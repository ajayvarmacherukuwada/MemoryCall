import { connectCallSignalChannel, createCallRoom, disconnectCallSignalChannel, fetchCallSignals, sendCallSignal } from "@/lib/calls/signaling-client";
import { createRecordingSession, type RecordingResult } from "@/lib/calls/recording-service";
import type { CallCompletion, CallLifecycle, CallRole, CallSignalEnvelope, CallSnapshot } from "@/lib/calls/types";

type Listener = () => void;

type CallState = {
  callId: string | null;
  role: CallRole | null;
  lifecycle: CallLifecycle;
  inviteUrl: string | null;
  guestJoined: boolean;
  cameraEnabled: boolean;
  cameraFacingMode: "user" | "environment";
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localStreamReady: boolean;
  remoteStreamReady: boolean;
  recordingActive: boolean;
  isSavingArchive: boolean;
  elapsedSeconds: number;
  errorMessage: string | null;
  statusMessage: string;
  archiveId: string | null;
  archiveMessage: string | null;
};

const DEFAULT_STATE: CallState = {
  callId: null,
  role: null,
  lifecycle: "idle",
  inviteUrl: null,
  guestJoined: false,
  cameraEnabled: true,
  cameraFacingMode: "user",
  microphoneEnabled: true,
  speakerEnabled: true,
  localStream: null,
  remoteStream: null,
  localStreamReady: false,
  remoteStreamReady: false,
  recordingActive: false,
  isSavingArchive: false,
  elapsedSeconds: 0,
  errorMessage: null,
  statusMessage: "Create or join a memory call to begin.",
  archiveId: null,
  archiveMessage: null,
};

type TerminationReason = "local_end" | "remote_hangup" | "room_ended";

function getClientId() {
  if (typeof window === "undefined") {
    return crypto.randomUUID();
  }

  const key = "letscall.call-client-id";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.sessionStorage.setItem(key, id);
  return id;
}

function now() {
  return Date.now();
}

function getOrigin() {
  return typeof window === 'undefined' ? 'server' : window.location.origin;
}

function buildSnapshot(state: CallState): CallSnapshot {
  return {
    callId: state.callId,
    role: state.role,
    lifecycle: state.lifecycle,
    inviteUrl: state.inviteUrl,
    guestJoined: state.guestJoined,
    connectionLabel: state.guestJoined ? "Connected" : state.role === "host" ? "Waiting for guest" : "Joining call",
    cameraEnabled: state.cameraEnabled,
    cameraFacingMode: state.cameraFacingMode,
    microphoneEnabled: state.microphoneEnabled,
    speakerEnabled: state.speakerEnabled,
    localStreamReady: state.localStreamReady,
    remoteStreamReady: state.remoteStreamReady,
    localStream: state.localStream,
    remoteStream: state.remoteStream,
    recordingActive: state.recordingActive,
    isSavingArchive: state.isSavingArchive,
    elapsedSeconds: state.elapsedSeconds,
    errorMessage: state.errorMessage,
    statusMessage: state.statusMessage,
    archiveId: state.archiveId,
    archiveMessage: state.archiveMessage,
  };
}

function buildRoomInviteUrl(callId: string) {
  return `/call/${encodeURIComponent(callId)}`;
}

function chooseIceServers(): RTCIceServer[] {
  return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
}

function getTrack(stream: MediaStream | null, kind: "audio" | "video") {
  return stream?.getTracks().find((track) => track.kind === kind) ?? null;
}

function logCallEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[LetsCall][CallService]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function logLifecycleEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[CALL LIFECYCLE]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function logJoinEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[JOIN]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function logWebRtcEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[WEBRTC]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function logIceEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[ICE]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function logMediaEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[MEDIA]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const timeoutError = new Error(timeoutMessage);
      (timeoutError as Error & { code?: string }).code = "timeout";
      reject(timeoutError);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

class CallSessionController {
  private listeners = new Set<Listener>();
  private state: CallState = { ...DEFAULT_STATE };
  private peerConnection: RTCPeerConnection | null = null;
  private pollTimer: number | null = null;
  private elapsedTimer: number | null = null;
  private clientId = getClientId();
  private remoteDescriptionSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private lastSignalAt = 0;
  private startedAt = 0;
  private recordingSession: ReturnType<typeof createRecordingSession> | null = null;
  private hasStartedRecording = false;
  private isEnding = false;
  private currentCompletion: CallCompletion | null = null;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return buildSnapshot(this.state);
  }

  getCompletion() {
    return this.currentCompletion;
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setState(partial: Partial<CallState>) {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private transition(lifecycle: CallLifecycle, partial: Partial<CallState>, details: Record<string, unknown> = {}) {
    const nextState = { ...partial, lifecycle };
    this.setState(nextState);
    logCallEvent("transition", {
      callId: this.state.callId,
      role: this.state.role,
      lifecycle,
      statusMessage: nextState.statusMessage ?? this.state.statusMessage,
      ...details,
    });
  }

  private failSession(message: string, details: Record<string, unknown> = {}) {
    this.transition(
      "failed",
      {
        errorMessage: message,
        statusMessage: message,
        isSavingArchive: false,
        recordingActive: false,
      },
      { ...details, error: message },
    );
    this.stopTimers();
    this.stopPeerConnection();
    this.stopLocalStreams();
    this.isEnding = false;
  }

  private signalIssue(message: string, details: Record<string, unknown> = {}) {
    logLifecycleEvent("SIGNALING_ERROR", {
      callId: this.state.callId,
      role: this.state.role,
      error: message,
      ...details,
    });
    this.transition(
      "reconnecting",
      {
        errorMessage: message,
        statusMessage: message,
        isSavingArchive: false,
      },
      { ...details, error: message },
    );
  }

  private resetSessionState() {
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.lastSignalAt = 0;
    this.startedAt = 0;
    this.hasStartedRecording = false;
    this.currentCompletion = null;
    this.isEnding = false;
  }

  private stopTimers() {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.elapsedTimer !== null) {
      window.clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  private stopPeerConnection() {
    if (!this.peerConnection) {
      return;
    }

    this.peerConnection.ontrack = null;
    this.peerConnection.onicecandidate = null;
    this.peerConnection.onconnectionstatechange = null;
    this.peerConnection.close();
    this.peerConnection = null;
  }

  private stopLocalStreams() {
    this.state.localStream?.getTracks().forEach((track) => track.stop());
    this.state.remoteStream?.getTracks().forEach((track) => track.stop());
    this.state.localStream = null;
    this.state.remoteStream = null;
  }

  private async stopRecording() {
    logCallEvent("recording_stop_check", {
      callId: this.state.callId,
      hasRecordingSession: Boolean(this.recordingSession),
      hasStartedRecording: this.hasStartedRecording,
      role: this.state.role,
    });
    if (!this.recordingSession) return null;

    const session = this.recordingSession;
    this.recordingSession = null;
    const result = await session.stop();
    logCallEvent("recording_stop_resolved", {
      callId: this.state.callId,
      fileName: result.file.name,
      fileSize: result.file.size,
      durationSeconds: result.durationSeconds,
      role: this.state.role,
    });
    return result;
  }

  private async createHostOffer() {
    if (!this.peerConnection || !this.state.callId || this.state.role !== "host") {
      return;
    }

    if (this.peerConnection.localDescription) {
      return;
    }

    const offer = await this.peerConnection.createOffer();
    logWebRtcEvent("Offer created", {
      callId: this.state.callId,
      role: this.state.role,
    });
    await this.peerConnection.setLocalDescription(offer);
    logWebRtcEvent("Local description set", {
      callId: this.state.callId,
      role: this.state.role,
      signal: "offer",
    });
    await sendCallSignal(this.state.callId, {
      senderId: this.clientId,
      type: "offer",
      payload: offer,
    });
    logWebRtcEvent("Offer sent", {
      callId: this.state.callId,
      role: this.state.role,
    });
  }

  private async maybeStartRecording() {
    logCallEvent("recording_start_check", {
      callId: this.state.callId,
      hasLocalStream: Boolean(this.state.localStream),
      hasRemoteStream: Boolean(this.state.remoteStream),
      hasPeerConnection: Boolean(this.peerConnection),
      connectionState: this.peerConnection?.connectionState ?? null,
      hasStartedRecording: this.hasStartedRecording,
    });

    if (
      this.hasStartedRecording ||
      !this.state.localStream ||
      !this.state.remoteStream ||
      !this.peerConnection ||
      this.peerConnection.connectionState !== "connected"
    ) {
      logCallEvent("recording_start_skipped", {
        callId: this.state.callId,
        hasLocalStream: Boolean(this.state.localStream),
        hasRemoteStream: Boolean(this.state.remoteStream),
        hasPeerConnection: Boolean(this.peerConnection),
        connectionState: this.peerConnection?.connectionState ?? null,
        hasStartedRecording: this.hasStartedRecording,
      });
      return false;
    }

    await this.startRecording();
    return true;
  }

  private async startRecording() {
    if (
      this.hasStartedRecording ||
      !this.state.localStream ||
      !this.state.remoteStream ||
      !this.peerConnection ||
      this.peerConnection.connectionState !== "connected"
    ) {
      throw new Error("Recording can only start after the call is connected.");
    }

    this.recordingSession = createRecordingSession({
      title: "Memory Call",
      callId: this.state.callId,
      sessionId: this.state.callId ?? undefined,
      localStream: this.state.localStream,
      remoteStream: this.state.remoteStream,
    });

    this.hasStartedRecording = true;
    logCallEvent("recording_session_created", {
      callId: this.state.callId,
      role: this.state.role,
      recordingSessionId: this.state.callId,
    });

    this.transition(
      "recording",
      {
        recordingActive: true,
        statusMessage: "Connected. Recording your memory call.",
      },
      { action: "start_recording" },
    );

    this.startedAt = now();
    if (!this.elapsedTimer) {
      this.elapsedTimer = window.setInterval(() => this.updateElapsed(), 1000);
    }
    this.updateElapsed();
  }
  private updateElapsed() {
    if (!this.startedAt) return;
    const elapsedSeconds = Math.max(0, Math.floor((now() - this.startedAt) / 1000));
    this.setState({ elapsedSeconds });
  }

  private async ensureLocalMedia(facingMode: "user" | "environment" = this.state.cameraFacingMode) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
        },
        audio: true,
      });

      this.setState({
        localStream: stream,
        localStreamReady: true,
        cameraEnabled: true,
        cameraFacingMode: facingMode,
        microphoneEnabled: true,
        speakerEnabled: true,
        statusMessage: this.state.role === "host" ? "Preparing your memory call..." : "Joining memory call...",
      });

      logCallEvent("local_media_ready", {
        callId: this.state.callId,
        role: this.state.role,
        hasVideo: stream.getVideoTracks().length > 0,
        hasAudio: stream.getAudioTracks().length > 0,
      });

      return stream;
    } catch (error) {
      const message = error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)
        ? "Camera and microphone are blocked on this connection. Open LetsCall over HTTPS or localhost, then allow permissions."
        : describeError(error);
      throw new Error(message || "Unable to access camera and microphone.");
    }
  }

  private createPeerConnection() {
    const peerConnection = new RTCPeerConnection({ iceServers: chooseIceServers() });
    this.peerConnection = peerConnection;
    logCallEvent("peer_connection_created", {
      callId: this.state.callId,
      role: this.state.role,
      origin: getOrigin(),
      iceServers: chooseIceServers().length,
    });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !this.state.callId) {
        return;
      }

      const candidateJson = event.candidate.toJSON();
      logIceEvent("Candidate gathered", {
        callId: this.state.callId,
        role: this.state.role,
        sdpMid: candidateJson.sdpMid,
        sdpMLineIndex: candidateJson.sdpMLineIndex,
        candidate: candidateJson.candidate?.slice(0, 120) ?? null,
      });

      void sendCallSignal(this.state.callId, {
        senderId: this.clientId,
        type: "candidate",
        payload: candidateJson,
      })
        .then(() => {
          logIceEvent("Candidate sent", {
            callId: this.state.callId,
            role: this.state.role,
            sdpMid: candidateJson.sdpMid,
            sdpMLineIndex: candidateJson.sdpMLineIndex,
          });
        })
        .catch((error) => {
          logCallEvent("signal_candidate_failed", {
            callId: this.state.callId,
            error: describeError(error),
          });
        });
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      if (this.state.remoteStream !== remoteStream) {
        logMediaEvent("Remote track received", {
          callId: this.state.callId,
          role: this.state.role,
          audioTracks: remoteStream.getAudioTracks().length,
          videoTracks: remoteStream.getVideoTracks().length,
        });
        this.setState({ remoteStream, remoteStreamReady: true });
        this.recordingSession?.updateRemoteStream(remoteStream);
        logMediaEvent("Remote stream attached", {
          callId: this.state.callId,
          audioTracks: remoteStream.getAudioTracks().length,
          videoTracks: remoteStream.getVideoTracks().length,
        });
      }

      void this.maybeStartRecording().catch((error) => {
        logCallEvent("recording_start_failed", {
          callId: this.state.callId,
          error: describeError(error),
        });
      });
    };
    peerConnection.onconnectionstatechange = () => {
      logLifecycleEvent("PEER_CONNECTION_STATE_CHANGED", {
        callId: this.state.callId,
        role: this.state.role,
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        signalingState: peerConnection.signalingState,
      });

      if (this.isEnding) {
        return;
      }

      if (peerConnection.connectionState === "connected") {
        logLifecycleEvent("CALL_CONNECTED", {
          callId: this.state.callId,
          role: this.state.role,
          connectionState: peerConnection.connectionState,
        });
        this.transition(
          "connected",
          {
            guestJoined: true,
            statusMessage: "Connected. Waiting for recording to start.",
            errorMessage: null,
          },
          { connectionState: peerConnection.connectionState },
        );
        void this.maybeStartRecording().catch((error) => {
          logCallEvent("recording_start_failed", {
            callId: this.state.callId,
            error: describeError(error),
          });
        });
      }

      if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
        this.signalIssue("The connection was interrupted. Reconnecting...", {
          connectionState: peerConnection.connectionState,
        });
      }
    };

    if (this.state.localStream) {
      for (const track of this.state.localStream.getTracks()) {
        peerConnection.addTrack(track, this.state.localStream);
      }
    }

    return peerConnection;
  }

  private async applyPendingCandidates() {
    if (!this.peerConnection || !this.remoteDescriptionSet) {
      return;
    }

    logIceEvent("Pending candidates ready", {
      callId: this.state.callId,
      role: this.state.role,
      count: this.pendingCandidates.length,
    });

    const queue = [...this.pendingCandidates];
    this.pendingCandidates = [];

    for (const candidate of queue) {
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (error) {
        logCallEvent("candidate_rejected", {
          callId: this.state.callId,
          error: describeError(error),
        });
      }
    }
  }

  private async handleSignal(message: CallSignalEnvelope) {
    if (message.senderId === this.clientId) {
      return;
    }

    if (!this.peerConnection) {
      return;
    }

    logCallEvent("signal_received", {
      callId: this.state.callId,
      type: message.type,
      senderId: message.senderId,
    });

    if (message.type === "join" && message.payload) {
      logJoinEvent("Participant joined room", { callId: this.state.callId, senderId: message.senderId });
      this.setState({ guestJoined: true, statusMessage: "The other person joined the call.", errorMessage: null });

      if (this.state.role === "host") {
        try {
          await this.createHostOffer();
          logLifecycleEvent("WAITING_FOR_PARTICIPANT", { callId: this.state.callId, role: this.state.role, signal: "join" });
          this.transition("waiting_for_participant", { statusMessage: "Waiting for participant...", errorMessage: null }, { callId: this.state.callId, role: this.state.role, signal: "join" });
        } catch (error) {
          this.signalIssue(describeError(error) || "Unable to send call signaling data.", {
            phase: "offer",
          });
        }
      }
      return;
    }

    if (message.type === "offer" && this.state.role === "guest") {
      logWebRtcEvent("Offer received", { callId: this.state.callId, senderId: message.senderId });
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit));
      this.remoteDescriptionSet = true;
      const answer = await this.peerConnection.createAnswer();
      logWebRtcEvent("Answer created", { callId: this.state.callId, senderId: this.clientId });
      await this.peerConnection.setLocalDescription(answer);
      try {
        await sendCallSignal(this.state.callId!, {
          senderId: this.clientId,
          type: "answer",
          payload: answer,
        });
        logWebRtcEvent("Answer sent", {
          callId: this.state.callId,
          role: this.state.role,
        });
      } catch (error) {
        this.signalIssue(describeError(error) || "Unable to send call signaling data.", {
          phase: "answer",
        });
        return;
      }
      logLifecycleEvent("SIGNALING_CONNECTED", {
        callId: this.state.callId,
        role: this.state.role,
        signal: "offer",
      });
      await this.applyPendingCandidates();
      this.transition("connecting", { statusMessage: "Connecting memory call...", errorMessage: null }, { signal: "offer" });
      return;
    }

    if (message.type === "answer" && this.state.role === "host") {
      logWebRtcEvent("Answer received", { callId: this.state.callId, senderId: message.senderId });
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit));
      this.remoteDescriptionSet = true;
      await this.applyPendingCandidates();
      logLifecycleEvent("SIGNALING_CONNECTED", {
        callId: this.state.callId,
        role: this.state.role,
        signal: "answer",
      });
      this.transition("connecting", { statusMessage: "Connecting memory call...", errorMessage: null }, { signal: "answer" });
      return;
    }

    if (message.type === "candidate") {
      logIceEvent("Candidate received", { callId: this.state.callId, senderId: message.senderId });
      const candidate = message.payload as RTCIceCandidateInit;
      if (!this.remoteDescriptionSet) {
        this.pendingCandidates.push(candidate);
        return;
      }

      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (error) {
        logCallEvent("candidate_apply_failed", {
          callId: this.state.callId,
          error: describeError(error),
        });
      }
      return;
    }

    if (message.type === "hangup") {
      this.transition("ending", { statusMessage: "The other person ended the call." }, { signal: "hangup" });
      await this.terminateCall({ notifyPeer: false, reason: "remote_hangup" });
    }
  }

  private async pollSignals() {
    if (!this.state.callId) {
      return;
    }

    logCallEvent("poll_signals_cycle", {
      callId: this.state.callId,
      since: this.lastSignalAt,
      role: this.state.role,
    });

    const response = await fetchCallSignals(this.state.callId, this.lastSignalAt);
    logCallEvent("poll_signals_result", {
      callId: this.state.callId,
      since: this.lastSignalAt,
      messageCount: response.messages.length,
      roomEnded: response.roomEnded,
    });

    for (const message of response.messages) {
      this.lastSignalAt = Math.max(this.lastSignalAt, message.sequence);
      await this.handleSignal(message);
    }

    if (response.roomEnded) {
      this.transition("ending", { statusMessage: "The call has ended." }, { roomEnded: true });
      await this.terminateCall({ notifyPeer: false, reason: "room_ended" });
    }
  }

  private async terminateCall(options: { notifyPeer: boolean; reason: TerminationReason }) {
    if (this.isEnding) {
      return this.currentCompletion;
    }

    this.isEnding = true;
    logLifecycleEvent("CALL_TERMINATED", {
      callId: this.state.callId,
      reason: options.reason,
      notifyPeer: options.notifyPeer,
    });
    logCallEvent("termination_started", {
      callId: this.state.callId,
      reason: options.reason,
      notifyPeer: options.notifyPeer,
    });

    let recording: RecordingResult | null = null;

    try {
      this.transition("ending", { statusMessage: "Ending call..." }, { reason: options.reason });

      if (options.notifyPeer && this.state.callId) {
        await withTimeout(
          sendCallSignal(this.state.callId, {
            senderId: this.clientId,
            type: "hangup",
            payload: null,
          }),
          5000,
          "Timed out while notifying the other participant that the call ended.",
        );
      }

      this.transition("finalizing_recording", { statusMessage: "Finalizing recording..." }, { reason: options.reason });

      recording = await withTimeout(this.stopRecording(), 15000, "Timed out while finalizing the recording.");

      if (!recording) {
        const message = this.hasStartedRecording
          ? "No recording was produced for this call."
          : "Recording never started before the call ended.";
        this.failSession(message, { reason: options.reason });
        return null;
      }

      this.currentCompletion = {
        recording: recording.file,
        durationSeconds: recording.durationSeconds,
        title: recording.title,
        description: recording.description,
        recordingSessionId: recording.recordingSessionId,
        chunkCount: recording.chunkCount,
        totalBytes: recording.totalBytes,
        mimeType: recording.mimeType,
      };
      logCallEvent("completion_created", {
        callId: this.state.callId,
        role: this.state.role,
        hasRecording: Boolean(this.currentCompletion.recording),
        fileName: this.currentCompletion.recording?.name ?? null,
        fileSize: this.currentCompletion.recording?.size ?? null,
        durationSeconds: this.currentCompletion.durationSeconds,
      });

      this.setState({
        recordingActive: false,
        localStreamReady: false,
        remoteStreamReady: false,
        guestJoined: false,
      });

      logCallEvent("recording_finalized", {
        callId: this.state.callId,
        durationSeconds: recording.durationSeconds,
        fileName: recording.file.name,
        reason: options.reason,
      });

      return this.currentCompletion;
    } catch (error) {
      this.failSession(describeError(error) || "Unable to end the call.", {
        reason: options.reason,
      });
      throw error;
    } finally {
      const activeCallId = this.state.callId;
      this.stopTimers();
      this.stopPeerConnection();
      this.stopLocalStreams();
      this.isEnding = false;
      void disconnectCallSignalChannel(activeCallId);
    }
  }
  async startHostCall() {
    const response = await createCallRoom();
    logLifecycleEvent("CALL_CREATED", { callId: response.callId, role: "host" });
    logCallEvent("start_host_call", { callId: response.callId });
    logJoinEvent("Call created", { callId: response.callId });
    await this.begin(response.callId, "host");
    this.setState({ inviteUrl: response.inviteUrl });
    logJoinEvent("Call code generated", { callId: response.callId, inviteUrl: response.inviteUrl });
    return response;
  }

  async joinCall(callId: string) {
    logJoinEvent("Join requested", { callId });
    logLifecycleEvent("WAITING_FOR_PARTICIPANT", { callId, role: "guest" });
    logCallEvent("join_call", { callId });
    await this.begin(callId, "guest");
  }

  async flipCamera() {
    const nextFacingMode = this.state.cameraFacingMode === "user" ? "environment" : "user";
    const currentStream = this.state.localStream;
    if (!currentStream) return;

    const currentVideoTrack = getTrack(currentStream, "video");
    const audioTracks = currentStream.getAudioTracks();

    try {
      const nextStream = await this.ensureLocalMedia(nextFacingMode);
      const nextVideoTrack = getTrack(nextStream, "video");
      const nextAudioTrack = getTrack(nextStream, "audio");
      const videoSender = this.peerConnection?.getSenders().find((sender) => sender.track?.kind === "video") ?? null;

      if (videoSender && nextVideoTrack) {
        await videoSender.replaceTrack(nextVideoTrack);
      }

      currentVideoTrack?.stop();
      if (nextAudioTrack) {
        nextAudioTrack.enabled = audioTracks[0]?.enabled ?? true;
      }

      this.setState({
        localStream: nextStream,
        cameraEnabled: true,
        cameraFacingMode: nextFacingMode,
        microphoneEnabled: nextAudioTrack ? nextAudioTrack.enabled : this.state.microphoneEnabled,
      });
      this.recordingSession?.updateLocalStream(nextStream);
      logCallEvent("flip_camera", {
        callId: this.state.callId,
        facingMode: nextFacingMode,
      });
    } catch (error) {
      logCallEvent("flip_camera_failed", {
        callId: this.state.callId,
        error: describeError(error),
      });
    }
  }

  toggleCamera() {
    const localTrack = getTrack(this.state.localStream, "video");
    if (!localTrack) return;

    localTrack.enabled = !localTrack.enabled;
    this.setState({ cameraEnabled: localTrack.enabled });
    logCallEvent("toggle_camera", { callId: this.state.callId, enabled: localTrack.enabled });
  }

  toggleMicrophone() {
    const localTrack = getTrack(this.state.localStream, "audio");
    if (!localTrack) return;
    localTrack.enabled = !localTrack.enabled;
    this.setState({ microphoneEnabled: localTrack.enabled });
    logCallEvent("toggle_microphone", { callId: this.state.callId, enabled: localTrack.enabled });
  }

  toggleSpeaker() {
    const nextSpeakerEnabled = !this.state.speakerEnabled;
    this.setState({ speakerEnabled: nextSpeakerEnabled });
    logCallEvent("toggle_speaker", { callId: this.state.callId, enabled: nextSpeakerEnabled });
  }

  async endCall() {
    logLifecycleEvent("END_BUTTON_PRESSED", { callId: this.state.callId, role: this.state.role });
    return await this.terminateCall({ notifyPeer: true, reason: "local_end" });
  }

  async begin(callId: string, role: CallRole) {
    this.dispose();
    this.resetSessionState();

    this.transition(
      role === "host" ? "creating" : "joining",
      {
        callId,
        role,
        inviteUrl: role === "host" ? buildRoomInviteUrl(callId) : window.location.href,
        statusMessage: role === "host" ? "Preparing your memory call..." : "Joining memory call...",
        errorMessage: null,
        archiveId: null,
        archiveMessage: null,
        guestJoined: false,
        recordingActive: false,
        isSavingArchive: false,
        elapsedSeconds: 0,
      },
      { callId, role },
    );

    try {
      logCallEvent("local_media_request_started", {
        callId: this.state.callId,
        role,
        origin: getOrigin(),
      });
      await this.ensureLocalMedia(this.state.cameraFacingMode);
      this.createPeerConnection();
      await connectCallSignalChannel(callId);
      logLifecycleEvent("PEER_CONNECTION_INITIALIZED", {
        callId: this.state.callId,
        role,
        origin: getOrigin(),
      });
      this.pollTimer = window.setInterval(() => {
        void this.pollSignals().catch((error) => {
          this.signalIssue(describeError(error) || "Unable to read call signaling data.", {
            callId: this.state.callId,
          });
        });
      }, 700);

      try {
        await sendCallSignal(callId, {
          senderId: this.clientId,
          type: "join",
          payload: { role },
        });
        logJoinEvent("Join signal sent", {
          callId,
          role,
        });
      } catch (error) {
        this.signalIssue(describeError(error) || "Unable to send call signaling data.", {
          callId,
          role,
          phase: "join",
        });
        return;
      }

      if (role === "host") {
        logLifecycleEvent("WAITING_FOR_PARTICIPANT", { callId, role });
        this.transition("waiting_for_participant", { statusMessage: "Waiting for participant...", errorMessage: null }, { callId, role });
      } else {
        logLifecycleEvent("WAITING_FOR_PARTICIPANT", { callId, role });
        this.transition("connecting", { statusMessage: "Connecting memory call...", errorMessage: null }, { callId, role });
      }

    } catch (error) {
      this.signalIssue(describeError(error) || "Unable to start the call.", {
        callId,
        role,
      });
      return;
    }
  }

  markArchiving(message = "Securing memory...") {
    logLifecycleEvent("ARCHIVE_STARTED", {
      callId: this.state.callId,
      archiveMessage: message,
    });
    this.transition(
      "archiving",
      {
        isSavingArchive: true,
        archiveMessage: message,
        statusMessage: message,
      },
      { archiveMessage: message },
    );
  }

  markSuccess(archiveId: string, message = "Memory saved successfully.") {
    this.transition(
      "success",
      {
        archiveId,
        archiveMessage: message,
        isSavingArchive: false,
        errorMessage: null,
        statusMessage: message,
      },
      { archiveId, message },
    );
  }

  markFailed(message: string) {
    this.failSession(message, { source: "archive_pipeline" });
  }

  setSavingArchive(isSavingArchive: boolean) {
    if (isSavingArchive) {
      this.markArchiving();
      return;
    }

    this.setState({ isSavingArchive });
  }

  setArchiveResult(archiveId: string | null, archiveMessage: string | null) {
    if (archiveId) {
      this.markSuccess(archiveId, archiveMessage ?? "Memory saved successfully.");
      return;
    }

    this.setState({ archiveId, archiveMessage });
  }

  dispose() {
    const activeCallId = this.state.callId;
    this.stopTimers();
    this.stopPeerConnection();
    this.stopLocalStreams();
    this.recordingSession = null;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.hasStartedRecording = false;
    this.isEnding = false;
    this.currentCompletion = null;
    void disconnectCallSignalChannel(activeCallId);
  }
}

const controller = new CallSessionController();

export const CallService = {
  subscribe: (listener: Listener) => controller.subscribe(listener),
  getSnapshot: () => controller.getSnapshot(),
  startHostCall: () => controller.startHostCall(),
  joinCall: (callId: string) => controller.joinCall(callId),
  flipCamera: () => controller.flipCamera(),
  toggleCamera: () => controller.toggleCamera(),
  toggleMicrophone: () => controller.toggleMicrophone(),
  toggleSpeaker: () => controller.toggleSpeaker(),
  endCall: () => controller.endCall(),
  dispose: () => controller.dispose(),
  setSavingArchive: (isSavingArchive: boolean) => controller.setSavingArchive(isSavingArchive),
  setArchiveResult: (archiveId: string | null, archiveMessage: string | null) => controller.setArchiveResult(archiveId, archiveMessage),
  markArchiving: (message?: string) => controller.markArchiving(message),
  markSuccess: (archiveId: string, message?: string) => controller.markSuccess(archiveId, message),
  markFailed: (message: string) => controller.markFailed(message),
  getCompletion: () => controller.getCompletion(),
};

