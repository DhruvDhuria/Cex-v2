import React from "react";

export interface WsStreamMessage {
  stream: string;
  /** Inner payload JSON string; JSON.parse before use. */
  raw: string;
}

const WS_URL = "ws://localhost:8080";

export function useWebSocket(channels: string[]) {
  const [messages, setMessages] = React.useState<WsStreamMessage[]>([]);

  React.useEffect(() => {
    if (channels.length === 0) return;

    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const socket = new WebSocket(WS_URL);
      ws = socket;

      socket.onopen = () => {
        const params = [...new Set(channels)];
        socket.send(JSON.stringify({ method: "SUBSCRIBE", params }));
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as { stream?: string; data?: string };
          const msg: WsStreamMessage = { stream: parsed.stream ?? "", raw: parsed.data ?? "" };
          setMessages((prev) => {
            if (prev.length > 200) prev = prev.slice(prev.length - 200);
            return [...prev, msg];
          });
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => socket.close();
      socket.onclose = () => {
        ws = null;
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [JSON.stringify(channels)]);

  return { messages };
}