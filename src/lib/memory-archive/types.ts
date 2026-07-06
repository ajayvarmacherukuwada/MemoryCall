export type MemoryCollection = "Family" | "Work" | "Health" | "Learning" | "Property" | "Personal";

export type MemoryArchiveStatus =
  | "preparing"
  | "uploading"
  | "processing"
  | "archived"
  | "failed"
  | "queued"
  | "paused";

export type MemoryArchiveRecord = {
  id: string;
  archiveId: string;
  title: string;
  description: string;
  collection: MemoryCollection;
  createdAt: string;
  duration: number;
  thumbnailUrl: string | null;
  status: MemoryArchiveStatus;
  progress: number;
  errorMessage?: string | null;
};

export type MemoryArchiveDraft = {
  title: string;
  description: string;
  collection: MemoryCollection;
};

export type MemoryArchiveInput = MemoryArchiveDraft & {
  file: File;
  duration: number;
};

export type MemoryArchiveProgress = {
  status: MemoryArchiveStatus;
  progress: number;
  message: string;
};

export type MemoryArchiveProviderState = {
  archiveId: string;
  providerId: string;
  archiveUrl: string | null;
  playbackUrl?: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
};

export type GoogleResponseDebug = {
  endpoint: string;
  uploadType: "multipart" | "resumable";
  privacyStatus: "private";
  requestedScope: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBodyRaw?: string;
  responseBodyJson?: unknown;
  requestParts?: string;
  requestMetadata?: {
    snippet: {
      title: string;
      description: string;
      categoryId: string;
    };
    status: {
      privacyStatus: "private";
      selfDeclaredMadeForKids: boolean;
    };
    recordingDetails: {
      recordingDate: string;
    };
  };
};

export type MemoryArchiveUploadResponse = {
  archive: MemoryArchiveRecord;
  providerState: MemoryArchiveProviderState;
};

export type MemoryArchiveUploadRequest = MemoryArchiveInput & {
  accessToken: string;
};

export type MemoryArchivePlayback = {
  archiveId: string;
  title: string;
  description: string;
  collection: MemoryCollection;
  createdAt: string;
  duration: number;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
};

export type MemoryArchiveView = {
  archiveId: string;
  title: string;
  description: string;
  collection: MemoryCollection;
  createdAt: string;
  duration: number;
  thumbnailUrl: string | null;
  archiveUrl: string | null;
};

export type MemoryArchivePlaybackSource = {
  kind: "source";
  playback: MemoryArchivePlayback;
  sourceUrl: string;
};

export type MemoryArchivePlaybackAuthorizationError = {
  kind: "authorization_error";
  title: string;
  message: string;
  actionLabel: string;
};

export type MemoryArchivePlaybackResult = MemoryArchivePlaybackSource | MemoryArchivePlaybackAuthorizationError;

export type MemoryArchiveViewSource = {
  kind: "external";
  view: MemoryArchiveView;
  actionLabel: string;
  openingMessage: string;
};

export type MemoryArchiveViewAuthorizationError = {
  kind: "authorization_error";
  title: string;
  message: string;
  actionLabel: string;
};

export type MemoryArchiveViewResult = MemoryArchiveViewSource | MemoryArchiveViewAuthorizationError;

