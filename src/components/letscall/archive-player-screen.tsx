"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, Avatar, Badge, GlassCard, SectionHeader } from "@/components/letscall/mobile-shell";
import { MemoryArchiveService } from "@/lib/memory-archive/memory-archive-service";
import type { MemoryArchiveViewResult } from "@/lib/memory-archive/types";

type ViewState = MemoryArchiveViewResult;

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

function ReconnectCard({
  title,
  message,
  onBack,
  actionLabel = "Back to Library",
}: {
  title: string;
  message: string;
  onBack: () => void;
  actionLabel?: string;
}) {
  return (
    <GlassCard className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Memory Details</p>
      <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-white">{title}</h2>
      <p className="mt-3 text-[15px] leading-6 text-white/62">{message}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 flex min-h-[56px] w-full items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
      >
        {actionLabel}
      </button>
    </GlassCard>
  );
}

export function ArchivePlayerScreen({ archiveId }: { archiveId: string }) {
  const [state, setState] = useState<ViewState>(MemoryArchiveService.resolveView(archiveId));
  const [isOpening, setIsOpening] = useState(false);
  const view = state.kind === "external" ? state.view : null;
  const authError = state.kind === "authorization_error" ? state : null;

  useEffect(() => {
    const syncState = () => setState(MemoryArchiveService.resolveView(archiveId));
    syncState();
    return MemoryArchiveService.subscribe(syncState);
  }, [archiveId]);

  const openMemory = () => {
    if (!view?.archiveUrl) return;
    setIsOpening(true);
    window.open(view.archiveUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => setIsOpening(false), 1000);
  };

  return (
    <AppShell activeTab="library" title="Memory Details" subtitle="Review the memory and open it externally when needed.">
      <div className="space-y-4">
        {view ? (
          <>
            <GlassCard className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Archive</p>
                  <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{view.title}</h2>
                  <p className="mt-3 text-[15px] leading-6 text-white/62">{view.description || "No description added."}</p>
                </div>
                <Badge>{view.collection}</Badge>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[22px] bg-white/6 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">Duration</p>
                  <p className="mt-2 text-[18px] font-semibold text-white">{formatDuration(view.duration)}</p>
                </div>
                <div className="rounded-[22px] bg-white/6 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">Created</p>
                  <p className="mt-2 text-[18px] font-semibold text-white">{formatDate(view.createdAt)}</p>
                </div>
              </div>
            </GlassCard>

            <section>
              <SectionHeader eyebrow="Identity" title="Memory details" />
              <GlassCard className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar name={view.title} imageUrl={view.thumbnailUrl} size={64} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/36">Archive id</p>
                    <p className="mt-2 truncate text-[15px] text-white/72">{view.archiveId}</p>
                  </div>
                </div>
              </GlassCard>
            </section>

            <div className="space-y-3">
              <button
                type="button"
                onClick={openMemory}
                disabled={isOpening}
                className="flex min-h-[56px] w-full items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98] disabled:opacity-80"
              >
                {isOpening ? "Opening your private archived memory..." : "View Memory"}
              </button>

              <Link
                href="/library"
                className="flex min-h-[56px] items-center justify-center rounded-[24px] border border-white/10 bg-white/6 px-5 text-[16px] font-semibold text-white transition active:scale-[0.98]"
              >
                Back to Library
              </Link>
            </div>
          </>
        ) : authError ? (
          <ReconnectCard title={authError.title} message={authError.message} onBack={() => window.history.back()} actionLabel={authError.actionLabel} />
        ) : (
          <ReconnectCard
            title="Open Archived Memory"
            message="This memory could not be loaded on this device. Return to the Library and open it again from the archive list."
            onBack={() => window.history.back()}
          />
        )}
      </div>
    </AppShell>
  );
}


