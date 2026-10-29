import React from "react";

export type WsStatus = "connecting" | "open" | "closed";

/** Receives the inner payload of a frame, always as a JSON string. */
export type MessageHandler = (raw: string) => void;
export type StatusHandler = (status: WsStatus) => void;

const WS_URL = "ws://localhost:8080";
const RECONNECT_MS = 2000;

/**
 * A single WebSocket shared by the whole app.
 *
 * Every hook used to open its own socket and read only the *last* message of a
 * buffer, so a frame that was not the newest one was silently dropped and a
 * depth push arriving after a trades push hid the trade from the other hooks.
 * Here each frame is dispatched straight to the handlers registered for its
 * channel, as soon as it arrives.
 */
const handlers = new Map<string, Set<MessageHandler>>();
const statusHandlers = new Set<StatusHandler>();
const channels = new Set<string>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let status: WsStatus = "closed";
let closedByUser = false;

function setStatus(next: WsStatus) {
  status = next;
  statusHandlers.forEach((handler) => handler(next));
}

function sendSubscribe(channel: string) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ method: "SUBSCRIBE", params: [channel] }));
}

function connect() {
  if (socket && socket.readyState !== WebSocket.CLOSED) return;

  setStatus("connecting");
  const ws = new WebSocket(WS_URL);
  socket = ws;

  ws.onopen = () => {
    setStatus("open");
    if (channels.size > 0) {
      ws.send(
        JSON.stringify({ method: "SUBSCRIBE", params: [...channels] }),
      );
    }
  };

  ws.onmessage = (event) => {
    let parsed: { stream?: string; data?: unknown };
    try {
      parsed = JSON.parse(String(event.data)) as { stream?: string; data?: unknown };
    } catch {
      return;
    }
    if (!parsed.stream) return;

    // `data` is a JSON string on every channel; normalise just in case.
    const raw =
      typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data);

    handlers.get(parsed.stream)?.forEach((handler) => {
      try {
        handler(raw);
      } catch {
        // a broken handler must not kill the socket
      }
    });
  };

  ws.onerror = () => ws.close();

  ws.onclose = () => {
    socket = null;
    setStatus("closed");
    if (!closedByUser) {
      reconnectTimer = setTimeout(connect, RECONNECT_MS);
    }
  };
}

export function subscribe(channel: string, handler: MessageHandler): () => void {
  let bucket = handlers.get(channel);
  if (!bucket) {
    bucket = new Set<MessageHandler>();
    handlers.set(channel, bucket);
  }

  const isNewChannel = !channels.has(channel);
  bucket.add(handler);
  channels.add(channel);

  if (isNewChannel) {
    sendSubscribe(channel);
  }
  if (!socket) {
    connect();
  }

  return () => {
    const current = handlers.get(channel);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) {
      handlers.delete(channel);
      channels.delete(channel);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ method: "UNSUBSCRIBE", params: [channel] }),
        );
      }
    }
  };
}

export function subscribeStatus(handler: StatusHandler): () => void {
  statusHandlers.add(handler);
  handler(status);
  return () => {
    statusHandlers.delete(handler);
  };
}

/**
 * Subscribes to a channel for the lifetime of the component.
 * The handler is kept in a ref so it can change every render without
 * tearing down the subscription.
 */
export function useStreamSubscription(
  channel: string,
  handler: MessageHandler,
): void {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(
    () => subscribe(channel, (raw) => handlerRef.current(raw)),
    [channel],
  );
}
