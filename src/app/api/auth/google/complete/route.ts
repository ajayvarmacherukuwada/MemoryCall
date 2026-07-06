import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { fetchGoogleUserInfo } from "@/lib/server/google-oauth";
import { getGoogleProviderSession, syncGoogleProviderConnection } from "@/lib/server/google-provider";

export const runtime = "nodejs";

type GoogleCompleteBody = {
  accessToken?: string;
  refreshToken?: string | null;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
};

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

    if (code === "missing_provider_access_token" || code === "missing_refresh_token") {
      return 400;
    }
  }

  return 500;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: string }).code ?? "google_complete_failed");
  }

  return "google_complete_failed";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "Unable to complete the Google provider connection.")
      : "Unable to complete the Google provider connection.";
}

export async function POST(request: Request) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    const body = (await request.json().catch(() => null)) as GoogleCompleteBody | null;
    const accessToken = body?.accessToken?.trim() ?? "";

    if (!accessToken) {
      const error = new Error("Missing Google provider access token.");
      (error as Error & { code?: string }).code = "missing_provider_access_token";
      throw error;
    }

    const googleUser = await fetchGoogleUserInfo(accessToken);
    await ensureProfileRow(user, {
      displayName: googleUser.name ?? user.email ?? null,
      photoUrl: googleUser.picture ?? null,
    });

    const syncResult = await syncGoogleProviderConnection({
      profileId: user.id,
      googleUser,
      googleTokens: {
        accessToken,
        refreshToken: body?.refreshToken ?? null,
        expiresIn: typeof body?.expiresIn === "number" && Number.isFinite(body.expiresIn) ? body.expiresIn : 3600,
        tokenType: body?.tokenType ?? "bearer",
        scope: body?.scope ?? "",
      },
    });

    const session = await getGoogleProviderSession(user.id);
    return NextResponse.json({
      session: {
        ...session,
        providerConnectionState: "connected",
      },
      youtubeConnected: syncResult.youtubeConnected,
      youtubeReason: syncResult.youtubeReason,
    });
  } catch (error) {
    const status = getErrorStatus(error);
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    console.error("[AUTH][google-complete]", {
      status,
      code,
      message,
    });

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status },
    );
  }
}
