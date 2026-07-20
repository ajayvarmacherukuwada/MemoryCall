import { NextResponse, type NextRequest } from "next/server";
import { authenticateSupabaseRequest, getSupabaseAdminClient } from "@/lib/server/supabase-admin";
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

function logGoogleCallback(step: string, details: Record<string, unknown>) {
  console.info("[AUTH][google-callback]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      code: (error as Error & { code?: string }).code ?? null,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: null,
    code: null,
  };
}

async function loadUserFromCallbackState(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw error ?? new Error("Unable to load the authenticated user for the Google callback.");
  }

  return data.user;
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

  logGoogleCallback("callback_received", {
    hasCode: Boolean(code),
    hasState: Boolean(stateParam),
    oauthError: oauthError ?? null,
  });

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
    logGoogleCallback("state_cookie_invalid", {
      hasCookieState: Boolean(cookieState),
      hasCodeVerifier: Boolean(codeVerifier),
      cookieMatchesState: cookieState === stateParam,
    });
    return redirectToApp(request, "/profile", {
      google_oauth: "error",
      code: "invalid_state",
    });
  }

  let redirectTarget = "/profile";
  try {
    const state = parseGoogleOAuthState(stateParam);
    redirectTarget = state.redirectTo;
    logGoogleCallback("state_validated", {
      userId: state.userId,
      redirectTarget,
    });

    let user;
    try {
      const authenticated = await authenticateSupabaseRequest(request);
      if (authenticated.user.id !== state.userId) {
        throw new Error("Google OAuth state does not match the current session.");
      }

      user = authenticated.user;
      logGoogleCallback("session_authenticated", {
        userId: user.id,
        source: "bearer",
      });
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code === "missing_supabase_access_token") {
        user = await loadUserFromCallbackState(state.userId);
        logGoogleCallback("session_loaded_from_state", {
          userId: user.id,
          source: "oauth_state",
        });
      } else {
        throw error;
      }
    }

    logGoogleCallback("token_exchange_started", {
      userId: user.id,
    });
    const tokens = await exchangeGoogleCodeForTokens({ code, codeVerifier }, request);
    logGoogleCallback("token_exchange_succeeded", {
      userId: user.id,
      hasRefreshToken: Boolean(tokens.refreshToken),
      expiresIn: tokens.expiresIn,
      scope: tokens.scope,
    });

    logGoogleCallback("google_user_fetch_started", {
      userId: user.id,
    });
    const googleUser = await fetchGoogleUserInfo(tokens.accessToken);
    logGoogleCallback("google_user_fetch_succeeded", {
      userId: user.id,
      googleSubject: googleUser.sub,
      googleEmail: googleUser.email ?? null,
    });

    logGoogleCallback("profile_ensure_started", {
      userId: user.id,
    });
    await ensureProfileRow(user, {
      displayName: googleUser.name ?? user.email ?? null,
      photoUrl: googleUser.picture ?? null,
    });
    logGoogleCallback("profile_ensure_succeeded", {
      userId: user.id,
    });

    logGoogleCallback("provider_sync_started", {
      userId: user.id,
    });
    const syncResult = await syncGoogleProviderConnection({
      profileId: user.id,
      googleUser,
      googleTokens: tokens,
    });
    logGoogleCallback("provider_sync_succeeded", {
      userId: user.id,
      archiveEnabled: syncResult.archiveEnabled,
      youtubeConnected: syncResult.youtubeConnected,
      youtubeReason: syncResult.youtubeReason ?? null,
    });

    const response = redirectToApp(request, redirectTarget, {
      google_oauth: "connected",
      archive_enabled: String(syncResult.archiveEnabled),
    });
    clearOAuthCookies(response, request);
    logGoogleCallback("callback_complete", {
      userId: user.id,
      redirectTarget,
    });
    return response;
  } catch (error) {
    const codeValue = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code ?? "google_callback_failed") : "google_callback_failed";
    logGoogleCallback("callback_failed", {
      redirectTarget,
      ...summarizeError(error),
    });
    const response = redirectToApp(request, redirectTarget, {
      google_oauth: "error",
      code: codeValue,
    });
    clearOAuthCookies(response, request);
    return response;
  }
}
