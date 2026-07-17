import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { readDeviceSessionMetadata, touchDeviceSession } from "@/lib/server/device-sessions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user } = await authenticateSupabaseRequest(request);
  await ensureProfileRow(user);
  const metadata = readDeviceSessionMetadata(request);

  if (metadata) {
    await touchDeviceSession(user.id, metadata);
  }

  return NextResponse.json({ ok: true });
}
