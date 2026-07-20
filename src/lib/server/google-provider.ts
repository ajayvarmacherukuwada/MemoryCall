import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  decryptGoogleSecret,
  encryptGoogleSecret,
  fetchGoogleChannelInfo,
  refreshGoogleAccessToken,
  GOOGLE_ARCHIVE_PROVIDER_KEY,
  GOOGLE_PROVIDER_KEY,
} from "@/lib/server/google-oauth";
import type { ProviderConnectionState, ProviderSessionSnapshot } from "@/lib/provider-session";

const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const CHANNEL_VERIFICATION_CACHE_MS = 10 * 60 * 1000;

type ProviderAccountRow = {
  id: string;
  profile_id: string;
  archive_provider_id: string;
  provider_subject: string;
  provider_email: string | null;
  provider_display_name: string | null;
  provider_photo_url: string | null;
  connection_status: "connected" | "onboarding" | "needs_reconnect" | "revoked" | "disabled";
  archive_enabled: boolean;
  last_verified_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  provider_metadata: Record<string, unknown> | null;
  deleted_at: string | null;
};

type OAuthTokenRow = {
  id: string;
  profile_id: string;
  provider_account_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_type: string;
  granted_scopes: string;
  expires_at: string;
  last_refreshed_at: string | null;
  revoked_at: string | null;
};

type ArchiveProviderRow = {
  id: string;
  provider_key: string;
  display_name: string;
  is_active: boolean;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type OAuthTokenRpcRow = OAuthTokenRow | OAuthTokenRow[] | null;

function logProviderEvent(step: string, details: Record<string, unknown>) {
  console.info("[LetsCall][Provider]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function getErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (error && typeof error === "object") {
    const supabaseError = error as SupabaseLikeError;
    return {
      name: "SupabaseLikeError",
      message: supabaseError.message ?? "Unknown error",
      code: supabaseError.code ?? null,
      details: supabaseError.details ?? null,
      hint: supabaseError.hint ?? null,
      stack: null,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: null,
  };
}

async function getArchiveProviderRow(providerKey = GOOGLE_ARCHIVE_PROVIDER_KEY) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("archive_providers")
    .select("id,provider_key,display_name,is_active")
    .eq("provider_key", providerKey)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? `Missing archive provider: ${providerKey}`);
  }

  return data as ArchiveProviderRow;
}

function parseMetadata(metadata: Record<string, unknown> | null | undefined) {
  return metadata ?? {};
}

function isFreshChannelMetadata(lastVerifiedAt: string | null) {
  if (!lastVerifiedAt) return false;
  return Date.now() - new Date(lastVerifiedAt).getTime() < CHANNEL_VERIFICATION_CACHE_MS;
}

async function selectGoogleProviderAccount(profileId: string) {
  const supabase = getSupabaseAdminClient();
  const provider = await getArchiveProviderRow();
  const { data, error } = await supabase
    .from("provider_accounts")
    .select("*")
    .eq("profile_id", profileId)
    .eq("archive_provider_id", provider.id)
    .maybeSingle();

  if (error) throw error;
  return { provider, account: (data as ProviderAccountRow | null) ?? null };
}

async function selectOAuthTokens(providerAccountId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("get_private_oauth_token", {
    p_provider_account_id: providerAccountId,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] ?? null : (data as OAuthTokenRpcRow);
  return (row as OAuthTokenRow | null) ?? null;
}

async function updateProviderAccount(providerAccountId: string, patch: Partial<ProviderAccountRow>) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("provider_accounts").update(patch).eq("id", providerAccountId);
  if (error) throw error;
}

async function upsertOAuthTokenRow(input: {
  profileId: string;
  providerAccountId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenType: string;
  grantedScopes: string;
  expiresAt: string;
  lastRefreshedAt: string | null;
  revokedAt: string | null;
}) {
  const supabase = getSupabaseAdminClient();
  logProviderEvent("oauth_token_upsert_start", {
    profileId: input.profileId,
    providerAccountId: input.providerAccountId,
    hasRefreshToken: Boolean(input.refreshTokenEncrypted),
    expiresAt: input.expiresAt,
  });
  const { error } = await supabase.rpc("upsert_private_oauth_token", {
    p_profile_id: input.profileId,
    p_provider_account_id: input.providerAccountId,
    p_access_token_encrypted: input.accessTokenEncrypted,
    p_refresh_token_encrypted: input.refreshTokenEncrypted,
    p_token_type: input.tokenType,
    p_granted_scopes: input.grantedScopes,
    p_expires_at: input.expiresAt,
    p_last_refreshed_at: input.lastRefreshedAt,
    p_revoked_at: input.revokedAt,
  });

  if (error) throw error;
}

async function markOAuthTokenRevoked(providerAccountId: string, revokedAt: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.rpc("mark_private_oauth_token_revoked", {
    p_provider_account_id: providerAccountId,
    p_revoked_at: revokedAt,
  });

  if (error) throw error;
}

async function getOrCreateGoogleProviderAccount(input: {
  profileId: string;
  googleUser: { sub: string; email?: string; name?: string; picture?: string };
  youtubeChannel: { id: string; title: string | null; url: string | null } | null;
  providerDisplayName?: string;
  grantedScopes: string;
  expiresAt: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}) {
  const supabase = getSupabaseAdminClient();
  const provider = await getArchiveProviderRow();
  const connectionStatus = input.youtubeChannel ? "connected" : "onboarding";
  const archiveEnabled = Boolean(input.youtubeChannel);

  const { data: existing, error: selectError } = await supabase
    .from("provider_accounts")
    .select("*")
    .eq("profile_id", input.profileId)
    .eq("archive_provider_id", provider.id)
    .maybeSingle();

  if (selectError) throw selectError;

  const nowIso = new Date().toISOString();
  const providerMetadata = {
    provider: GOOGLE_PROVIDER_KEY,
    google: {
      subject: input.googleUser.sub,
      email: input.googleUser.email ?? null,
      name: input.googleUser.name ?? null,
      picture: input.googleUser.picture ?? null,
    },
    youtube: input.youtubeChannel,
    grantedScopes: input.grantedScopes,
    providerDisplayName: input.providerDisplayName ?? provider.display_name,
    lastVerifiedAt: nowIso,
  };

  const accountPayload = {
    profile_id: input.profileId,
    archive_provider_id: provider.id,
    provider_subject: input.googleUser.sub,
    provider_email: input.googleUser.email ?? null,
    provider_display_name: input.googleUser.name ?? input.googleUser.email ?? "Google Account",
    provider_photo_url: input.googleUser.picture ?? null,
    connection_status: connectionStatus,
    archive_enabled: archiveEnabled,
    last_verified_at: nowIso,
    connected_at: existing?.connected_at ?? nowIso,
    disconnected_at: null,
    provider_metadata: providerMetadata,
    deleted_at: null,
  } satisfies Partial<ProviderAccountRow> & Record<string, unknown>;

  let accountRow: ProviderAccountRow;

  if (existing?.id) {
    const { data, error } = await supabase
      .from("provider_accounts")
      .update(accountPayload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error || !data) throw error ?? new Error("Unable to update provider account.");
    accountRow = data as ProviderAccountRow;
  } else {
    const { data, error } = await supabase
      .from("provider_accounts")
      .insert(accountPayload)
      .select("*")
      .single();

    if (error || !data) throw error ?? new Error("Unable to create provider account.");
    accountRow = data as ProviderAccountRow;
  }

  const encryptedAccessToken = encryptGoogleSecret(input.accessToken);
  const encryptedRefreshToken = encryptGoogleSecret(input.refreshToken);
  const tokenPayload = {
    profile_id: input.profileId,
    provider_account_id: accountRow.id,
    access_token_encrypted: encryptedAccessToken,
    refresh_token_encrypted: encryptedRefreshToken,
    token_type: input.tokenType,
    granted_scopes: input.grantedScopes,
    expires_at: input.expiresAt,
    last_refreshed_at: nowIso,
    revoked_at: null,
  };

  await upsertOAuthTokenRow({
    profileId: input.profileId,
    providerAccountId: accountRow.id,
    accessTokenEncrypted: encryptedAccessToken,
    refreshTokenEncrypted: encryptedRefreshToken,
    tokenType: input.tokenType,
    grantedScopes: input.grantedScopes,
    expiresAt: input.expiresAt,
    lastRefreshedAt: nowIso,
    revokedAt: null,
  });

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({
      email: input.googleUser.email ?? undefined,
      display_name: input.googleUser.name ?? input.googleUser.email ?? undefined,
      photo_url: input.googleUser.picture ?? undefined,
      onboarded_at: existing?.connected_at ?? nowIso,
    })
    .eq("id", input.profileId);

  if (profileUpdateError) throw profileUpdateError;

  return { provider, accountId: accountRow.id, archiveEnabled };
}

export async function syncGoogleProviderConnection(input: {
  profileId: string;
  googleUser: { sub: string; email?: string; name?: string; picture?: string };
  googleTokens: {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number;
    tokenType: string;
    scope: string;
  };
}) {
  logProviderEvent("sync_start", {
    profileId: input.profileId,
    googleSubject: input.googleUser.sub,
    googleEmail: input.googleUser.email ?? null,
    hasRefreshToken: Boolean(input.googleTokens.refreshToken),
    scope: input.googleTokens.scope,
  });

  const existing = await selectGoogleProviderAccount(input.profileId);
  logProviderEvent("existing_account_loaded", {
    profileId: input.profileId,
    accountId: existing.account?.id ?? null,
    connectionStatus: existing.account?.connection_status ?? null,
    archiveEnabled: existing.account?.archive_enabled ?? null,
  });

  const existingTokens = existing.account ? await selectOAuthTokens(existing.account.id) : null;
  const resolvedRefreshToken = input.googleTokens.refreshToken ?? (existingTokens ? decryptGoogleSecret(existingTokens.refresh_token_encrypted) : null);

  if (!resolvedRefreshToken) {
    const error = new Error("Google did not return a refresh token. Please reconnect and grant offline access again.");
    (error as Error & { code?: string }).code = "missing_refresh_token";
    throw error;
  }

  logProviderEvent("channel_verification_started", {
    profileId: input.profileId,
    accountId: existing.account?.id ?? null,
  });
  const channel = await fetchGoogleChannelInfo(input.googleTokens.accessToken);
  logProviderEvent("channel_verification_succeeded", {
    profileId: input.profileId,
    accountId: existing.account?.id ?? null,
    channelId: channel?.id ?? null,
    channelTitle: channel?.title ?? null,
  });

  logProviderEvent("provider_account_write_start", {
    profileId: input.profileId,
    hasChannel: Boolean(channel?.id),
  });
  const { accountId, archiveEnabled } = await getOrCreateGoogleProviderAccount({
    profileId: input.profileId,
    googleUser: input.googleUser,
    youtubeChannel: channel,
    grantedScopes: input.googleTokens.scope,
    expiresAt: new Date(Date.now() + input.googleTokens.expiresIn * 1000).toISOString(),
    accessToken: input.googleTokens.accessToken,
    refreshToken: resolvedRefreshToken,
    tokenType: input.googleTokens.tokenType,
  });
  logProviderEvent("provider_account_write_complete", {
    profileId: input.profileId,
    accountId,
    archiveEnabled,
    channelId: channel?.id ?? null,
  });

  logProviderEvent("callback_synced", {
    profileId: input.profileId,
    accountId,
    archiveEnabled,
    channelId: channel?.id ?? null,
  });

  return {
    accountId,
    archiveEnabled,
    channel,
    youtubeConnected: Boolean(channel?.id),
    youtubeReason: channel?.id ? null : "No YouTube channel found for this Google account.",
  };
}

export async function getGoogleProviderSession(profileId: string): Promise<ProviderSessionSnapshot> {
  const { account, provider } = await selectGoogleProviderAccount(profileId);
  if (!account) {
    return {
      signedIn: true,
      userId: profileId,
      email: null,
      displayName: null,
      photoUrl: null,
      providerKey: null,
      providerDisplayName: null,
      providerConnectionState: "missing",
      archiveEnabled: false,
      youtubeChannelId: null,
      youtubeChannelTitle: null,
      lastVerifiedAt: null,
      connectedAt: null,
      refreshRequired: false,
    };
  }

  const metadata = parseMetadata(account.provider_metadata);
  const youtube = (metadata.youtube as { id?: string; title?: string | null } | null) ?? null;
  const tokens = await selectOAuthTokens(account.id);
  if (!tokens) {
    const shouldReconnect = account.connection_status === "connected" || account.connection_status === "onboarding";
    if (shouldReconnect) {
      await updateProviderAccount(account.id, {
        connection_status: "needs_reconnect",
        archive_enabled: false,
        provider_metadata: {
          ...metadata,
          tokenState: "missing",
        },
      });
    }

    return {
      signedIn: true,
      userId: profileId,
      email: account.provider_email,
      displayName: account.provider_display_name,
      photoUrl: account.provider_photo_url,
      providerKey: GOOGLE_PROVIDER_KEY,
      providerDisplayName: provider.display_name,
      providerConnectionState: shouldReconnect ? "needs_reconnect" : account.connection_status,
      archiveEnabled: false,
      youtubeChannelId: youtube?.id ?? null,
      youtubeChannelTitle: youtube?.title ?? null,
      lastVerifiedAt: account.last_verified_at,
      connectedAt: account.connected_at,
      refreshRequired: true,
    };
  }

  const canRefreshTokens = Boolean(tokens.refresh_token_encrypted);
  const refreshRequired = !canRefreshTokens && (account.connection_status === "needs_reconnect" || account.connection_status === "revoked");

  let resolvedAccount = account;

  if (!refreshRequired) {
    const expiresAtMs = new Date(tokens.expires_at).getTime();
    if (expiresAtMs <= Date.now() + TOKEN_REFRESH_SKEW_MS) {
      try {
        const refreshToken = decryptGoogleSecret(tokens.refresh_token_encrypted);
        const refreshed = await refreshGoogleAccessToken(refreshToken);
        const encryptedRefreshToken = refreshed.refreshToken ? encryptGoogleSecret(refreshed.refreshToken) : null;
        await upsertOAuthTokenRow({
          profileId,
          providerAccountId: account.id,
          accessTokenEncrypted: encryptGoogleSecret(refreshed.accessToken),
          refreshTokenEncrypted: encryptedRefreshToken ?? tokens.refresh_token_encrypted,
          tokenType: refreshed.tokenType,
          grantedScopes: refreshed.scope || tokens.granted_scopes,
          expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
          lastRefreshedAt: new Date().toISOString(),
          revokedAt: null,
        });
        const refreshedChannel = isFreshChannelMetadata(account.last_verified_at) && youtube?.id ? youtube : await fetchGoogleChannelInfo(refreshed.accessToken).catch(() => null);
        logProviderEvent("access_token_refresh_succeeded", {
          profileId,
          accountId: account.id,
          hasNewRefreshToken: Boolean(refreshed.refreshToken),
          hasChannelAfterRefresh: Boolean(refreshedChannel?.id),
        });
        if (refreshedChannel?.id && !account.archive_enabled) {
          await updateProviderAccount(account.id, {
            archive_enabled: true,
            connection_status: "connected",
            last_verified_at: new Date().toISOString(),
            provider_metadata: {
              ...metadata,
              youtube: refreshedChannel,
            },
          });
          resolvedAccount = {
            ...account,
            archive_enabled: true,
            connection_status: "connected",
            last_verified_at: new Date().toISOString(),
            provider_metadata: {
              ...metadata,
              youtube: refreshedChannel,
            },
          };
        }
      } catch (error) {
        logProviderEvent("refresh_failed", {
          profileId,
          accountId: account.id,
          ...getErrorSummary(error),
        });
        await updateProviderAccount(account.id, {
          connection_status: "needs_reconnect",
          archive_enabled: false,
          provider_metadata: {
            ...metadata,
            refreshError: error instanceof Error ? error.message : String(error),
          },
        });
        return {
          signedIn: true,
          userId: profileId,
          email: account.provider_email,
          displayName: account.provider_display_name,
          photoUrl: account.provider_photo_url,
          providerKey: GOOGLE_PROVIDER_KEY,
          providerDisplayName: provider.display_name,
          providerConnectionState: "needs_reconnect",
          archiveEnabled: false,
          youtubeChannelId: youtube?.id ?? null,
          youtubeChannelTitle: youtube?.title ?? null,
          lastVerifiedAt: account.last_verified_at,
          connectedAt: account.connected_at,
          refreshRequired: true,
        };
      }
    }
  }

  const connectionState: ProviderConnectionState = resolvedAccount.connection_status;
  return {
    signedIn: true,
    userId: profileId,
    email: resolvedAccount.provider_email,
    displayName: resolvedAccount.provider_display_name,
    photoUrl: resolvedAccount.provider_photo_url,
    providerKey: GOOGLE_PROVIDER_KEY,
    providerDisplayName: provider.display_name,
    providerConnectionState: connectionState,
    archiveEnabled: resolvedAccount.archive_enabled,
    youtubeChannelId: youtube?.id ?? null,
    youtubeChannelTitle: youtube?.title ?? null,
    lastVerifiedAt: resolvedAccount.last_verified_at,
    connectedAt: resolvedAccount.connected_at,
    refreshRequired,
  };
}

export async function getGoogleAccessToken(profileId: string) {
  const { account } = await selectGoogleProviderAccount(profileId);
  if (!account) {
    const error = new Error("Reconnect Google to continue archiving.");
    (error as Error & { code?: string }).code = "needs_reconnect";
    throw error;
  }

  logProviderEvent("access_token_lookup_start", {
    profileId,
    accountId: account.id,
  });

  const tokens = await selectOAuthTokens(account.id);
  if (!tokens) {
    const error = new Error("Reconnect Google to continue archiving.");
    (error as Error & { code?: string }).code = "needs_reconnect";
    throw error;
  }

  const expiresAtMs = new Date(tokens.expires_at).getTime();
  if (expiresAtMs > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    logProviderEvent("access_token_returned", {
      profileId,
      accountId: account.id,
      refreshed: false,
    });
    return {
      accessToken: decryptGoogleSecret(tokens.access_token_encrypted),
      providerAccountId: account.id,
      account,
    };
  }

  try {
    logProviderEvent("access_token_refresh_started", {
      profileId,
      accountId: account.id,
    });
    const refreshToken = decryptGoogleSecret(tokens.refresh_token_encrypted);
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    await upsertOAuthTokenRow({
      profileId,
      providerAccountId: account.id,
      accessTokenEncrypted: encryptGoogleSecret(refreshed.accessToken),
      refreshTokenEncrypted: refreshed.refreshToken ? encryptGoogleSecret(refreshed.refreshToken) : tokens.refresh_token_encrypted,
      tokenType: refreshed.tokenType,
      grantedScopes: refreshed.scope || tokens.granted_scopes,
      expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      lastRefreshedAt: new Date().toISOString(),
      revokedAt: null,
    });

    logProviderEvent("access_token_refresh_succeeded", {
      profileId,
      accountId: account.id,
      hasNewRefreshToken: Boolean(refreshed.refreshToken),
    });

    return {
      accessToken: refreshed.accessToken,
      providerAccountId: account.id,
      account,
    };
  } catch (error) {
    await updateProviderAccount(account.id, {
      connection_status: "needs_reconnect",
      archive_enabled: false,
    });
    await markOAuthTokenRevoked(account.id, new Date().toISOString());
    logProviderEvent("refresh_failed", {
      profileId,
      accountId: account.id,
      ...getErrorSummary(error),
    });
    const wrapped = new Error("Reconnect Google to continue archiving.");
    (wrapped as Error & { code?: string }).code = (error as Error & { code?: string }).code ?? "needs_reconnect";
    throw wrapped;
  }
}

export async function disconnectGoogleProvider(profileId: string) {
  const { account } = await selectGoogleProviderAccount(profileId);
  if (!account) return;

  const tokens = await selectOAuthTokens(account.id);
  const tokenValue = tokens ? decryptGoogleSecret(tokens.refresh_token_encrypted || tokens.access_token_encrypted) : null;

  if (tokenValue) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token: tokenValue }).toString(),
      });
    } catch {
      // Revoke is best-effort.
    }
  }

  await updateProviderAccount(account.id, {
    connection_status: "revoked",
    archive_enabled: false,
    disconnected_at: new Date().toISOString(),
  });
  if (tokens) {
    await markOAuthTokenRevoked(account.id, new Date().toISOString());
  }

  logProviderEvent("disconnected", { profileId, accountId: account.id });
}

