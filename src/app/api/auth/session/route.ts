import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { getGoogleProviderSession } from "@/lib/server/google-provider";
import { readDeviceSessionMetadata, touchDeviceSession } from "@/lib/server/device-sessions";

export const runtime = "nodejs";

function logSessionBootstrap(step: string, details: Record<string, unknown>) {
  console.info("[AUTH][session]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (error && typeof error === "object") {
    return {
      name: "UnknownObjectError",
      message: "message" in error ? String((error as { message?: string }).message ?? "Unable to load session.") : "Unable to load session.",
      code: "code" in error ? String((error as { code?: string }).code ?? "session_lookup_failed") : null,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: null,
  };
}

function getErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "missing_supabase_access_token" || code === "invalid_supabase_session") {
      return 401;
    }
  }

  return 500;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: string }).code ?? "session_lookup_failed");
  }

  return "session_lookup_failed";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "Unable to load session.")
      : "Unable to load session.";
}

export async function GET(request: Request) {
  let step = "authenticate";

  try {
    logSessionBootstrap("start", {});
    const { user } = await authenticateSupabaseRequest(request);
    logSessionBootstrap("authenticated", {
      userId: user.id,
    });

    step = "ensureProfileRow";
    const profile = await ensureProfileRow(user);
    logSessionBootstrap("profile_ensured", {
      userId: user.id,
      profileId: profile.id,
    });

    step = "touchDeviceSession";
    const deviceSession = readDeviceSessionMetadata(request);
    if (deviceSession) {
      await touchDeviceSession(user.id, deviceSession);
      logSessionBootstrap("device_session_updated", {
        userId: user.id,
        deviceId: deviceSession.deviceId,
      });
    } else {
      logSessionBootstrap("device_session_skipped", {
        userId: user.id,
        reason: "missing_device_metadata",
      });
    }

    step = "getGoogleProviderSession";
    const providerSession = await getGoogleProviderSession(user.id);
    logSessionBootstrap("provider_session_loaded", {
      userId: user.id,
      providerConnectionState: providerSession.providerConnectionState,
    });

    const session = {
      ...providerSession,
      email: providerSession.email ?? profile.email ?? user.email ?? null,
      displayName:
        providerSession.displayName ??
        profile.display_name ??
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        null,
      photoUrl:
        providerSession.photoUrl ??
        profile.photo_url ??
        (user.user_metadata?.avatar_url as string | undefined) ??
        null,
    };

    logSessionBootstrap("complete", {
      userId: user.id,
      providerConnectionState: session.providerConnectionState,
      archiveEnabled: session.archiveEnabled,
    });

    return NextResponse.json({ session });
  } catch (error) {
    const status = getErrorStatus(error);
    const code = getErrorCode(error);
    const message = getErrorMessage(error);
    const details = summarizeError(error);

    console.error(
      "[AUTH][session]",
      JSON.stringify({
        step,
        status,
        code,
        message,
        error: details,
        at: new Date().toISOString(),
      }),
    );

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status },
    );
  }
}

