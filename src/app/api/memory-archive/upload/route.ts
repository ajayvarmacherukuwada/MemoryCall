import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ArchiveProviderError } from "@/lib/memory-archive/providers/archive-provider";
import { YouTubeArchiveProvider } from "@/lib/memory-archive/providers/youtube-archive-provider";
import type { MemoryArchiveInput } from "@/lib/memory-archive/types";
import { authenticateSupabaseRequest, getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { getGoogleAccessToken, getGoogleProviderSession } from "@/lib/server/google-provider";

export const runtime = "nodejs";

const provider = new YouTubeArchiveProvider();

function parseNumber(value: FormDataEntryValue | null) {
  const parsed = Number(typeof value === "string" ? value : "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function logArchiveStage(step: string, details: Record<string, unknown>) {
  console.info("[LetsCall][ArchivePipeline]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function sanitizeFileName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "memory-upload.webm";
}

function buildStoragePath(profileId: string, requestId: string, fileName: string) {
  return `memory-archives/${profileId}/${requestId}/${sanitizeFileName(fileName)}`;
}

async function loadExistingArchive(supabase: ReturnType<typeof getSupabaseAdminClient>, recordingId: string) {
  const { data: recording } = await supabase.from("recordings").select("*").eq("id", recordingId).maybeSingle();
  if (!recording) return null;

  const { data: archiveRun } = await supabase.from("archive_runs").select("*").eq("recording_id", recordingId).maybeSingle();
  if (!archiveRun) return null;

  const { data: memory } = await supabase.from("memories").select("*").eq("archive_run_id", archiveRun.id).maybeSingle();
  if (!memory) return null;

  const archive = {
    id: memory.id,
    archiveId: memory.id,
    title: memory.title,
    description: memory.description ?? "",
    collection: (archiveRun.provider_metadata as Record<string, unknown> | null)?.collection as MemoryArchiveInput["collection"],
    createdAt: memory.created_at,
    duration: recording.duration_seconds,
    thumbnailUrl: archiveRun.provider_thumbnail_url ?? null,
    status: "archived" as const,
    progress: 100,
    errorMessage: null,
  };

  const providerState = {
    archiveId: memory.id,
    providerId: archiveRun.provider_archive_id ?? archiveRun.provider_url ?? memory.id,
    archiveUrl: archiveRun.provider_url ?? null,
    playbackUrl: archiveRun.provider_playback_url ?? archiveRun.provider_url ?? null,
    thumbnailUrl: archiveRun.provider_thumbnail_url ?? null,
    createdAt: memory.created_at,
  };

  return { archive, providerState };
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);

    const providerSession = await getGoogleProviderSession(user.id);
    if (!providerSession.archiveEnabled) {
      return NextResponse.json(
        {
          error:
            providerSession.providerConnectionState === "onboarding"
              ? "This Google account does not currently own a YouTube channel."
              : "Google provider access needs to be reconnected before archive uploads can continue.",
          code: providerSession.providerConnectionState === "onboarding" ? "needs_channel" : "needs_reconnect",
        },
        { status: 409 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A video file is required.", code: "invalid_input" }, { status: 400 });
    }

    const input: MemoryArchiveInput = {
      file,
      title: parseString(formData.get("title")),
      description: parseString(formData.get("description")),
      collection: parseString(formData.get("collection")) as MemoryArchiveInput["collection"],
      duration: parseNumber(formData.get("duration")),
    };
    const requestId = parseString(formData.get("requestId")) || request.headers.get("x-idempotency-key") || crypto.randomUUID();
    const storagePath = buildStoragePath(user.id, requestId, file.name);

    logArchiveStage("Recording Started", { userId: user.id, requestId, storagePath, fileName: file.name, fileSize: file.size });

    const { data: existingRecording } = await supabase.from("recordings").select("id").eq("storage_path", storagePath).maybeSingle();
    if (existingRecording?.id) {
      const existing = await loadExistingArchive(supabase, existingRecording.id);
      if (existing) {
        logArchiveStage("Archive Completed", { userId: user.id, requestId, reused: true });
        return NextResponse.json(existing, { status: 200 });
      }

      return NextResponse.json(
        { error: "An archive upload is already in progress for this file.", code: "archive_in_progress" },
        { status: 409 },
      );
    }

    const { data: recordingRow, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        profile_id: user.id,
        source_call_code: null,
        source_room_name: null,
        storage_bucket: "memory-archives",
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || "video/mp4",
        file_size_bytes: file.size,
        duration_seconds: Math.max(0, Math.round(input.duration)),
        checksum_sha256: null,
        status: "finalized",
        finalized_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (recordingError || !recordingRow) {
      return NextResponse.json(
        { error: recordingError?.message ?? "Unable to create the recording record.", code: "recording_create_failed" },
        { status: 500 },
      );
    }

    logArchiveStage("Blob Created", { userId: user.id, requestId, recordingId: recordingRow.id, sizeBytes: file.size });

    let providerToken;
    try {
      providerToken = await getGoogleAccessToken(user.id);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code ?? "needs_reconnect") : "needs_reconnect";
      await supabase.from("recordings").update({ status: "failed", failed_at: new Date().toISOString(), error_code: code, error_message: error instanceof Error ? error.message : "Unable to refresh Google access token." }).eq("id", recordingRow.id);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to refresh Google access token.", code }, { status: 409 });
    }

    const { data: archiveRunRow, error: archiveRunError } = await supabase
      .from("archive_runs")
      .insert({
        profile_id: user.id,
        recording_id: recordingRow.id,
        provider_account_id: providerToken.providerAccountId,
        archive_provider_id: providerToken.account.archive_provider_id,
        status: "validating_auth",
        attempt_number: 1,
        source_file_size_bytes: file.size,
        source_duration_seconds: Math.max(0, Math.round(input.duration)),
        provider_metadata: {
          requestId,
          collection: input.collection,
          sourceFileName: file.name,
        },
      })
      .select("*")
      .single();

    if (archiveRunError || !archiveRunRow) {
      return NextResponse.json(
        { error: archiveRunError?.message ?? "Unable to create the archive run.", code: "archive_run_create_failed" },
        { status: 500 },
      );
    }

    logArchiveStage("Validation Started", { userId: user.id, requestId, archiveRunId: archiveRunRow.id });
    logArchiveStage("Upload Started", { userId: user.id, requestId, archiveRunId: archiveRunRow.id });

    try {
      const result = await provider.upload(
        {
          file,
          accessToken: providerToken.accessToken,
          title: input.title,
          description: input.description,
          collection: input.collection,
          duration: input.duration,
        },
        { accessToken: providerToken.accessToken, signal: request.signal },
      );

      const archiveCompletedAt = new Date().toISOString();
      await supabase.from("archive_runs").update({
        status: "archived",
        completed_at: archiveCompletedAt,
        provider_archive_id: result.providerState.providerId,
        provider_url: result.providerState.archiveUrl,
        provider_playback_url: result.providerState.playbackUrl ?? result.providerState.archiveUrl,
        provider_thumbnail_url: result.providerState.thumbnailUrl,
        provider_metadata: {
          requestId,
          collection: input.collection,
          youtube: {
            providerId: result.providerState.providerId,
            archiveUrl: result.providerState.archiveUrl,
          },
        },
      }).eq("id", archiveRunRow.id);

      const { data: memoryRow, error: memoryError } = await supabase
        .from("memories")
        .insert({
          profile_id: user.id,
          recording_id: recordingRow.id,
          archive_run_id: archiveRunRow.id,
          title: input.title.trim() || file.name,
          description: input.description.trim() || null,
          memory_source: "manual_upload",
          processing_status: "ready",
          archived_at: archiveCompletedAt,
        })
        .select("*")
        .single();

      if (memoryError || !memoryRow) {
        throw new Error(memoryError?.message ?? "Unable to persist the memory record.");
      }

      await supabase.from("memory_assets").insert([
        {
          profile_id: user.id,
          memory_id: memoryRow.id,
          asset_kind: "video",
          storage_bucket: "memory-archives",
          storage_path: storagePath,
          mime_type: file.type || "video/mp4",
          file_size_bytes: file.size,
          checksum_sha256: null,
          metadata: { requestId },
        },
        ...(result.providerState.thumbnailUrl
          ? [
              {
                profile_id: user.id,
                memory_id: memoryRow.id,
                asset_kind: "thumbnail",
                storage_bucket: "external",
                storage_path: result.providerState.thumbnailUrl,
                mime_type: "image/jpeg",
                metadata: { requestId, source: "youtube" },
              },
            ]
          : []),
      ]);

      const archive = {
        id: memoryRow.id,
        archiveId: memoryRow.id,
        title: memoryRow.title,
        description: memoryRow.description ?? "",
        collection: input.collection,
        createdAt: memoryRow.created_at,
        duration: input.duration,
        thumbnailUrl: result.providerState.thumbnailUrl,
        status: "archived" as const,
        progress: 100,
        errorMessage: null,
      };

      const providerState = {
        archiveId: memoryRow.id,
        providerId: result.providerState.providerId,
        archiveUrl: result.providerState.archiveUrl,
        playbackUrl: result.providerState.playbackUrl ?? result.providerState.archiveUrl,
        thumbnailUrl: result.providerState.thumbnailUrl,
        createdAt: memoryRow.created_at,
      };

      logArchiveStage("Upload Completed", { userId: user.id, requestId, archiveId: memoryRow.id });
      logArchiveStage("Archive Completed", { userId: user.id, requestId, archiveId: memoryRow.id });

      return NextResponse.json({ archive, providerState }, { status: 200 });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code ?? "upload_failed") : "upload_failed";
      const message = error instanceof Error ? error.message : "The archive provider rejected the upload.";
      await supabase.from("archive_runs").update({ status: "failed", failed_at: new Date().toISOString(), error_code: code, error_message: message }).eq("id", archiveRunRow.id);
      await supabase.from("recordings").update({ status: "failed", failed_at: new Date().toISOString(), error_code: code, error_message: message }).eq("id", recordingRow.id);
      return NextResponse.json({ error: message, code }, { status: code === "needs_channel" || code === "needs_reconnect" ? 409 : 500 });
    }
  } catch (error) {
    if (error instanceof ArchiveProviderError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          debug: error.debug ?? null,
          status: error.status,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save memory.",
        code: "unknown_error",
      },
      { status: 500 },
    );
  }
}

