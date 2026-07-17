"use client";

const DEVICE_ID_STORAGE_KEY = "letscall.device-id.v1";

function getNavigatorValue(value: string | undefined | null, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export type BrowserDeviceMetadata = {
  deviceId: string;
  deviceName: string;
  platform: string;
  platformVersion: string | null;
  appVersion: string | null;
};

export function getBrowserDeviceMetadata(): BrowserDeviceMetadata {
  if (typeof window === "undefined") {
    return {
      deviceId: "server",
      deviceName: "server",
      platform: "server",
      platformVersion: null,
      appVersion: null,
    };
  }

  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  const deviceId = existing ?? crypto.randomUUID();
  if (!existing) {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }

  const userAgentData = (navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      platformVersion?: string;
    };
  }).userAgentData;

  return {
    deviceId,
    deviceName: getNavigatorValue(navigator.platform, navigator.userAgent),
    platform: getNavigatorValue(userAgentData?.platform, navigator.platform || "web"),
    platformVersion: userAgentData?.platformVersion ?? null,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || null,
  };
}
