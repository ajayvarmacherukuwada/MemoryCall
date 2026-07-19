import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { CallRoomInfo, CallRoomRecord, CallSignalMessage } from "@/lib/calls/types";

type CallSessionRow = {
  call_id: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  message_count: number;
  next_sequence: number;
  deleted_at: string | null;
  status: string;
};

type CreateCallRoomDetails = {
  creatorProfileId: string;
  contactId?: string | null;
  calleeProfileId?: string | null;
  mode?: "video" | "audio";
};

function logCallStoreEvent(step: string, details: Record<string, unknown>) {
  console.info("[LetsCall][CallStore]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function getCallSessionsTable() {
  const supabase = getSupabaseAdminClient();
  return supabase.from("call_sessions");
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRoomRow(row: CallSessionRow): CallRoomRecord {
  return {
    callId: row.call_id,
    createdAt: toTimestamp(row.created_at) ?? Date.now(),
    updatedAt: toTimestamp(row.updated_at) ?? Date.now(),
    endedAt: toTimestamp(row.ended_at),
    nextSequence: row.next_sequence ?? 1,
    messages: [],
  };
}

export async function createCallRoomRecord(callId: string, details: CreateCallRoomDetails): Promise<CallRoomRecord> {
  const now = new Date().toISOString();
  const payload = {
    call_id: callId,
    creator_profile_id: details.creatorProfileId,
    contact_id: details.contactId ?? null,
    callee_profile_id: details.calleeProfileId ?? null,
    mode: details.mode ?? "video",
    status: "active",
    message_count: 0,
    next_sequence: 1,
    last_signal_at: null,
    ended_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  logCallStoreEvent("create_start", {
    callId,
    creatorProfileId: details.creatorProfileId,
    contactId: details.contactId ?? null,
    calleeProfileId: details.calleeProfileId ?? null,
    mode: details.mode ?? "video",
  });

  const { data, error } = await getCallSessionsTable()
    .upsert(payload, { onConflict: "call_id" })
    .select("call_id, created_at, updated_at, ended_at, message_count, next_sequence, deleted_at, status")
    .single();

  if (error || !data) {
    logCallStoreEvent("create_failed", {
      callId,
      message: error?.message ?? "Unable to persist the call session.",
      code: error?.code ?? null,
    });
    throw error ?? new Error("Unable to persist the call session.");
  }

  logCallStoreEvent("create_complete", {
    callId,
    status: (data as CallSessionRow).status,
    messageCount: (data as CallSessionRow).message_count,
  });

  return mapRoomRow(data as CallSessionRow);
}

export async function getCallRoomRecord(callId: string) {
  const { data, error } = await getCallSessionsTable()
    .select("call_id, created_at, updated_at, ended_at, message_count, next_sequence, deleted_at, status")
    .eq("call_id", callId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logCallStoreEvent("get_failed", {
      callId,
      message: error.message,
      code: error.code ?? null,
    });
    throw error;
  }

  return data ? mapRoomRow(data as CallSessionRow) : null;
}

export async function appendCallSignalMessage(message: Omit<CallSignalMessage, "sequence">) {
  const { data: existing, error: selectError } = await getCallSessionsTable()
    .select("call_id, created_at, updated_at, ended_at, message_count, next_sequence, deleted_at, status")
    .eq("call_id", message.callId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selectError) {
    logCallStoreEvent("append_select_failed", {
      callId: message.callId,
      message: selectError.message,
      code: selectError.code ?? null,
    });
    throw selectError;
  }

  if (!existing) {
    return null;
  }

  const existingRow = existing as CallSessionRow;
  const now = new Date(message.createdAt).toISOString();
  const nextSequence = Math.max(1, existingRow.next_sequence ?? 1);
  const updatePayload: Record<string, unknown> = {
    last_signal_at: now,
    message_count: (existingRow.message_count ?? 0) + 1,
    next_sequence: nextSequence + 1,
    status:
      message.type === "accept"
        ? "accepted"
        : message.type === "decline"
          ? "declined"
          : message.type === "end" || message.type === "hangup"
            ? "ended"
            : existingRow.status,
    ended_at:
      message.type === "end" || message.type === "hangup" || message.type === "decline"
        ? existingRow.ended_at ?? now
        : existingRow.ended_at,
    updated_at: now,
  };

  const { data, error } = await getCallSessionsTable()
    .update(updatePayload)
    .eq("call_id", message.callId)
    .is("deleted_at", null)
    .select("call_id, created_at, updated_at, ended_at, message_count, next_sequence, deleted_at, status")
    .single();

  if (error || !data) {
    logCallStoreEvent("append_update_failed", {
      callId: message.callId,
      message: error?.message ?? "Unable to update the call session.",
      code: error?.code ?? null,
    });
    throw error ?? new Error("Unable to update the call session.");
  }

  logCallStoreEvent("append_complete", {
    callId: message.callId,
    type: message.type,
    messageCount: (data as CallSessionRow).message_count,
  });

  return mapRoomRow(data as CallSessionRow);
}

export async function listCallMessages(callId: string, since = 0) {
  const room = await getCallRoomRecord(callId);
  if (!room) {
    return [] as CallSignalMessage[];
  }

  // Live signaling already flows through the browser Realtime channel.
  // The backend only needs to confirm that the room still exists.
  return [] as CallSignalMessage[];
}

export async function getCallRoomInfo(callId: string): Promise<CallRoomInfo | null> {
  const room = await getCallRoomRecord(callId);
  if (!room) {
    return null;
  }

  const { data } = await getCallSessionsTable()
    .select("message_count")
    .eq("call_id", callId)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    callId: room.callId,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    endedAt: room.endedAt,
    messageCount: (data as CallSessionRow | null)?.message_count ?? 0,
  };
}

export async function removeCallRoom(callId: string) {
  const now = new Date().toISOString();
  const { error } = await getCallSessionsTable()
    .update({
      ended_at: now,
      status: "ended",
      deleted_at: now,
      updated_at: now,
    })
    .eq("call_id", callId);

  if (error) {
    logCallStoreEvent("remove_failed", {
      callId,
      message: error.message,
      code: error.code ?? null,
    });
    throw error;
  }

  logCallStoreEvent("remove_complete", { callId });
}
