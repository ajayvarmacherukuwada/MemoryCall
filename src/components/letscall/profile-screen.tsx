"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Avatar, Badge, GlassCard, SectionHeader } from "@/components/letscall/mobile-shell";
import { disconnectGoogleProvider, startGoogleProviderConnection } from "@/lib/provider-session";
import { clearLocalAuthSession, signInWithGoogleSession } from "@/lib/supabase-browser";
import { isDebugAuthEnabled } from "@/lib/env";
import { useSessionProfile } from "@/components/letscall/use-session-profile";
import { useContacts } from "@/components/letscall/use-contacts";

const YOUTUBE_CREATE_CHANNEL_URL = "https://www.youtube.com/create_channel";

export function ProfileScreen() {
  const router = useRouter();
  const profile = useSessionProfile();
  const { refreshProfile } = profile;
  const contacts = useContacts(profile.signedIn);
  const [isRefreshingChannel, setIsRefreshingChannel] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  useEffect(() => {
    if (!selectedContactId && contacts.contacts[0]) {
      setSelectedContactId(contacts.contacts[0].id);
    }
  }, [contacts.contacts, selectedContactId]);

  const selectedContact = useMemo(
    () => contacts.contacts.find((contact) => contact.id === selectedContactId) ?? contacts.contacts[0] ?? null,
    [contacts.contacts, selectedContactId],
  );

  async function handleConnect() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (profile.signedIn) {
        await startGoogleProviderConnection("/profile");
      } else {
        await signInWithGoogleSession("/profile");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to connect Google.");
    }
  }

  async function handleDisconnect() {
    if (typeof window === "undefined") return;

    try {
      await disconnectGoogleProvider();
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to disconnect Google.");
    }
  }

  async function handleClearSession() {
    if (typeof window === "undefined") return;

    try {
      await clearLocalAuthSession();
      router.replace("/profile");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to clear the session.");
    }
  }

  async function handleRefreshChannelStatus() {
    if (typeof window === "undefined") return;

    setIsRefreshingChannel(true);

    try {
      await refreshProfile();
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to refresh your channel status.");
    } finally {
      setIsRefreshingChannel(false);
    }
  }

  function handleCreateChannel() {
    if (typeof window === "undefined") return;

    window.open(YOUTUBE_CREATE_CHANNEL_URL, "_blank", "noopener,noreferrer");
  }

  const isGoogleConnected = profile.signedIn && ["connected", "onboarding"].includes(profile.providerConnectionState);
  const isNoYouTubeState = isGoogleConnected && profile.youtubeConnected === false && Boolean(profile.youtubeReason);
  const archiveBadge = profile.archiveEnabled
    ? "Archive Ready"
    : isNoYouTubeState
      ? "Needs YouTube Channel"
      : profile.providerConnectionState === "needs_reconnect"
        ? "Reconnect Required"
        : profile.signedIn && profile.providerConnectionState === "missing"
          ? "Google Not Connected"
          : profile.signedIn
            ? "Google Connected"
            : "Not Connected";
  const statusText = profile.signedIn
    ? profile.archiveEnabled
      ? "Connected with Google and ready for archives"
      : isNoYouTubeState
        ? "Google is connected, but no YouTube channel was found for this account."
        : profile.providerConnectionState === "needs_reconnect"
          ? "Google needs to be reconnected to continue archiving."
          : profile.providerConnectionState === "missing"
            ? "Signed in to MemoryCall. Connect Google to enable archiving features."
            : "Google is connected."
    : "No active LetsCall session";

  return (
    <AppShell activeTab="profile" title="People" subtitle="Saved people, call shortcuts, and connected providers.">
      <div className="space-y-4">
        <section>
          <SectionHeader eyebrow="Saved people" title="Saved people" />
          <div className="space-y-3">
            {contacts.loading ? (
              <GlassCard className="p-4">
                <p className="text-[14px] text-white/58">Loading contacts...</p>
              </GlassCard>
            ) : contacts.contacts.length === 0 ? (
              <GlassCard className="p-4">
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-white">No people yet.</p>
                <p className="mt-2 text-[14px] leading-6 text-white/58">Add someone on Home to start your first private conversation.</p>
              </GlassCard>
            ) : (
              contacts.contacts.map((contact) => {
                const isSelected = contact.id === selectedContact?.id;
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedContactId(contact.id)}
                    className={`w-full text-left transition active:scale-[0.99] ${isSelected ? "scale-[0.995]" : ""}`}
                  >
                    <GlassCard className={`p-4 ${isSelected ? "border-white/22 bg-white/10" : ""}`}>
                      <div className="flex items-start gap-3">
                        <Avatar name={contact.displayName} imageUrl={null} size={52} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">{contact.isOnline ? "Online" : "Offline"}</p>
                          <h3 className="mt-2 truncate text-[18px] font-semibold tracking-[-0.02em] text-white">{contact.displayName}</h3>
                          <p className="mt-1 text-[13px] text-white/58">{contact.lastSeenAt ? `Last seen ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(contact.lastSeenAt))}` : "Saved contact"}</p>
                        </div>
                        <Badge>{isSelected ? "Open" : "Tap"}</Badge>
                      </div>
                      <p className="mt-3 text-[14px] leading-6 text-white/68">Tap to open a private call shortcut.</p>
                    </GlassCard>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {selectedContact ? (
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Tap person</p>
                <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-white">{selectedContact.displayName}</h2>
                <p className="mt-2 text-[14px] leading-6 text-white/60">{selectedContact.isOnline ? "Online now" : "Offline right now"}</p>
              </div>
              <Badge>{selectedContact.isOnline ? "Ready" : "Offline"}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a
                href={`/call?contactId=${encodeURIComponent(selectedContact.id)}&name=${encodeURIComponent(selectedContact.displayName)}&mode=video`}
                onClick={() => console.info("[CALL UI]", JSON.stringify({ step: "Video Call button clicked", at: new Date().toISOString(), contactId: selectedContact.id, contactName: selectedContact.displayName, mode: "video" }))}
                className="flex min-h-[54px] items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[15px] font-semibold text-[#07110f] transition active:scale-[0.98]"
              >
                Video Call
              </a>
              <a
                href={`/call?contactId=${encodeURIComponent(selectedContact.id)}&name=${encodeURIComponent(selectedContact.displayName)}&mode=audio`}
                onClick={() => console.info("[CALL UI]", JSON.stringify({ step: "Audio Call button clicked", at: new Date().toISOString(), contactId: selectedContact.id, contactName: selectedContact.displayName, mode: "audio" }))}
                className="flex min-h-[54px] items-center justify-center rounded-[20px] border border-white/10 bg-white/6 px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]"
              >
                Audio Call
              </a>
            </div>
            <button
              type="button"
              disabled
              className="mt-3 flex min-h-[54px] w-full cursor-not-allowed items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-white/4 px-5 text-[15px] font-semibold text-white/42"
            >
              Shared Memories later
            </button>
          </GlassCard>
        ) : null}

        <section>
          <SectionHeader eyebrow="Provider" title="Google connection" />
          <div className="space-y-3">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[16px] font-semibold text-white">Status</p>
                  <p className="mt-1 text-[14px] text-white/60">{statusText}</p>
                </div>
                <Badge>{archiveBadge}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-white/64">
                <div className="rounded-[20px] bg-white/6 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/36">Provider</p>
                  <p className="mt-2 font-medium text-white">{isGoogleConnected ? (profile.providerDisplayName ?? "Google") : "Not linked"}</p>
                </div>
                <div className="rounded-[20px] bg-white/6 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/36">YouTube</p>
                  <p className="mt-2 font-medium text-white">{profile.youtubeChannelTitle ?? "Not linked"}</p>
                  {isNoYouTubeState ? (
                    <p className="mt-2 text-[12px] leading-5 text-white/52">
                      A YouTube channel is required to archive your memories. Creating one takes about one minute.
                    </p>
                  ) : null}
                </div>
              </div>
            </GlassCard>

            {profile.signedIn && isGoogleConnected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex min-h-[56px] items-center justify-center rounded-[24px] border border-white/10 bg-white/6 px-5 text-[16px] font-semibold text-white transition active:scale-[0.98]"
              >
                Disconnect Google
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className="flex min-h-[56px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
              >
                {profile.signedIn ? (isGoogleConnected ? "Disconnect Google" : "Connect Google") : "Continue with Google"}
              </button>
            )}

            {isNoYouTubeState ? (
              <>
                <button
                  type="button"
                  onClick={handleCreateChannel}
                  className="flex min-h-[56px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#ff8f7d_0%,#ef5b48_100%)] px-5 text-[16px] font-semibold text-white shadow-[0_18px_42px_rgba(239,91,72,0.28)] transition active:scale-[0.98]"
                >
                  Create YouTube Channel
                </button>
                <p className="px-2 text-center text-[12px] text-white/52">
                  You&apos;ll return here after creating your channel.
                </p>
                <button
                  type="button"
                  onClick={handleRefreshChannelStatus}
                  disabled={isRefreshingChannel}
                  className="flex min-h-[56px] items-center justify-center rounded-[24px] border border-white/10 bg-white/6 px-5 text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRefreshingChannel ? "Checking Channel..." : "I've Created My Channel"}
                </button>
              </>
            ) : null}

            {isDebugAuthEnabled() ? (
              <button
                type="button"
                onClick={handleClearSession}
                className="flex min-h-[48px] items-center justify-center rounded-[20px] border border-white/10 bg-white/5 px-5 text-[14px] font-medium text-white/76 transition active:scale-[0.98]"
              >
                Clear Session
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}