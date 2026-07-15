"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";

export type CallSignalEnvelope = {
  id: string;
  callId: string;
  sequence: number;
  senderId: string;
  type: "join" | "offer" | "answer" | "candidate" | "hangup";
  payload: unknown;
  createdAt: number;
};

export type CreateCallResponse = {
  callId: string;
  inviteUrl: string;
};

type CallRoomInfo = {
  callId: string;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
  messageCount: number;
};

type RealtimeSignalPayload = {
  id?: string;
  senderId?: string;
  type?: CallSignalEnvelope["type"];
  payload?: unknown;
  createdAt?: number;
};

type ActiveSignalChannel = {
  callId: string;
  channel: RealtimeChannel;
  ready: Promise<void>;
  queue: CallSignalEnvelope[];
  nextSequence: number;
};

let activeChannel: ActiveSignalChannel | null = null;

function getOrigin() {
  return typeof window === "undefined" ? "server" : window.location.origin;
}

function logSignalApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[CALL SIGNAL API]", JSON.stringify({ step, at: new Date().toISOString(), origin: getOrigin(), ...details }));
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function isRealtimeSubscribed(status: string) {
  return status === "SUBSCRIBED";
}

function isRealtimeFailure(status: string) {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED";
}

function normalizeSignalPayload(callId: string, state: ActiveSignalChannel, payload: RealtimeSignalPayload): CallSignalEnvelope | null {
  if (!payload.senderId || !payload.type) {
    return null;
  }

  return {
    id: payload.id ?? crypto.randomUUID(),
    callId,
    sequence: state.nextSequence++,
    senderId: payload.senderId,
    type: payload.type,
    payload: payload.payload ?? null,
    createdAt: payload.createdAt ?? Date.now(),
  };
}

async function removeActiveChannel() {
  if (!activeChannel) {
    return;
  }

  const supabase = getBrowserSupabaseClient();
  const channelToRemove = activeChannel.channel;
  const callId = activeChannel.callId;
  activeChannel = null;
  await supabase.removeChannel(channelToRemove);
  logSignalApiEvent("disconnect_channel", { callId });
}

async function ensureSignalChannel(callId: string) {
  if (activeChannel?.callId === callId) {
    await activeChannel.ready;
    return activeChannel;
  }

  await removeActiveChannel();

  const supabase = getBrowserSupabaseClient();
  const topic = `call:${callId}`;
  const queue: CallSignalEnvelope[] = [];

  const channel = supabase.channel(topic, {
    config: {
      broadcast: {
        self: false,
      },
    },
  });

  const nextState: ActiveSignalChannel = {
    callId,
    channel,
    queue,
    nextSequence: 1,
    ready: Promise.resolve(),
  };

  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    const normalized = normalizeSignalPayload(callId, nextState, (payload ?? null) as RealtimeSignalPayload);
    if (!normalized) {
      logSignalApiEvent("receive_signal_ignored", { callId, reason: "invalid_payload" });
      return;
    }

    nextState.queue.push(normalized);
    logSignalApiEvent("receive_signal", {
      callId,
      type: normalized.type,
      senderId: normalized.senderId,
      sequence: normalized.sequence,
      queueSize: nextState.queue.length,
    });
  });

  nextState.ready = new Promise<void>((resolve, reject) => {
    channel.subscribe((status, error) => {
      logSignalApiEvent("channel_status", {
        callId,
        status,
        error: error ? String(error) : null,
      });

      if (isRealtimeSubscribed(status)) {
        resolve();
        return;
      }

      if (isRealtimeFailure(status)) {
        reject(new Error(error ? String(error) : `Realtime subscription failed with status ${status}.`));
      }
    });
  });

  activeChannel = nextState;
  await nextState.ready;
  logSignalApiEvent("connect_channel", { callId, topic });
  return nextState;
}

export async function connectCallSignalChannel(callId: string) {
  await ensureSignalChannel(callId);
}

export async function disconnectCallSignalChannel(callId?: string | null) {
  if (!activeChannel || (callId && activeChannel.callId !== callId)) {
    return;
  }

  await removeActiveChannel();
}

export async function createCallRoom() {
  logSignalApiEvent("create_call_request", { requestUrl: "/api/calls" });
  const response = await fetch("/api/calls", { method: "POST" });
  const bodyText = await response.clone().text();
  logSignalApiEvent("create_call_response", {
    requestUrl: "/api/calls",
    status: response.status,
    ok: response.ok,
    body: bodyText,
  });
  if (!response.ok) {
    throw new Error("Unable to create a call room.");
  }

  return await parseJson<CreateCallResponse>(response);
}

export async function getCallRoomInfo(callId: string) {
  const requestUrl = `/api/calls/${encodeURIComponent(callId)}`;
  logSignalApiEvent("get_call_room_request", { callId, requestUrl, mode: "synthetic" });

  return {
    callId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    endedAt: null,
    messageCount: 0,
  } satisfies CallRoomInfo;
}

export async function sendCallSignal(callId: string, message: Omit<CallSignalEnvelope, "id" | "callId" | "sequence" | "createdAt">) {
  const state = await ensureSignalChannel(callId);
  const payload = {
    id: crypto.randomUUID(),
    senderId: message.senderId,
    type: message.type,
    payload: message.payload ?? null,
    createdAt: Date.now(),
  } satisfies RealtimeSignalPayload;

  logSignalApiEvent("send_signal_request", { callId, type: message.type });
  const response = await state.channel.send({
    type: "broadcast",
    event: "signal",
    payload,
  });

  if (response !== "ok") {
    logSignalApiEvent("send_signal_failed", { callId, type: message.type, response });
    throw new Error("Unable to send call signaling data.");
  }

  logSignalApiEvent("send_signal_response", { callId, type: message.type, response });
  return { ok: true as const };
}

export async function fetchCallSignals(callId: string, since = 0) {
  const state = await ensureSignalChannel(callId);
  const messages = state.queue.filter((message) => message.sequence > since);
  if (messages.length > 0) {
    state.queue.splice(0, messages.length);
  }

  logSignalApiEvent("poll_signals_response", {
    callId,
    since,
    messageCount: messages.length,
  });

  return {
    messages,
    roomEnded: messages.some((message) => message.type === "hangup"),
  };
}
