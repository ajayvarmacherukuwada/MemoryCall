"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { getBrowserDeviceMetadata } from "@/lib/browser-device";

async function getSupabaseAccessToken() {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session?.access_token ?? null;
}

export async function authFetch<T>(input: string, init: RequestInit = {}) {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    throw new Error("Missing Supabase session. Please sign in again.");
  }

  const metadata = getBrowserDeviceMetadata();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("x-letscall-device-id", metadata.deviceId);
  headers.set("x-letscall-device-name", metadata.deviceName);
  headers.set("x-letscall-device-platform", metadata.platform);
  if (metadata.platformVersion) {
    headers.set("x-letscall-device-platform-version", metadata.platformVersion);
  }
  if (metadata.appVersion) {
    headers.set("x-letscall-app-version", metadata.appVersion);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && body && "error" in body
        ? String((body as { error?: string }).error ?? "Request failed")
        : "Request failed";
    const error = new Error(message);
    (error as Error & { code?: string }).code =
      body && typeof body === "object" && body && "code" in body
        ? String((body as { code?: string }).code ?? "request_failed")
        : "request_failed";
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return body as T;
}

export async function touchSessionPresence() {
  await authFetch<{ ok: true }>("/api/auth/session/heartbeat", {
    method: "POST",
    cache: "no-store",
  });
}
