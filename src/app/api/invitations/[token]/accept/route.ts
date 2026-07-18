import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { acceptInviteToken } from "@/lib/server/invitations";

export const runtime = "nodejs";

function getErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }

  return 500;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: string }).code ?? "invite_accept_failed");
  }

  return "invite_accept_failed";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "Unable to accept invite.")
      : "Unable to accept invite.";
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);
    const { token } = await context.params;

    const invite = await acceptInviteToken({
      token,
      profileId: user.id,
      email: user.email ?? "",
    });

    return NextResponse.json({ ok: true, invite });
  } catch (error) {
    const status = getErrorStatus(error);
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status },
    );
  }
}