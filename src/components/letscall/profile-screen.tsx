"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Avatar, Badge, GlassCard, SectionHeader } from "@/components/letscall/mobile-shell";
import { people } from "@/lib/letscall-data";
import { disconnectGoogleProvider } from "@/lib/provider-session";
import { clearLocalAuthSession, signInWithGoogleSession } from "@/lib/supabase-browser";
import { isDebugAuthEnabled } from "@/lib/env";
import { useSessionProfile } from "@/components/letscall/use-session-profile";

const YOUTUBE_CREATE_CHANNEL_URL = "https://www.youtube.com/create_channel";

export function ProfileScreen() {
  const router = useRouter();
  const profile = useSessionProfile();
  const { refreshProfile } = profile;
  const [isRefreshingChannel, setIsRefreshingChannel] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState(people[0]?.id ?? "");
  const [inviteEmail, setInviteEmail] = useState("");

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? people[0],
    [selectedPersonId],
  );

  const inviteHref = useMemo(() => {
    const email = inviteEmail.trim();
    if (!email) return "";

    const subject = encodeURIComponent("Join me on LetsCall");
    const body = encodeURIComponent("I’d love to save our calls and memories in LetsCall. Tap the link and sign in when you’re ready.");
    return `mailto:${email}?subject=${subject}&body=${body}`;
  }, [inviteEmail]);

  async function handleConnect() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      await signInWithGoogleSession("/profile");
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
          : "Sign in with Google to finish connecting your archive provider."
    : "No active LetsCall session";

  return (
    <AppShell activeTab="profile" title="People" subtitle="Saved people, call shortcuts, and invites by email.">
      <div className="space-y-4">
        <section>
          <SectionHeader eyebrow="Saved people" title="Saved people" />
          <div className="space-y-3">
            {people.map((person) => {
              const isSelected = person.id === selectedPerson?.id;
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedPersonId(person.id)}
                  className={`w-full text-left transition active:scale-[0.99] ${isSelected ? "scale-[0.995]" : ""}`}
                >
                  <GlassCard className={`p-4 ${isSelected ? "border-white/22 bg-white/10" : ""}`}>
                    <div className="flex items-start gap-3">
                      <Avatar name={person.name} imageUrl={null} size={52} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">{person.relationship}</p>
                        <h3 className="mt-2 truncate text-[18px] font-semibold tracking-[-0.02em] text-white">{person.name}</h3>
                        <p className="mt-1 text-[13px] text-white/58">{person.lastSeen}</p>
                      </div>
                      <Badge>{isSelected ? "Open" : "Tap"}</Badge>
                    </div>
                    <p className="mt-3 text-[14px] leading-6 text-white/68">{person.note}</p>
                  </GlassCard>
                </button>
              );
            })}
          </div>
        </section>

        {selectedPerson ? (
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Tap person</p>
                <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-white">{selectedPerson.name}</h2>
                <p className="mt-2 text-[14px] leading-6 text-white/60">{selectedPerson.note}</p>
              </div>
              <Badge>{selectedPerson.relationship}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a
                href={`/call?person=${encodeURIComponent(selectedPerson.name)}&mode=video`}
                className="flex min-h-[54px] items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[15px] font-semibold text-[#07110f] transition active:scale-[0.98]"
              >
                Video Call
              </a>
              <a
                href={`/call?person=${encodeURIComponent(selectedPerson.name)}&mode=audio`}
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
          <SectionHeader eyebrow="Add someone by email" title="Add someone by email" />
          <GlassCard className="space-y-4 p-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36" htmlFor="invite-email">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="name@example.com"
                className="mt-2 h-14 w-full rounded-[20px] border border-white/10 bg-white/6 px-4 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/20"
              />
            </div>
            <a
              href={inviteHref || undefined}
              aria-disabled={!inviteHref}
              className={`flex min-h-[54px] items-center justify-center rounded-[20px] px-5 text-[15px] font-semibold transition active:scale-[0.98] ${inviteHref ? "bg-[linear-gradient(180deg,#ff8f7d_0%,#ef5b48_100%)] text-white shadow-[0_18px_42px_rgba(239,91,72,0.28)]" : "cursor-not-allowed border border-white/10 bg-white/5 text-white/42"}`}
              onClick={(event) => {
                if (!inviteHref) {
                  event.preventDefault();
                }
              }}
            >
              Send Invite
            </a>
            <p className="text-[12px] leading-5 text-white/52">We&apos;ll add address-book sync later. For now, this opens a ready-to-send email invite.</p>
          </GlassCard>
        </section>

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
                {profile.signedIn ? "Reconnect Google" : "Sign in with Google"}
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
