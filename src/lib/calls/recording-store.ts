"use client";

export type RecordingDraftStatus = "recording" | "finalized";

export type RecordingDraftSession = {
  sessionId: string;
  callId: string | null;
  title: string;
  description: string;
  fileName: string;
  mimeType: string;
  status: RecordingDraftStatus;
  createdAt: number;
  updatedAt: number;
  chunkCount: number;
  totalBytes: number;
  durationSeconds: number | null;
  finalBlob: Blob | null;
};

const DB_NAME = "letscall.recordings.v1";
const DB_VERSION = 1;
const SESSION_STORE = "recording_sessions";
const CHUNK_STORE = "recording_chunks";
const PENDING_COMPLETION_PREFIX = "letscall.pending-recording.";
const listeners = new Set<() => void>();

function emitRecordingStoreChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors so one bad subscriber does not break the store.
    }
  }
}

type RecordingChunkRecord = {
  id?: number;
  sessionId: string;
  sequence: number;
  blob: Blob;
  size: number;
  mimeType: string;
  createdAt: number;
};

function logRecordingStoreEvent(step: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  console.info("[LetsCall][RecordingStore]", JSON.stringify({ step, at: new Date().toISOString(), ...details }));
}

function ensureBrowser() {
  if (typeof indexedDB === "undefined" || typeof window === "undefined") {
    throw new Error("Recording storage is not available in this browser.");
  }
}

function openDatabase() {
  ensureBrowser();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "sessionId" });
      }

      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const store = db.createObjectStore(CHUNK_STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("by_session", "sessionId", { unique: false });
        store.createIndex("by_session_sequence", ["sessionId", "sequence"], { unique: false });
      }
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open recording storage."));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function runTransaction<T>(stores: string[], mode: IDBTransactionMode, executor: (tx: IDBTransaction) => IDBRequest<T> | Promise<T>) {
  return openDatabase().then((db) => {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        callback();
        db.close();
      };

      tx.onabort = () => {
        finish(() => reject(tx.error ?? new Error("Recording storage transaction aborted.")));
      };

      tx.onerror = () => {
        finish(() => reject(tx.error ?? new Error("Recording storage transaction failed.")));
      };

      try {
        const result = executor(tx);
        if (result instanceof Promise) {
          result
            .then((value) => {
              tx.oncomplete = () => finish(() => resolve(value));
            })
            .catch((error) => {
              finish(() => reject(error));
            });
          return;
        }

        tx.oncomplete = () => {
          finish(() => resolve(result as unknown as T));
        };
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
}

function getSessionSnapshot(sessionId: string) {
  return runTransaction<RecordingDraftSession | null>([SESSION_STORE], "readonly", (tx) => {
    const store = tx.objectStore(SESSION_STORE);
    return new Promise((resolve, reject) => {
      const request = store.get(sessionId);
      request.onsuccess = () => resolve((request.result as RecordingDraftSession | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Unable to read the recording session."));
    });
  });
}

async function listChunks(sessionId: string) {
  return await runTransaction<RecordingChunkRecord[]>([CHUNK_STORE], "readonly", (tx) => {
    const store = tx.objectStore(CHUNK_STORE);
    const index = store.index("by_session");
    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(sessionId));
      request.onsuccess = () => resolve((request.result as RecordingChunkRecord[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error("Unable to read recording chunks."));
    });
  });
}

export async function upsertRecordingSession(session: Omit<RecordingDraftSession, "createdAt" | "updatedAt" | "chunkCount" | "totalBytes" | "durationSeconds" | "finalBlob"> & Partial<Pick<RecordingDraftSession, "createdAt" | "updatedAt" | "chunkCount" | "totalBytes" | "durationSeconds" | "finalBlob">>) {
  const existing = await getSessionSnapshot(session.sessionId);
  const createdAt = existing?.createdAt ?? session.createdAt ?? Date.now();
  const nextSession: RecordingDraftSession = {
    sessionId: session.sessionId,
    callId: session.callId ?? existing?.callId ?? null,
    title: session.title ?? existing?.title ?? "Memory Call",
    description: session.description ?? existing?.description ?? "",
    fileName: session.fileName ?? existing?.fileName ?? "memory-call.webm",
    mimeType: session.mimeType ?? existing?.mimeType ?? "video/webm",
    status: session.status ?? existing?.status ?? "recording",
    createdAt,
    updatedAt: session.updatedAt ?? Date.now(),
    chunkCount: session.chunkCount ?? existing?.chunkCount ?? 0,
    totalBytes: session.totalBytes ?? existing?.totalBytes ?? 0,
    durationSeconds: session.durationSeconds ?? existing?.durationSeconds ?? null,
    finalBlob: session.finalBlob ?? existing?.finalBlob ?? null,
  };

  await runTransaction<void>([SESSION_STORE], "readwrite", (tx) => {
    const store = tx.objectStore(SESSION_STORE);
    return new Promise((resolve, reject) => {
      const request = store.put(nextSession);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Unable to store the recording session."));
    });
  });

  logRecordingStoreEvent("session_upserted", {
    sessionId: nextSession.sessionId,
    callId: nextSession.callId,
    status: nextSession.status,
    chunkCount: nextSession.chunkCount,
    totalBytes: nextSession.totalBytes,
  });
  setPendingRecordingPointer(nextSession.callId, nextSession.sessionId, nextSession.status);

  return nextSession;
}

export async function appendRecordingChunk(sessionId: string, sequence: number, blob: Blob, mimeType: string) {
  ensureBrowser();
  const createdAt = Date.now();

  await runTransaction<void>([SESSION_STORE, CHUNK_STORE], "readwrite", (tx) => {
    const sessionStore = tx.objectStore(SESSION_STORE);
    const chunkStore = tx.objectStore(CHUNK_STORE);

    return new Promise((resolve, reject) => {
      const readRequest = sessionStore.get(sessionId);
      readRequest.onerror = () => reject(readRequest.error ?? new Error("Unable to update recording metadata."));
      readRequest.onsuccess = () => {
        const current = (readRequest.result as RecordingDraftSession | undefined) ?? null;
        const nextSession: RecordingDraftSession = {
          sessionId,
          callId: current?.callId ?? null,
          title: current?.title ?? "Memory Call",
          description: current?.description ?? "",
          fileName: current?.fileName ?? "memory-call.webm",
          mimeType: current?.mimeType ?? mimeType,
          status: current?.status ?? "recording",
          createdAt: current?.createdAt ?? createdAt,
          updatedAt: createdAt,
          chunkCount: (current?.chunkCount ?? 0) + 1,
          totalBytes: (current?.totalBytes ?? 0) + blob.size,
          durationSeconds: current?.durationSeconds ?? null,
          finalBlob: current?.finalBlob ?? null,
        };

        const chunk: RecordingChunkRecord = {
          sessionId,
          sequence,
          blob,
          size: blob.size,
          mimeType: blob.type || mimeType,
          createdAt,
        };

        const chunkRequest = chunkStore.add(chunk);
        chunkRequest.onerror = () => reject(chunkRequest.error ?? new Error("Unable to persist the recording chunk."));
        chunkRequest.onsuccess = () => {
          const sessionRequest = sessionStore.put(nextSession);
          sessionRequest.onerror = () => reject(sessionRequest.error ?? new Error("Unable to persist recording metadata."));
          sessionRequest.onsuccess = () => resolve();
        };
      };
    });
  });

  logRecordingStoreEvent("chunk_saved", { sessionId, sequence, size: blob.size, mimeType });
}

export async function finalizeRecordingSession(
  sessionId: string,
  details: { fileName: string; mimeType: string; durationSeconds: number; finalBlob: Blob },
) {
  const current = await getSessionSnapshot(sessionId);
  if (!current) {
    return null;
  }

  const nextSession: RecordingDraftSession = {
    ...current,
    fileName: details.fileName,
    mimeType: details.mimeType,
    durationSeconds: details.durationSeconds,
    finalBlob: details.finalBlob,
    status: "finalized",
    updatedAt: Date.now(),
  };

  await runTransaction<void>([SESSION_STORE], "readwrite", (tx) => {
    const store = tx.objectStore(SESSION_STORE);
    return new Promise((resolve, reject) => {
      const request = store.put(nextSession);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Unable to finalize the recording session."));
    });
  });

  logRecordingStoreEvent("session_finalized", {
    sessionId,
    chunkCount: nextSession.chunkCount,
    totalBytes: nextSession.totalBytes,
    durationSeconds: nextSession.durationSeconds,
    fileName: nextSession.fileName,
  });
  setPendingRecordingPointer(nextSession.callId, nextSession.sessionId, nextSession.status);

  return nextSession;
}

export async function buildRecordingFile(sessionId: string) {
  const session = await getSessionSnapshot(sessionId);
  if (!session) {
    return null;
  }

  if (session.finalBlob) {
    const finalFile = new File([session.finalBlob], session.fileName, {
      type: session.mimeType || session.finalBlob.type || "video/webm",
    });
    return { session, file: finalFile };
  }

  const chunks = await listChunks(sessionId);
  if (!chunks.length) {
    return null;
  }

  const ordered = [...chunks].sort((left, right) => left.sequence - right.sequence);
  const blob = new Blob(ordered.map((chunk) => chunk.blob), {
    type: session.mimeType || ordered[0]?.mimeType || "video/webm",
  });
  const file = new File([blob], session.fileName, {
    type: blob.type || "video/webm",
  });

  return { session, file };
}

export async function clearRecordingSession(sessionId: string) {
  ensureBrowser();

  const current = await getSessionSnapshot(sessionId);

  await runTransaction<void>([SESSION_STORE, CHUNK_STORE], "readwrite", (tx) => {
    const sessionStore = tx.objectStore(SESSION_STORE);
    const chunkStore = tx.objectStore(CHUNK_STORE);
    return new Promise((resolve, reject) => {
      const deleteSessionRequest = sessionStore.delete(sessionId);
      deleteSessionRequest.onerror = () => reject(deleteSessionRequest.error ?? new Error("Unable to delete the recording session."));
      deleteSessionRequest.onsuccess = () => {
        const index = chunkStore.index("by_session");
        const rangeRequest = index.getAllKeys(IDBKeyRange.only(sessionId));
        rangeRequest.onerror = () => reject(rangeRequest.error ?? new Error("Unable to delete the recording chunks."));
        rangeRequest.onsuccess = () => {
          const keys = (rangeRequest.result as IDBValidKey[]) ?? [];
          if (!keys.length) {
            resolve();
            return;
          }

          let remaining = keys.length;
          for (const key of keys) {
            const deleteChunkRequest = chunkStore.delete(key);
            deleteChunkRequest.onerror = () => reject(deleteChunkRequest.error ?? new Error("Unable to delete the recording chunks."));
            deleteChunkRequest.onsuccess = () => {
              remaining -= 1;
              if (remaining === 0) resolve();
            };
          }
        };
      };
    });
  });

  setPendingRecordingPointer(current?.callId ?? null, null);
  logRecordingStoreEvent("session_cleared", { sessionId });
}

export function setPendingRecordingPointer(callId: string | null, sessionId: string | null, status: RecordingDraftStatus | null = null) {
  if (typeof window === "undefined") return;

  const key = `${PENDING_COMPLETION_PREFIX}${callId ?? "unknown"}`;
  if (!sessionId) {
    window.localStorage.removeItem(key);
    emitRecordingStoreChange();
    return;
  }

    window.localStorage.setItem(
    key,
    JSON.stringify({
      callId,
      sessionId,
      status,
      updatedAt: Date.now(),
    }),
  );
  emitRecordingStoreChange();
}

export function getPendingRecordingPointer(callId: string | null) {
  if (typeof window === "undefined") return null;

  const key = `${PENDING_COMPLETION_PREFIX}${callId ?? "unknown"}`;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as { callId: string | null; sessionId: string; status?: RecordingDraftStatus | null; updatedAt: number };
  } catch {
    return null;
  }
}


export function subscribeRecordingStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}