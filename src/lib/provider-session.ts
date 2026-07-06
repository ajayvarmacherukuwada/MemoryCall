"use client";

import { getBrowserSupabaseClient, type GoogleProviderTokenHandoff } from "@/lib/supabase-browser";

export type ProviderConnectionState = "connected" | "onboarding" | "needs_reconnect" | "revoked" | "disabled" | "missing";

export type ProviderSessionSnapshot = {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  providerKey: string | null;
  providerDisplayName: string | null;
  providerConnectionState: ProviderConnectionState;
  archiveEnabled: boolean;
  youtubeChannelId: string | null;
  youtubeChannelTitle: string | null;
  lastVerifiedAt: string | null;
  connectedAt: string | null;
  refreshRequired: boolean;
  youtubeConnected?: boolean;
  youtubeReason?: string | null;
};

export type ProviderSessionResponse = {
  session: ProviderSessionSnapshot;
  youtubeConnected?: boolean;
  youtubeReason?: string | null;
};

async function getSupabaseAccessToken() {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session?.access_token ?? null;
}

async function authFetch<T>(input: string, init: RequestInit = {}) {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    throw new Error("Missing Supabase session. Please sign in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && body && "error" in body ? String((body as { error?: string }).error ?? "Request failed") : "Request failed";
    const error = new Error(message);
    (error as Error & { code?: string }).code = body && typeof body === "object" && body && "code" in body ? String((body as { code?: string }).code ?? "request_failed") : "request_failed";
    throw error;
  }

  return body as T;
}

export async function fetchProviderSession() {
  const response = await authFetch<ProviderSessionResponse>("/api/auth/session", { method: "GET" });
  return {
    ...response.session,
    youtubeConnected:
      response.youtubeConnected ??
      (response.session.providerConnectionState === "onboarding" && !response.session.youtubeChannelId ? false : response.session.youtubeConnected),
    youtubeReason:
      response.youtubeReason ??
      (response.session.providerConnectionState === "onboarding" && !response.session.youtubeChannelId
        ? "No YouTube channel found for this Google account."
        : response.session.youtubeReason ?? null),
  };
}

export async function completeGoogleProviderConnection(googleTokens: GoogleProviderTokenHandoff) {
  const response = await authFetch<ProviderSessionResponse>("/api/auth/google/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(googleTokens),
  });

  return {
    ...response.session,
    youtubeConnected: response.youtubeConnected ?? response.session.youtubeConnected,
    youtubeReason: response.youtubeReason ?? response.session.youtubeReason ?? null,
  };
}

export async function startGoogleProviderConnection(redirectTo = "/profile") {
  const response = await authFetch<{ authorizationUrl: string }>(`/api/auth/google/start?redirectTo=${encodeURIComponent(redirectTo)}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.authorizationUrl) {
    throw new Error("Google authorization URL was not returned.");
  }

  window.location.assign(response.authorizationUrl);
}

export async function disconnectGoogleProvider() {
  await authFetch<{ ok: true }>("/api/auth/google/disconnect", { method: "POST" });
}
