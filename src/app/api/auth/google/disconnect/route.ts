import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { disconnectGoogleProvider } from "@/lib/server/google-provider";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);
    await disconnectGoogleProvider(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to disconnect Google.",
        code: "google_disconnect_failed",
      },
      { status: 400 },
    );
  }
}
