"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Avatar, Badge, GlassCard } from "@/components/letscall/mobile-shell";
import { acceptInvitation, declineInvitation, fetchInvitation, type IncomingCallInvitation } from "@/lib/contacts-client";

function formatCallType(mode: IncomingCallInvitation["mode"]) {
  return mode === "audio" ? "Audio call" : "Video call";
}

function logIncomingCallEvent(step: string, details: Record<string, unknown>) {
  console.info("[LetsCall][IncomingCall]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

export function IncomingCallScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<IncomingCallInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadInvitation = async () => {
      try {
        logIncomingCallEvent("INCOMING_RECEIVED", { invitationId });
        const response = await fetchInvitation(invitationId);
        if (!cancelled) {
          setInvitation(response.invitation);
          setError(null);
          logIncomingCallEvent("INCOMING_LOADED", {
            invitationId,
            callId: response.invitation?.callId ?? null,
            status: response.invitation?.status ?? null,
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Unable to load this call invitation.";
          setError(message);
          logIncomingCallEvent("INCOMING_LOAD_FAILED", { invitationId, error: message });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInvitation();
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  async function handleAccept() {
    if (!invitation) return;
    setBusy(true);
    setError(null);

    try {
      logIncomingCallEvent("ACCEPTED", { invitationId: invitation.id, callId: invitation.callId });
      const response = await acceptInvitation(invitation.id);
      router.replace(`/call/${encodeURIComponent(response.callId)}`);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Unable to accept this call.");
      setBusy(false);
    }
  }

  async function handleDecline() {
    if (!invitation) return;
    setBusy(true);
    setError(null);

    try {
      logIncomingCallEvent("DECLINED", { invitationId: invitation.id, callId: invitation.callId });
      await declineInvitation(invitation.id);
      router.replace("/");
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : "Unable to decline this call.");
      setBusy(false);
    }
  }

  return (
    <AppShell activeTab="home" title="Incoming call" subtitle="" showHeader={false} showNav={false} mainClassName="flex-1 min-h-0 overflow-hidden p-0">
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-5 py-5">
        <div className="w-full max-w-[460px] space-y-4">
          <GlassCard className="p-5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Incoming</p>
            <div className="mt-5 flex flex-col items-center gap-4">
              <Avatar name={invitation?.callerDisplayName ?? "LetsCall"} imageUrl={invitation?.callerPhotoUrl ?? null} size={92} />
              <div>
                <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-white">{loading ? "Calling..." : invitation?.callerDisplayName ?? "Incoming call"}</h2>
                <p className="mt-2 text-[15px] leading-6 text-white/62">{loading ? "Please wait..." : formatCallType(invitation?.mode ?? "video")}</p>
              </div>
              <Badge>{loading ? "Loading" : invitation?.status ?? "pending"}</Badge>
            </div>
            {error ? <p className="mt-4 whitespace-pre-wrap text-[13px] leading-6 text-rose-200">{error}</p> : null}
          </GlassCard>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDecline}
              disabled={busy || loading || !invitation}
              className="flex min-h-[56px] items-center justify-center rounded-[24px] border border-white/10 bg-white/6 px-5 text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy || loading || !invitation}
              className="flex min-h-[56px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98] disabled:opacity-60"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
