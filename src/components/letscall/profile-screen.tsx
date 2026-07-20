'use client';

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AppShell, Avatar, GlassCard } from "@/components/letscall/mobile-shell";
import { useContacts } from "@/components/letscall/use-contacts";
import { useSessionProfile } from "@/components/letscall/use-session-profile";
import type { ContactCreationResult, ContactSummary, MemoryInviteSummary } from "@/lib/contacts-client";

function CallActionLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`grid size-10 place-items-center rounded-full border border-white/10 bg-white/6 text-white/86 transition active:scale-[0.96] ${className}`}
    >
      {children}
    </Link>
  );
}

function PresenceDot({ isOnline }: { isOnline: boolean }) {
  return <span className={`size-2.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-rose-400"} shadow-[0_0_0_4px_rgba(255,255,255,0.03)]`} />;
}

function ContactCard({ contact }: { contact: ContactSummary }) {
  return (
    <GlassCard className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={contact.displayName} imageUrl={null} size={42} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white">{contact.displayName}</h3>
        </div>
        <div className="flex items-center gap-2 pl-1">
          <CallActionLink
            href={`/call?contactId=${encodeURIComponent(contact.id)}&name=${encodeURIComponent(contact.displayName)}&mode=video`}
            label={`Start video call with ${contact.displayName}`}
            className="hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M14.5 8.5 20 5.5v13l-5.5-3" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="4.5" y="7" width="10" height="10" rx="2.5" />
            </svg>
          </CallActionLink>
          <CallActionLink
            href={`/call?contactId=${encodeURIComponent(contact.id)}&name=${encodeURIComponent(contact.displayName)}&mode=audio`}
            label={`Start audio call with ${contact.displayName}`}
            className="hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M9 9.5v5a3 3 0 0 0 6 0v-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 16.5V19" strokeLinecap="round" />
              <path d="M8.5 19h7" strokeLinecap="round" />
            </svg>
          </CallActionLink>
          <PresenceDot isOnline={contact.isOnline} />
        </div>
      </div>
    </GlassCard>
  );
}

function AddPersonSheet({
  open,
  inviterName,
  onClose,
  onSave,
}: {
  open: boolean;
  inviterName: string;
  onClose: () => void;
  onSave: (contact: { email: string; displayName: string }) => Promise<ContactCreationResult>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "neutral" | "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<MemoryInviteSummary | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ startY: 0, currentY: 0, dragging: false });

  useEffect(() => {
    if (!open) {
      setEmail("");
      setDisplayName("");
      setFeedback(null);
      setSaving(false);
      setInvite(null);
      if (panelRef.current) {
        panelRef.current.style.transform = "translateY(0px)";
      }
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

  if (!open) return null;

  const emailValue = email.trim().toLowerCase();
  const displayNameValue = displayName.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canContinue = !saving && !invite && Boolean(emailValue && emailPattern.test(emailValue) && displayNameValue);

  const resetDrag = () => {
    dragState.current = { startY: 0, currentY: 0, dragging: false };
    if (panelRef.current) {
      panelRef.current.style.transform = "translateY(0px)";
    }
  };

  const finishDrag = () => {
    const distance = dragState.current.currentY - dragState.current.startY;
    if (distance > 92) onClose();
    else resetDrag();
  };

  const handleSave = async () => {
    if (!emailValue || !emailPattern.test(emailValue)) {
      setFeedback({ tone: "error", message: "Please enter a valid email address." });
      return;
    }

    if (!displayNameValue) {
      setFeedback({ tone: "error", message: "Please enter a display name." });
      return;
    }

    setSaving(true);
    setFeedback({ tone: "neutral", message: "Checking MemoryCall account..." });

    try {
      const result = await onSave({ email: emailValue, displayName: displayNameValue });
      if (result.status === "contact_added") {
        setInvite(null);
        setFeedback({ tone: "success", message: "Contact added successfully." });
        window.setTimeout(() => onClose(), 650);
      } else {
        setInvite(result.invite);
        setFeedback({ tone: "neutral", message: "This person isn't on MemoryCall yet." });
      }
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Unable to add this contact." });
    } finally {
      setSaving(false);
    }
  };

  const handleShareInvite = async () => {
    if (!invite || typeof window === "undefined") return;

    const shareTitle = "Join me on MemoryCall";
    const shareText = `${inviterName} invited you to join MemoryCall.`;

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: invite.shareUrl });
      } else {
        await navigator.clipboard.writeText(invite.shareUrl);
        setFeedback({ tone: "success", message: "Invite link copied to clipboard." });
      }
    } catch {
      setFeedback({ tone: "error", message: "Unable to share the invite link." });
    }
  };

  const handleInputChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (invite) {
      setInvite(null);
      setFeedback(null);
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
        aria-label="Add person"
        style={{ maxHeight: "60dvh" }}
      >
        <div
          className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/18"
          role="presentation"
          onPointerDown={(event) => {
            dragState.current = { startY: event.clientY, currentY: event.clientY, dragging: true };
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
              onChange={(event) => handleInputChange(setEmail)(event.target.value)}
              placeholder="name@example.com"
              className="mt-2 h-14 w-full rounded-[20px] border border-white/10 bg-white/6 px-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
            />
          </div>

          <div>
            <label htmlFor="contact-display-name" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
              Display Name
            </label>
            <input
              id="contact-display-name"
              type="text"
              value={displayName}
              onChange={(event) => handleInputChange(setDisplayName)(event.target.value)}
              placeholder="Mom"
              className="mt-2 h-14 w-full rounded-[20px] border border-white/10 bg-white/6 px-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
            />
          </div>

          {!invite ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={!canContinue}
              className="flex min-h-[54px] w-full items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[15px] font-semibold text-[#07110f] transition active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? "Checking MemoryCall account..." : "Continue"}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="px-2 text-center text-[13px] leading-6 text-white/72">This person isn&apos;t on MemoryCall yet.</p>
              <button
                type="button"
                onClick={handleShareInvite}
                className="flex min-h-[54px] w-full items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[15px] font-semibold text-[#07110f] transition active:scale-[0.98]"
              >
                Share Invite
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[54px] w-full items-center justify-center rounded-[20px] border border-white/10 bg-white/6 px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          )}

          {feedback ? (
            <p className={`pb-1 text-center text-[12px] leading-5 ${feedback.tone === "success" ? "text-emerald-200" : feedback.tone === "error" ? "text-rose-200" : "text-white/42"}`}>
              {feedback.message}
            </p>
          ) : (
            <p className="pb-1 text-center text-[12px] leading-5 text-white/42">Saved contacts stay private in your people list.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProfileScreen() {
  const profile = useSessionProfile();
  const contacts = useContacts(profile.signedIn);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  return (
    <AppShell activeTab="people" title="People" subtitle="Who do you want to call?">
      <div className="space-y-4 pb-[calc(18px+env(safe-area-inset-bottom)+84px)]">
        <section className="space-y-3">
          {contacts.loading ? (
            <GlassCard className="p-4">
              <p className="text-[14px] text-white/58">Loading people...</p>
            </GlassCard>
          ) : contacts.contacts.length === 0 ? (
            <GlassCard className="p-4">
              <p className="text-[17px] font-semibold tracking-[-0.02em] text-white">No people added yet.</p>
              <p className="mt-2 text-[14px] leading-6 text-white/58">Tap + to add your first person.</p>
            </GlassCard>
          ) : (
            contacts.contacts.map((contact) => <ContactCard key={contact.id} contact={contact} />)
          )}
        </section>

        <div className="sticky bottom-[calc(14px+env(safe-area-inset-bottom)+78px)] z-30 flex justify-end pointer-events-none">
          <button
            type="button"
            onClick={() => setAddSheetOpen(true)}
            aria-label="Add person"
            className="pointer-events-auto grid size-14 place-items-center rounded-full bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] text-[26px] font-semibold text-[#07110f] shadow-[0_18px_40px_rgba(87,209,171,0.34)] transition active:scale-[0.96]"
          >
            +
          </button>
        </div>
      </div>

      <AddPersonSheet open={addSheetOpen} inviterName={profile.name || "Someone"} onClose={() => setAddSheetOpen(false)} onSave={contacts.addContact} />
    </AppShell>
  );
}

