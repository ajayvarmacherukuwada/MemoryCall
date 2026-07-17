import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-admin";
import { addContactForProfile, listContactsForProfile } from "@/lib/server/contacts";
import { ensureProfileRow } from "@/lib/server/profile";

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
    return String((error as { code?: string }).code ?? "contacts_failed");
  }

  return "contacts_failed";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "Unable to manage contacts.")
      : "Unable to manage contacts.";
}

export async function GET(request: Request) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);
    const contacts = await listContactsForProfile(user.id);
    return NextResponse.json({ contacts });
  } catch (error) {
    const status = getErrorStatus(error);
    const code = getErrorCode(error);
    const message = getErrorMessage(error);
    console.error("[CONTACTS][list]", { status, code, message });

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    await ensureProfileRow(user);

    const body = (await request.json().catch(() => null)) as { email?: string; nickname?: string | null } | null;
    const email = body?.email?.trim() ?? "";
    const nickname = body?.nickname?.trim() ?? null;

    if (!email) {
      return NextResponse.json({ error: "Please enter a valid email address.", code: "invalid_email" }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address.", code: "invalid_email" }, { status: 400 });
    }

    const contact = await addContactForProfile(user.id, email, nickname);
    return NextResponse.json({ contact });
  } catch (error) {
    const status = getErrorStatus(error);
    const code = getErrorCode(error);
    const message = getErrorMessage(error);
    console.error("[CONTACTS][create]", { status, code, message });

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status },
    );
  }
}
