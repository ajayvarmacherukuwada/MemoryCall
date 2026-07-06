import { NextResponse } from "next/server";
import { getCallRoomInfo, removeCallRoom } from "@/lib/calls/call-store";

function logApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[JOIN]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

export async function GET(_request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  const info = getCallRoomInfo(callId);
  if (!info) {
    logApiEvent("Call not found", { callId });
    return NextResponse.json({ error: "Call room not found." }, { status: 404 });
  }

  logApiEvent("Call found", { callId, messageCount: info.messageCount, endedAt: info.endedAt });
  return NextResponse.json(info);
}

export async function DELETE(_request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  removeCallRoom(callId);
  logApiEvent("Call removed", { callId });
  return NextResponse.json({ ok: true });
}
