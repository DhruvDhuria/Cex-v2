import React from "react";
import { fetchDepth, wsChannel } from "@/lib/api";
import { subscribeStatus, useStreamSubscription } from "@/lib/wsClient";
import { parseDepth } from "@/lib/streamPayloads";

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthState {
  asks: DepthLevel[];
  bids: DepthLevel[];
  lastPrice: number | null;
}

interface Book {
  asks: Map<number, number>;
  bids: Map<number, number>;
}

function emptyBook(): Book {
  return { asks: new Map(), bids: new Map() };
}

function applyLevels(target: Map<number, number>, levels: DepthLevel[]): boolean {
  let changed = false;
  for (const level of levels) {
    if (level.qty <= 0) {
      if (target.delete(level.price)) changed = true;
    } else if (target.get(level.price) !== level.qty) {
      target.set(level.price, level.qty);
      changed = true;
    }
  }
  return changed;
}

export function useDepth(symbol: string, lastPrice: number | null): {
  depth: DepthState | null;
  loading: boolean;
  error: string | null;
} {
  const [book, setBook] = React.useState<Book>(emptyBook);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Snapshot of the book over REST. Also used to resync after a reconnect.
  const refetch = React.useCallback(async () => {
    try {
      const data = await fetchDepth(symbol);
      const asks = new Map<number, number>();
      const bids = new Map<number, number>();
      for (const level of data.asks ?? []) {
        if (level.qty > 0) asks.set(level.price, level.qty);
      }
      for (const level of data.bids ?? []) {
        if (level.qty > 0) bids.set(level.price, level.qty);
      }
      setBook({ asks, bids });
      setError(null);
    } catch {
      setError("Failed to load orderbook");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  React.useEffect(() => {
    setBook(emptyBook());
    setLoading(true);
    setError(null);
    void refetch();
  }, [refetch]);

  // The depth stream carries absolute quantities per level, so the local book
  // is kept in sync without polling the REST endpoint.
  const handleDepth = React.useCallback((raw: string) => {
    const payload = parseDepth(raw);
    if (!payload) return;

    setBook((prev) => {
      const asks = new Map(prev.asks);
      const bids = new Map(prev.bids);
      const asksChanged = applyLevels(asks, payload.asks);
      const bidsChanged = applyLevels(bids, payload.bids);
      return asksChanged || bidsChanged ? { asks, bids } : prev;
    });
  }, []);

  useStreamSubscription(wsChannel(symbol, "depth"), handleDepth);

  // Resync from REST whenever the socket (re)connects so nothing stays stale.
  React.useEffect(
    () =>
      subscribeStatus((status) => {
        if (status === "open") void refetch();
      }),
    [refetch],
  );

  const depth = React.useMemo<DepthState | null>(() => {
    if (loading) return null;
    return {
      asks: [...book.asks.entries()]
        .map(([price, qty]) => ({ price, qty }))
        .sort((a, b) => a.price - b.price),
      bids: [...book.bids.entries()]
        .map(([price, qty]) => ({ price, qty }))
        .sort((a, b) => b.price - a.price),
      lastPrice,
    };
  }, [book, lastPrice, loading]);

  return { depth, loading, error };
}
