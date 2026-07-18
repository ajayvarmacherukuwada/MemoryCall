import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { getActiveDeviceSessionMap } from "@/lib/server/device-sessions";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function formatDisplayName(email: string, displayName: string | null, nickname: string | null) {
  const trimmedNickname = nickname?.trim();
  if (trimmedNickname) {
    return trimmedNickname;
  }

  const trimmedDisplayName = displayName?.trim();
  if (trimmedDisplayName) {
    return trimmedDisplayName;
  }

  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type ContactDirectoryItem = {
  id: string;
  email: string;
  displayName: string;
  nickname: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listContactsForProfile(profileId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, contact_profile_id, contact_email, contact_display_name, nickname, created_at, updated_at")
    .eq("owner_profile_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const contactProfileIds = (contacts ?? []).map((contact) => contact.contact_profile_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in("id", contactProfileIds)
    .is("deleted_at", null);

  if (profilesError) {
    throw profilesError;
  }

  const presence = await getActiveDeviceSessionMap(contactProfileIds);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return (contacts ?? []).map((contact) => {
    const profile = profileById.get(contact.contact_profile_id);
    const displayName = formatDisplayName(contact.contact_email, profile?.display_name ?? contact.contact_display_name, contact.nickname ?? null);
    const activeSession = presence.get(contact.contact_profile_id) ?? null;

    return {
      id: contact.id,
      email: contact.contact_email,
      displayName,
      nickname: contact.nickname ?? null,
      isOnline: Boolean(activeSession),
      lastSeenAt: activeSession?.lastSeenAt ?? null,
      createdAt: contact.created_at,
      updatedAt: contact.updated_at,
    } satisfies ContactDirectoryItem;
  });
}

export async function addContactForProfile(profileId: string, email: string, nickname: string | null) {
  const supabase = getSupabaseAdminClient();
  const normalizedEmail = normalizeEmail(email);

  const { data: targetProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .eq("email", normalizedEmail)
    .is("deleted_at", null)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!targetProfile) {
    const error = new Error("This email address is not registered with MemoryCall.");
    (error as Error & { code?: string; status?: number }).code = "contact_not_found";
    (error as Error & { code?: string; status?: number }).status = 404;
    throw error;
  }

  if (targetProfile.id === profileId) {
    const error = new Error("You cannot add yourself as a contact.");
    (error as Error & { code?: string; status?: number }).code = "contact_self";
    (error as Error & { code?: string; status?: number }).status = 400;
    throw error;
  }

  const { data: existingContact, error: existingError } = await supabase
    .from("contacts")
    .select("id")
    .eq("owner_profile_id", profileId)
    .eq("contact_profile_id", targetProfile.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingContact) {
    const error = new Error("Contact already added.");
    (error as Error & { code?: string; status?: number }).code = "contact_exists";
    (error as Error & { code?: string; status?: number }).status = 409;
    throw error;
  }

  const contactDisplayName = formatDisplayName(normalizedEmail, targetProfile.display_name ?? null, nickname);

  const { data: contactRow, error: insertError } = await supabase
    .from("contacts")
    .insert({
      owner_profile_id: profileId,
      contact_profile_id: targetProfile.id,
      contact_email: normalizedEmail,
      contact_display_name: contactDisplayName,
      nickname: nickname?.trim() || null,
      last_verified_at: new Date().toISOString(),
    })
    .select("id, contact_email, contact_display_name, nickname, created_at, updated_at")
    .single();

  if (insertError || !contactRow) {
    throw insertError ?? new Error("Unable to save the contact.");
  }

  return {
    id: contactRow.id,
    email: contactRow.contact_email,
    displayName: contactRow.contact_display_name,
    nickname: contactRow.nickname ?? null,
    isOnline: await isContactOnline(targetProfile.id),
    lastSeenAt: null,
    createdAt: contactRow.created_at,
    updatedAt: contactRow.updated_at,
  } satisfies ContactDirectoryItem;
}

export async function isContactOnline(profileId: string) {
  const presence = await getActiveDeviceSessionMap([profileId]);
  return presence.has(profileId);
}

export type CallInvitationItem = {
  id: string;
  callId: string;
  mode: "video" | "audio";
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  callerProfileId: string;
  callerDisplayName: string;
  callerEmail: string;
  callerPhotoUrl: string | null;
  contactId: string | null;
  createdAt: string;
  expiresAt: string;
};

export async function createCallInvitation(input: {
  callId: string;
  callerProfileId: string;
  calleeProfileId: string;
  contactId: string | null;
  mode: "video" | "audio";
}) {
  const supabase = getSupabaseAdminClient();
  const { data: callerProfile, error: callerProfileError } = await supabase
    .from("profiles")
    .select("id, email, display_name, photo_url")
    .eq("id", input.callerProfileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (callerProfileError) {
    throw callerProfileError;
  }

  const { data: invitation, error } = await supabase
    .from("call_invitations")
    .insert({
      call_id: input.callId,
      caller_profile_id: input.callerProfileId,
      callee_profile_id: input.calleeProfileId,
      contact_id: input.contactId,
      mode: input.mode,
      status: "pending",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select("id, call_id, mode, status, caller_profile_id, callee_profile_id, contact_id, created_at, expires_at")
    .single();

  if (error || !invitation) {
    throw error ?? new Error("Unable to create the call invitation.");
  }

  return {
    id: invitation.id,
    callId: invitation.call_id,
    mode: invitation.mode,
    status: invitation.status,
    callerProfileId: invitation.caller_profile_id,
    callerDisplayName: callerProfile?.display_name ?? callerProfile?.email ?? "LetsCall",
    callerEmail: callerProfile?.email ?? "",
    callerPhotoUrl: callerProfile?.photo_url ?? null,
    contactId: invitation.contact_id ?? null,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
  } satisfies CallInvitationItem;
}

async function loadInvitationWithCaller(invitationId: string, profileId?: string | null) {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("call_invitations")
    .select("id, call_id, mode, status, caller_profile_id, callee_profile_id, contact_id, created_at, expires_at")
    .eq("id", invitationId)
    .is("deleted_at", null);

  if (profileId) {
    query.or(`caller_profile_id.eq.${profileId},callee_profile_id.eq.${profileId}`);
  }

  const { data: invitation, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  if (!invitation) {
    return null;
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("id, email, display_name, photo_url")
    .eq("id", invitation.caller_profile_id)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    id: invitation.id,
    callId: invitation.call_id,
    mode: invitation.mode,
    status: invitation.status,
    callerProfileId: invitation.caller_profile_id,
    callerDisplayName: callerProfile?.display_name ?? callerProfile?.email ?? "LetsCall",
    callerEmail: callerProfile?.email ?? "",
    callerPhotoUrl: callerProfile?.photo_url ?? null,
    contactId: invitation.contact_id ?? null,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
  } satisfies CallInvitationItem;
}

export async function getInvitationForProfile(invitationId: string, profileId?: string | null) {
  return await loadInvitationWithCaller(invitationId, profileId);
}

export async function getInvitationByCallId(callId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: invitation, error } = await supabase
    .from("call_invitations")
    .select("id, call_id, mode, status, caller_profile_id, callee_profile_id, contact_id, created_at, expires_at")
    .eq("call_id", callId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!invitation) {
    return null;
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("id, email, display_name, photo_url")
    .eq("id", invitation.caller_profile_id)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    id: invitation.id,
    callId: invitation.call_id,
    mode: invitation.mode,
    status: invitation.status,
    callerProfileId: invitation.caller_profile_id,
    callerDisplayName: callerProfile?.display_name ?? callerProfile?.email ?? "LetsCall",
    callerEmail: callerProfile?.email ?? "",
    callerPhotoUrl: callerProfile?.photo_url ?? null,
    contactId: invitation.contact_id ?? null,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
  } satisfies CallInvitationItem;
}

export async function listIncomingCallInvitations(profileId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: invitations, error } = await supabase
    .from("call_invitations")
    .select("id, call_id, mode, status, caller_profile_id, callee_profile_id, contact_id, created_at, expires_at")
    .eq("callee_profile_id", profileId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const callerIds = (invitations ?? []).map((item) => item.caller_profile_id);
  if (callerIds.length === 0) {
    return [];
  }

  const { data: callerProfiles, error: callerError } = await supabase
    .from("profiles")
    .select("id, email, display_name, photo_url")
    .in("id", callerIds)
    .is("deleted_at", null);

  if (callerError) {
    throw callerError;
  }

  const callerById = new Map((callerProfiles ?? []).map((profile) => [profile.id, profile]));
  return (invitations ?? []).map((invitation) => {
    const callerProfile = callerById.get(invitation.caller_profile_id);
    return {
      id: invitation.id,
      callId: invitation.call_id,
      mode: invitation.mode,
      status: invitation.status,
      callerProfileId: invitation.caller_profile_id,
      callerDisplayName: callerProfile?.display_name ?? callerProfile?.email ?? "LetsCall",
      callerEmail: callerProfile?.email ?? "",
      callerPhotoUrl: callerProfile?.photo_url ?? null,
      contactId: invitation.contact_id ?? null,
      createdAt: invitation.created_at,
      expiresAt: invitation.expires_at,
    } satisfies CallInvitationItem;
  });
}

export async function acceptCallInvitation(invitationId: string, profileId: string) {
  const supabase = getSupabaseAdminClient();
  const invitation = await getInvitationForProfile(invitationId, profileId);
  if (!invitation) {
    const error = new Error("Call invitation not found.");
    (error as Error & { code?: string; status?: number }).code = "invitation_not_found";
    (error as Error & { code?: string; status?: number }).status = 404;
    throw error;
  }

  if (invitation.callerProfileId === profileId) {
    const error = new Error("You cannot accept your own call invitation.");
    (error as Error & { code?: string; status?: number }).code = "invitation_invalid";
    (error as Error & { code?: string; status?: number }).status = 400;
    throw error;
  }

  const { error } = await supabase
    .from("call_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitationId)
    .eq("callee_profile_id", profileId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }

  return invitation;
}

export async function declineCallInvitation(invitationId: string, profileId: string) {
  const supabase = getSupabaseAdminClient();
  const invitation = await getInvitationForProfile(invitationId, profileId);
  if (!invitation) {
    const error = new Error("Call invitation not found.");
    (error as Error & { code?: string; status?: number }).code = "invitation_not_found";
    (error as Error & { code?: string; status?: number }).status = 404;
    throw error;
  }

  const { error } = await supabase
    .from("call_invitations")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
    })
    .eq("id", invitationId)
    .eq("callee_profile_id", profileId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }

  return invitation;
}

export async function cancelCallInvitation(callId: string, profileId?: string | null) {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("call_invitations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("call_id", callId)
    .eq("status", "pending");

  if (profileId) {
    query.eq("caller_profile_id", profileId);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
}


