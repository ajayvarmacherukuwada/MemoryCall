"use client";

import { appendRecordingChunk, finalizeRecordingSession, upsertRecordingSession } from "@/lib/calls/recording-store";

export type RecordingOptions = {
  title: string;
  callId?: string | null;
  sessionId?: string;
  localStream: MediaStream;
  remoteStream: MediaStream | null;
};

export type RecordingResult = {
  file: File;
  durationSeconds: number;
  title: string;
  description: string;
  recordingSessionId: string;
  chunkCount: number;
  totalBytes: number;
  mimeType: string;
};

function logRecordingEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[LetsCall][Recording]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function pickMimeType() {
  const preferred = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  if (typeof MediaRecorder === "undefined") {
    return preferred[0];
  }

  return preferred.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "video/webm";
}

function createTextOverlay(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save();
  ctx.font = "600 18px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function createAudioMixer(localStream: MediaStream, remoteStream: MediaStream | null) {
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  const attach = (stream: MediaStream | null) => {
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
    source.connect(destination);
  };

  attach(localStream);
  attach(remoteStream);

  return {
    stream: destination.stream,
    close: () => audioContext.close(),
  };
}

function buildRecordingFileName(title: string) {
  return `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "memory-call"}.webm`;
}

export function createRecordingSession(options: RecordingOptions) {
  const recordingSessionId = options.sessionId ?? crypto.randomUUID();
  const mimeType = pickMimeType();
  const localTracks = options.localStream.getTracks();
  const remoteTracks = options.remoteStream?.getTracks() ?? [];
  const fileName = buildRecordingFileName(options.title);
  const description = `One-to-one memory call recorded on ${new Date().toLocaleDateString("en-US")}`;

  logRecordingEvent("create_session", {
    title: options.title,
    callId: options.callId ?? null,
    sessionId: recordingSessionId,
    mimeType,
    localTracks: localTracks.length,
    remoteTracks: remoteTracks.length,
  });

  void upsertRecordingSession({
    sessionId: recordingSessionId,
    callId: options.callId ?? null,
    title: options.title,
    description,
    fileName,
    mimeType,
    status: "recording",
    chunkCount: 0,
    totalBytes: 0,
    durationSeconds: null,
    finalBlob: null,
  }).catch((error) => {
    logRecordingEvent("session_persist_failed", {
      sessionId: recordingSessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Recording is not supported in this browser.");
  }

  const localVideo = document.createElement("video");
  localVideo.autoplay = true;
  localVideo.muted = true;
  localVideo.playsInline = true;
  localVideo.srcObject = options.localStream;

  const remoteVideo = document.createElement("video");
  remoteVideo.autoplay = true;
  remoteVideo.muted = true;
  remoteVideo.playsInline = true;
  remoteVideo.srcObject = options.remoteStream;

  void localVideo.play().catch((error) => {
    logRecordingEvent("local_video_play_failed", {
      sessionId: recordingSessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  void remoteVideo.play().catch((error) => {
    logRecordingEvent("remote_video_play_failed", {
      sessionId: recordingSessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const audioMixer = createAudioMixer(options.localStream, options.remoteStream);
  const canvasStream = canvas.captureStream(30);
  const mixedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioMixer.stream.getAudioTracks(),
  ]);

  const mediaRecorder = new MediaRecorder(mixedStream, {
    mimeType,
  });

  logRecordingEvent("media_recorder_created", {
    title: options.title,
    sessionId: recordingSessionId,
    state: mediaRecorder.state,
    mimeType: mediaRecorder.mimeType || mimeType,
    mixedVideoTracks: mixedStream.getVideoTracks().length,
    mixedAudioTracks: mixedStream.getAudioTracks().length,
  });

  const chunks: BlobPart[] = [];
  let animationFrameId = 0;
  let firstChunkReceived = false;
  let chunkSequence = 0;
  const startedAt = performance.now();

  const draw = () => {
    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const hasRemote = remoteVideo.readyState >= 2 && remoteVideo.videoWidth > 0;
    const hasLocal = localVideo.readyState >= 2 && localVideo.videoWidth > 0;

    if (hasRemote) {
      const scale = Math.max(canvas.width / remoteVideo.videoWidth, canvas.height / remoteVideo.videoHeight);
      const width = remoteVideo.videoWidth * scale;
      const height = remoteVideo.videoHeight * scale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      ctx.drawImage(remoteVideo, x, y, width, height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#0f1724");
      gradient.addColorStop(1, "#040507");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (hasLocal) {
      const pipWidth = canvas.width * 0.25;
      const pipHeight = pipWidth * 0.75;
      const pipX = canvas.width - pipWidth - 32;
      const pipY = canvas.height - pipHeight - 32;
      ctx.save();
      ctx.fillStyle = "rgba(7,11,16,0.7)";
      ctx.fillRect(pipX - 10, pipY - 10, pipWidth + 20, pipHeight + 52);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      ctx.strokeRect(pipX - 10, pipY - 10, pipWidth + 20, pipHeight + 52);
      ctx.drawImage(localVideo, pipX, pipY, pipWidth, pipHeight);
      ctx.restore();
      createTextOverlay(ctx, "You", pipX, pipY + pipHeight + 28);
    }

    createTextOverlay(ctx, options.title, 36, 52);
    animationFrameId = window.requestAnimationFrame(draw);
  };

  const recordingPromise = new Promise<RecordingResult>((resolve, reject) => {
    mediaRecorder.onstart = () => {
      logRecordingEvent("recorder_onstart", {
        title: options.title,
        sessionId: recordingSessionId,
        state: mediaRecorder.state,
        mimeType: mediaRecorder.mimeType || mimeType,
      });
    };

    mediaRecorder.ondataavailable = (event) => {
      logRecordingEvent("dataavailable", {
        size: event.data.size,
        chunksBeforePush: chunks.length,
        mimeType: event.data.type || mediaRecorder.mimeType || mimeType,
        sessionId: recordingSessionId,
      });
      if (!firstChunkReceived && event.data.size > 0) {
        firstChunkReceived = true;
        logRecordingEvent("first_dataavailable", {
          size: event.data.size,
          mimeType: event.data.type || mediaRecorder.mimeType || mimeType,
          sessionId: recordingSessionId,
        });
      }
      if (event.data.size > 0) {
        chunks.push(event.data);
        chunkSequence += 1;
        void appendRecordingChunk(recordingSessionId, chunkSequence, event.data, mediaRecorder.mimeType || mimeType).catch((error) => {
          logRecordingEvent("chunk_persist_failed", {
            sessionId: recordingSessionId,
            sequence: chunkSequence,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        logRecordingEvent("chunk_received", {
          size: event.data.size,
          chunks: chunks.length,
          mimeType: event.data.type || mediaRecorder.mimeType || mimeType,
          sessionId: recordingSessionId,
          sequence: chunkSequence,
        });
      }
    };

    mediaRecorder.onerror = () => {
      logRecordingEvent("recorder_error", { state: mediaRecorder.state, sessionId: recordingSessionId });
      reject(new Error("Unable to record the call."));
    };
    mediaRecorder.onstop = () => {
      logRecordingEvent("recorder_onstop", {
        state: mediaRecorder.state,
        chunks: chunks.length,
        firstChunkReceived,
        sessionId: recordingSessionId,
      });
      const elapsedMs = Math.max(0, performance.now() - startedAt);
      const durationSeconds = Math.max(1, Math.round(elapsedMs / 1000));
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType || "video/webm" });
      logRecordingEvent("blob_created", {
        chunks: chunks.length,
        blobSize: blob.size,
        blobType: blob.type || "video/webm",
        firstChunkReceived,
        sessionId: recordingSessionId,
      });
      if (blob.size <= 0) {
        logRecordingEvent("blob_invalid", {
          chunks: chunks.length,
          blobSize: blob.size,
          blobType: blob.type || "video/webm",
          sessionId: recordingSessionId,
        });
        reject(new Error("No recording was produced for this call."));
        return;
      }
      const file = new File([blob], fileName, {
        type: blob.type || "video/webm",
      });

      void finalizeRecordingSession(recordingSessionId, {
        fileName: file.name,
        mimeType: file.type || "video/webm",
        durationSeconds,
        finalBlob: blob,
      }).catch((error) => {
        logRecordingEvent("session_finalize_failed", {
          sessionId: recordingSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      logRecordingEvent("recorder_stopped", {
        chunks: chunks.length,
        blobSize: blob.size,
        blobType: blob.type || "video/webm",
        fileName: file.name,
        durationSeconds,
        sessionId: recordingSessionId,
      });

      resolve({
        file,
        durationSeconds,
        title: options.title,
        description,
        recordingSessionId,
        chunkCount: chunks.length,
        totalBytes: blob.size,
        mimeType: file.type || "video/webm",
      });
    };
  });

  draw();
  logRecordingEvent("start_recording_invoked", {
    title: options.title,
    sessionId: recordingSessionId,
    stateBeforeStart: mediaRecorder.state,
    timesliceMs: 1000,
  });
  mediaRecorder.start(1000);
  logRecordingEvent("recorder_started", {
    title: options.title,
    sessionId: recordingSessionId,
    mimeType: mediaRecorder.mimeType || mimeType,
    state: mediaRecorder.state,
  });

  return {
    stop: async () => {
      logRecordingEvent("stop_requested", {
        state: mediaRecorder.state,
        chunkCount: chunks.length,
        mimeType: mediaRecorder.mimeType || mimeType,
        firstChunkReceived,
        sessionId: recordingSessionId,
      });
      window.cancelAnimationFrame(animationFrameId);
      if (mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.requestData();
          logRecordingEvent("request_data_before_stop", {
            state: mediaRecorder.state,
            chunkCount: chunks.length,
            sessionId: recordingSessionId,
          });
        } catch (error) {
          logRecordingEvent("request_data_before_stop_failed", {
            error: error instanceof Error ? error.message : String(error),
            state: mediaRecorder.state,
            sessionId: recordingSessionId,
          });
        }
        mediaRecorder.stop();
      }
      const result = await recordingPromise;
      localVideo.srcObject = null;
      remoteVideo.srcObject = null;
      await audioMixer.close();
      mixedStream.getTracks().forEach((track) => track.stop());
      canvasStream.getTracks().forEach((track) => track.stop());
      logRecordingEvent("stop_resolved", {
        fileName: result.file.name,
        fileSize: result.file.size,
        mimeType: result.file.type,
        durationSeconds: result.durationSeconds,
        sessionId: recordingSessionId,
      });
      return result;
    },
    updateRemoteStream: (stream: MediaStream | null) => {
      remoteVideo.srcObject = stream;
      logRecordingEvent("remote_stream_updated", {
        hasStream: Boolean(stream),
        audioTracks: stream?.getAudioTracks().length ?? 0,
        videoTracks: stream?.getVideoTracks().length ?? 0,
        sessionId: recordingSessionId,
      });
    },
    updateLocalStream: (stream: MediaStream | null) => {
      localVideo.srcObject = stream;
      logRecordingEvent("local_stream_updated", {
        hasStream: Boolean(stream),
        audioTracks: stream?.getAudioTracks().length ?? 0,
        videoTracks: stream?.getVideoTracks().length ?? 0,
        sessionId: recordingSessionId,
      });
    },
  };
}
