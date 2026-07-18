import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { getAppBaseUrl } from "@/lib/server/google-oauth";
import { getInviteEnv } from "@/lib/env";

export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type InviteSummary = {
  id: string;
  token: string;
  shareUrl: string;
  inviterProfileId: string;
  inviterDisplayName: string;
  inviterPhotoUrl: string | null;
  recipientEmail: string;
  recipientDisplayName: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
};

type InviteRow = {
  id: string;
  secure_token: string;
  inviter_profile_id: string;
  recipient_email: string;
  recipient_display_name: string;
  status: InviteStatus;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_profile_id: string | null;
  revoked_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createInviteUrl(token: string) {
  return `${getAppBaseUrl().replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`;
}

function toSummary(invite: InviteRow, inviter: ProfileRow | null): InviteSummary {
  return {
    id: invite.id,
    token: invite.secure_token,
    shareUrl: createInviteUrl(invite.secure_token),
    inviterProfileId: invite.inviter_profile_id,
    inviterDisplayName: inviter?.display_name ?? inviter?.email ?? "LetsCall",
    inviterPhotoUrl: inviter?.photo_url ?? null,
    recipientEmail: invite.recipient_email,
    recipientDisplayName: invite.recipient_display_name,
    status: invite.status,
    expiresAt: invite.expires_at,
    createdAt: invite.created_at,
  };
}

async function loadProfile(profileId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, photo_url")
    .eq("id", profileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProfileRow | null) ?? null;
}

async function ensureContactLink(ownerProfileId: string, contactProfile: ProfileRow, displayName: string) {
  const supabase = getSupabaseAdminClient();
  const normalizedDisplayName = displayName.trim();

  const { data: existing, error: selectError } = await supabase
    .from("contacts")
    .select("id")
    .eq("owner_profile_id", ownerProfileId)
    .eq("contact_profile_id", contactProfile.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existing?.id) {
    return existing.id;
  }

  const { error: insertError } = await supabase.from("contacts").insert({
    owner_profile_id: ownerProfileId,
    contact_profile_id: contactProfile.id,
    contact_email: contactProfile.email,
    contact_display_name: normalizedDisplayName || contactProfile.display_name || contactProfile.email,
    nickname: normalizedDisplayName || null,
    last_verified_at: new Date().toISOString(),
  });

  if (insertError) {
    throw insertError;
  }

  return null;
}

export async function createInviteForProfile(input: {
  inviterProfileId: string;
  recipientEmail: string;
  recipientDisplayName: string;
}) {
  const supabase = getSupabaseAdminClient();
  const { inviteExpiryHours } = getInviteEnv();
  const recipientEmail = normalizeEmail(input.recipientEmail);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + inviteExpiryHours * 60 * 60 * 1000).toISOString();

  const { data: inviterProfile, error: inviterError } = await supabase
    .from("profiles")
    .select("id, email, display_name, photo_url")
    .eq("id", input.inviterProfileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (inviterError) {
    throw inviterError;
  }

  const existingQuery = supabase
    .from("invitations")
    .select("*")
    .eq("inviter_profile_id", input.inviterProfileId)
    .eq("recipient_email", recipientEmail)
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .is("deleted_at", null);

  const { data: existingInvite, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    throw existingError;
  }

  const inviteRow = existingInvite as InviteRow | null;
  if (inviteRow) {
    return toSummary(inviteRow, inviterProfile as ProfileRow | null);
  }

  const token = createInviteToken();
  const { data: inserted, error: insertError } = await supabase
    .from("invitations")
    .insert({
      secure_token: token,
      inviter_profile_id: input.inviterProfileId,
      recipient_email: recipientEmail,
      recipient_display_name: input.recipientDisplayName.trim(),
      status: "pending",
      expires_at: expiresAt,
      accepted_at: null,
      accepted_by_profile_id: null,
      revoked_at: null,
      deleted_at: null,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error("Unable to create invite.");
  }

  return toSummary(inserted as InviteRow, inviterProfile as ProfileRow | null);
}

export async function findInviteByToken(token: string) {
  const supabase = getSupabaseAdminClient();
  const { data: invite, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("secure_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!invite) {
    return null;
  }

  const inviterProfile = await loadProfile((invite as InviteRow).inviter_profile_id);
  return {
    invite: invite as InviteRow,
    inviterProfile,
    summary: toSummary(invite as InviteRow, inviterProfile),
  };
}

export async function loadInviteDetailsForPublic(token: string) {
  const inviteRecord = await findInviteByToken(token);
  if (!inviteRecord) {
    return null;
  }

  const { invite } = inviteRecord;
  const nowIso = new Date().toISOString();
  if (invite.status === "pending" && invite.expires_at <= nowIso) {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invite.id)
      .eq("status", "pending");

    return {
      ...inviteRecord.summary,
      status: "expired" as const,
    };
  }

  return inviteRecord.summary;
}

export async function acceptInviteToken(input: { token: string; profileId: string; email: string }) {
  const inviteRecord = await findInviteByToken(input.token);
  if (!inviteRecord) {
    const error = new Error("Invalid invite.");
    (error as Error & { code?: string; status?: number }).code = "invalid_invite";
    (error as Error & { code?: string; status?: number }).status = 404;
    throw error;
  }

  const { invite, inviterProfile } = inviteRecord;
  const nowIso = new Date().toISOString();

  if (invite.status === "revoked") {
    const error = new Error("This invite has been revoked.");
    (error as Error & { code?: string; status?: number }).code = "revoked_invite";
    (error as Error & { code?: string; status?: number }).status = 410;
    throw error;
  }

  if (invite.status === "accepted" && invite.accepted_by_profile_id === input.profileId) {
    return inviteRecord.summary;
  }

  if (invite.status === "accepted") {
    const error = new Error("This invite has already been accepted.");
    (error as Error & { code?: string; status?: number }).code = "accepted_invite";
    (error as Error & { code?: string; status?: number }).status = 410;
    throw error;
  }

  if (invite.status === "pending" && invite.expires_at <= nowIso) {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invite.id)
      .eq("status", "pending");

    const error = new Error("This invite has expired.");
    (error as Error & { code?: string; status?: number }).code = "expired_invite";
    (error as Error & { code?: string; status?: number }).status = 410;
    throw error;
  }

  if (normalizeEmail(input.email) !== normalizeEmail(invite.recipient_email)) {
    const error = new Error("This invite was sent to a different email address.");
    (error as Error & { code?: string; status?: number }).code = "invite_email_mismatch";
    (error as Error & { code?: string; status?: number }).status = 403;
    throw error;
  }

  const supabase = getSupabaseAdminClient();
  const recipientProfile = await loadProfile(input.profileId);
  if (!recipientProfile) {
    const error = new Error("Unable to load your MemoryCall profile.");
    (error as Error & { code?: string; status?: number }).code = "profile_missing";
    (error as Error & { code?: string; status?: number }).status = 500;
    throw error;
  }

  if (!inviterProfile) {
    const error = new Error("Unable to load the inviter profile.");
    (error as Error & { code?: string; status?: number }).code = "inviter_missing";
    (error as Error & { code?: string; status?: number }).status = 500;
    throw error;
  }

  await ensureContactLink(input.profileId, inviterProfile, inviterProfile.display_name ?? inviterProfile.email);
  await ensureContactLink(inviterProfile.id, recipientProfile, invite.recipient_display_name);

  const { error: updateError } = await supabase
    .from("invitations")
    .update({
      status: "accepted",
      accepted_at: nowIso,
      accepted_by_profile_id: input.profileId,
    })
    .eq("id", invite.id)
    .eq("status", "pending");

  if (updateError) {
    throw updateError;
  }

  return {
    ...inviteRecord.summary,
    status: "accepted" as const,
  };
}

export async function revokeInviteByToken(token: string, inviterProfileId: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("invitations")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("secure_token", token)
    .eq("inviter_profile_id", inviterProfileId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }
}
