"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, GlassCard } from "@/components/letscall/mobile-shell";
import { acceptMemoryInvite, fetchMemoryInvite, type MemoryInviteSummary } from "@/lib/contacts-client";
import { signInWithGoogleSession } from "@/lib/supabase-browser";
import { useSessionProfile } from "@/components/letscall/use-session-profile";

type InviteStatusState = "loading" | "ready" | "invalid" | "expired" | "revoked" | "accepted" | "error";

function getStatusCopy(status: InviteStatusState) {
  switch (status) {
    case "invalid":
      return "Invalid invite.";
    case "expired":
      return "This invite has expired.";
    case "revoked":
      return "This invite has been revoked.";
    case "accepted":
      return "This invite has already been used.";
    case "error":
      return "Unable to load this invite.";
    case "loading":
      return "Checking invite...";
    default:
      return "You have been invited to join MemoryCall.";
  }
}

export function InviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const profile = useSessionProfile();
  const [invite, setInvite] = useState<MemoryInviteSummary | null>(null);
  const [status, setStatus] = useState<InviteStatusState>("loading");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const didAttemptAccept = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadInvite = async () => {
      setStatus("loading");
      setActionMessage(null);

      try {
        const response = await fetchMemoryInvite(token);
        if (cancelled) return;
        setInvite(response.invite);
        setStatus(response.invite.status === "pending" ? "ready" : response.invite.status);
      } catch (error) {
        if (cancelled) return;
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "") : "";
        const responseStatus = error && typeof error === "object" && "status" in error ? (error as { status?: number }).status : undefined;
        if (responseStatus === 404 || code === "invalid_invite") {
          setStatus("invalid");
          return;
        }
        if (responseStatus === 410 || code === "expired_invite") {
          setStatus("expired");
          return;
        }
        setStatus("error");
      }
    };

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!invite || invite.status !== "pending" || !profile.signedIn || !profile.email || didAttemptAccept.current) {
      return;
    }

    didAttemptAccept.current = true;
    setAccepting(true);

    void acceptMemoryInvite(token)
      .then(() => {
        router.replace("/");
      })
      .catch((error) => {
        didAttemptAccept.current = false;
        setActionMessage(error instanceof Error ? error.message : "Unable to accept invite.");
        setAccepting(false);
      });
  }, [invite, profile.email, profile.signedIn, router, token]);

  useEffect(() => {
    if (invite?.status === "accepted" && profile.signedIn) {
      router.replace("/");
    }
  }, [invite?.status, profile.signedIn, router]);

  async function handleContinueWithGoogle() {
    if (typeof window === "undefined") return;
    await signInWithGoogleSession(window.location.pathname);
  }

  async function handleCopyInvite() {
    if (!invite || typeof window === "undefined") return;

    try {
      await navigator.clipboard.writeText(invite.shareUrl);
      setActionMessage("Invite link copied to clipboard.");
    } catch {
      setActionMessage("Unable to copy the invite link.");
    }
  }

  const statusLabel = getStatusCopy(status);
  const inviterName = invite?.inviterDisplayName ?? "A friend";

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(120,197,173,0.18),_transparent_24%),radial-gradient(circle_at_bottom,_rgba(68,121,255,0.14),_transparent_28%),linear-gradient(180deg,#07090d_0%,#05070b_42%,#030406_100%)] px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[480px] items-center">
        <GlassCard className="w-full p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">MemoryCall Invite</p>
              <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{statusLabel}</h1>
            </div>
            <Badge>{status === "ready" ? "Pending" : status}</Badge>
          </div>

          {invite ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={invite.inviterDisplayName} imageUrl={invite.inviterPhotoUrl} size={56} />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tracking-[-0.02em] text-white">{inviterName} invited you to join MemoryCall.</p>
                  <p className="mt-1 text-[13px] text-white/58">Tap continue with Google to accept the invite.</p>
                </div>
              </div>

              {status === "ready" ? (
                profile.signedIn ? (
                  <div className="rounded-[22px] border border-white/10 bg-white/6 p-4 text-[14px] leading-6 text-white/72">
                    {accepting ? "Accepting invite..." : "Verifying your account..."}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleContinueWithGoogle}
                    className="flex min-h-[56px] w-full items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
                  >
                    Continue with Google
                  </button>
                )
              ) : null}

              {status !== "ready" ? (
                <div className="rounded-[22px] border border-white/10 bg-white/6 p-4 text-[14px] leading-6 text-white/72">{statusLabel}</div>
              ) : null}

              {actionMessage ? <p className="text-[13px] leading-6 text-amber-200">{actionMessage}</p> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="flex min-h-[52px] items-center justify-center rounded-[22px] border border-white/10 bg-white/6 px-4 text-[14px] font-semibold text-white transition active:scale-[0.98]"
                >
                  Copy Invite Link
                </button>
                <button
                  type="button"
                  onClick={() => router.replace("/")}
                  className="flex min-h-[52px] items-center justify-center rounded-[22px] bg-[linear-gradient(180deg,#ff8f7d_0%,#ef5b48_100%)] px-4 text-[14px] font-semibold text-white shadow-[0_18px_42px_rgba(239,91,72,0.28)] transition active:scale-[0.98]"
                >
                  Go Home
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-[22px] border border-white/10 bg-white/6 p-4 text-[14px] leading-6 text-white/72">{statusLabel}</div>
              <button
                type="button"
                onClick={() => router.replace("/")}
                className="flex min-h-[52px] w-full items-center justify-center rounded-[22px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-4 text-[14px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
              >
                Go Home
              </button>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}