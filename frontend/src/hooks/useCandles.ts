import React, { useEffect, useRef, useState } from "react";
import type {
  CandlestickData,
  HistogramData,
  UTCTimestamp,
} from "lightweight-charts";
import { fetchTradeHistory, type TradeRecord } from "@/lib/api";
import type { TradePayload } from "@/lib/streamPayloads";
import type { SubscribeToTrades } from "@/hooks/useMarketData";

export type CandleInterval = "1s" | "1m" | "5m";

export const CANDLE_INTERVALS: readonly CandleInterval[] = ["1s", "1m", "5m"];

export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1s": 1,
  "1m": 60,
  "5m": 300,
};

const UP_VOLUME_COLOR = "rgba(38, 166, 154, 0.5)";
const DOWN_VOLUME_COLOR = "rgba(239, 83, 80, 0.5)";

const STORAGE_PREFIX = "cex_candles";
const MAX_CACHED_BARS = 500;
const PERSIST_DEBOUNCE_MS = 300;

interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function storageKey(symbol: string, interval: CandleInterval): string {
  return `${STORAGE_PREFIX}:${symbol.toUpperCase()}:${interval}`;
}

function bucketFor(tsMs: number, interval: CandleInterval): number {
  const step = INTERVAL_SECONDS[interval];
  return Math.floor(Math.floor(tsMs / 1000) / step) * step;
}

/** Folds a single trade into the bar map, preserving ascending bucket order. */
function applyTrade(
  bars: Map<number, Bar>,
  lastBucket: number | null,
  trade: { price: number; qty: number; ts?: number },
  interval: CandleInterval,
): number | null {
  const bucket = bucketFor(trade.ts ?? Date.now(), interval);

  const existing = bars.get(bucket);
  if (existing) {
    existing.high = Math.max(existing.high, trade.price);
    existing.low = Math.min(existing.low, trade.price);
    existing.close = trade.price;
    existing.volume += trade.qty;
    return lastBucket;
  }

  // Drop late/out-of-order trades: series times must stay ascending.
  if (lastBucket !== null && bucket < lastBucket) return lastBucket;

  bars.set(bucket, {
    open: trade.price,
    high: trade.price,
    low: trade.price,
    close: trade.price,
    volume: trade.qty,
  });
  return bucket;
}

function barsFromTrades(
  trades: TradeRecord[],
  interval: CandleInterval,
): Map<number, Bar> {
  const bars = new Map<number, Bar>();
  let lastBucket: number | null = null;
  for (const trade of trades) {
    if (!(trade.price > 0) || !(trade.qty > 0)) continue;
    lastBucket = applyTrade(bars, lastBucket, trade, interval);
  }
  return bars;
}

/**
 * Merges freshly fetched history with the local cache.
 *
 * History wins for every bucket it covers; cached bars older than the fetched
 * window are kept. This avoids double-counting volume for overlapping trades.
 */
function mergeHistory(
  cached: Map<number, Bar>,
  history: Map<number, Bar>,
): Map<number, Bar> {
  if (history.size === 0) return cached;

  let earliest = Infinity;
  for (const time of history.keys()) {
    if (time < earliest) earliest = time;
  }

  const merged = new Map<number, Bar>();
  for (const [time, bar] of cached) {
    if (time < earliest) merged.set(time, bar);
  }
  for (const [time, bar] of history) {
    merged.set(time, bar);
  }
  return merged;
}

function lastBucketOf(bars: Map<number, Bar>): number | null {
  let last: number | null = null;
  for (const time of bars.keys()) {
    if (last === null || time > last) last = time;
  }
  return last;
}

function toSeries(bars: Map<number, Bar>): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
} {
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];

  const sorted = [...bars.entries()].sort((a, b) => a[0] - b[0]);
  for (const [time, bar] of sorted) {
    candles.push({
      time: time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    });
    volumes.push({
      time: time as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? UP_VOLUME_COLOR : DOWN_VOLUME_COLOR,
    });
  }
  return { candles, volumes };
}

function loadCachedBars(
  symbol: string,
  interval: CandleInterval,
): Map<number, Bar> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(symbol, interval));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Array<{ time: number } & Bar>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const bars = new Map<number, Bar>();
    for (const item of parsed) {
      if (
        !Number.isFinite(item.time) ||
        !Number.isFinite(item.open) ||
        !Number.isFinite(item.high) ||
        !Number.isFinite(item.low) ||
        !Number.isFinite(item.close) ||
        !Number.isFinite(item.volume)
      ) {
        continue;
      }
      bars.set(item.time, {
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      });
    }
    return bars.size > 0 ? bars : null;
  } catch {
    return null;
  }
}

function saveCachedBars(
  symbol: string,
  interval: CandleInterval,
  bars: Map<number, Bar>,
): void {
  if (typeof window === "undefined") return;
  try {
    const sorted = [...bars.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-MAX_CACHED_BARS);
    window.localStorage.setItem(
      storageKey(symbol, interval),
      JSON.stringify(sorted.map(([time, bar]) => ({ time, ...bar }))),
    );
  } catch {
    // Storage can be full or disabled; the live chart still works.
  }
}

/**
 * Aggregates trades into OHLCV candles backed by two sources:
 *  - the backend's `/trades/:symbol` history (Redis stream replay), and
 *  - a localStorage cache so a refresh paints instantly.
 */
export function useCandles(
  symbol: string,
  interval: CandleInterval,
  subscribeToTrades: SubscribeToTrades,
): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
} {
  const [candles, setCandles] = useState<CandlestickData<UTCTimestamp>[]>([]);
  const [volumes, setVolumes] = useState<HistogramData<UTCTimestamp>[]>([]);
  const barsRef = useRef(new Map<number, Bar>());
  const lastBucketRef = useRef<number | null>(null);
  const hydratingRef = useRef(false);
  const pendingRef = useRef<TradePayload[]>([]);

  // Load history (cache first, then the server) for the current symbol/interval.
  useEffect(() => {
    let cancelled = false;

    const cached = loadCachedBars(symbol, interval) ?? new Map<number, Bar>();
    barsRef.current = cached;
    lastBucketRef.current = lastBucketOf(cached);
    hydratingRef.current = true;
    pendingRef.current = [];

    const initial = toSeries(cached);
    setCandles(initial.candles);
    setVolumes(initial.volumes);

    void (async () => {
      try {
        const history = await fetchTradeHistory(symbol);
        if (cancelled) return;

        const merged = mergeHistory(
          barsRef.current,
          barsFromTrades(history, interval),
        );

        let lastBucket = lastBucketOf(merged);
        for (const trade of pendingRef.current) {
          lastBucket = applyTrade(merged, lastBucket, trade, interval);
        }
        pendingRef.current = [];

        barsRef.current = merged;
        lastBucketRef.current = lastBucket;

        const series = toSeries(merged);
        setCandles(series.candles);
        setVolumes(series.volumes);
        saveCachedBars(symbol, interval, merged);
      } catch {
        if (cancelled) return;

        // Keep whatever cache we have, but still apply queued live trades.
        let lastBucket = lastBucketRef.current;
        for (const trade of pendingRef.current) {
          lastBucket = applyTrade(barsRef.current, lastBucket, trade, interval);
        }
        pendingRef.current = [];
        lastBucketRef.current = lastBucket;

        const series = toSeries(barsRef.current);
        setCandles(series.candles);
        setVolumes(series.volumes);
        saveCachedBars(symbol, interval, barsRef.current);
      } finally {
        if (!cancelled) hydratingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  const handleTrade = React.useCallback(
    (data: TradePayload) => {
      if (!(data.price > 0) || !(data.qty > 0)) return;

      // Trades arriving while history loads must not be lost on the rebuild.
      if (hydratingRef.current) {
        pendingRef.current.push(data);
        return;
      }

      lastBucketRef.current = applyTrade(
        barsRef.current,
        lastBucketRef.current,
        data,
        interval,
      );

      const next = toSeries(barsRef.current);
      setCandles(next.candles);
      setVolumes(next.volumes);
    },
    [interval],
  );

  useEffect(
    () => subscribeToTrades(handleTrade),
    [subscribeToTrades, handleTrade],
  );

  // Debounced persistence so every trade does not hit localStorage.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydratingRef.current) return;
      saveCachedBars(symbol, interval, barsRef.current);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [candles, volumes, symbol, interval]);

  return { candles, volumes };
}
