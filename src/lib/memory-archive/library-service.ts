"use client";

import { subscribeMemoryArchive, readMemoryArchive, upsertMemoryArchiveRecord, updateMemoryArchiveRecord } from "@/lib/memory-archive/storage";
import type { MemoryArchiveRecord } from "@/lib/memory-archive/types";

export const LibraryService = {
  readAll(): MemoryArchiveRecord[] {
    return readMemoryArchive();
  },
  upsert(record: MemoryArchiveRecord) {
    upsertMemoryArchiveRecord(record);
  },
  update(archiveId: string, updater: (record: MemoryArchiveRecord) => MemoryArchiveRecord) {
    updateMemoryArchiveRecord(archiveId, updater);
  },
  subscribe(listener: () => void) {
    return subscribeMemoryArchive(listener);
  },
};