import { NextResponse, type NextRequest } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import {
  createOAuthCookieOptions,
  exchangeGoogleCodeForTokens,
  fetchGoogleUserInfo,
  getAppBaseUrl,
  parseGoogleOAuthState,
} from "@/lib/server/google-oauth";
import { syncGoogleProviderConnection } from "@/lib/server/google-provider";

export const runtime = "nodejs";

function clearOAuthCookies(response: NextResponse, request: NextRequest) {
  const options = createOAuthCookieOptions(request);
  response.cookies.set("letscall_google_oauth_state", "", { ...options, maxAge: 0 });
  response.cookies.set("letscall_google_oauth_verifier", "", { ...options, maxAge: 0 });
}

function redirectToApp(request: NextRequest, redirectTo: string, params: Record<string, string>) {
  const baseUrl = getAppBaseUrl(request);
  const targetUrl = new URL(redirectTo, baseUrl);
  Object.entries(params).forEach(([key, value]) => targetUrl.searchParams.set(key, value));
  return NextResponse.redirect(targetUrl);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error") ?? url.searchParams.get("error_description");

  if (oauthError) {
    return redirectToApp(request, "/profile", {
      google_oauth: "error",
      code: oauthError,
    });
  }

  if (!code || !stateParam) {
    return redirectToApp(request, "/profile", {
      google_oauth: "error",
      code: "missing_code",
    });
  }

  const cookieState = request.cookies.get("letscall_google_oauth_state")?.value ?? null;
  const codeVerifier = request.cookies.get("letscall_google_oauth_verifier")?.value ?? null;
  if (!cookieState || !codeVerifier || cookieState !== stateParam) {
    return redirectToApp(request, "/profile", {
      google_oauth: "error",
      code: "invalid_state",
    });
  }

  let redirectTarget = "/profile";
  try {
    const state = parseGoogleOAuthState(stateParam);
    redirectTarget = state.redirectTo;

    const { user } = await authenticateSupabaseRequest(request);
    if (user.id !== state.userId) {
      throw new Error("Google OAuth state does not match the current session.");
    }

    const tokens = await exchangeGoogleCodeForTokens({ code, codeVerifier }, request);
    const googleUser = await fetchGoogleUserInfo(tokens.accessToken);
    await ensureProfileRow(user, {
      displayName: googleUser.name ?? user.email ?? null,
      photoUrl: googleUser.picture ?? null,
    });

    const syncResult = await syncGoogleProviderConnection({
      profileId: user.id,
      googleUser,
      googleTokens: tokens,
    });

    const response = redirectToApp(request, redirectTarget, {
      google_oauth: "connected",
      archive_enabled: String(syncResult.archiveEnabled),
    });
    clearOAuthCookies(response, request);
    return response;
  } catch (error) {
    const codeValue = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code ?? "google_callback_failed") : "google_callback_failed";
    const response = redirectToApp(request, redirectTarget, {
      google_oauth: "error",
      code: codeValue,
    });
    clearOAuthCookies(response, request);
    return response;
  }
}

