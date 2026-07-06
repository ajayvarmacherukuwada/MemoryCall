"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AppShell, Badge, GlassCard, SectionHeader } from "@/components/letscall/mobile-shell";
import { MemoryArchiveService } from "@/lib/memory-archive/memory-archive-service";
import type { MemoryArchiveProgress, MemoryArchiveRecord, MemoryCollection, MemoryArchiveStatus } from "@/lib/memory-archive/types";
import { useSessionProfile } from "@/components/letscall/use-session-profile";

const collections: MemoryCollection[] = ["Family", "Work", "Health", "Learning", "Property", "Personal"];

type SaveStage = MemoryArchiveStatus | "idle";

const stageMessages: Record<Exclude<MemoryArchiveStatus, "queued" | "paused" | "archived" | "failed">, string> = {
  preparing: "Preparing memory...",
  uploading: "Securing memory...",
  processing: "Finalizing archive...",
};

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatDate(isoString: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoString));
}

async function getVideoDuration(file: File) {
  return await new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read the video duration."));
    };
    video.src = objectUrl;
  });
}

export function MemoryScreen() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profile = useSessionProfile();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [collection, setCollection] = useState<MemoryCollection>("Personal");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [loadingDuration, setLoadingDuration] = useState(false);
  const [stage, setStage] = useState<SaveStage>("idle");
  const [progress, setProgress] = useState(0);
  const [savedMemory, setSavedMemory] = useState<MemoryArchiveRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const stageText = useMemo(() => {
    if (stage === "idle" || stage === "archived") return null;
    if (stage === "failed") return error ?? "Unable to save memory.";
    return stageMessages[stage as Exclude<MemoryArchiveStatus, "queued" | "paused" | "archived" | "failed">];
  }, [error, stage]);

  const canSave = Boolean(selectedFile && durationSeconds !== null && !loadingDuration && stage !== "uploading" && stage !== "processing" && stage !== "preparing" && profile.archiveEnabled);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    setBlockedMessage(null);
    setSavedMemory(null);
    setSelectedFile(file);
    setDurationSeconds(null);

    if (!file) return;

    setLoadingDuration(true);
    try {
      const videoDuration = await getVideoDuration(file);
      setDurationSeconds(videoDuration);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to read the selected video.");
      setSelectedFile(null);
    } finally {
      setLoadingDuration(false);
    }
  }

  async function handleSave() {
    if (!selectedFile || durationSeconds === null) {
      setError("Please select a video before saving.");
      return;
    }

    if (!profile.signedIn) {
      setError("Please sign in to LetsCall before saving a memory.");
      return;
    }

    if (!profile.archiveEnabled) {
      setError(
        profile.providerConnectionState === "onboarding"
          ? "This Google account does not currently own a YouTube channel."
          : "Google provider access needs to be reconnected before archiving can continue.",
      );
      return;
    }

    setError(null);
    setBlockedMessage(null);
    setStage("preparing");
    setProgress(10);

    try {
      const record = await MemoryArchiveService.saveMemory(
        {
          file: selectedFile,
          title,
          description,
          collection,
          duration: durationSeconds,
        },
        {
          onProgress: (snapshot: MemoryArchiveProgress) => {
            setStage(snapshot.status);
            setProgress(snapshot.progress);
          },
          onBlocked: (message) => setBlockedMessage(message),
        },
      );

      setSavedMemory(record);
      setStage("archived");
      setProgress(100);
      setSelectedFile(null);
      setDurationSeconds(null);
      setTitle("");
      setDescription("");
      setCollection("Personal");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (saveError) {
      const code = (saveError as Error & { code?: string }).code;
      const message = saveError instanceof Error ? saveError.message.toLowerCase() : "";
      const isConfigIssue = ["missing_scope", "access_denied", "invalid_scope", "origin_mismatch", "redirect_uri_mismatch", "unauthorized_client"].some((fragment) =>
        message.includes(fragment),
      );

      if (code === "missing_scope" || isConfigIssue) {
        setStage("failed");
        return;
      }

      setStage("failed");
      setError(saveError instanceof Error ? saveError.message : "Unable to save memory.");
    }
  }

  function handleCancel() {
    MemoryArchiveService.cancelCurrentUpload();
    setStage("failed");
    setError("The upload was cancelled.");
  }

  if (savedMemory) {
    return (
      <AppShell activeTab="memory" title="Create Memory" subtitle="Your private memory has been saved.">
        <div className="space-y-4">
          <GlassCard className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Success</p>
            <h2 className="mt-4 text-[34px] font-semibold leading-[0.98] tracking-[-0.05em] text-white">? Memory saved successfully</h2>
            <p className="mt-3 text-[15px] leading-6 text-white/62">Your memory is now safely archived and ready to revisit anytime.</p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Title</p>
                <p className="mt-1 text-[17px] font-semibold text-white">{savedMemory.title}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Description</p>
                <p className="mt-1 text-[15px] leading-6 text-white/70">{savedMemory.description || "No description added."}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[22px] bg-white/6 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">Duration</p>
                  <p className="mt-2 text-[18px] font-semibold text-white">{formatDuration(savedMemory.duration)}</p>
                </div>
                <div className="rounded-[22px] bg-white/6 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">Created</p>
                  <p className="mt-2 text-[18px] font-semibold text-white">{formatDate(savedMemory.createdAt)}</p>
                </div>
              </div>
            </div>
          </GlassCard>

          <Link
            href="/library"
            className="flex min-h-[56px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
          >
            View in Memory Library
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeTab="memory" title="Create Memory" subtitle="Select a video and save it to your private memory archive.">
      <div className="space-y-4">
        <GlassCard className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Create Memory</p>
          <h2 className="mt-4 text-[32px] font-semibold leading-[0.98] tracking-[-0.05em] text-white">Save a private memory from your device.</h2>
          <p className="mt-3 text-[15px] leading-6 text-white/62">
            Choose a video, add a title or description if you want, pick a collection, and keep it in your private archive.
          </p>
        </GlassCard>

        <section className="space-y-3">
          <SectionHeader eyebrow="Source" title="Choose a video" />
          <GlassCard className="p-4">
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[56px] w-full items-center justify-center rounded-[24px] border border-white/10 bg-white/6 px-5 text-[16px] font-semibold text-white transition active:scale-[0.98]"
            >
              Select existing video
            </button>

            {selectedFile ? (
              <div className="mt-4 rounded-[22px] bg-white/6 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">Selected</p>
                <p className="mt-2 truncate text-[15px] font-semibold text-white">{selectedFile.name}</p>
                <p className="mt-1 text-[13px] text-white/52">
                  {selectedFile.type || "video"} · {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
                <p className="mt-2 text-[13px] text-white/52">
                  {loadingDuration ? "Reading duration..." : durationSeconds !== null ? `Duration ${formatDuration(durationSeconds)}` : "Duration unavailable"}
                </p>
              </div>
            ) : null}
          </GlassCard>
        </section>

        <section className="space-y-3">
          <SectionHeader eyebrow="Collection" title="Choose a space" />
          <GlassCard className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            {collections.map((item) => {
              const active = item === collection;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCollection(item)}
                  className={`rounded-[22px] border px-4 py-4 text-left transition active:scale-[0.98] ${
                    active
                      ? "border-emerald-300/40 bg-emerald-300/12 text-white"
                      : "border-white/10 bg-white/6 text-white/72"
                  }`}
                >
                  <p className="text-[14px] font-semibold">{item}</p>
                  <p className="mt-1 text-[12px] text-white/46">Private archive</p>
                </button>
              );
            })}
          </GlassCard>
        </section>

        <section className="space-y-3">
          <SectionHeader eyebrow="Details" title="Add context" />
          <GlassCard className="space-y-3 p-4">
            <label className="block space-y-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/36">Optional title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Family dinner in Tokyo"
                className="h-14 w-full rounded-[20px] border border-white/10 bg-white/6 px-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/36">Optional description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add the context you want to remember later."
                rows={4}
                className="w-full rounded-[20px] border border-white/10 bg-white/6 px-4 py-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
              />
            </label>
          </GlassCard>
        </section>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex min-h-[56px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98] disabled:opacity-50"
        >
          Save Memory
        </button>

        {stageText ? (
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Saving</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="size-3 rounded-full bg-emerald-300/90 shadow-[0_0_18px_rgba(110,230,196,0.65)]" />
                  <p className="text-[16px] font-semibold text-white">{stageText}</p>
                </div>
              </div>
              {stage !== "failed" ? <Badge>{progress}%</Badge> : null}
            </div>
            {stage !== "failed" ? (
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#93f4d5_0%,#65c9ad_100%)] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(10, progress))}%` }}
                />
              </div>
            ) : null}
          </GlassCard>
        ) : null}

        {blockedMessage ? (
          <GlassCard className="border border-amber-300/20 bg-amber-500/10 p-4">
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-amber-50">{blockedMessage}</p>
          </GlassCard>
        ) : null}

        {error ? (
          <GlassCard className="border border-rose-300/20 bg-rose-500/10 p-4">
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-rose-50">{error}</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="flex min-h-[48px] flex-1 items-center justify-center rounded-[20px] bg-white px-5 text-[15px] font-semibold text-[#07110f] transition active:scale-[0.98]"
              >
                Retry
              </button>
              {stage === "uploading" || stage === "processing" ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex min-h-[48px] flex-1 items-center justify-center rounded-[20px] border border-white/12 bg-white/6 px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </GlassCard>
        ) : null}

        {!profile.signedIn || !profile.archiveEnabled ? (
          <GlassCard className="p-4">
            <p className="text-[15px] leading-6 text-white/68">Connect Google from Profile before saving a memory.</p>
          </GlassCard>
        ) : null}
      </div>
    </AppShell>
  );
}

