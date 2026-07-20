"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { LibraryService } from "@/lib/memory-archive/library-service";
import { ViewMemoryService } from "@/lib/memory-archive/player-service";
import { uploadMemoryArchive } from "@/lib/memory-archive/upload-service";
import { upsertArchiveProviderState, upsertMemoryArchiveRecord } from "@/lib/memory-archive/storage";
import type { MemoryArchiveInput, MemoryArchiveProgress, MemoryArchiveRecord, MemoryArchiveUploadResponse, MemoryArchiveViewResult } from "@/lib/memory-archive/types";
import { fetchProviderSession } from "@/lib/provider-session";

export type MemoryArchiveSaveCallbacks = {
  onProgress?: (progress: MemoryArchiveProgress) => void;
  onBlocked?: (message: string) => void;
};

function logArchiveEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[LetsCall][MemoryArchiveService]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const timeoutError = new Error(timeoutMessage);
      (timeoutError as Error & { code?: string }).code = "timeout";
      reject(timeoutError);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

let currentUploadController: { promise: Promise<MemoryArchiveUploadResponse>; cancel: () => void } | null = null;

function buildBlockedMessage(code: string | undefined, providerState: Awaited<ReturnType<typeof fetchProviderSession>>) {
  if (providerState.providerConnectionState === "onboarding" || code === "needs_channel") {
    return "Reconnect Google to continue archiving.";
  }

  if (providerState.providerConnectionState === "needs_reconnect" || providerState.providerConnectionState === "revoked" || code === "revoked_token") {
    return "Reconnect Google to continue archiving.";
  }

  return "Reconnect Google to continue archiving.";
}

export const MemoryArchiveService = {
  readLibrary() {
    return LibraryService.readAll();
  },
  subscribe(listener: () => void) {
    return LibraryService.subscribe(listener);
  },
  resolveView(archiveId: string): MemoryArchiveViewResult {
    return ViewMemoryService.resolveView(archiveId);
  },
  resolvePlayback(archiveId: string) {
    return ViewMemoryService.resolveView(archiveId);
  },
  cancelCurrentUpload() {
    currentUploadController?.cancel();
    currentUploadController = null;
  },
  async archiveRecording(input: MemoryArchiveInput, callbacks: MemoryArchiveSaveCallbacks = {}) {
    return await this.saveMemory(input, callbacks);
  },
  async saveMemory(input: MemoryArchiveInput, callbacks: MemoryArchiveSaveCallbacks = {}) {
    if (currentUploadController) {
      logArchiveEvent("reuse_inflight_upload", { title: input.title, collection: input.collection });
      return (await currentUploadController.promise).archive;
    }

    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const sessionToken = data.session?.access_token ?? null;
    if (!sessionToken) {
      throw new Error("Please sign in with LetsCall first.");
    }

    const providerSession = await fetchProviderSession();
    logArchiveEvent("archive_start", {
      title: input.title,
      collection: input.collection,
      hasSession: Boolean(sessionToken),
      duration: input.duration,
      providerConnectionState: providerSession.providerConnectionState,
      archiveEnabled: providerSession.archiveEnabled,
    });

    if (!providerSession.archiveEnabled) {
      const blockedMessage = buildBlockedMessage(undefined, providerSession);
      callbacks.onBlocked?.(blockedMessage);
      throw Object.assign(new Error(blockedMessage), { code: "needs_channel" });
    }

    callbacks.onProgress?.({ status: "preparing", progress: 8, message: "Preparing recording..." });

    const requestId = crypto.randomUUID();
    let controller: ReturnType<typeof uploadMemoryArchive> | null = null;

    try {
      callbacks.onProgress?.({ status: "uploading", progress: 20, message: "Uploading recording..." });
      logArchiveEvent("upload_controller_created", { title: input.title, collection: input.collection, requestId });
      controller = uploadMemoryArchive(input, sessionToken, requestId, {
        onProgress: callbacks.onProgress,
      });

      currentUploadController = controller;

      const response = await withTimeout(controller.promise, 120000, "Timed out while uploading the memory archive.");
      persistUploadResponse(response, input);
      callbacks.onProgress?.({ status: "processing", progress: 92, message: "Processing archive..." });
      callbacks.onProgress?.({ status: "archived", progress: 100, message: "Archive complete." });
      logArchiveEvent("archive_complete", {
        archiveId: response.archive.archiveId,
        providerId: response.providerState.providerId,
        requestId,
      });
      return response.archive;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save memory.";
      const code = (error as Error & { code?: string }).code;
      logArchiveEvent("archive_failed", {
        error: message,
        code,
        requestId,
      });

      if (code === "needs_channel" || code === "needs_reconnect" || code === "revoked_token") {
        callbacks.onBlocked?.(buildBlockedMessage(code, providerSession));
      }

      if (message.includes("cancel")) {
        throw new Error("The upload was cancelled.");
      }

      throw error;
    } finally {
      currentUploadController = null;
    }
  },
};

function persistUploadResponse(response: MemoryArchiveUploadResponse, input: MemoryArchiveInput) {
  upsertMemoryArchiveRecord({
    ...response.archive,
    callId: input.callId ?? null,
    recordingSessionId: input.recordingSessionId ?? null,
  });
  upsertArchiveProviderState(response.providerState);
}

