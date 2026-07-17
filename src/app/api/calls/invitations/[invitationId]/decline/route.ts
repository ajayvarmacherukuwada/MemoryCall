import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { declineCallInvitation } from "@/lib/server/contacts";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);
    const { invitationId } = await context.params;
    await declineCallInvitation(invitationId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to decline the call invitation.";
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "invitation_decline_failed") : "invitation_decline_failed";
    const status =
      error && typeof error === "object" && "status" in error && typeof (error as { status?: number }).status === "number"
        ? ((error as { status?: number }).status as number)
        : 500;

    return NextResponse.json({ error: message, code }, { status });
  }
}
