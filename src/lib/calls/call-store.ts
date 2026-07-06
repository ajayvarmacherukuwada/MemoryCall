import type { CallRoomInfo, CallRoomRecord, CallSignalMessage } from "@/lib/calls/types";

const CALL_ROOM_TTL_MS = 1000 * 60 * 60 * 6;

function getStore() {
  const globalAny = globalThis as typeof globalThis & {
    __letscallCallRooms?: Map<string, CallRoomRecord>;
  };

  if (!globalAny.__letscallCallRooms) {
    globalAny.__letscallCallRooms = new Map<string, CallRoomRecord>();
  }

  return globalAny.__letscallCallRooms;
}

function now() {
  return Date.now();
}

function purgeExpiredRooms(store: Map<string, CallRoomRecord>) {
  const cutoff = now() - CALL_ROOM_TTL_MS;
  for (const [callId, room] of store.entries()) {
    if (room.updatedAt < cutoff) {
      store.delete(callId);
    }
  }
}

export function createCallRoomRecord(callId: string): CallRoomRecord {
  const room: CallRoomRecord = {
    callId,
    createdAt: now(),
    updatedAt: now(),
    endedAt: null,
    nextSequence: 1,
    messages: [],
  };

  const store = getStore();
  store.set(callId, room);
  purgeExpiredRooms(store);
  return room;
}

export function getCallRoomRecord(callId: string) {
  const store = getStore();
  purgeExpiredRooms(store);
  return store.get(callId) ?? null;
}

export function appendCallSignalMessage(message: Omit<CallSignalMessage, "sequence">) {
  const store = getStore();
  const room = store.get(message.callId);
  if (!room) {
    return null;
  }

  const envelope: CallSignalMessage = {
    ...message,
    sequence: room.nextSequence++,
  };

  room.updatedAt = now();
  room.messages = [...room.messages.slice(-199), envelope];

  if (message.type === "hangup") {
    room.endedAt = room.endedAt ?? message.createdAt;
  }

  store.set(message.callId, room);
  purgeExpiredRooms(store);
  return room;
}

export function listCallMessages(callId: string, since = 0) {
  const room = getCallRoomRecord(callId);
  if (!room) {
    return [] as CallSignalMessage[];
  }

  return room.messages.filter((message) => message.sequence > since);
}

export function getCallRoomInfo(callId: string): CallRoomInfo | null {
  const room = getCallRoomRecord(callId);
  if (!room) {
    return null;
  }

  return {
    callId: room.callId,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    endedAt: room.endedAt,
    messageCount: room.messages.length,
  };
}

export function removeCallRoom(callId: string) {
  const store = getStore();
  store.delete(callId);
}

