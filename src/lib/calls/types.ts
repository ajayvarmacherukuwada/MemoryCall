export type CallRole = "host" | "guest";

export type CallLifecycle =
  | "idle"
  | "creating"
  | "joining"
  | "waiting"
  | "waiting_for_participant"
  | "reconnecting"
  | "connecting"
  | "connected"
  | "recording"
  | "ending"
  | "finalizing_recording"
  | "archiving"
  | "success"
  | "failed";

export type CallSignalType = "join" | "offer" | "answer" | "candidate" | "hangup";

export type CallSignalMessage = {
  id: string;
  callId: string;
  sequence: number;
  senderId: string;
  type: CallSignalType;
  payload: unknown;
  createdAt: number;
};

export type CallSignalEnvelope = CallSignalMessage;

export type CallRoomRecord = {
  callId: string;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
  nextSequence: number;
  messages: CallSignalMessage[];
};

export type CallCreateResponse = {
  callId: string;
  inviteUrl: string;
};

export type CallSnapshot = {
  callId: string | null;
  role: CallRole | null;
  lifecycle: CallLifecycle;
  inviteUrl: string | null;
  guestJoined: boolean;
  connectionLabel: string;
  cameraEnabled: boolean;
  cameraFacingMode: "user" | "environment";
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  localStreamReady: boolean;
  remoteStreamReady: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  recordingActive: boolean;
  isSavingArchive: boolean;
  elapsedSeconds: number;
  errorMessage: string | null;
  statusMessage: string;
  archiveId: string | null;
  archiveMessage: string | null;
};

export type CallCompletion = {
  recording: File | null;
  durationSeconds: number;
  title: string;
  description: string;
  recordingSessionId: string;
  chunkCount: number;
  totalBytes: number;
  mimeType: string;
};

export type CallRoomInfo = {
  callId: string;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
  messageCount: number;
};

