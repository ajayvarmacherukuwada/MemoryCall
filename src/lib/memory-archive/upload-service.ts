"use client";

import type { GoogleResponseDebug, MemoryArchiveInput, MemoryArchiveProgress, MemoryArchiveUploadResponse } from "@/lib/memory-archive/types";

export type MemoryArchiveUploadCallbacks = {
  onProgress?: (progress: MemoryArchiveProgress) => void;
  onResponse?: (response: MemoryArchiveUploadResponse) => void;
};

export type MemoryArchiveUploadController = {
  promise: Promise<MemoryArchiveUploadResponse>;
  cancel: () => void;
};

function logUploadEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[LetsCall][ArchiveUpload]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function createFormData(input: MemoryArchiveInput, requestId: string) {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("title", input.title);
  formData.append("description", input.description);
  formData.append("collection", input.collection);
  formData.append("duration", String(input.duration));
  formData.append("requestId", requestId);
  return formData;
}

function parseJsonResponse(responseText: string) {
  try {
    return JSON.parse(responseText) as MemoryArchiveUploadResponse & {
      error?: string;
      code?: string;
      status?: number;
      debug?: GoogleResponseDebug | null;
    };
  } catch {
    return null;
  }
}

function formatDebug(debug: GoogleResponseDebug | null | undefined) {
  if (!debug) return null;

  const lines = [
    `Endpoint: ${debug.endpoint}`,
    `Upload type: ${debug.uploadType}`,
    `Privacy status: ${debug.privacyStatus}`,
    `Requested scope: ${debug.requestedScope}`,
  ];

  if (typeof debug.status === "number") {
    lines.push(`HTTP status: ${debug.status}${debug.statusText ? ` ${debug.statusText}` : ""}`);
  }

  if (debug.responseHeaders) {
    lines.push(`Headers: ${JSON.stringify(debug.responseHeaders)}`);
  }

  if (debug.responseBodyRaw) {
    lines.push(`Body: ${debug.responseBodyRaw}`);
  }

  return lines.join("\n");
}

export function uploadMemoryArchive(
  input: MemoryArchiveInput,
  bearerToken: string,
  requestId: string,
  callbacks: MemoryArchiveUploadCallbacks = {},
): MemoryArchiveUploadController {
  const xhr = new XMLHttpRequest();
  const formData = createFormData(input, requestId);

  const promise = new Promise<MemoryArchiveUploadResponse>((resolve, reject) => {
    let uploadProgress = 0;

    xhr.open("POST", "/api/memory-archive/upload");
    xhr.responseType = "text";
    xhr.setRequestHeader("Authorization", `Bearer ${bearerToken}`);
    xhr.setRequestHeader("X-Idempotency-Key", requestId);

    logUploadEvent("request_opened", {
      endpoint: "/api/memory-archive/upload",
      method: "POST",
      title: input.title,
      collection: input.collection,
      requestId,
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      uploadProgress = event.total > 0 ? event.loaded / event.total : 0;
      callbacks.onProgress?.({
        status: "uploading",
        progress: Math.min(88, 18 + Math.round(uploadProgress * 64)),
        message: "Uploading " + Math.max(1, Math.round(uploadProgress * 100)) + "%",
      });
      logUploadEvent("upload_progress", {
        loaded: event.loaded,
        total: event.total,
        progress: uploadProgress,
        requestId,
      });
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;

      if (xhr.status >= 200 && xhr.status < 300) {
        const payload = parseJsonResponse(xhr.responseText);
        if (!payload || !payload.archive || !payload.providerState) {
          logUploadEvent("invalid_response", { status: xhr.status, body: xhr.responseText, requestId });
          reject(new Error("The archive service returned an unexpected response."));
          return;
        }

        logUploadEvent("response_success", {
          status: xhr.status,
          archiveId: payload.archive.archiveId,
          providerId: payload.providerState.providerId,
          requestId,
        });
        callbacks.onResponse?.(payload);
        resolve(payload);
        return;
      }

      const payload = parseJsonResponse(xhr.responseText);
      const debugMessage = formatDebug(payload?.debug ?? null);
      const message = debugMessage
        ? `${payload?.error ?? "The archive provider rejected the upload."}\n\n${debugMessage}`
        : payload?.error ?? xhr.statusText ?? "Unable to save memory.";
      const error = new Error(message);
      (error as Error & { code?: string; requiredScope?: string; debug?: GoogleResponseDebug | null }).code = payload?.code;
      (error as Error & { code?: string; requiredScope?: string; debug?: GoogleResponseDebug | null }).debug = payload?.debug ?? null;
      (error as Error & { code?: string; requiredScope?: string; debug?: GoogleResponseDebug | null }).requiredScope = payload?.debug?.requestedScope;
      logUploadEvent("response_error", {
        status: xhr.status,
        statusText: xhr.statusText,
        body: xhr.responseText,
        code: payload?.code,
        debug: payload?.debug ?? null,
        requestId,
      });
      reject(error);
    };

    xhr.onerror = () => {
      logUploadEvent("network_error", { endpoint: "/api/memory-archive/upload", requestId });
      reject(new Error("A network error interrupted the archive upload."));
    };
    xhr.onabort = () => {
      logUploadEvent("aborted", { endpoint: "/api/memory-archive/upload", requestId });
      reject(Object.assign(new Error("The upload was cancelled."), { name: "AbortError" }));
    };

    callbacks.onProgress?.({ status: "preparing", progress: 10, message: "Preparing recording..." });
    xhr.send(formData);
    callbacks.onProgress?.({ status: "uploading", progress: 20, message: "Uploading 0%" });
    logUploadEvent("request_sent", { endpoint: "/api/memory-archive/upload", requestId });
  });

  return {
    promise,
    cancel: () => xhr.abort(),
  };
}
