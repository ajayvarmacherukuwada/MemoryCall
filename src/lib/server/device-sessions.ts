import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

const ACTIVE_SESSION_WINDOW_MS = 90 * 1000;

export type DeviceSessionMetadata = {
  deviceId: string;
  deviceName: string;
  platform: string;
  platformVersion: string | null;
  appVersion: string | null;
};

function logDeviceSessionEvent(step: string, details: Record<string, unknown>) {
  console.info("[LetsCall][DeviceSession]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

export function readDeviceSessionMetadata(request: Request) {
  const headers = request.headers;
  const deviceId = headers.get("x-letscall-device-id")?.trim() ?? "";
  const deviceName = headers.get("x-letscall-device-name")?.trim() ?? "";
  const platform = headers.get("x-letscall-device-platform")?.trim() ?? "";
  const platformVersion = headers.get("x-letscall-device-platform-version")?.trim() ?? null;
  const appVersion = headers.get("x-letscall-app-version")?.trim() ?? null;

  if (!deviceId) {
    return null;
  }

  return {
    deviceId,
    deviceName: deviceName || "Unknown device",
    platform: platform || "web",
    platformVersion,
    appVersion,
  } satisfies DeviceSessionMetadata;
}

function buildDeviceSessionPayload(profileId: string, metadata: DeviceSessionMetadata) {
  const now = new Date().toISOString();
  return {
    profile_id: profileId,
    device_identifier: metadata.deviceId,
    device_name: metadata.deviceName,
    platform: metadata.platform,
    platform_version: metadata.platformVersion,
    app_version: metadata.appVersion,
    last_seen_at: now,
    signed_in_at: now,
    signed_out_at: null,
    revoked_at: null,
    deleted_at: null,
  };
}

export async function touchDeviceSession(profileId: string, metadata: DeviceSessionMetadata) {
  const supabase = getSupabaseAdminClient();
  const payload = buildDeviceSessionPayload(profileId, metadata);

  logDeviceSessionEvent("touch_start", {
    profileId,
    deviceId: metadata.deviceId,
  });

  const { data: existing, error: selectError } = await supabase
    .from("device_sessions")
    .select("id,deleted_at")
    .eq("profile_id", profileId)
    .eq("device_identifier", metadata.deviceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selectError) {
    logDeviceSessionEvent("touch_select_failed", {
      profileId,
      deviceId: metadata.deviceId,
      message: selectError.message,
      code: selectError.code ?? null,
    });
    throw selectError;
  }

  if (existing?.id) {
    const { error: updateError } = await supabase.from("device_sessions").update(payload).eq("id", existing.id);
    if (updateError) {
      logDeviceSessionEvent("touch_update_failed", {
        profileId,
        deviceId: metadata.deviceId,
        message: updateError.message,
        code: updateError.code ?? null,
      });
      throw updateError;
    }

    logDeviceSessionEvent("touch_update_complete", {
      profileId,
      deviceId: metadata.deviceId,
      deviceSessionId: existing.id,
    });
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("device_sessions")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: conflicted, error: retrySelectError } = await supabase
        .from("device_sessions")
        .select("id")
        .eq("profile_id", profileId)
        .eq("device_identifier", metadata.deviceId)
        .is("deleted_at", null)
        .maybeSingle();

      if (retrySelectError) {
        logDeviceSessionEvent("touch_retry_select_failed", {
          profileId,
          deviceId: metadata.deviceId,
          message: retrySelectError.message,
          code: retrySelectError.code ?? null,
        });
        throw retrySelectError;
      }

      if (conflicted?.id) {
        const { error: retryUpdateError } = await supabase.from("device_sessions").update(payload).eq("id", conflicted.id);
        if (retryUpdateError) {
          logDeviceSessionEvent("touch_retry_update_failed", {
            profileId,
            deviceId: metadata.deviceId,
            message: retryUpdateError.message,
            code: retryUpdateError.code ?? null,
          });
          throw retryUpdateError;
        }

        logDeviceSessionEvent("touch_retry_update_complete", {
          profileId,
          deviceId: metadata.deviceId,
          deviceSessionId: conflicted.id,
        });
        return;
      }
    }

    logDeviceSessionEvent("touch_insert_failed", {
      profileId,
      deviceId: metadata.deviceId,
      message: insertError.message,
      code: insertError.code ?? null,
    });
    throw insertError;
  }

  logDeviceSessionEvent("touch_insert_complete", {
    profileId,
    deviceId: metadata.deviceId,
    deviceSessionId: inserted.id,
  });
}

export async function signOutDeviceSession(profileId: string, deviceId: string | null) {
  if (!deviceId) return;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("device_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      signed_out_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .eq("device_identifier", deviceId);

  if (error) {
    throw error;
  }
}

export async function getActiveDeviceSessionMap(profileIds: string[]) {
  const supabase = getSupabaseAdminClient();
  if (profileIds.length === 0) {
    return new Map<string, { lastSeenAt: string | null }>();
  }

  const cutoff = new Date(Date.now() - ACTIVE_SESSION_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("device_sessions")
    .select("profile_id,last_seen_at,signed_out_at,revoked_at,deleted_at")
    .in("profile_id", profileIds)
    .is("deleted_at", null)
    .is("signed_out_at", null)
    .is("revoked_at", null)
    .gte("last_seen_at", cutoff);

  if (error) {
    throw error;
  }

  const presence = new Map<string, { lastSeenAt: string | null }>();
  for (const row of data ?? []) {
    const current = presence.get(row.profile_id);
    if (!current || (row.last_seen_at && (!current.lastSeenAt || row.last_seen_at > current.lastSeenAt))) {
      presence.set(row.profile_id, { lastSeenAt: row.last_seen_at ?? null });
    }
  }

  return presence;
}

export async function isProfileOnline(profileId: string) {
  const map = await getActiveDeviceSessionMap([profileId]);
  return map.has(profileId);
}
