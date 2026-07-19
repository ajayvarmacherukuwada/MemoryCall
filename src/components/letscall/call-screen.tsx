"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppShell, Avatar, GlassCard } from "@/components/letscall/mobile-shell";
import { useSessionProfile } from "@/components/letscall/use-session-profile";
import { CallService } from "@/lib/calls/call-service";
import { MemoryArchiveService } from "@/lib/memory-archive/memory-archive-service";
import type { CallCompletion, CallSnapshot } from "@/lib/calls/types";
import type { MemoryArchiveRecord } from "@/lib/memory-archive/types";

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatDate(isoString: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoString));
}

function copyToClipboard(value: string) {
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error("Copy is not supported in this browser.");
    }
  };

  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).catch(() => {
      fallbackCopy();
    });
  }

  fallbackCopy();
  return Promise.resolve();
}

function buildJoinUrl(inviteUrl: string | null, callId: string | null) {
  if (inviteUrl) return inviteUrl;
  if (!callId) return "";
  return `${window.location.origin}/call/${encodeURIComponent(callId)}`;
}

function logCallUiEvent(step: string, details: Record<string, unknown>) {
  console.info("[LetsCall][CallScreen]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function logJoinUiEvent(step: string, details: Record<string, unknown>) {
  console.info("[JOIN UI]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function logLifecycleEvent(step: string, details: Record<string, unknown>) {
  console.info("[CALL LIFECYCLE]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function getFriendlyCallStatus(lifecycle: string) {
  switch (lifecycle) {
    case "creating":
    case "joining":
      return "Connecting...";
    case "waiting":
    case "waiting_for_participant":
    case "ringing":
      return "Ringing...";
    case "accepted":
      return "Accepted...";
    case "reconnecting":
      return "Reconnecting...";
    case "connected":
      return "Connected";
    case "recording":
      return "Private Memory Call";
    case "finalizing_recording":
    case "archiving":
      return "Saving Memory...";
    case "ending":
    case "ended":
      return "Call ended";
    case "declined":
      return "Declined";
    case "success":
      return "Completed";
    case "failed":
      return "Call Ended";
    default:
      return "Calling...";
  }
}

function formatContactLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Your contact";

  if (trimmed.includes("@")) {
    const localPart = trimmed.split("@")[0] ?? trimmed;
    return localPart
      .split(/[._-]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return trimmed
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function CallProgressCard({
  title,
  message,
  progress,
  error,
  onRetry,
  retryLabel = "Retry archive",
}: {
  title: string;
  message: string;
  progress: number;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <GlassCard className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Archive</p>
      <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-white">{title}</h2>
      <p className="mt-3 text-[15px] leading-6 text-white/62">{message}</p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#93f4d5_0%,#65c9ad_100%)] transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
        />
      </div>
      {error ? <p className="mt-4 whitespace-pre-wrap text-[13px] leading-6 text-rose-200">{error}</p> : null}
      {error && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[18px] border border-white/10 bg-white/6 px-4 text-[14px] font-semibold text-white transition active:scale-[0.98]"
        >
          {retryLabel}
        </button>
      ) : null}
    </GlassCard>
  );
}

function CallLauncher({
  onCreate,
  onJoin,
  joinCode,
  onJoinCodeChange,
  busy,
}: {
  onCreate: () => void;
  onJoin: () => void;
  joinCode: string;
  onJoinCodeChange: (value: string) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Memory Call</p>
        <h2 className="mt-4 text-[32px] font-semibold leading-[0.98] tracking-[-0.05em] text-white">Create a private one-to-one memory call.</h2>
        <p className="mt-3 text-[15px] leading-6 text-white/62">Open a call, share the link, and LetsCall will archive the recording automatically when the call ends.</p>
      </GlassCard>

      <button
        type="button"
        onClick={() => {
          console.info("[CALL UI]", JSON.stringify({ step: "Start Memory Call button clicked", at: new Date().toISOString() }));
          onCreate();
        }}
        disabled={busy}
        className="flex min-h-[56px] w-full items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98] disabled:opacity-60"
      >
        Start Memory Call
      </button>

      <GlassCard className="space-y-4 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Join</p>
          <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-white">Enter a call code</h3>
        </div>
        <input
          value={joinCode}
          onChange={(event) => {
            const nextValue = event.target.value.toUpperCase();
            console.info("[JOIN UI]", JSON.stringify({ step: "Call code changed", at: new Date().toISOString(), rawValue: event.target.value, normalizedValue: nextValue.replace(/\s+/g, "").trim() }));
            onJoinCodeChange(nextValue);
          }}
          onInput={(event) => {
            const nextValue = event.currentTarget.value.toUpperCase();
            console.info("[JOIN UI]", JSON.stringify({ step: "Call code changed", at: new Date().toISOString(), rawValue: event.currentTarget.value, normalizedValue: nextValue.replace(/\s+/g, "").trim() }));
            onJoinCodeChange(nextValue);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="AB12CD34"
          className="h-14 w-full rounded-[20px] border border-white/10 bg-white/6 px-4 text-[15px] tracking-[0.2em] text-white outline-none placeholder:text-white/30 focus:border-white/20"
        />
        <button
          type="button"
          onClick={() => {
            console.info("[JOIN UI]", JSON.stringify({ step: "Join Memory Call button clicked", at: new Date().toISOString() }));
            onJoin();
          }}
          disabled={busy || joinCode.replace(/\s+/g, "").trim().length !== 8}
          className="flex min-h-[52px] w-full items-center justify-center rounded-[20px] border border-white/10 bg-white/6 px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          Join Memory Call
        </button>
      </GlassCard>
    </div>
  );
}
function CallStage({
  snapshot,
  participantName,
  userName,
  onFlipCamera,
  onToggleMicrophone,
  onToggleCamera,
  onToggleSpeaker,
  onEndCall,
  noticeMessage,
  noticeTone = "amber",
}: {
  snapshot: CallSnapshot;
  participantName: string;
  userName: string;
  onFlipCamera: () => void;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onEndCall: () => void;
  noticeMessage?: string | null;
  noticeTone?: "amber" | "rose";
}) {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = snapshot.remoteStream;
      remoteVideoRef.current.muted = !snapshot.speakerEnabled;
    }
  }, [snapshot.remoteStream, snapshot.speakerEnabled]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = snapshot.localStream;
    }
  }, [snapshot.localStream]);

  const participantLabel = formatContactLabel(participantName || "Your contact");
  const userLabel = userName || "You";
  const cameraTrack = snapshot.localStream?.getVideoTracks().find((track) => track.kind === "video") ?? null;
  const cameraActive = Boolean(cameraTrack && cameraTrack.enabled && snapshot.cameraEnabled);
  const previewMirrored = snapshot.cameraFacingMode === "user";
  const connectedTimer =
    snapshot.lifecycle === "connected" ||
    snapshot.remoteStream ||
    snapshot.recordingActive ||
    snapshot.lifecycle === "recording" ||
    snapshot.lifecycle === "finalizing_recording" ||
    snapshot.lifecycle === "archiving"
      ? formatDuration(snapshot.elapsedSeconds)
      : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(147,244,213,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(92,132,255,0.16),_transparent_30%),linear-gradient(180deg,#081017_0%,#05070b_100%)]">
      {snapshot.remoteStream ? (
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <div className="flex max-w-[300px] flex-col items-center gap-4">
            <div className="relative grid size-40 place-items-center">
              <div className="absolute inset-0 animate-pulse rounded-full bg-[radial-gradient(circle,rgba(147,244,213,0.22),rgba(147,244,213,0.04)_58%,transparent_72%)] blur-3xl" />
              <Avatar name={participantLabel} imageUrl={null} size={96} />
            </div>
            <div>
              <p className="mt-2 text-[14px] leading-6 text-white/68 text-center">
                {snapshot.lifecycle === "waiting" || snapshot.lifecycle === "waiting_for_participant"
                  ? "Ringing..."
                  : snapshot.lifecycle === "connecting" || snapshot.lifecycle === "creating" || snapshot.lifecycle === "joining"
                    ? "Connecting..."
                    : "Private Memory Call"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,6,10,0.1)_0%,rgba(4,6,10,0.18)_38%,rgba(4,6,10,0.34)_70%,rgba(4,6,10,0.76)_100%)]" />

      <div className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white">{participantLabel}</p>
          <p className="text-[12px] text-white/70">{connectedTimer ? `Connected - ${connectedTimer}` : getFriendlyCallStatus(snapshot.lifecycle)}</p>
        </div>
      </div>

      <div
        className="absolute right-4 top-4 z-20 overflow-hidden rounded-[18px] border border-white/14 bg-black/46 shadow-[0_16px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        style={{ width: "clamp(72px, 18vw, 92px)" }}
        aria-label="Local preview"
      >
        <div className="relative aspect-[9/16] w-full bg-black/70">
          {cameraActive && snapshot.localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${previewMirrored ? "scale-x-[-1]" : ""}`}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center text-white/70">
              <Avatar name={userLabel} imageUrl={null} size={44} />
              <p className="text-[11px] font-semibold text-white">Camera Off</p>
            </div>
          )}
        </div>
      </div>

      {noticeMessage ? (
        <div className="absolute inset-x-4 bottom-[96px] z-20 text-center">
          <p className={noticeTone === "rose" ? "text-[13px] font-medium text-rose-100/90" : "text-[13px] font-medium text-amber-50/90"}>{noticeMessage}</p>
        </div>
      ) : null}

      <div className="absolute inset-x-3 bottom-3 z-20 rounded-[26px] border border-white/10 bg-[rgba(5,7,11,0.5)] px-3 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.32)] backdrop-blur-2xl sm:inset-x-4 sm:bottom-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onToggleMicrophone} className="flex h-12 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/8 px-2 text-white transition active:scale-[0.97]">
            <span className="text-[11px] font-semibold">{snapshot.microphoneEnabled ? "Mute" : "Unmute"}</span>
          </button>
          <button type="button" onClick={onToggleCamera} className="flex h-12 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/8 px-2 text-white transition active:scale-[0.97]">
            <span className="text-[11px] font-semibold">{cameraActive ? "Camera" : "Camera Off"}</span>
          </button>
          <button type="button" onClick={onFlipCamera} className="flex h-12 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/8 px-2 text-white transition active:scale-[0.97]">
            <span className="text-[11px] font-semibold">Switch</span>
          </button>
          <button type="button" onClick={onToggleSpeaker} className="flex h-12 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/8 px-2 text-white transition active:scale-[0.97]">
            <span className="text-[11px] font-semibold">{snapshot.speakerEnabled ? "Speaker" : "Speaker Off"}</span>
          </button>
          <button type="button" onClick={onEndCall} className="flex h-12 flex-[1.15] items-center justify-center rounded-full bg-[linear-gradient(180deg,#ff8f7d_0%,#ef5b48_100%)] px-2 text-white shadow-[0_18px_40px_rgba(239,91,72,0.32)] transition active:scale-[0.97]">
            <span className="text-[11px] font-semibold">End</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SavedMemoryCard({ record }: { record: MemoryArchiveRecord }) {
  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Success</p>
        <h2 className="mt-4 text-[32px] font-semibold leading-[0.98] tracking-[-0.05em] text-white">Memory saved successfully</h2>
        <p className="mt-3 text-[15px] leading-6 text-white/62">Your call is now part of your private memory archive.</p>
      </GlassCard>
      <GlassCard className="p-4">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Title</p>
            <p className="mt-1 text-[17px] font-semibold text-white">{record.title}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Description</p>
            <p className="mt-1 text-[15px] leading-6 text-white/70">{record.description || "No description added."}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[22px] bg-white/6 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">Duration</p>
              <p className="mt-2 text-[18px] font-semibold text-white">{formatDuration(record.duration)}</p>
            </div>
            <div className="rounded-[22px] bg-white/6 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">Created</p>
              <p className="mt-2 text-[18px] font-semibold text-white">{formatDate(record.createdAt)}</p>
            </div>
          </div>
        </div>
      </GlassCard>
      <Link
        href="/library"
        className="flex min-h-[56px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
      >
        View in Memory Library
      </Link>
    </div>
  );
}
export function CallScreen() {
  const searchParams = useSearchParams();
  const params = useParams<{ callId?: string }>();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(CallService.getSnapshot());
  const [joinCode, setJoinCode] = useState(searchParams.get("join") ?? "");
  const [busy, setBusy] = useState(false);
  const [savedMemory, setSavedMemory] = useState<MemoryArchiveRecord | null>(null);
  const [archiveSetupRequired, setArchiveSetupRequired] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveProgress, setArchiveProgress] = useState(0);
  const [archiveMessage, setArchiveMessage] = useState("Preparing memory...");
  const [inviteCopyState, setInviteCopyState] = useState<"idle" | "copied">("idle");
  const archiveStartedRef = useRef(false);
  const autoStartRequestedRef = useRef(false);
  const completionRef = useRef<CallCompletion | null>(null);
  const profile = useSessionProfile();

  useEffect(() => {
    CallService.setDebugIdentity({ localProfileId: profile.userId ?? null });
  }, [profile.userId]);
  const routeCallId = typeof params?.callId === "string" ? params.callId : Array.isArray(params?.callId) ? params.callId[0] ?? null : null;
  const contactNameFromUrl = searchParams.get("name") ?? searchParams.get("person") ?? searchParams.get("contact") ?? "";
  const contactIdFromUrl = searchParams.get("contactId") ?? null;
  const callModeFromUrl = searchParams.get("mode") === "audio" ? "audio" : "video";
  const hasAutoCallIntent = Boolean(routeCallId || contactIdFromUrl || searchParams.get("person") || searchParams.get("contact") || searchParams.get("join"));
  const contactDisplayName = formatContactLabel(contactNameFromUrl);

  useEffect(() => {
    return CallService.subscribe(() => setSnapshot(CallService.getSnapshot()));
  }, []);

  useEffect(() => {
    archiveStartedRef.current = false;
    completionRef.current = null;
    setSavedMemory(null);
    setArchiveError(null);
    setArchiveSetupRequired(false);
    setArchiveProgress(0);
    setArchiveMessage("Preparing memory...");
  }, [snapshot.callId]);

  const normalizedJoinCode = joinCode.replace(/\s+/g, "").trim().toUpperCase();
  const isJoinCodeValid = normalizedJoinCode.length === 8;
  const isJoinButtonEnabled = !busy && isJoinCodeValid;

  const handleJoinCodeChange = (value: string) => {
    const nextValue = value.toUpperCase();
    console.info(
      "[JOIN UI]",
      JSON.stringify({
        step: "Call code changed",
        at: new Date().toISOString(),
        rawValue: value,
        normalizedValue: nextValue.replace(/\s+/g, "").trim(),
      }),
    );
    setJoinCode(nextValue);
  };

  useEffect(() => {
    logJoinUiEvent("Validation result", {
      callCode: normalizedJoinCode,
      isValid: isJoinCodeValid,
      busy,
    });
    logJoinUiEvent("Button enabled", {
      enabled: isJoinButtonEnabled,
      callCode: normalizedJoinCode,
    });
  }, [busy, isJoinButtonEnabled, isJoinCodeValid, normalizedJoinCode]);


  useEffect(() => {
    // Keep the singleton call service alive across /call -> /call/[callId] route transitions.
    // The call is explicitly disposed when the session ends.
    return undefined;
  }, []);

  useEffect(() => {
    if (autoStartRequestedRef.current) return;
    if (!hasAutoCallIntent) return;
    if (busy || savedMemory || archiveSetupRequired || snapshot.lifecycle === "failed") return;
    if (snapshot.callId || snapshot.lifecycle !== "idle") return;

    autoStartRequestedRef.current = true;
    if (routeCallId) {
      void handleJoin(routeCallId);
      return;
    }
    if (searchParams.get("join")) {
      void handleJoin();
      return;
    }
    void handleCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveSetupRequired, busy, hasAutoCallIntent, searchParams, savedMemory, snapshot.callId, snapshot.lifecycle]);

  useEffect(() => {
    if (!savedMemory) return;
    const timeout = window.setTimeout(() => {
      router.replace("/");
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [router, savedMemory]);

  useEffect(() => {
    if (busy || savedMemory || archiveSetupRequired || snapshot.lifecycle === "failed") {
      return;
    }

    if (snapshot.lifecycle === "ended" || snapshot.lifecycle === "declined") {
      const timeout = window.setTimeout(() => {
        router.replace("/");
      }, 250);
      return () => window.clearTimeout(timeout);
    }
  }, [archiveSetupRequired, busy, router, savedMemory, snapshot.lifecycle]);

  const isArchiving = snapshot.lifecycle === "archiving";
  const isFailed = snapshot.lifecycle === "failed";

  const status = useMemo(() => getFriendlyCallStatus(snapshot.lifecycle), [snapshot.lifecycle]);
  const callSubtitle =
    snapshot.lifecycle === "connected" || snapshot.lifecycle === "recording" || snapshot.lifecycle === "finalizing_recording" || snapshot.lifecycle === "archiving"
      ? snapshot.elapsedSeconds > 0
        ? `${status} ï¿½ ${formatDuration(snapshot.elapsedSeconds)}`
        : status
      : status;

  async function archiveCompletion(completion: CallCompletion) {
    logLifecycleEvent("ARCHIVE_STARTED", {
      title: completion.title,
      durationSeconds: completion.durationSeconds,
      callId: snapshot.callId,
    });
    logCallUiEvent("archive_pipeline_start", {
      title: completion.title,
      durationSeconds: completion.durationSeconds,
      callId: snapshot.callId,
    });
    CallService.markArchiving("Preparing memory...");
    setArchiveProgress(10);
    setArchiveMessage("Preparing memory...");
    setArchiveError(null);
    setArchiveSetupRequired(false);

    try {
      const archive = await MemoryArchiveService.archiveRecording(
        {
          file: completion.recording!,
          title: completion.title,
          description: completion.description,
          collection: "Personal",
          duration: completion.durationSeconds,
        },
        {
          onProgress: (progress) => {
            setArchiveProgress(progress.progress);
            setArchiveMessage(progress.message);
            logCallUiEvent("archive_progress", {
              status: progress.status,
              progress: progress.progress,
              message: progress.message,
            });
          },
          onBlocked: (message) => {
            setArchiveError(message);
            logCallUiEvent("archive_blocked", { message });
          },
        },
      );

      if (!profile.archiveEnabled) {
        setArchiveSetupRequired(true);
        setArchiveMessage("Archive setup required. Create a free YouTube channel to enable automatic memory archiving.");
        CallService.markFailed("Archive setup required. Create a free YouTube channel to enable automatic memory archiving.");
        return;
      }

      setSavedMemory(archive);
      CallService.markSuccess(archive.archiveId, "Memory saved to your library.");
      logCallUiEvent("archive_success", { archiveId: archive.archiveId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to archive the call.";
      setArchiveError(message);
      CallService.markFailed(message);
      logCallUiEvent("archive_failed", { error: message });
    }
  }

  const handleCreate = async () => {
    setBusy(true);
    setArchiveError(null);
    setArchiveSetupRequired(false);
    setArchiveProgress(0);
    archiveStartedRef.current = false;
    completionRef.current = null;
    logCallUiEvent("create_call_requested", {});
    console.info("[CALL API]", JSON.stringify({ step: "Sending create call request", at: new Date().toISOString() }));

    try {
      const response = await CallService.startHostCall(contactIdFromUrl ? { contactId: contactIdFromUrl, mode: callModeFromUrl } : { mode: callModeFromUrl });
      router.replace(`/call/${encodeURIComponent(response.callId)}`);
      console.info("[CALL API]", JSON.stringify({ step: "Create call response received", at: new Date().toISOString(), callId: response.callId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start the memory call.";
      setArchiveError(message);
      CallService.markFailed(message);
      logCallUiEvent("create_call_failed", { error: message });
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (overrideCallId?: string) => {
    const code = (overrideCallId ?? normalizedJoinCode).replace(/\s+/g, "").trim().toUpperCase();
    if (code.length !== 8) return;

    setBusy(true);
    setArchiveError(null);
    setArchiveSetupRequired(false);
    setArchiveProgress(0);
    archiveStartedRef.current = false;
    completionRef.current = null;
    logJoinUiEvent("Join button clicked", { callCode: code });
    logJoinUiEvent("Validation result", { callCode: code, isValid: true, busy: true });
    logCallUiEvent("join_call_requested", { callId: code });
    console.info("[JOIN API]", JSON.stringify({ step: "Sending join request", at: new Date().toISOString(), callId: code }));

    try {
      await CallService.joinCall(code);
      router.replace(`/call/${encodeURIComponent(code)}`);
      console.info("[JOIN API]", JSON.stringify({ step: "Response received", at: new Date().toISOString(), callId: code }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to join the memory call.";
      setArchiveError(message);
      CallService.markFailed(message);
      logCallUiEvent("join_call_failed", { error: message, callId: code });
    } finally {
      setBusy(false);
    }
  };

  const handleEndCall = async () => {
    setBusy(true);
    setArchiveError(null);
    setArchiveSetupRequired(false);
    setArchiveProgress(10);
    setArchiveMessage("Ending call...");
    archiveStartedRef.current = false;
    logCallUiEvent("end_call_requested", { callId: snapshot.callId });

    try {
      const completion = await CallService.endCall();
      completionRef.current = completion;
      logCallUiEvent("call_ended_callback", {
        callId: snapshot.callId,
        hasRecording: Boolean(completion?.recording),
      });

      if (!completion?.recording) {
        setArchiveError(null);
        setArchiveSetupRequired(false);
        setArchiveMessage("Call ended.");
        router.replace("/");
        return;
      }

      const shouldArchive = window.confirm("Recording available. Do you want to archive this memory?");
      if (!shouldArchive) {
        router.replace("/");
        return;
      }

      setArchiveMessage("Finalizing recording...");
      await archiveCompletion(completion);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to end the call.";
      setArchiveError(message);
      CallService.markFailed(message);
      logCallUiEvent("end_call_failed", { error: message, callId: snapshot.callId });
    } finally {
      setBusy(false);
    }
  };

  const handleRetryArchive = async () => {
    const completion = completionRef.current ?? CallService.getCompletion();
    if (!completion?.recording) {
      return;
    }

    archiveStartedRef.current = false;
    setArchiveError(null);
    setArchiveSetupRequired(false);
    logCallUiEvent("archive_retry_requested", { callId: snapshot.callId });
    await archiveCompletion(completion);
  };

  const participantLabel = contactDisplayName || "Private Call";
  const noticeMessage =
    snapshot.lifecycle === "reconnecting"
      ? snapshot.errorMessage ?? "The connection is recovering. Please stay on this screen while LetsCall reconnects signaling."
      : archiveError && snapshot.lifecycle !== "archiving"
        ? archiveError
        : null;

  const renderShell = (content: ReactNode) => (
    <AppShell
      activeTab="home"
      title="Call"
      subtitle={undefined}
      headerBadge={null}
      showHeader={false}
      showNav={false}
      mainClassName="flex-1 min-h-0 overflow-hidden p-0"
    >
      {content}
    </AppShell>
  );

  if (archiveSetupRequired) {
    return renderShell(
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(147,244,213,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(92,132,255,0.16),_transparent_30%),linear-gradient(180deg,#081017_0%,#05070b_100%)]">
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col justify-center px-4 py-4 sm:px-5">
          <CallProgressCard
            title="Archive setup required"
            message="Create a free YouTube channel to enable automatic memory archiving."
            progress={100}
            error={archiveError ?? "Create a free YouTube channel to enable automatic memory archiving."}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a
              href="https://www.youtube.com/create_channel"
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[52px] items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[15px] font-semibold text-[#07110f]"
            >
              Create Channel
            </a>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex min-h-[52px] items-center justify-center rounded-[20px] border border-white/10 bg-white/6 px-5 text-[15px] font-semibold text-white"
            >
              Refresh Status
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (savedMemory) {
    return renderShell(
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(147,244,213,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(92,132,255,0.16),_transparent_30%),linear-gradient(180deg,#081017_0%,#05070b_100%)]">
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col justify-center px-4 py-4 sm:px-5">
          <SavedMemoryCard record={savedMemory} />
        </div>
      </div>
    );
  }

  if (snapshot.lifecycle === "archiving" || snapshot.lifecycle === "finalizing_recording") {
    const title = snapshot.lifecycle === "finalizing_recording" ? "Finalizing recording..." : "Saving memory...";
    const progress = snapshot.lifecycle === "finalizing_recording" ? 28 : archiveProgress;
    return renderShell(
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(147,244,213,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(92,132,255,0.16),_transparent_30%),linear-gradient(180deg,#081017_0%,#05070b_100%)]">
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col justify-center px-4 py-4 sm:px-5">
          <CallProgressCard title={title} message={archiveMessage} progress={progress} error={archiveError} />
        </div>
      </div>
    );
  }

  if (isFailed) {
    return renderShell(
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(147,244,213,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(92,132,255,0.16),_transparent_30%),linear-gradient(180deg,#081017_0%,#05070b_100%)]">
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col justify-center px-4 py-4 sm:px-5">
          <CallProgressCard
            title="Archive failed"
            message={archiveMessage}
            progress={100}
            error={archiveError ?? snapshot.errorMessage}
            onRetry={completionRef.current?.recording ? handleRetryArchive : undefined}
          />
        </div>
      </div>
    );
  }

  return renderShell(
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(147,244,213,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(92,132,255,0.16),_transparent_30%),linear-gradient(180deg,#081017_0%,#05070b_100%)]">
      <div className="flex h-full min-h-0 flex-col">
        <CallStage
          snapshot={snapshot}
          participantName={participantLabel}
          userName={profile.displayName || "You"}
          onFlipCamera={() => CallService.flipCamera()}
          onToggleMicrophone={() => CallService.toggleMicrophone()}
          onToggleCamera={() => CallService.toggleCamera()}
          onToggleSpeaker={() => CallService.toggleSpeaker()}
          onEndCall={handleEndCall}
          noticeMessage={noticeMessage}
          noticeTone={snapshot.lifecycle === "reconnecting" || archiveError ? "rose" : "amber"}
        />

        <div className="sr-only" aria-live="polite">
          {inviteCopyState === "copied" ? "Invite copied to clipboard." : ""}
        </div>
      </div>
    </div>
  );
}




