"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Avatar, Badge, GlassCard, SectionHeader } from "@/components/letscall/mobile-shell";
import { useMemoryArchive } from "@/lib/memory-archive/storage";
import type { MemoryArchiveRecord } from "@/lib/memory-archive/types";
import { useSessionProfile } from "@/components/letscall/use-session-profile";

type HomeContact = {
  email: string;
  nickname: string;
  createdAt: string;
};

const CONTACTS_STORAGE_KEY = "letscall.home-contacts.v1";

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  return `${minutes} min`;
}

function readContacts(): HomeContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HomeContact[];
  } catch {
    return [];
  }
}

function writeContacts(contacts: HomeContact[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
  window.dispatchEvent(new Event("letscall:home-contacts-changed"));
}

function useHomeContacts() {
  const [contacts, setContacts] = useState<HomeContact[]>([]);

  useEffect(() => {
    const sync = () => setContacts(readContacts());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("letscall:home-contacts-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("letscall:home-contacts-changed", sync);
    };
  }, []);

  return {
    contacts,
    setContacts: (next: HomeContact[]) => setContacts(next),
    refresh: () => setContacts(readContacts()),
  };
}

function normalizeDisplayName(contact: HomeContact) {
  const nickname = contact.nickname.trim();
  if (nickname) return nickname;
  const localPart = contact.email.split("@")[0] ?? contact.email;
  return localPart
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function describeContactConversation(contact: HomeContact, latestArchive: MemoryArchiveRecord | null) {
  if (!latestArchive) return "No calls yet";
  const haystack = `${latestArchive.title} ${latestArchive.description} ${latestArchive.collection}`.toLowerCase();
  const needle = normalizeDisplayName(contact).toLowerCase();
  if (haystack.includes(needle)) {
    return `${formatDateLabel(latestArchive.createdAt)}`;
  }
  return "No calls yet";
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <GlassCard className="p-4">
      <p className="text-[17px] font-semibold tracking-[-0.02em] text-white">{title}</p>
      <p className="mt-2 text-[14px] leading-6 text-white/58">{description}</p>
    </GlassCard>
  );
}

function ContactCard({
  contact,
  lastConversation,
}: {
  contact: HomeContact;
  lastConversation: string;
}) {
  const displayName = normalizeDisplayName(contact);

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={displayName} imageUrl={null} size={52} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[18px] font-semibold tracking-[-0.02em] text-white">{displayName}</h3>
          <p className="mt-1 text-[13px] text-white/52">Saved contact</p>
        </div>
        <Badge>Private</Badge>
      </div>

      <div className="mt-4 space-y-2 text-[13px] text-white/58">
        <div>
          <span className="text-white/38">Last conversation</span>
          <div className="mt-1 text-white">{lastConversation}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href={`/call?contact=${encodeURIComponent(contact.email)}&name=${encodeURIComponent(displayName)}&mode=video`}
          className="flex min-h-[48px] items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-4 text-[14px] font-semibold text-[#07110f] transition active:scale-[0.98]"
        >
          Video Call
        </Link>
        <Link
          href={`/call?contact=${encodeURIComponent(contact.email)}&name=${encodeURIComponent(displayName)}&mode=audio`}
          className="flex min-h-[48px] items-center justify-center rounded-[18px] border border-white/10 bg-white/6 px-4 text-[14px] font-semibold text-white transition active:scale-[0.98]"
        >
          Audio Call
        </Link>
      </div>
    </GlassCard>
  );
}

function CompactMemoryCard({ archive }: { archive: MemoryArchiveRecord }) {
  return (
    <Link href={`/archive/${encodeURIComponent(archive.archiveId)}`} className="block transition active:scale-[0.99]">
      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/36">{archive.collection}</p>
            <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-white">{archive.title}</h3>
            <p className="mt-1 text-[13px] text-white/52">{formatDateLabel(archive.createdAt)}</p>
          </div>
          <Badge>{formatDuration(archive.duration)}</Badge>
        </div>
        <p className="mt-3 text-[14px] leading-6 text-white/68">Tap to open</p>
      </GlassCard>
    </Link>
  );
}

function AddContactSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (contact: HomeContact) => void;
}) {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ startY: 0, currentY: 0, dragging: false });

  useEffect(() => {
    if (!open) {
      setEmail("");
      setNickname("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const resetDrag = () => {
    dragState.current = { startY: 0, currentY: 0, dragging: false };
    if (panelRef.current) {
      panelRef.current.style.transform = "translateY(0px)";
    }
  };

  const finishDrag = () => {
    const distance = dragState.current.currentY - dragState.current.startY;
    if (distance > 92) {
      onClose();
    } else {
      resetDrag();
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/55 px-3 pb-3 pt-3 backdrop-blur-sm sm:px-4 sm:pb-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="w-full max-w-[480px] rounded-t-[28px] border border-white/10 border-b-0 bg-[linear-gradient(180deg,rgba(14,18,25,0.98),rgba(7,9,13,0.98))] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-out sm:rounded-[28px] sm:border-b"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add someone"
        style={{ maxHeight: "60dvh" }}
      >
        <div
          className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/18"
          role="presentation"
          onPointerDown={(event) => {
            dragState.current = {
              startY: event.clientY,
              currentY: event.clientY,
              dragging: true,
            };
          }}
          onPointerMove={(event) => {
            if (!dragState.current.dragging) return;
            dragState.current.currentY = event.clientY;
            if (panelRef.current) {
              const distance = Math.max(0, event.clientY - dragState.current.startY);
              panelRef.current.style.transform = `translateY(${Math.min(distance, 120)}px)`;
            }
          }}
          onPointerUp={finishDrag}
          onPointerCancel={resetDrag}
        />

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Add Person</p>
            <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-white">Add someone</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[13px] font-medium text-white/82 transition active:scale-[0.98]"
          >
            Cancel
          </button>
        </div>

        <div className="mt-5 space-y-4 overflow-y-auto pr-1">
          <div>
            <label htmlFor="contact-email" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
              Email Address
            </label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="mt-2 h-14 w-full rounded-[20px] border border-white/10 bg-white/6 px-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
            />
          </div>

          <div>
            <label htmlFor="contact-nickname" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
              Nickname (optional)
            </label>
            <input
              id="contact-nickname"
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Mom"
              className="mt-2 h-14 w-full rounded-[20px] border border-white/10 bg-white/6 px-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const normalizedEmail = email.trim().toLowerCase();
              if (!normalizedEmail) return;
              onSave({ email: normalizedEmail, nickname: nickname.trim(), createdAt: new Date().toISOString() });
              onClose();
            }}
            className="flex min-h-[54px] w-full items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[15px] font-semibold text-[#07110f] transition active:scale-[0.98]"
          >
            Continue
          </button>

          <p className="pb-1 text-center text-[12px] leading-5 text-white/42">Saved contacts stay local to this device.</p>
        </div>
      </div>
    </div>
  );
}

export function HomeScreen() {
  const profile = useSessionProfile();
  const { contacts, setContacts } = useHomeContacts();
  const archives = useMemoryArchive();
  const latestArchive = archives[0] ?? null;
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const welcomeName = useMemo(() => profile.name.split(" ")[0] || "there", [profile.name]);

  const firstName = profile.loading ? "" : welcomeName;
  const archiveStatus = profile.archiveEnabled
    ? "Archive Ready"
    : profile.providerConnectionState === "onboarding"
      ? "Needs YouTube Channel"
      : profile.providerConnectionState === "needs_reconnect"
        ? "Reconnect Required"
        : profile.signedIn
          ? "Google Connected"
          : "Guest";

  const addContact = (contact: HomeContact) => {
    const next = [contact, ...contacts.filter((item) => item.email !== contact.email)];
    setContacts(next);
    writeContacts(next);
  };

  return (
    <AppShell activeTab="home" title={`Good Morning, ${firstName || "User"}`} subtitle="Your private conversations, always within reach.">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setAddSheetOpen(true)}
          className="flex min-h-[56px] w-full items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[17px] font-semibold tracking-[-0.02em] text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
        >
          + Add Someone
        </button>

        <section>
          <SectionHeader eyebrow="People" title="Your People" />
          <div className="space-y-3">
            {contacts.length === 0 ? (
              <EmptyCard
                title="No people yet."
                description="Add someone to start your first private conversation."
              />
            ) : (
              contacts.map((contact) => (
                <ContactCard
                  key={contact.email}
                  contact={contact}
                  lastConversation={describeContactConversation(contact, latestArchive)}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <SectionHeader eyebrow="Recent Calls" title="Recent Calls" />
          <div className="space-y-3">
            {latestArchive ? (
              <GlassCard className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/36">Latest call</p>
                    <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-white">{latestArchive.title}</h3>
                    <p className="mt-1 text-[13px] text-white/52">{latestArchive.collection} · {formatDateLabel(latestArchive.createdAt)}</p>
                  </div>
                  <Badge>{formatDuration(latestArchive.duration)}</Badge>
                </div>
                <p className="mt-3 text-[14px] leading-6 text-white/68">{latestArchive.description}</p>
              </GlassCard>
            ) : (
              <EmptyCard title="No recent calls yet." description="Your latest private call will appear here." />
            )}
          </div>
        </section>

        <section className="pb-1">
          <SectionHeader eyebrow="Recent Memories" title="Recent Memories" />
          <div className="space-y-3">
            {latestArchive ? (
              <CompactMemoryCard archive={latestArchive} />
            ) : (
              <EmptyCard title="No recent memories yet." description="Your first archived memory will appear here." />
            )}
          </div>
        </section>
      </div>

      <AddContactSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onSave={addContact}
      />
    </AppShell>
  );
}


