"use client";

import { useState, type ReactNode } from "react";
import { AppShell, Avatar } from "@/components/letscall/mobile-shell";
import { useSessionProfile } from "@/components/letscall/use-session-profile";
import { clearLocalAuthSession, signInWithGoogleSession } from "@/lib/supabase-browser";
import { disconnectGoogleProvider, startGoogleProviderConnection } from "@/lib/provider-session";

type ServiceKey = "google" | "youtube";

function Section({ children }: { children: ReactNode }) {
  return <section className="overflow-hidden rounded-[24px] border border-white/10 bg-white/5">{children}</section>;
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-white/30" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span className={connected ? "inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-300" : "inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-300"}>
      <span className={connected ? "size-2 rounded-full bg-emerald-400" : "size-2 rounded-full bg-rose-400"} />
      {connected ? "Connected" : "Not Connected"}
    </span>
  );
}

function ServiceIcon({ service }: { service: ServiceKey }) {
  if (service === "google") {
    return (
      <div className="grid size-10 place-items-center rounded-[14px] border border-white/10 bg-[linear-gradient(135deg,rgba(67,97,238,0.28),rgba(52,211,153,0.14))] text-[13px] font-semibold text-white">
        G
      </div>
    );
  }

  return (
    <div className="grid size-10 place-items-center rounded-[14px] border border-white/10 bg-[linear-gradient(135deg,rgba(239,68,68,0.24),rgba(255,255,255,0.06))] text-white">
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
        <path d="M9.5 7.5v9l7-4.5-7-4.5Z" />
      </svg>
    </div>
  );
}

function PrefIcon({ children }: { children: ReactNode }) {
  return <span className="grid size-10 place-items-center rounded-[14px] border border-white/10 bg-white/6 text-[16px] text-white/90">{children}</span>;
}

function RowButton({
  onClick,
  children,
  expanded,
}: {
  onClick?: () => void | Promise<void>;
  children: ReactNode;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={typeof expanded === "boolean" ? expanded : undefined}
      className="flex w-full items-center gap-3 px-4 py-4 text-left transition active:bg-white/5"
    >
      {children}
    </button>
  );
}

function PreferenceRow({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-white/5">
      <PrefIcon>{icon}</PrefIcon>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-white">{title}</span>
        {description ? <span className="mt-0.5 block text-[12px] leading-5 text-white/44">{description}</span> : null}
      </span>
      <Chevron />
    </button>
  );
}

export function ProfileScreen() {
  const profile = useSessionProfile();
  const [expanded, setExpanded] = useState<ServiceKey | null>(null);
  const [busy, setBusy] = useState<"google" | "youtube" | "signout" | null>(null);

  const connectedGoogle = profile.signedIn && profile.providerConnectionState === "connected";
  const connectedYoutube = Boolean(profile.youtubeConnected);
  const accountName = profile.name || "Guest";

  const beginGoogleAuth = async () => {
    setBusy("google");
    try {
      if (!profile.signedIn) {
        await signInWithGoogleSession("/profile");
        return;
      }

      await startGoogleProviderConnection("/profile");
    } finally {
      setBusy(null);
    }
  };

  const handleServiceTap = async (service: ServiceKey) => {
    if (service === "google") {
      if (connectedGoogle) {
        setExpanded((current) => (current === service ? null : service));
        return;
      }
      await beginGoogleAuth();
      return;
    }

    if (connectedYoutube) {
      setExpanded((current) => (current === service ? null : service));
      return;
    }

    await beginGoogleAuth();
  };

  const handleDisconnectGoogle = async () => {
    setBusy("google");
    try {
      await disconnectGoogleProvider();
      await profile.refreshProfile();
      setExpanded(null);
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = async () => {
    setBusy("signout");
    try {
      await clearLocalAuthSession();
      setExpanded(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell activeTab="profile" title="Profile" subtitle="Account and settings">
      <div className="space-y-5 pb-[calc(24px+env(safe-area-inset-bottom)+96px)]">
          <Section>
            <div className="flex items-center gap-3 px-4 py-4">
              <Avatar name={accountName} imageUrl={profile.avatarUrl} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-white">{accountName}</p>
                <p className="truncate text-[13px] text-white/54">{profile.email}</p>
              </div>
            </div>
            {!profile.signedIn ? (
              <div className="border-t border-white/8 px-4 py-4">
                <button
                  type="button"
                  onClick={() => void beginGoogleAuth()}
                  disabled={busy === "google"}
                  className="flex min-h-[48px] w-full items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-4 text-[15px] font-semibold text-[#07110f] transition active:scale-[0.98] disabled:opacity-60"
                >
                  Continue with Google
                </button>
              </div>
            ) : null}
          </Section>

          <Section>
            <div className="border-b border-white/8 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Connected Accounts</p>
            </div>

            <div className="divide-y divide-white/8">
              <div>
                <RowButton onClick={() => void handleServiceTap("google")} expanded={expanded === "google"}>
                  <ServiceIcon service="google" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[15px] font-medium text-white">Google</span>
                      <StatusPill connected={connectedGoogle} />
                    </div>
                    {connectedGoogle ? <p className="mt-1 truncate text-[12px] leading-5 text-white/46">{profile.email}</p> : null}
                  </div>
                  <Chevron />
                </RowButton>
                {expanded === "google" && connectedGoogle ? (
                  <div className="border-t border-white/8 px-4 pb-4 pt-1">
                    <div className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                      <p className="text-[13px] leading-6 text-white/62">Signed in as {profile.email}</p>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void beginGoogleAuth()}
                          disabled={busy === "google"}
                          className="flex-1 rounded-[16px] border border-white/10 bg-white/6 px-4 py-3 text-[13px] font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                        >
                          Reconnect Google
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDisconnectGoogle()}
                          disabled={busy === "google"}
                          className="flex-1 rounded-[16px] border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-[13px] font-medium text-rose-200 transition active:scale-[0.98] disabled:opacity-60"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <RowButton onClick={() => void handleServiceTap("youtube")} expanded={expanded === "youtube"}>
                  <ServiceIcon service="youtube" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[15px] font-medium text-white">YouTube</span>
                      <StatusPill connected={connectedYoutube} />
                    </div>
                    {connectedYoutube ? <p className="mt-1 truncate text-[12px] leading-5 text-white/46">{profile.youtubeChannelTitle ?? "Connected for archiving"}</p> : null}
                  </div>
                  <Chevron />
                </RowButton>
                {expanded === "youtube" && connectedYoutube ? (
                  <div className="border-t border-white/8 px-4 pb-4 pt-1">
                    <div className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                      <p className="text-[13px] leading-6 text-white/62">{profile.youtubeChannelTitle ?? "YouTube connected and ready for archives."}</p>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void beginGoogleAuth()}
                          disabled={busy === "youtube"}
                          className="flex-1 rounded-[16px] border border-white/10 bg-white/6 px-4 py-3 text-[13px] font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
                        >
                          Refresh Connection
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDisconnectGoogle()}
                          disabled={busy === "youtube"}
                          className="flex-1 rounded-[16px] border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-[13px] font-medium text-rose-200 transition active:scale-[0.98] disabled:opacity-60"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </Section>

          <Section>
            <div className="border-b border-white/8 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Preferences</p>
            </div>
            <div className="divide-y divide-white/8">
              <PreferenceRow icon={<>??</>} title="Notifications" description="Call alerts and reminders" />
              <PreferenceRow icon={<>??</>} title="Privacy" description="Who can reach you" />
              <PreferenceRow icon={<>??</>} title="Storage" description="Saved recordings and cache" />
            </div>
          </Section>

          <Section>
            <div className="border-b border-white/8 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Support</p>
            </div>
            <div className="divide-y divide-white/8">
              <PreferenceRow icon={<>?</>} title="Help" description="Tips and support" />
              <PreferenceRow icon={<>??</>} title="About" description="MemoryCall version and legal" />
            </div>
          </Section>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={busy === "signout"}
        className="flex min-h-[50px] w-full items-center justify-center rounded-[18px] border border-rose-400/18 bg-[rgba(28,10,14,0.94)] px-4 text-[14px] font-semibold text-rose-200 shadow-[0_-10px_30px_rgba(0,0,0,0.22)] transition active:scale-[0.98] disabled:opacity-60"
      >
        Sign Out
      </button>
    </div>
    </AppShell>
  );
}

export const ProfilePlaceholder = ProfileScreen;


