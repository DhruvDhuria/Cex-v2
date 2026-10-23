import React, { useEffect, useRef, useState } from "react";
import type {
  CandlestickData,
  HistogramData,
  UTCTimestamp,
} from "lightweight-charts";
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

// TODO(dummy): remove once a real /klines history endpoint exists.
// Temporary seed so the chart paints immediately for visual verification.
const SEED_CANDLE_COUNT = 60;
const SEED_BASE_PRICE: Record<string, number> = {
  BTC: 67234,
  ETH: 3521,
  SOL: 171,
};

function buildSeedBars(symbol: string, interval: CandleInterval): Map<number, Bar> {
  const bars = new Map<number, Bar>();
  const step = INTERVAL_SECONDS[interval];
  const base = SEED_BASE_PRICE[symbol] ?? 100;
  const lastBucket = Math.floor(Math.floor(Date.now() / 1000) / step) * step;
  let price = base;
  for (let i = SEED_CANDLE_COUNT - 1; i >= 0; i--) {
    const drift = (Math.random() - 0.5) * 0.003 * base;
    const open = price;
    const close = Math.max(open + drift, base * 0.01);
    const high = Math.max(open, close) + Math.random() * 0.001 * base;
    const low = Math.max(Math.min(open, close) - Math.random() * 0.001 * base, base * 0.01);
    bars.set(lastBucket - i * step, {
      open,
      high,
      low,
      close,
      volume: Math.random() * 2 + 0.1,
    });
    price = close;
  }
  return bars;
}

function toSeries(bars: Map<number, Bar>): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
} {
  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];
  for (const [time, bar] of bars) {
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

interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Aggregates the live `trades.*` websocket stream into OHLCV candles.
 * Buckets are UTCTimestamps in seconds; arrays stay ascending with unique times.
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

  // Reset aggregation when symbol or interval changes (reseeds dummy history).
  useEffect(() => {
    const seed = buildSeedBars(symbol, interval);
    barsRef.current = seed;
    const buckets = [...seed.keys()];
    lastBucketRef.current = buckets[buckets.length - 1] ?? null;
    const series = toSeries(seed);
    setCandles(series.candles);
    setVolumes(series.volumes);
  }, [symbol, interval]);

  const handleTrade = React.useCallback(
    (data: TradePayload) => {
      if (!(data.price > 0) || !(data.qty > 0)) return;

      const bucket =
        Math.floor(
          Math.floor(Date.now() / 1000) / INTERVAL_SECONDS[interval],
        ) * INTERVAL_SECONDS[interval];

      const existing = barsRef.current.get(bucket);
      if (existing) {
        existing.high = Math.max(existing.high, data.price);
        existing.low = Math.min(existing.low, data.price);
        existing.close = data.price;
        existing.volume += data.qty;
      } else {
        // Drop late/out-of-order trades: series times must stay ascending.
        if (lastBucketRef.current !== null && bucket < lastBucketRef.current) return;
        barsRef.current.set(bucket, {
          open: data.price,
          high: data.price,
          low: data.price,
          close: data.price,
          volume: data.qty,
        });
        lastBucketRef.current = bucket;
      }

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

  return { candles, volumes };
}
