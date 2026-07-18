function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServerEnv() {
  return {
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getGoogleOAuthEnv() {
  return {
    googleOAuthClientId: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
    googleOAuthClientSecret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    googleOAuthStateSecret: requireEnv("GOOGLE_OAUTH_STATE_SECRET"),
    googleTokenEncryptionKey: requireEnv("GOOGLE_TOKEN_ENCRYPTION_KEY"),
  };
}

export function getInviteEnv() {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    throw new Error("Missing required environment variable: APP_BASE_URL");
  }

  const expiryHoursRaw = process.env.INVITE_EXPIRY_HOURS?.trim();
  const parsedExpiryHours = expiryHoursRaw ? Number(expiryHoursRaw) : 72;
  const inviteExpiryHours = Number.isFinite(parsedExpiryHours) && parsedExpiryHours > 0 ? parsedExpiryHours : 72;

  return {
    appBaseUrl: configuredBaseUrl.replace(/\/$/, ""),
    inviteExpiryHours,
  };
}

export function isDebugAuthEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
}

export function getPublicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

export function hasPublicSupabaseEnv() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  return Boolean(supabaseUrl && supabaseAnonKey);
}
