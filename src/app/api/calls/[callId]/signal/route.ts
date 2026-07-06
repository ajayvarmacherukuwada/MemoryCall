import { NextResponse } from "next/server";
import { appendCallSignalMessage, getCallRoomInfo, listCallMessages } from "@/lib/calls/call-store";
import type { CallSignalMessage } from "@/lib/calls/types";

function parseSince(value: string | null) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function logApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[SIGNAL]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

export async function GET(request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  const info = getCallRoomInfo(callId);
  if (!info) {
    logApiEvent("Signal poll room missing", { callId, requestOrigin: new URL(request.url).origin });
    return NextResponse.json({ error: "Call room not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const since = parseSince(url.searchParams.get("since"));
  logApiEvent("Signal poll start", { callId, since, requestOrigin: url.origin });
  const messages = listCallMessages(callId, since);
  logApiEvent("Signal poll result", {
    callId,
    since,
    requestOrigin: url.origin,
    messageCount: messages.length,
    roomEnded: info.endedAt !== null,
  });

  return NextResponse.json({ messages, roomEnded: info.endedAt !== null });
}

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  const room = getCallRoomInfo(callId);
  if (!room) {
    logApiEvent("Signal post room missing", { callId, requestOrigin: new URL(request.url).origin });
    return NextResponse.json({ error: "Call room not found." }, { status: 404 });
  }

  const payload = (await request.json()) as {
    senderId?: string;
    type?: CallSignalMessage["type"];
    payload?: unknown;
  };

  if (!payload.senderId || !payload.type) {
    return NextResponse.json({ error: "Invalid signaling payload." }, { status: 400 });
  }

  const stored = appendCallSignalMessage({
    id: crypto.randomUUID(),
    callId,
    senderId: payload.senderId,
    type: payload.type,
    payload: payload.payload ?? null,
    createdAt: Date.now(),
  });

  logApiEvent("Signal stored", {
    callId,
    senderId: payload.senderId,
    type: payload.type,
    requestOrigin: new URL(request.url).origin,
    sequence: stored?.nextSequence ? stored.nextSequence - 1 : null,
  });

  if (payload.type === "join") {
    logApiEvent("Participant joined room", { callId, senderId: payload.senderId });
  }

  if (payload.type === "offer") {
    logApiEvent("Offer created", { callId, senderId: payload.senderId });
  }

  if (payload.type === "answer") {
    logApiEvent("Answer created", { callId, senderId: payload.senderId });
  }

  if (payload.type === "candidate") {
    logApiEvent("Candidate sent", { callId, senderId: payload.senderId });
  }

  if (payload.type === "hangup") {
    logApiEvent("Hangup sent", { callId, senderId: payload.senderId });
  }

  return NextResponse.json({ ok: true });
}