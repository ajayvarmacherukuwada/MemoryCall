"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { GOOGLE_WEB_SCOPES } from "@/lib/google-scopes";

let browserClient: SupabaseClient | null = null;

export type GoogleProviderTokenHandoff = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string;
  expiresIn: number;
};

export type BrowserSessionRestoreResult = {
  session: Session | null;
  googleProviderTokens: GoogleProviderTokenHandoff | null;
};

export function getBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase public environment variables are missing.");
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });

  return browserClient;
}

export async function getExistingBrowserSession() {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session ?? null;
}

function readOAuthFragment() {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    tokenType: params.get("token_type") ?? "bearer",
    providerToken: params.get("provider_token"),
    providerRefreshToken: params.get("provider_refresh_token"),
    scope: params.get("scope") ?? GOOGLE_WEB_SCOPES.archiveAccess,
    expiresIn: Number(params.get("expires_in") ?? "3600"),
  };
}

function clearUrlHash() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.toString());
}

function clearStorageKeys(storage: Storage, prefixes: string[]) {
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

function clearLetsCallClientState() {
  if (typeof window === "undefined") {
    return;
  }

  clearStorageKeys(window.localStorage, ["sb-"]);
  window.localStorage.removeItem("letscall.memory-archive.provider.v2");
  clearStorageKeys(window.sessionStorage, ["sb-"]);
  clearUrlHash();
}

function notifyAuthReset() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("letscall-auth-reset"));
}

export async function restoreBrowserSessionFromUrlHash() {
  const supabase = getBrowserSupabaseClient();
  const fragment = readOAuthFragment();
  if (!fragment) {
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: fragment.accessToken,
    refresh_token: fragment.refreshToken,
  });

  if (error) {
    throw error;
  }

  if (data.session) {
    clearUrlHash();
  }

  return {
    session: data.session ?? null,
    googleProviderTokens: fragment.providerToken
      ? {
          accessToken: fragment.providerToken,
          refreshToken: fragment.providerRefreshToken,
          tokenType: fragment.tokenType,
          scope: fragment.scope,
          expiresIn: Number.isFinite(fragment.expiresIn) ? fragment.expiresIn : 3600,
        }
      : null,
  } satisfies BrowserSessionRestoreResult;
}

export async function clearLocalAuthSession() {
  const supabase = getBrowserSupabaseClient();

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Local sign-out cleanup is best-effort in development.
  }

  clearLetsCallClientState();
  notifyAuthReset();
  console.info("[AUTH DEBUG] Local auth session cleared.");
}

export async function signInWithGoogleSession(redirectTo = "/profile") {
  const supabase = getBrowserSupabaseClient();
  const absoluteRedirectTo = new URL(redirectTo, window.location.origin).toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: absoluteRedirectTo,
    },
  });

  if (error) {
    throw error;
  }

  if (!data.url) {
    throw new Error("Supabase did not return a Google sign-in URL.");
  }

  window.location.href = data.url;
}
