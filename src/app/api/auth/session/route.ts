import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { getGoogleProviderSession } from "@/lib/server/google-provider";

export const runtime = "nodejs";

type ErrorDetails = {
  code?: string;
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
  try {
    const { user } = await authenticateSupabaseRequest(request);
    const profile = await ensureProfileRow(user);
    const providerSession = await getGoogleProviderSession(user.id);
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

    return NextResponse.json({ session });
  } catch (error) {
    const status = getErrorStatus(error);
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    console.error("[AUTH][session]", {
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
