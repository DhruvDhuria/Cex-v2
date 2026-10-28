import React from "react";
import { wsChannel } from "@/lib/api";
import { useStreamSubscription } from "@/lib/wsClient";
import { parseTrade, parseTradeSnapshot, type TradePayload } from "@/lib/streamPayloads";

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
    const snapshot = parseTradeSnapshot(raw);
    if (snapshot) {
      if (snapshot.length > 0) {
        const tsNow = Date.now();
        const normalized = snapshot.slice(0, MAX_TRADES).map((t, i) => ({
          price: t.price,
          qty: t.qty,
          ts: t.ts ?? tsNow - i,
        }));
        setTrades(normalized);
        setLastPrice(normalized[0]!.price);
      }
      return;
    }

    const data = parseTrade(raw);
    if (!data) return;

    setLastPrice(data.price);
    setTrades((prev) => {
      const ts = data.ts ?? Date.now();
      const next = [{ ...data, ts }, ...prev];
      return next.slice(0, MAX_TRADES);
    });
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
