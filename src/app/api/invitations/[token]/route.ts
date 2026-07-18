import { NextResponse } from "next/server";
import { loadInviteDetailsForPublic } from "@/lib/server/invitations";

export const runtime = "nodejs";

function getErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "invalid_invite") {
      return 404;
    }
    if (code === "expired_invite" || code === "revoked_invite" || code === "accepted_invite") {
      return 410;
    }
  }

  return 500;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "Unable to load invite.")
      : "Unable to load invite.";
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const invite = await loadInviteDetailsForPublic(token);

    if (!invite) {
      return NextResponse.json({ error: "Invalid invite.", code: "invalid_invite" }, { status: 404 });
    }

    return NextResponse.json({ invite });
  } catch (error) {
    const status = getErrorStatus(error);
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message, code: "invite_lookup_failed" }, { status });
  }
}