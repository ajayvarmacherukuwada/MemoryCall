"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell, Badge, GlassCard } from "@/components/letscall/mobile-shell";
import { useSessionProfile } from "@/components/letscall/use-session-profile";
import { CallService } from "@/lib/calls/call-service";
import { MemoryArchiveService } from "@/lib/memory-archive/memory-archive-service";
import type { CallCompletion } from "@/lib/calls/types";
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
  return `${window.location.origin}/call?join=${encodeURIComponent(callId)}`;
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

function VideoFrame({ title, stream, muted = false }: { title: string; stream: MediaStream | null; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="relative aspect-video bg-black/60">
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-white/52">{title}</div>
        )}
      </div>
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
        <p className="mt-3 text-[15px] leading-6 text-white/62">
          Open a call, share the link, and LetsCall will archive the recording automatically when the call ends.
        </p>
      </GlassCard>

      <button
        type="button"
        onClick={() => {
          console.info("[CALL UI]", JSON.stringify({
            step: "Start Memory Call button clicked",
            at: new Date().toISOString(),
          }));
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
            console.info("[JOIN UI]", JSON.stringify({
              step: "Call code changed",
              at: new Date().toISOString(),
              rawValue: event.target.value,
              normalizedValue: nextValue.replace(/\s+/g, "").trim(),
            }));
            onJoinCodeChange(nextValue);
          }}
          onInput={(event) => {
            const nextValue = event.currentTarget.value.toUpperCase();
            console.info("[JOIN UI]", JSON.stringify({
              step: "Call code changed",
              at: new Date().toISOString(),
              rawValue: event.currentTarget.value,
              normalizedValue: nextValue.replace(/\s+/g, "").trim(),
            }));
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
            console.info("[JOIN UI]", JSON.stringify({
              step: "Join Memory Call button clicked",
              at: new Date().toISOString(),
            }));
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
  const [snapshot, setSnapshot] = useState(CallService.getSnapshot());
  const [joinCode, setJoinCode] = useState(searchParams.get("join") ?? "");
  const [busy, setBusy] = useState(false);
  const [savedMemory, setSavedMemory] = useState<MemoryArchiveRecord | null>(null);
  const [archiveSetupRequired, setArchiveSetupRequired] = useState(false);
  const profile = useSessionProfile();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveProgress, setArchiveProgress] = useState(0);
  const [archiveMessage, setArchiveMessage] = useState("Preparing memory...");
  const [inviteCopyState, setInviteCopyState] = useState<"idle" | "copied">("idle");
  const archiveStartedRef = useRef(false);
  const completionRef = useRef<CallCompletion | null>(null);

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
    console.info("[JOIN UI]", JSON.stringify({
      step: "Call code changed",
      at: new Date().toISOString(),
      rawValue: value,
      normalizedValue: nextValue.replace(/\s+/g, "").trim(),
    }));
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
    const completion = CallService.getCompletion();
    if (!completion || archiveStartedRef.current) {
      return;
    }

    if (snapshot.lifecycle !== "finalizing_recording") {
      return;
    }

    archiveStartedRef.current = true;
    completionRef.current = completion;
    void archiveCompletion(completion);
  }, [snapshot.lifecycle, snapshot.callId]);

  useEffect(() => {
    return () => {
      CallService.dispose();
    };
  }, []);

  const isInCall = ["creating", "joining", "waiting", "reconnecting", "connecting", "active", "ending", "finalizing_recording"].includes(snapshot.lifecycle);
  const isArchiving = snapshot.lifecycle === "archiving";
  const isFailed = snapshot.lifecycle === "failed";

  const status = useMemo(() => {
    switch (snapshot.lifecycle) {
      case "success":
        return "Archived";
      case "archiving":
        return "Archiving";
      case "finalizing_recording":
        return "Finalizing";
      case "ending":
        return "Ending";
      case "active":
        return "Active";
      case "waiting":
        return "Waiting";
      case "reconnecting":
        return "Reconnecting";
      case "joining":
        return "Joining";
      case "creating":
        return "Creating";
      case "failed":
        return "Failed";
      default:
        return "Ready";
    }
  }, [snapshot.lifecycle]);

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
            logCallUiEvent("archive_progress", { status: progress.status, progress: progress.progress, message: progress.message });
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
    console.info("[CALL API]", JSON.stringify({
      step: "Sending create call request",
      at: new Date().toISOString(),
    }));
    try {
      await CallService.startHostCall();
      console.info("[CALL API]", JSON.stringify({
        step: "Create call response received",
        at: new Date().toISOString(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start the memory call.";
      setArchiveError(message);
      CallService.markFailed(message);
      logCallUiEvent("create_call_failed", { error: message });
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = normalizedJoinCode;
    if (!isJoinCodeValid) return;

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

  const handleCopyInvite = async () => {
    const inviteText = buildJoinUrl(snapshot.inviteUrl, snapshot.callId);
    if (!inviteText) return;
    try {
      await copyToClipboard(inviteText);
      setInviteCopyState("copied");
      window.setTimeout(() => setInviteCopyState("idle"), 1800);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to copy the invite link.";
      setArchiveError(message);
    }
    logCallUiEvent("copy_invite", { inviteUrl: inviteText, callId: snapshot.callId });
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
        const message = "No recording was produced for this call.";
        setArchiveError(message);
        CallService.markFailed(message);
        return;
      }
      if (!profile.archiveEnabled) {
        setArchiveSetupRequired(true);
        const message = "Archive setup required. Create a free YouTube channel to enable automatic memory archiving.";
        setArchiveError(message);
        setArchiveMessage(message);
        CallService.markFailed(message);
        return;
      }
      setArchiveMessage("Finalizing recording...");
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

  if (archiveSetupRequired) {
    return (
      <AppShell activeTab="memory" title="Memory Call" subtitle="Archive setup required before automatic upload.">
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
      </AppShell>
    );
  }
  if (savedMemory) {
    return (
      <AppShell activeTab="memory" title="Memory Call" subtitle="The call is now archived in your private library.">
        <SavedMemoryCard record={savedMemory} />
      </AppShell>
    );
  }

  if (isArchiving || snapshot.lifecycle === "finalizing_recording") {
    const title = snapshot.lifecycle === "finalizing_recording" ? "Finalizing recording..." : "Saving memory...";
    const progress = snapshot.lifecycle === "finalizing_recording" ? 28 : archiveProgress;
    return (
      <AppShell activeTab="memory" title="Memory Call" subtitle="Your call is being archived.">
        <CallProgressCard title={title} message={archiveMessage} progress={progress} error={archiveError} />
      </AppShell>
    );
  }

  if (isFailed) {
    return (
      <AppShell activeTab="memory" title="Memory Call" subtitle="The archive flow needs attention.">
        <CallProgressCard
          title="Archive failed"
          message={archiveMessage}
          progress={100}
          error={archiveError ?? snapshot.errorMessage}
          onRetry={completionRef.current?.recording ? handleRetryArchive : undefined}
        />
      </AppShell>
    );
  }

  return (
    <AppShell activeTab="memory" title="Memory Call" subtitle="Make a private one-to-one call and archive it automatically.">
      <div className="space-y-4">
        <GlassCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">Call</p>
              <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-white">
                {snapshot.callId ? "Memory Call" : "Private call studio"}
              </h2>
              <p className="mt-3 text-[15px] leading-6 text-white/62">{snapshot.statusMessage}</p>
            </div>
            <Badge>{status}</Badge>
          </div>
        </GlassCard>

        {!isInCall ? (
          <CallLauncher onCreate={handleCreate} onJoin={handleJoin} joinCode={joinCode} onJoinCodeChange={handleJoinCodeChange} busy={busy} />
        ) : (
          <div className="space-y-4">
            {snapshot.lifecycle === "reconnecting" ? (
              <GlassCard className="border border-amber-300/20 bg-amber-500/10 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/80">Reconnecting</p>
                <p className="mt-2 text-[14px] leading-6 text-amber-50/90">
                  {snapshot.errorMessage ?? "The connection is recovering. Please stay on this screen while LetsCall reconnects signaling."}
                </p>
              </GlassCard>
            ) : null}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Call code</p>
                  <p className="mt-2 text-[18px] font-semibold tracking-[0.22em] text-white">{snapshot.callId}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[12px] font-semibold text-white"
                >
                  {inviteCopyState === "copied" ? "Copied" : "Copy invite"}
                </button>
              </div>
              <p className="mt-3 text-[13px] text-white/52">Share this invite with the other person so they can join the call.</p>
            </GlassCard>

            <div className="grid gap-3">
              <VideoFrame title="Remote participant will appear here" stream={snapshot.remoteStream} />
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <VideoFrame title="Your preview" stream={snapshot.localStream} muted />
                <GlassCard className="flex flex-col justify-between p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Status</p>
                    <p className="mt-2 text-[14px] leading-6 text-white/68">{snapshot.statusMessage}</p>
                  </div>
                  <div className="mt-4 text-[12px] font-medium tracking-[0.12em] text-white/42">{formatDuration(snapshot.elapsedSeconds)}</div>
                </GlassCard>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => CallService.toggleCamera()}
                className="flex min-h-[56px] items-center justify-center rounded-[22px] border border-white/10 bg-white/6 px-4 text-[14px] font-semibold text-white"
              >
                {snapshot.cameraEnabled ? "Camera On" : "Camera Off"}
              </button>
              <button
                type="button"
                onClick={() => CallService.toggleMicrophone()}
                className="flex min-h-[56px] items-center justify-center rounded-[22px] border border-white/10 bg-white/6 px-4 text-[14px] font-semibold text-white"
              >
                {snapshot.microphoneEnabled ? "Mic On" : "Mic Off"}
              </button>
              <button
                type="button"
                onClick={handleEndCall}
                disabled={busy}
                className="flex min-h-[56px] items-center justify-center rounded-[22px] bg-[linear-gradient(180deg,#ff8c7b_0%,#e65c54_100%)] px-4 text-[14px] font-semibold text-white disabled:opacity-70"
              >
                End
              </button>
            </div>
          </div>
        )}

        {archiveError && !isArchiving && !isFailed ? (
          <GlassCard className="border border-rose-300/20 bg-rose-500/10 p-4">
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-rose-50">{archiveError}</p>
          </GlassCard>
        ) : null}
      </div>
    </AppShell>
  );
}













