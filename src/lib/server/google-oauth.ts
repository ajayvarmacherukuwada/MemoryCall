import crypto from "node:crypto";
import { getGoogleOAuthEnv } from "@/lib/env";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_PROVIDER_KEY = "google";
export const GOOGLE_ARCHIVE_PROVIDER_KEY = "youtube";
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export type GoogleOAuthStatePayload = {
  userId: string;
  redirectTo: string;
  nonce: string;
  issuedAt: number;
};

export type GoogleOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
  tokenType: string;
  idToken?: string | null;
};

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
};

export type GoogleChannelInfo = {
  id: string;
  title: string | null;
  url: string | null;
};

function base64UrlEncode(input: Buffer | string) {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function getStateSecret() {
  const { googleOAuthStateSecret } = getGoogleOAuthEnv();
  return crypto.createHash("sha256").update(googleOAuthStateSecret).digest();
}

function getTokenSecret() {
  const { googleTokenEncryptionKey } = getGoogleOAuthEnv();
  return crypto.createHash("sha256").update(googleTokenEncryptionKey).digest();
}

export function createPkceVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function createPkceChallenge(verifier: string) {
  return base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());
}

export function createGoogleOAuthState(payload: GoogleOAuthStatePayload) {
  const rawPayload = JSON.stringify(payload);
  const body = base64UrlEncode(rawPayload);
  const signature = crypto.createHmac("sha256", getStateSecret()).update(body).digest();
  return `${body}.${base64UrlEncode(signature)}`;
}

export function parseGoogleOAuthState(state: string) {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) {
    throw new Error("Invalid OAuth state.");
  }

  const expectedSignature = crypto.createHmac("sha256", getStateSecret()).update(encodedPayload).digest();
  const providedSignature = base64UrlDecode(encodedSignature);
  if (expectedSignature.length !== providedSignature.length || !crypto.timingSafeEqual(expectedSignature, providedSignature)) {
    throw new Error("OAuth state validation failed.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as GoogleOAuthStatePayload;
  if (!payload.userId || !payload.redirectTo || !payload.nonce || !payload.issuedAt) {
    throw new Error("OAuth state payload is incomplete.");
  }

  return payload;
}

export function encryptGoogleSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${base64UrlEncode(iv)}.${base64UrlEncode(authTag)}.${base64UrlEncode(encrypted)}`;
}

export function decryptGoogleSecret(ciphertext: string) {
  const [ivPart, authTagPart, dataPart] = ciphertext.split(".");
  if (!ivPart || !authTagPart || !dataPart) {
    throw new Error("Invalid encrypted token format.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getTokenSecret(), base64UrlDecode(ivPart));
  decipher.setAuthTag(base64UrlDecode(authTagPart));
  const decrypted = Buffer.concat([decipher.update(base64UrlDecode(dataPart)), decipher.final()]);
  return decrypted.toString("utf8");
}

export function getAppBaseUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (request) {
    return new URL(request.url).origin;
  }

  throw new Error("Missing app base URL configuration.");
}

export function getGoogleOAuthRedirectUri(request?: Request) {
  return new URL("/api/auth/google/callback", getAppBaseUrl(request)).toString();
}

export function buildGoogleAuthorizationUrl(
  params: {
    state: string;
    codeChallenge: string;
    loginHint?: string | null;
  },
  request?: Request,
) {
  const { googleOAuthClientId } = getGoogleOAuthEnv();
  const url = new URL(GOOGLE_AUTH_BASE_URL);
  url.searchParams.set("client_id", googleOAuthClientId);
  url.searchParams.set("redirect_uri", getGoogleOAuthRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  if (params.loginHint) {
    url.searchParams.set("login_hint", params.loginHint);
  }

  return url.toString();
}

export async function exchangeGoogleCodeForTokens(input: { code: string; codeVerifier: string }, request?: Request) {
  const { googleOAuthClientId, googleOAuthClientSecret } = getGoogleOAuthEnv();
  const formData = new FormData();
  formData.set("code", input.code);
  formData.set("client_id", googleOAuthClientId);
  formData.set("client_secret", googleOAuthClientSecret);
  formData.set("redirect_uri", getGoogleOAuthRedirectUri(request));
  formData.set("grant_type", "authorization_code");
  formData.set("code_verifier", input.codeVerifier);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    body: formData,
  });
  const body = (await response.json().catch(() => null)) as Partial<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token: string;
    error: string;
    error_description: string;
  }> | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error_description ?? body?.error ?? "Failed to exchange Google authorization code.");
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresIn: body.expires_in ?? 3600,
    scope: body.scope ?? "",
    tokenType: body.token_type ?? "Bearer",
    idToken: body.id_token ?? null,
  } satisfies GoogleOAuthTokens;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { googleOAuthClientId, googleOAuthClientSecret } = getGoogleOAuthEnv();
  const formData = new FormData();
  formData.set("client_id", googleOAuthClientId);
  formData.set("client_secret", googleOAuthClientSecret);
  formData.set("grant_type", "refresh_token");
  formData.set("refresh_token", refreshToken);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    body: formData,
  });
  const body = (await response.json().catch(() => null)) as Partial<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
    error: string;
    error_description: string;
  }> | null;

  if (!response.ok || !body?.access_token) {
    const error = new Error(body?.error_description ?? body?.error ?? "Failed to refresh Google access token.");
    (error as Error & { code?: string }).code = body?.error ?? "refresh_failed";
    throw error;
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresIn: body.expires_in ?? 3600,
    scope: body.scope ?? "",
    tokenType: body.token_type ?? "Bearer",
  };
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = (await response.json().catch(() => null)) as GoogleUserInfo | null;
  if (!response.ok || !body?.sub) {
    throw new Error("Unable to load Google account information.");
  }

  return body;
}

export async function fetchGoogleChannelInfo(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | {
        items?: Array<{
          id?: string;
          snippet?: { title?: string; customUrl?: string };
        }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    const error = new Error(body?.error?.message ?? "Unable to verify the connected YouTube channel.");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const channel = body?.items?.[0];
  if (!channel?.id) {
    return null;
  }

  return {
    id: channel.id,
    title: channel.snippet?.title ?? null,
    url: channel.snippet?.customUrl ? `https://www.youtube.com/${channel.snippet.customUrl}` : null,
  } satisfies GoogleChannelInfo;
}

export function buildAppRedirectUrl(baseUrl: string, redirectTo: string) {
  return new URL(redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`, baseUrl).toString();
}

export function createOAuthCookieOptions(request: Request) {
  const isHttps = new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps,
    path: "/",
  };
}

