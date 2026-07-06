"use client";

import { AppShell, Badge, GlassCard, MemoryCard, SearchPill, SectionHeader } from "@/components/letscall/mobile-shell";
import { searchResults, searchSuggestions } from "@/lib/letscall-data";

export function SearchScreen() {
  return (
    <AppShell
      activeTab="search"
      title="Search"
      subtitle="Find a conversation instantly by topic, name, or moment."
    >
      <div className="space-y-4">
        <GlassCard className="p-4">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/36">Search memories</label>
          <div className="mt-3 flex min-h-[56px] items-center rounded-[22px] border border-white/10 bg-white/6 px-4 text-[15px] text-white/45">
            Search by person, topic, or date
          </div>
        </GlassCard>

        <section>
          <SectionHeader eyebrow="Suggestions" title="Quick search" action={<Badge>Tap one</Badge>} />
          <div className="flex flex-wrap gap-2">
            {searchSuggestions.map((suggestion) => (
              <SearchPill key={suggestion}>{suggestion}</SearchPill>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader eyebrow="Results" title="Recent matches" />
          <div className="space-y-3">
            {searchResults.map((result) => (
              <MemoryCard key={result.id} {...result} />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

