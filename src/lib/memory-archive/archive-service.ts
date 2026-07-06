"use client";

import { MemoryArchiveService } from "@/lib/memory-archive/memory-archive-service";
import type { MemoryArchiveInput, MemoryArchiveProgress, MemoryArchiveRecord } from "@/lib/memory-archive/types";

export async function saveMemoryArchiveEntry(
  input: MemoryArchiveInput,
  callbacks?: { onProgress?: (progress: MemoryArchiveProgress) => void; onBlocked?: (message: string) => void },
): Promise<MemoryArchiveRecord> {
  return await MemoryArchiveService.saveMemory(input, callbacks);
}