import React from "react";
import { fetchDepth, wsChannel, type DepthLevel } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";

export interface DepthState {
  asks: DepthLevel[];
  bids: DepthLevel[];
  lastPrice: number | null;
}

interface TradePayload {
  price: number;
  qty: number;
}

export function useDepth(symbol: string): { depth: DepthState | null; loading: boolean; error: string | null } {
  const [depth, setDepth] = React.useState<DepthState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { messages } = useWebSocket([
    wsChannel(symbol, "depth"),
    wsChannel(symbol, "trades"),
  ]);

  const refetch = React.useCallback(async () => {
    try {
      const data = await fetchDepth(symbol);
      setDepth((prev) => ({
        asks: data.asks,
        bids: data.bids,
        lastPrice: prev?.lastPrice ?? null,
      }));
      setError(null);
    } catch {
      setError("Failed to load orderbook");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  React.useEffect(() => {
    setLoading(true);
    setDepth(null);
    setError(null);
    void refetch();
  }, [refetch]);

  const lastMessage = messages[messages.length - 1];
  const lastMessageJson = JSON.stringify(lastMessage);

  const refetchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!lastMessage) return;
    const stream = lastMessage.stream;

    if (stream === wsChannel(symbol, "depth")) {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => void refetch(), 250);
    } else if (stream === wsChannel(symbol, "trades")) {
      const data = JSON.parse(lastMessage.raw) as TradePayload;
      if (typeof data.price === "number") {
        setDepth((prev) => (prev ? { ...prev, lastPrice: data.price } : prev));
      }
    }
  }, [lastMessageJson]);

  return { depth, loading, error };
}