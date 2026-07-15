import { NextResponse } from "next/server";
import { createCallRoomRecord } from "@/lib/calls/call-store";

function createCallId() {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

function logApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[HOST]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function buildInviteUrl(request: Request, callId: string) {
  const url = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}/call/${callId}`;
  }

  return `${url.origin}/call/${callId}`;
}

export async function POST(request: Request) {
  const callId = createCallId();
  createCallRoomRecord(callId);
  const inviteUrl = buildInviteUrl(request, callId);
  const requestOrigin = new URL(request.url).origin;

  logApiEvent("Call created", { callId, requestOrigin, inviteUrl });
  logApiEvent("Call code generated", { callId, requestOrigin, inviteUrl });

  return NextResponse.json({
    callId,
    inviteUrl,
  });
}