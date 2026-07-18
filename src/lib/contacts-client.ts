import { authFetch } from "@/lib/auth-client";

export type ContactSummary = {
  id: string;
  email: string;
  displayName: string;
  nickname: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type MemoryInviteSummary = {
  id: string;
  token: string;
  shareUrl: string;
  inviterProfileId: string;
  inviterDisplayName: string;
  inviterPhotoUrl: string | null;
  recipientEmail: string;
  recipientDisplayName: string;
  status: MemoryInviteStatus;
  expiresAt: string;
  createdAt: string;
};

export type ContactCreationResult =
  | { status: "contact_added"; contact: ContactSummary }
  | { status: "invite_created"; invite: MemoryInviteSummary };

export type IncomingCallInvitation = {
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

export type ContactsResponse = {
  contacts: ContactSummary[];
};

async function parseJsonError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  const message = body?.error ?? "Request failed";
  const error = new Error(message);
  (error as Error & { code?: string }).code = body?.code ?? "request_failed";
  (error as Error & { status?: number }).status = response.status;
  throw error;
}

export async function fetchContacts() {
  return authFetch<ContactsResponse>("/api/contacts", {
    method: "GET",
    cache: "no-store",
  });
}

export async function createContact(input: { email: string; displayName: string }) {
  return authFetch<ContactCreationResult>("/api/contacts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchIncomingInvitation() {
  return authFetch<{ invitation: IncomingCallInvitation | null }>("/api/calls/invitations/incoming", {
    method: "GET",
    cache: "no-store",
  });
}

export async function fetchInvitation(invitationId: string) {
  return authFetch<{ invitation: IncomingCallInvitation | null }>(`/api/calls/invitations/${encodeURIComponent(invitationId)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function acceptInvitation(invitationId: string) {
  return authFetch<{ callId: string }>(`/api/calls/invitations/${encodeURIComponent(invitationId)}/accept`, {
    method: "POST",
    cache: "no-store",
  });
}

export async function declineInvitation(invitationId: string) {
  return authFetch<{ ok: true }>(`/api/calls/invitations/${encodeURIComponent(invitationId)}/decline`, {
    method: "POST",
    cache: "no-store",
  });
}

export async function cancelInvitationByCallId(callId: string) {
  return authFetch<{ ok: true }>(`/api/calls/${encodeURIComponent(callId)}/cancel`, {
    method: "POST",
    cache: "no-store",
  });
}

export async function fetchMemoryInvite(token: string) {
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    await parseJsonError(response);
  }

  return (await response.json()) as { invite: MemoryInviteSummary };
}

export async function acceptMemoryInvite(token: string) {
  const response = await authFetch<{ ok: true; invite: MemoryInviteSummary }>(`/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    cache: "no-store",
  });

  return response;
}
