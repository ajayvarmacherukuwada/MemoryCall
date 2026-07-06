"use client";

import { useEffect, useState } from "react";
import type { MemoryArchiveProviderState, MemoryArchiveRecord } from "@/lib/memory-archive/types";

const LIBRARY_STORAGE_KEY = "letscall.memory-archive.library.v2";
const PROVIDER_STATE_STORAGE_KEY = "letscall.memory-archive.provider.v2";
const LIBRARY_EVENT_NAME = "letscall:memory-archive-library-changed";
const PROVIDER_EVENT_NAME = "letscall:memory-archive-provider-changed";

function emitEvent(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(name));
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readMemoryArchive() {
  if (typeof window === "undefined") return [] as MemoryArchiveRecord[];
  return safeParse<MemoryArchiveRecord[]>(window.localStorage.getItem(LIBRARY_STORAGE_KEY), []);
}

export function writeMemoryArchive(records: MemoryArchiveRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(records));
  emitEvent(LIBRARY_EVENT_NAME);
}

export function upsertMemoryArchiveRecord(record: MemoryArchiveRecord) {
  const current = readMemoryArchive();
  const next = [record, ...current.filter((item) => item.archiveId !== record.archiveId)];
  writeMemoryArchive(next);
}

export function updateMemoryArchiveRecord(archiveId: string, updater: (record: MemoryArchiveRecord) => MemoryArchiveRecord) {
  const current = readMemoryArchive();
  const next = current.map((record) => (record.archiveId === archiveId ? updater(record) : record));
  writeMemoryArchive(next);
}

export function removeMemoryArchiveRecord(archiveId: string) {
  const current = readMemoryArchive();
  writeMemoryArchive(current.filter((record) => record.archiveId !== archiveId));
}

export function readArchiveProviderStates() {
  if (typeof window === "undefined") return [] as MemoryArchiveProviderState[];
  return safeParse<MemoryArchiveProviderState[]>(window.localStorage.getItem(PROVIDER_STATE_STORAGE_KEY), []);
}

export function writeArchiveProviderStates(states: MemoryArchiveProviderState[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROVIDER_STATE_STORAGE_KEY, JSON.stringify(states));
  emitEvent(PROVIDER_EVENT_NAME);
}

export function upsertArchiveProviderState(state: MemoryArchiveProviderState) {
  const current = readArchiveProviderStates();
  const next = [state, ...current.filter((item) => item.archiveId !== state.archiveId)];
  writeArchiveProviderStates(next);
}

export function removeArchiveProviderState(archiveId: string) {
  const current = readArchiveProviderStates();
  writeArchiveProviderStates(current.filter((state) => state.archiveId !== archiveId));
}

export function getArchiveProviderState(archiveId: string) {
  return readArchiveProviderStates().find((state) => state.archiveId === archiveId) ?? null;
}

export function subscribeMemoryArchive(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === LIBRARY_STORAGE_KEY || event.key === PROVIDER_STATE_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(LIBRARY_EVENT_NAME, listener);
  window.addEventListener(PROVIDER_EVENT_NAME, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LIBRARY_EVENT_NAME, listener);
    window.removeEventListener(PROVIDER_EVENT_NAME, listener);
  };
}

export function useMemoryArchive() {
  const [archive, setArchive] = useState<MemoryArchiveRecord[]>([]);

  useEffect(() => {
    const syncArchive = () => setArchive(readMemoryArchive());
    syncArchive();
    return subscribeMemoryArchive(syncArchive);
  }, []);

  return archive;
}

export function useArchiveProviderStates() {
  const [states, setStates] = useState<MemoryArchiveProviderState[]>([]);

  useEffect(() => {
    const syncStates = () => setStates(readArchiveProviderStates());
    syncStates();
    return subscribeMemoryArchive(syncStates);
  }, []);

  return states;
}