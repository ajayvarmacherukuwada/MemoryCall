"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, Badge, GlassCard, MemoryCard, SectionHeader } from "@/components/letscall/mobile-shell";
import { recentMemories, libraryHighlights } from "@/lib/letscall-data";
import { MemoryArchiveService } from "@/lib/memory-archive/memory-archive-service";
import type { MemoryArchiveRecord } from "@/lib/memory-archive/types";

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatRelativeDate(isoString: string) {
  const createdAt = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(createdAt);
}

function ArchiveItem({ item }: { item: MemoryArchiveRecord }) {
  return (
    <Link href={`/archive/${item.archiveId}`} className="block">
      <MemoryCard
        title={item.title}
        participants={`${item.collection} · Private archive`}
        time={formatRelativeDate(item.createdAt)}
        duration={formatDuration(item.duration)}
        summary={item.description || "No description added yet."}
        tag={item.status === "archived" ? "Ready" : item.status}
      />
    </Link>
  );
}

export function LibraryScreen() {
  const [archive, setArchive] = useState<MemoryArchiveRecord[]>(MemoryArchiveService.readLibrary());

  useEffect(() => MemoryArchiveService.subscribe(() => setArchive(MemoryArchiveService.readLibrary())), []);

  const totalItems = recentMemories.length + archive.length;

  return (
    <AppShell activeTab="library" title="Library" subtitle="Everything you have saved, organized for a quick return.">
      <div className="space-y-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/36">Overview</p>
              <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-white">{totalItems} memories</p>
            </div>
            <Badge>All memories</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {libraryHighlights.map((highlight) => (
              <Badge key={highlight}>{highlight}</Badge>
            ))}
          </div>
        </GlassCard>

        <section>
          <SectionHeader eyebrow="Archive" title="Private memories" />
          {archive.length ? (
            <div className="space-y-3">
              {archive.map((item) => (
                <ArchiveItem key={item.archiveId} item={item} />
              ))}
            </div>
          ) : (
            <GlassCard className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Empty archive</p>
              <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-white">Your memories will appear here.</h3>
              <p className="mt-3 text-[15px] leading-6 text-white/62">
                Save a memory and it will be added to this private library automatically.
              </p>
            </GlassCard>
          )}
        </section>

        <section>
          <SectionHeader eyebrow="Library" title="Recent items" />
          <div className="space-y-3">
            {recentMemories.map((memory) => (
              <MemoryCard key={memory.id} {...memory} />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}