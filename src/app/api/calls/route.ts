import { NextResponse } from "next/server";
import { createCallRoomRecord } from "@/lib/calls/call-store";
import { authenticateSupabaseRequest, getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { ensureProfileRow } from "@/lib/server/profile";
import { createCallInvitation, isContactOnline } from "@/lib/server/contacts";

function createCallId() {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

function logApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[HOST]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function buildInviteUrl(request: Request, callId: string) {
  const url = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}/call/${callId}`;
  }

  return `${url.origin}/call/${callId}`;
}

export async function POST(request: Request) {
  try {
    const { user } = await authenticateSupabaseRequest(request);
    const supabase = getSupabaseAdminClient();
    await ensureProfileRow(user);

    const body = (await request.json().catch(() => null)) as {
      contactId?: string | null;
      contactEmail?: string | null;
      mode?: "video" | "audio";
    } | null;

    const contactId = body?.contactId?.trim() ?? "";
    const contactEmail = body?.contactEmail?.trim().toLowerCase() ?? "";
    const mode = body?.mode === "audio" ? "audio" : "video";
    const callId = createCallId();
    const inviteUrl = buildInviteUrl(request, callId);
    const requestOrigin = new URL(request.url).origin;

    logApiEvent("Call create requested", {
      callId,
      requestOrigin,
      mode,
      hasContactId: Boolean(contactId),
      hasContactEmail: Boolean(contactEmail),
    });

    if (!contactId && !contactEmail) {
      await createCallRoomRecord(callId, { creatorProfileId: user.id, mode });
      logApiEvent("Call created", { callId, requestOrigin, inviteUrl, mode, contactId: null, contactEmail: null });
      logApiEvent("Call code generated", { callId, requestOrigin, inviteUrl });

      return NextResponse.json({
        callId,
        inviteUrl,
      });
    }

    const contactQuery = supabase
      .from("contacts")
      .select("id, contact_profile_id, contact_display_name, nickname, contact_email")
      .eq("owner_profile_id", user.id)
      .is("deleted_at", null);

    if (contactId) {
      contactQuery.eq("id", contactId);
    } else {
      contactQuery.eq("contact_email", contactEmail);
    }

    logApiEvent("Contact lookup started", {
      callId,
      requestOrigin,
      contactId: contactId || null,
      contactEmail: contactEmail || null,
    });

    const { data: contactRow, error: contactError } = await contactQuery.maybeSingle();

    if (contactError) {
      logApiEvent("Contact lookup failed", {
        callId,
        requestOrigin,
        message: contactError.message,
        code: contactError.code ?? null,
      });
      return NextResponse.json({ error: contactError.message, code: "contact_lookup_failed" }, { status: 500 });
    }

    if (!contactRow) {
      return NextResponse.json(
        {
          error: "This email address is not registered with MemoryCall.",
          code: "contact_not_found",
        },
        { status: 404 },
      );
    }

    const online = await isContactOnline(contactRow.contact_profile_id);
    logApiEvent("Contact presence checked", {
      callId,
      requestOrigin,
      contactId: contactRow.id,
      contactProfileId: contactRow.contact_profile_id,
      online,
    });

    if (!online) {
      return NextResponse.json(
        {
          error: "This contact is currently offline.",
          code: "contact_offline",
        },
        { status: 409 },
      );
    }

    logApiEvent("Call session creation started", {
      callId,
      requestOrigin,
      creatorProfileId: user.id,
      contactId: contactRow.id,
      calleeProfileId: contactRow.contact_profile_id,
      mode,
    });

    await createCallRoomRecord(callId, {
      creatorProfileId: user.id,
      contactId: contactRow.id,
      calleeProfileId: contactRow.contact_profile_id,
      mode,
    });

    logApiEvent("Call session creation completed", {
      callId,
      requestOrigin,
      creatorProfileId: user.id,
      contactId: contactRow.id,
      calleeProfileId: contactRow.contact_profile_id,
      mode,
    });

    logApiEvent("Call invitation creation started", {
      callId,
      requestOrigin,
      callerProfileId: user.id,
      calleeProfileId: contactRow.contact_profile_id,
      contactId: contactRow.id,
      mode,
    });

    const invitation = await createCallInvitation({
      callId,
      callerProfileId: user.id,
      calleeProfileId: contactRow.contact_profile_id,
      contactId: contactRow.id,
      mode,
    });

    logApiEvent("Call created", {
      callId,
      requestOrigin,
      inviteUrl,
      mode,
      contactId: contactRow.id,
      contactEmail: contactRow.contact_email,
      contactName: contactRow.nickname ?? contactRow.contact_display_name,
      invitationId: invitation.id,
    });
    logApiEvent("Call invitation creation completed", {
      callId,
      invitationId: invitation.id,
      calleeProfileId: contactRow.contact_profile_id,
      mode,
    });

    return NextResponse.json({
      callId,
      inviteUrl,
      invitationId: invitation.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the call.";
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "call_create_failed") : "call_create_failed";
    const status =
      error && typeof error === "object" && "status" in error && typeof (error as { status?: number }).status === "number"
        ? ((error as { status?: number }).status as number)
        : 500;

    logApiEvent("Call create failed", {
      message,
      code,
      status,
      requestOrigin: new URL(request.url).origin,
      stack: error instanceof Error ? error.stack ?? null : null,
    });

    return NextResponse.json({ error: message, code }, { status });
  }
}
