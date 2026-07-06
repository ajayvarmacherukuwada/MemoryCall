"use client";

import { getArchiveProviderState, readMemoryArchive } from "@/lib/memory-archive/storage";
import type {
  MemoryArchivePlayback,
  MemoryArchivePlaybackAuthorizationError,
  MemoryArchivePlaybackResult,
  MemoryArchiveView,
  MemoryArchiveViewAuthorizationError,
  MemoryArchiveViewResult,
} from "@/lib/memory-archive/types";

function buildAuthorizationError(message: string): MemoryArchiveViewAuthorizationError {
  return {
    kind: "authorization_error",
    title: "Open Archived Memory",
    message,
    actionLabel: "Back to Library",
  };
}

function resolveExternalArchiveUrl(archiveId: string) {
  const providerState = getArchiveProviderState(archiveId);
  return providerState?.archiveUrl ?? providerState?.playbackUrl ?? null;
}

export const ViewMemoryService = {
  resolveView(archiveId: string): MemoryArchiveViewResult {
    const record = readMemoryArchive().find((item) => item.archiveId === archiveId);
    if (!record) {
      return buildAuthorizationError("This memory is not available on this device yet.");
    }

    const archiveUrl = resolveExternalArchiveUrl(archiveId);
    if (!archiveUrl) {
      return buildAuthorizationError(
        "Opening your private archived memory is not available yet. Return to the Library and try again from another device or session.",
      );
    }

    const view: MemoryArchiveView = {
      archiveId: record.archiveId,
      title: record.title,
      description: record.description,
      collection: record.collection,
      createdAt: record.createdAt,
      duration: record.duration,
      thumbnailUrl: record.thumbnailUrl,
      archiveUrl,
    };

    return {
      kind: "external",
      view,
      actionLabel: "View Memory",
      openingMessage: "Opening your private archived memory...",
    };
  },
};

export const PlayerService = ViewMemoryService;
