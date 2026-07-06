import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  createOAuthCookieOptions,
  createPkceChallenge,
  createPkceVerifier,
  GOOGLE_PROVIDER_KEY,
} from "@/lib/server/google-oauth";
import { getGoogleProviderSession } from "@/lib/server/google-provider";

export const runtime = "nodejs";

function normalizeRedirectTo(value: string | null) {
  if (!value) return "/profile";
  if (/^https?:\/\//i.test(value)) {
    throw new Error("Invalid redirect target.");
  }
  return value.startsWith("/") ? value : `/${value}`;
}

export async function GET(request: Request) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    const profile = await ensureProfileRow(user);
    const providerSession = await getGoogleProviderSession(user.id);

    if (providerSession.providerConnectionState === "connected" && providerSession.archiveEnabled) {
      return NextResponse.json({
        authorizationUrl: null,
        alreadyConnected: true,
        providerKey: GOOGLE_PROVIDER_KEY,
      });
    }

    const url = new URL(request.url);
    const redirectTo = normalizeRedirectTo(url.searchParams.get("redirectTo"));
    const verifier = createPkceVerifier();
    const state = createGoogleOAuthState({
      userId: user.id,
      redirectTo,
      nonce: crypto.randomUUID(),
      issuedAt: Date.now(),
    });

    const authorizationUrl = buildGoogleAuthorizationUrl(
      {
        state,
        codeChallenge: createPkceChallenge(verifier),
        loginHint: profile.email ?? user.email ?? null,
      },
      request,
    );

    const response = NextResponse.json({
      authorizationUrl,
      providerKey: GOOGLE_PROVIDER_KEY,
      redirectTo,
    });

    const cookieOptions = createOAuthCookieOptions(request);
    response.cookies.set("letscall_google_oauth_state", state, {
      ...cookieOptions,
      maxAge: 10 * 60,
    });
    response.cookies.set("letscall_google_oauth_verifier", verifier, {
      ...cookieOptions,
      maxAge: 10 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to start Google connection.",
        code: "google_start_failed",
      },
      { status: 400 },
    );
  }
}
