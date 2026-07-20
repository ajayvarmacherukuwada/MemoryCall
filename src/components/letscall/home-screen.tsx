"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppShell, Avatar, GlassCard } from "@/components/letscall/mobile-shell";
import { useMemoryArchive } from "@/lib/memory-archive/storage";
import type { MemoryArchiveRecord } from "@/lib/memory-archive/types";
import { useSessionProfile } from "@/components/letscall/use-session-profile";
import { formatContactDisplayName, useContacts } from "@/components/letscall/use-contacts";
import type { ContactSummary } from "@/lib/contacts-client";

type RelationshipTone = "green" | "yellow" | "red" | "neutral";

type RelationshipInsight = {
  contact: ContactSummary;
  displayName: string;
  lastConversationAt: string | null;
  daysSinceLastConversation: number | null;
  tone: RelationshipTone;
  relationshipLabel: string;
};

const subtitleMessages = [
  "Stay close to the people who matter.",
  "Every conversation becomes a memory.",
  "Your memories grow one call at a time.",
  "Relationships deserve attention.",
  "One call can make someone's day.",
] as const;

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  return `${minutes} min`;
}

function getDaysSince(value: string | null) {
  if (!value) return null;

  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return null;

  return Math.max(0, Math.floor(diff / 86400000));
}

function getConversationDateLabel(value: string | null) {
  if (!value) return "No conversations yet";

  const days = getDaysSince(value);
  if (days === null) return "No conversations yet";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return `${days} days ago`;
  return formatDateLabel(value);
}

function getRelationshipTone(daysSince: number | null): RelationshipTone {
  if (daysSince === null) return "neutral";
  if (daysSince <= 3) return "green";
  if (daysSince <= 7) return "yellow";
  return "red";
}

function getRelationshipLabel(daysSince: number | null) {
  if (daysSince === null) return "No conversations yet";
  if (daysSince <= 3) return "Recently connected";
  if (daysSince <= 7) return "Check in soon";
  return "It's been a while";
}

function toneClasses(tone: RelationshipTone) {
  switch (tone) {
    case "green":
      return "border-emerald-400/18 bg-emerald-400/10 text-emerald-200";
    case "yellow":
      return "border-amber-400/18 bg-amber-400/10 text-amber-200";
    case "red":
      return "border-rose-400/18 bg-rose-400/10 text-rose-200";
    default:
      return "border-white/10 bg-white/6 text-white/60";
  }
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h2>
      {subtitle ? <p className="text-[13px] leading-6 text-white/50">{subtitle}</p> : null}
    </div>
  );
}

function buildRelationshipInsights(contacts: ContactSummary[]): RelationshipInsight[] {
  return contacts
    .map((contact) => {
      const displayName = formatContactDisplayName(contact);
      const daysSinceLastConversation = getDaysSince(contact.lastSeenAt);

      return {
        contact,
        displayName,
        lastConversationAt: contact.lastSeenAt,
        daysSinceLastConversation,
        tone: getRelationshipTone(daysSinceLastConversation),
        relationshipLabel: getRelationshipLabel(daysSinceLastConversation),
      };
    })
    .sort((left, right) => {
      const leftDays = left.daysSinceLastConversation ?? Number.POSITIVE_INFINITY;
      const rightDays = right.daysSinceLastConversation ?? Number.POSITIVE_INFINITY;
      if (leftDays !== rightDays) {
        return rightDays - leftDays;
      }

      const leftTime = left.lastConversationAt ? new Date(left.lastConversationAt).getTime() : 0;
      const rightTime = right.lastConversationAt ? new Date(right.lastConversationAt).getTime() : 0;
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return left.displayName.localeCompare(right.displayName);
    });
}

function sortArchives(archives: MemoryArchiveRecord[]) {
  return [...archives].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function RelationshipCard({ insight, hero = false }: { insight: RelationshipInsight; hero?: boolean }) {
  return (
    <GlassCard className={hero ? "p-5" : "p-4"}>
      <div className={hero ? "space-y-4" : "space-y-3"}>
        <div className="flex items-start gap-4">
          <Avatar name={insight.displayName} imageUrl={null} size={hero ? 60 : 46} />
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className={hero ? "truncate text-[22px] font-semibold tracking-[-0.03em] text-white" : "truncate text-[17px] font-semibold tracking-[-0.02em] text-white"}>
              {insight.displayName}
            </h3>
            <p className="text-[13px] text-white/54">{insight.contact.nickname?.trim() || "Relationship"}</p>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium ${toneClasses(insight.tone)}`}>
            <span className={`mr-2 size-2 rounded-full ${insight.tone === "green" ? "bg-emerald-400" : insight.tone === "yellow" ? "bg-amber-400" : insight.tone === "red" ? "bg-rose-400" : "bg-white/30"}`} />
            {insight.relationshipLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <p className="text-white/36">Last conversation</p>
            <p className="mt-1 text-white">{getConversationDateLabel(insight.lastConversationAt)}</p>
          </div>
          <div>
            <p className="text-white/36">Days since last call</p>
            <p className="mt-1 text-white">
              {insight.daysSinceLastConversation === null ? "No conversations yet" : `${insight.daysSinceLastConversation} days`}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] leading-5 text-white/48">
            {insight.daysSinceLastConversation === null ? "No conversations yet" : `Last talked ${getConversationDateLabel(insight.lastConversationAt)}`}
          </p>
          <Link
            href={`/call?contactId=${encodeURIComponent(insight.contact.id)}&name=${encodeURIComponent(insight.displayName)}&mode=video`}
            className={hero ? "flex min-h-[44px] items-center justify-center rounded-full bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-4 text-[13px] font-semibold text-[#07110f] transition active:scale-[0.98]" : "flex min-h-[40px] items-center justify-center rounded-full bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-3 text-[12px] font-semibold text-[#07110f] transition active:scale-[0.98]"}
          >
            Call
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}

function MemoryRow({ archive }: { archive: MemoryArchiveRecord }) {
  return (
    <Link href={`/archive/${encodeURIComponent(archive.archiveId)}`} className="block transition active:scale-[0.99]">
      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/36">{archive.collection}</p>
            <h3 className="mt-2 truncate text-[17px] font-semibold tracking-[-0.02em] text-white">{archive.title}</h3>
            <p className="mt-1 text-[13px] text-white/52">
              {formatDateLabel(archive.createdAt)} <span className="mx-1 text-white/26">?</span> {formatDuration(archive.duration)}
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[12px] font-medium text-white/70">Open</div>
        </div>
      </GlassCard>
    </Link>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/10 bg-white/4 px-4 py-5 text-center">
      <p className="text-[15px] font-semibold tracking-[-0.02em] text-white">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-white/52">{description}</p>
    </div>
  );
}

export function HomeScreen() {
  const profile = useSessionProfile();
  const contacts = useContacts(profile.signedIn);
  const archives = useMemoryArchive();

  const subtitle = useMemo(() => {
    const todayIndex = new Date().getDate() % subtitleMessages.length;
    return subtitleMessages[todayIndex];
  }, []);

  const relationshipInsights = useMemo(() => buildRelationshipInsights(contacts.contacts), [contacts.contacts]);
  const recentArchives = useMemo(() => sortArchives(archives).slice(0, 3), [archives]);
  const recentCallEntries = recentArchives.slice(0, 2);

  const firstName = profile.loading ? "" : profile.name.split(" ")[0] || "User";
  const heroInsight = relationshipInsights[0] ?? null;
  const otherInsights = relationshipInsights.slice(1);

  return (
    <AppShell activeTab="home" title={`Good Morning, ${firstName || "User"}`} subtitle={subtitle}>
      <div className="space-y-5">
        <section className="space-y-3">
          <SectionHeading title="People to Reconnect" />
          {contacts.loading ? (
            <EmptyState title="Loading people..." description="Fetching your saved contacts." />
          ) : contacts.error ? (
            <EmptyState title="Unable to load people." description={contacts.error} />
          ) : heroInsight ? (
            <div className="space-y-3">
              <RelationshipCard insight={heroInsight} hero />
              {otherInsights.map((insight) => (
                <RelationshipCard key={insight.contact.id} insight={insight} />
              ))}
            </div>
          ) : (
            <EmptyState title="No people added yet." description="Go to the People tab and tap + to add your first person." />
          )}
        </section>

        <section>
          <SectionHeading title="Recent Calls" />
          <div className="mt-4 space-y-3">
            {recentCallEntries.length > 0 ? (
              recentCallEntries.map((archive) => (
                <Link key={archive.archiveId} href={`/archive/${encodeURIComponent(archive.archiveId)}`} className="block transition active:scale-[0.99]">
                  <GlassCard className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/36">Latest call</p>
                        <h3 className="mt-2 truncate text-[17px] font-semibold tracking-[-0.02em] text-white">{archive.title}</h3>
                        <p className="mt-1 text-[13px] text-white/52">
                          {archive.collection} <span className="mx-1 text-white/26">?</span> {formatDateLabel(archive.createdAt)}
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[12px] font-medium text-white/70">{formatDuration(archive.duration)}</div>
                    </div>
                  </GlassCard>
                </Link>
              ))
            ) : (
              <EmptyState title="No recent calls yet." description="Your latest private call will appear here." />
            )}
          </div>
        </section>

        <section className="pb-1">
          <SectionHeading title="Recent Memories" />
          <div className="mt-4 space-y-3">
            {recentArchives.length > 0 ? (
              recentArchives.map((archive) => <MemoryRow key={archive.archiveId} archive={archive} />)
            ) : (
              <EmptyState title="No memories yet." description="Your saved conversations will appear here." />
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
