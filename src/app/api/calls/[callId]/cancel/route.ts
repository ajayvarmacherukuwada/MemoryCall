import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { cancelCallInvitation } from "@/lib/server/contacts";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);
    const { callId } = await context.params;
    await cancelCallInvitation(callId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel the call invitation.";
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "call_cancel_failed") : "call_cancel_failed";
    const status =
      error && typeof error === "object" && "status" in error && typeof (error as { status?: number }).status === "number"
        ? ((error as { status?: number }).status as number)
        : 500;

    return NextResponse.json({ error: message, code }, { status });
  }
}
