"use client";

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

export async function fetchContacts() {
  return authFetch<ContactsResponse>("/api/contacts", {
    method: "GET",
    cache: "no-store",
  });
}

export async function createContact(input: { email: string; nickname?: string }) {
  return authFetch<{ contact: ContactSummary }>("/api/contacts", {
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
