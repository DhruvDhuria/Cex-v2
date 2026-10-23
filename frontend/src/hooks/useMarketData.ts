import React from "react";
import { wsChannel } from "@/lib/api";
import { useStreamSubscription } from "@/lib/wsClient";
import { parseTrade, type TradePayload } from "@/lib/streamPayloads";

export interface Trade {
  price: number;
  qty: number;
  ts: number;
}

export type TradeListener = (trade: TradePayload) => void;
export type SubscribeToTrades = (listener: TradeListener) => () => void;

const MAX_TRADES = 50;

export function useMarketData(symbol: string): {
  trades: Trade[];
  lastPrice: number | null;
  subscribeToTrades: SubscribeToTrades;
} {
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [lastPrice, setLastPrice] = React.useState<number | null>(null);
  const listeners = React.useRef(new Set<TradeListener>());

  const subscribeToTrades = React.useCallback<SubscribeToTrades>((listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const handleTrade = React.useCallback((raw: string) => {
    const data = parseTrade(raw);
    if (!data) return;

    setLastPrice(data.price);
    setTrades((prev) =>
      [{ ...data, ts: Date.now() }, ...prev].slice(0, MAX_TRADES),
    );
    listeners.current.forEach((listener) => {
      try {
        listener(data);
      } catch {
        // A broken listener must not stop the others.
      }
    });
  }, []);

  useStreamSubscription(wsChannel(symbol, "trades"), handleTrade);

  React.useEffect(() => {
    setTrades([]);
    setLastPrice(null);
  }, [symbol]);

  return { trades, lastPrice, subscribeToTrades };
}
