import React from "react";
import { wsChannel } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";

export interface Trade {
  price: number;
  qty: number;
  ts: number;
}

interface TradePayload {
  price: number;
  qty: number;
}

const MAX_TRADES = 50;

export function useTrades(symbol: string): { trades: Trade[] } {
  const { messages } = useWebSocket([wsChannel(symbol, "trades")]);

  const [trades, setTrades] = React.useState<Trade[]>([]);

  const lastMessageJson = JSON.stringify(messages[messages.length - 1]);

  React.useEffect(() => {
    setTrades([]);
  }, [symbol]);

  React.useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.stream !== wsChannel(symbol, "trades")) return;

    let data: TradePayload;
    try {
      data = JSON.parse(last.raw) as TradePayload;
    } catch {
      return;
    }
    if (typeof data.price !== "number" || typeof data.qty !== "number") return;

    const trade: Trade = { price: data.price, qty: data.qty, ts: Date.now() };
    setTrades((prev) => [trade, ...prev].slice(0, MAX_TRADES));
  }, [lastMessageJson]);

  return { trades };
}