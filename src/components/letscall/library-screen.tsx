"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/letscall/mobile-shell";
import { MemoryArchiveService } from "@/lib/memory-archive/memory-archive-service";
import type { MemoryArchiveRecord } from "@/lib/memory-archive/types";

const categories = ["All", "Personal", "Family", "Work", "Favorites"] as const;
type Category = (typeof categories)[number];

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

function MemoryRow({ item }: { item: MemoryArchiveRecord }) {
  return (
    <Link href={`/archive/${item.archiveId}`} className="block rounded-[18px] px-3 py-3 transition active:scale-[0.99] hover:bg-white/4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white">{item.title}</h3>
          <p className="mt-1 text-[13px] font-medium text-white/62">{item.collection}</p>
          <p className="mt-1 text-[12px] text-white/44">{formatRelativeDate(item.createdAt)} ? {formatDuration(item.duration)}</p>
        </div>
      </div>
    </Link>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-medium transition ${active ? "bg-white text-[#07110f]" : "bg-white/5 text-white/62 hover:bg-white/8 hover:text-white/86"}`}
    >
      {children}
    </button>
  );
}

export function LibraryScreen() {
  const [archive, setArchive] = useState<MemoryArchiveRecord[]>(MemoryArchiveService.readLibrary());
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("All");

  useEffect(() => MemoryArchiveService.subscribe(() => setArchive(MemoryArchiveService.readLibrary())), []);

  const filteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...archive]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((item) => {
        if (activeCategory === "Favorites") {
          return item.status === "archived";
        }

        if (activeCategory !== "All" && item.collection !== activeCategory) {
          return false;
        }

        if (!normalizedQuery) return true;

        const haystack = `${item.title} ${item.collection} ${item.description}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  }, [archive, activeCategory, query]);

  return (
    <AppShell activeTab="library" title="Library" subtitle="Everything you've saved in one place.">
      <div className="space-y-4">
        <label className="block">
          <span className="sr-only">Search memories</span>
          <div className="flex h-14 items-center gap-3 rounded-[26px] border border-white/10 bg-white/6 px-4 text-white/72 shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
            <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="11" cy="11" r="5.3" />
              <path d="m15.2 15.2 3 3" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memories..."
              className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/34"
            />
          </div>
        </label>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => (
            <FilterChip key={category} active={activeCategory === category} onClick={() => setActiveCategory(category)}>
              {category}
            </FilterChip>
          ))}
        </div>

        {filteredMemories.length ? (
          <div className="divide-y divide-white/8 overflow-hidden rounded-[24px] border border-white/8 bg-white/4">
            {filteredMemories.map((item) => (
              <MemoryRow key={item.archiveId} item={item} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[42dvh] items-center justify-center px-4 text-center">
            <div>
              <p className="text-[20px] font-semibold tracking-[-0.03em] text-white">No memories yet.</p>
              <p className="mt-2 text-[14px] leading-6 text-white/58">Your saved conversations will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
