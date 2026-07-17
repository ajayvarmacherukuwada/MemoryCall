import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { listIncomingCallInvitations } from "@/lib/server/contacts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);
    const invitations = await listIncomingCallInvitations(user.id);
    return NextResponse.json({ invitation: invitations[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load incoming calls.";
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "incoming_invites_failed") : "incoming_invites_failed";
    const status =
      error && typeof error === "object" && "status" in error && typeof (error as { status?: number }).status === "number"
        ? ((error as { status?: number }).status as number)
        : 500;

    return NextResponse.json({ error: message, code }, { status });
  }
}
