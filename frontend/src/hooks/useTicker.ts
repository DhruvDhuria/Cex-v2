import React from "react";
import { wsChannel } from "@/lib/api";
import { useStreamSubscription } from "@/lib/wsClient";
import { parseTicker, type TickerPayload } from "@/lib/streamPayloads";

export type TickerStats = TickerPayload;

/**
 * Rolling 24h statistics for a market, computed server side by the
 * ws-server ticker manager and pushed on the `ticker.<PAIR>_USD` channel.
 *
 * The window covers "since the ws-server started" and resets on restart.
 */
export function useTicker(symbol: string): TickerStats | null {
  const [ticker, setTicker] = React.useState<TickerStats | null>(null);

  const handleTicker = React.useCallback((raw: string) => {
    const payload = parseTicker(raw);
    if (!payload) return;
    setTicker(payload);
  }, []);

  useStreamSubscription(wsChannel(symbol, "ticker"), handleTicker);

  React.useEffect(() => {
    setTicker(null);
  }, [symbol]);

  return ticker;
}
