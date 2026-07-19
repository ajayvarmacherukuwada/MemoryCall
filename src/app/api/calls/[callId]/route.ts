import { NextResponse } from "next/server";
import { getCallRoomInfo, removeCallRoom } from "@/lib/calls/call-store";

function logApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[JOIN]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function toErrorResponse(error: unknown, fallbackMessage: string, fallbackCode: string, requestUrl: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? fallbackCode) : fallbackCode;
  const status =
    error && typeof error === "object" && "status" in error && typeof (error as { status?: number }).status === "number"
      ? ((error as { status?: number }).status as number)
      : 500;

  logApiEvent("Call request failed", {
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
      logApiEvent("Call not found", { callId });
      return NextResponse.json({ error: "Call room not found." }, { status: 404 });
    }

    logApiEvent("Call found", { callId, messageCount: info.messageCount, endedAt: info.endedAt });
    return NextResponse.json(info);
  } catch (error) {
    return toErrorResponse(error, "Unable to load the call.", "call_lookup_failed", request.url);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await context.params;
    await removeCallRoom(callId);
    logApiEvent("Call removed", { callId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "Unable to remove the call.", "call_remove_failed", request.url);
  }
}