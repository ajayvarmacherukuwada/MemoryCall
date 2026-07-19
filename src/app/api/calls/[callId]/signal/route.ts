import { NextResponse } from "next/server";
import { appendCallSignalMessage, getCallRoomInfo, listCallMessages } from "@/lib/calls/call-store";
import type { CallSignalMessage } from "@/lib/calls/types";
import { getInvitationByCallId } from "@/lib/server/contacts";

function parseSince(value: string | null) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function logApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[SIGNAL]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function toErrorResponse(error: unknown, fallbackMessage: string, fallbackCode: string, requestUrl: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? fallbackCode) : fallbackCode;
  const status =
    error && typeof error === "object" && "status" in error && typeof (error as { status?: number }).status === "number"
      ? ((error as { status?: number }).status as number)
      : 500;

  logApiEvent("Signal request failed", {
    message,
    code,
    status,
    requestOrigin: new URL(requestUrl).origin,
  });

  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: Request, context: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await context.params;
    const info = await getCallRoomInfo(callId);
    if (!info) {
      logApiEvent("Signal poll room missing", { callId, requestOrigin: new URL(request.url).origin });
      return NextResponse.json({ error: "Call room not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const since = parseSince(url.searchParams.get("since"));
    logApiEvent("Signal poll start", { callId, since, requestOrigin: url.origin });
    const messages = await listCallMessages(callId, since);
    const invitation = await getInvitationByCallId(callId);
    logApiEvent("Signal poll result", {
      callId,
      since,
      requestOrigin: url.origin,
      messageCount: messages.length,
      roomEnded: info.endedAt !== null,
      invitationStatus: invitation?.status ?? null,
    });

    return NextResponse.json({
      messages,
      roomEnded: info.endedAt !== null,
      invitationStatus: invitation?.status ?? null,
      invitationId: invitation?.id ?? null,
    });
  } catch (error) {
    return toErrorResponse(error, "Unable to read call signaling data.", "signal_poll_failed", request.url);
  }
}

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await context.params;
    const room = await getCallRoomInfo(callId);
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

    const stored = await appendCallSignalMessage({
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
      requestOrigin: new Date().toISOString(),
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
  } catch (error) {
    return toErrorResponse(error, "Unable to send call signaling data.", "signal_post_failed", request.url);
  }
}