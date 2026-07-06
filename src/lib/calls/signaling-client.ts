export type CallSignalEnvelope = {
  id: string;
  callId: string;
  sequence: number;
  senderId: string;
  type: "join" | "offer" | "answer" | "candidate" | "hangup";
  payload: unknown;
  createdAt: number;
};

export type CreateCallResponse = {
  callId: string;
  inviteUrl: string;
};

function getOrigin() {
  return typeof window === "undefined" ? "server" : window.location.origin;
}

function logSignalApiEvent(step: string, details: Record<string, unknown>) {
  console.info("[CALL SIGNAL API]", JSON.stringify({ step, at: new Date().toISOString(), origin: getOrigin(), ...details }));
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function createCallRoom() {
  logSignalApiEvent("create_call_request", { requestUrl: "/api/calls" });
  const response = await fetch("/api/calls", { method: "POST" });
  const bodyText = await response.clone().text();
  logSignalApiEvent("create_call_response", {
    requestUrl: "/api/calls",
    status: response.status,
    ok: response.ok,
    body: bodyText,
  });
  if (!response.ok) {
    throw new Error("Unable to create a call room.");
  }

  return await parseJson<CreateCallResponse>(response);
}

export async function getCallRoomInfo(callId: string) {
  const requestUrl = `/api/calls/${encodeURIComponent(callId)}`;
  logSignalApiEvent("get_call_room_request", { callId, requestUrl });
  const response = await fetch(requestUrl);
  if (response.status === 404) {
    logSignalApiEvent("get_call_room_missing", { callId, requestUrl });
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to load the call room.");
  }

  const body = await parseJson<{ callId: string; createdAt: number; updatedAt: number; endedAt: number | null; messageCount: number }>(response);
  logSignalApiEvent("get_call_room_response", { callId, requestUrl, messageCount: body.messageCount, endedAt: body.endedAt });
  return body;
}

export async function sendCallSignal(callId: string, message: Omit<CallSignalEnvelope, "id" | "callId" | "sequence" | "createdAt">) {
  const requestUrl = `/api/calls/${encodeURIComponent(callId)}/signal`;
  logSignalApiEvent("send_signal_request", { callId, requestUrl, type: message.type });
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    logSignalApiEvent("send_signal_failed", { callId, requestUrl, type: message.type, status: response.status });
    throw new Error("Unable to send call signaling data.");
  }

  const body = await parseJson<{ ok: true }>(response);
  logSignalApiEvent("send_signal_response", { callId, requestUrl, type: message.type, ok: body.ok });
  return body;
}

export async function fetchCallSignals(callId: string, since = 0) {
  const requestUrl = `/api/calls/${encodeURIComponent(callId)}/signal?since=${since}`;
  logSignalApiEvent("poll_signals_request", { callId, requestUrl, since });
  const response = await fetch(requestUrl);
  if (!response.ok) {
    logSignalApiEvent("poll_signals_failed", { callId, requestUrl, since, status: response.status });
    throw new Error("Unable to read call signaling data.");
  }

  const body = await parseJson<{ messages: CallSignalEnvelope[]; roomEnded: boolean }>(response);
  logSignalApiEvent("poll_signals_response", {
    callId,
    requestUrl,
    since,
    messageCount: body.messages.length,
    roomEnded: body.roomEnded,
  });
  return body;
}