import type { GoogleResponseDebug, MemoryArchiveUploadRequest, MemoryArchiveUploadResponse } from "@/lib/memory-archive/types";

export type ArchiveProviderUploadContext = {
  accessToken: string;
  signal?: AbortSignal;
};

export interface ArchiveProvider {
  upload(input: MemoryArchiveUploadRequest, context: ArchiveProviderUploadContext): Promise<MemoryArchiveUploadResponse>;
}

export class ArchiveProviderError extends Error {
  code: string;
  status: number;
  debug?: GoogleResponseDebug;

  constructor(code: string, message: string, status = 500, debug?: GoogleResponseDebug) {
    super(message);
    this.name = "ArchiveProviderError";
    this.code = code;
    this.status = status;
    this.debug = debug;
  }
}