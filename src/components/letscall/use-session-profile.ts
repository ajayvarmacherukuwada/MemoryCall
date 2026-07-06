"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient, restoreBrowserSessionFromUrlHash } from "@/lib/supabase-browser";
import { completeGoogleProviderConnection, fetchProviderSession, type ProviderSessionSnapshot } from "@/lib/provider-session";

type SessionProfile = ProviderSessionSnapshot & {
  loading: boolean;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type SessionProfileWithActions = SessionProfile & {
  refreshProfile: () => Promise<ProviderSessionSnapshot | null>;
};

function toSessionProfile(session: ProviderSessionSnapshot | null): Omit<SessionProfile, "loading"> {
  if (!session || !session.signedIn) {
    return {
      signedIn: false,
      userId: null,
      displayName: null,
      photoUrl: null,
      providerKey: null,
      providerDisplayName: null,
      providerConnectionState: "missing",
      archiveEnabled: false,
      youtubeChannelId: null,
      youtubeChannelTitle: null,
      lastVerifiedAt: null,
      connectedAt: null,
      refreshRequired: false,
      youtubeConnected: undefined,
      youtubeReason: null,
      name: "Guest",
      email: "Not signed in",
      avatarUrl: null,
    };
  }

  return {
    ...session,
    name: session.displayName ?? session.email ?? "Guest",
    email: session.email ?? "Not signed in",
    avatarUrl: session.photoUrl,
  };
}

function guestProfileState(current: SessionProfile) {
  return {
    ...current,
    loading: false,
    signedIn: false,
    userId: null,
    email: "Not signed in",
    displayName: null,
    photoUrl: null,
    providerKey: null,
    providerDisplayName: null,
    providerConnectionState: "missing" as const,
    archiveEnabled: false,
    youtubeChannelId: null,
    youtubeChannelTitle: null,
    lastVerifiedAt: null,
    connectedAt: null,
    refreshRequired: false,
    youtubeConnected: undefined,
    youtubeReason: null,
    name: "Guest",
    avatarUrl: null,
  };
}

export function useSessionProfile(): SessionProfileWithActions {
  const [profile, setProfile] = useState<SessionProfile>({
    loading: true,
    signedIn: false,
    userId: null,
    displayName: null,
    photoUrl: null,
    providerKey: null,
    providerDisplayName: null,
    providerConnectionState: "missing",
    archiveEnabled: false,
    youtubeChannelId: null,
    youtubeChannelTitle: null,
    lastVerifiedAt: null,
    connectedAt: null,
    refreshRequired: false,
    youtubeConnected: undefined,
    youtubeReason: null,
    name: "Guest",
    email: "Not signed in",
    avatarUrl: null,
  });

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let isCancelled = false;

    const resetToGuest = () => {
      if (isCancelled) return;
      setProfile((current) => guestProfileState(current));
    };

    const applySession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session?.access_token) {
          if (!isCancelled) {
            setProfile((current) => guestProfileState(current));
          }
          return null;
        }

        const session = await fetchProviderSession();

        if (!isCancelled) {
          setProfile({ loading: false, ...toSessionProfile(session) });
        }

        return session;
      } catch {
        if (!isCancelled) {
          setProfile((current) => ({
            ...current,
            loading: false,
          }));
        }
        return null;
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void applySession();
    });

    const handleAuthReset = () => {
      resetToGuest();
    };

    window.addEventListener("letscall-auth-reset", handleAuthReset);

    void restoreBrowserSessionFromUrlHash()
      .then(async (restoreResult) => {
        if (!restoreResult?.googleProviderTokens) {
          return;
        }

        try {
          await completeGoogleProviderConnection(restoreResult.googleProviderTokens);
        } catch {
          // Keep the base Supabase session available even if provider completion needs follow-up.
        }
      })
      .catch(() => {
        // Ignore URL-hash restoration failures and continue with normal session loading.
      })
      .finally(() => {
        void applySession();
      });

    return () => {
      isCancelled = true;
      window.removeEventListener("letscall-auth-reset", handleAuthReset);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return {
    ...profile,
    refreshProfile: async () => {
      const session = await fetchProviderSession();
      setProfile({ loading: false, ...toSessionProfile(session) });
      return session;
    },
  };
}
