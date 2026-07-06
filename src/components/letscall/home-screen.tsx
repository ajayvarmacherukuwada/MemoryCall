"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppShell, Badge, CollectionCard, GlassCard, MemoryCard, SectionHeader } from "@/components/letscall/mobile-shell";
import { collections, continueMemory, recentMemories } from "@/lib/letscall-data";
import { useSessionProfile } from "@/components/letscall/use-session-profile";

function HeroGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
      <div className="absolute -right-10 -top-8 h-36 w-36 rounded-full bg-emerald-300/14 blur-3xl" />
      <div className="absolute -left-4 bottom-0 h-28 w-28 rounded-full bg-sky-400/12 blur-3xl" />
    </div>
  );
}

export function HomeScreen() {
  const profile = useSessionProfile();
  const welcomeName = useMemo(() => profile.name.split(" ")[0] || "there", [profile.name]);

  const status = profile.archiveEnabled
    ? "Archive Ready"
    : profile.providerConnectionState === "onboarding"
      ? "Needs YouTube Channel"
      : profile.providerConnectionState === "needs_reconnect"
        ? "Reconnect Required"
        : profile.signedIn
          ? "Google Connected"
          : "Guest";

  return (
    <AppShell activeTab="home" title="Home" subtitle="A calm place for the conversations you never want to lose.">
      <div className="space-y-4">
        <GlassCard className="relative overflow-hidden p-5">
          <HeroGlow />
          <div className="relative flex items-start justify-between gap-4">
            <div className="max-w-[250px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                Welcome back{profile.loading ? "" : `, ${welcomeName}`}
              </p>
              <h2 className="mt-4 text-[34px] font-semibold leading-[0.98] tracking-[-0.05em] text-white">
                Never lose an important conversation.
              </h2>
              <p className="mt-4 text-[15px] leading-6 text-white/62">
                Capture the moments that matter, keep them close, and return to them whenever you need.
              </p>
            </div>
            <Badge>{profile.loading ? "Loading" : status}</Badge>
          </div>
        </GlassCard>

        <Link
          href="/call"
          className="flex min-h-[56px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[17px] font-semibold tracking-[-0.02em] text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
        >
          Start Memory Call
        </Link>

        <section className="pt-1">
          <SectionHeader eyebrow="Continue" title="Last Memory" />
          <MemoryCard {...continueMemory} />
        </section>

        <section>
          <SectionHeader eyebrow="Recent" title="Recent Memories" />
          <div className="space-y-3">
            {recentMemories.map((memory) => (
              <MemoryCard key={memory.id} {...memory} />
            ))}
          </div>
        </section>

        <section className="pb-1">
          <SectionHeader eyebrow="Collections" title="Your spaces" />
          <div className="grid grid-cols-2 gap-3">
            {collections.map((collection) => (
              <CollectionCard key={collection.name} {...collection} />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
