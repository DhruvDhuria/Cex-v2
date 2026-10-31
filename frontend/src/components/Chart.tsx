import React, {useRef, useEffect, useState} from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  createTextWatermark,
} from "lightweight-charts";
import type {
  IChartApi,
  IPanePrimitive,
  ISeriesApi,
  ITextWatermarkPluginApi,
  Time,
} from "lightweight-charts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CANDLE_INTERVALS,
  useCandles,
  type CandleInterval,
} from "@/hooks/useCandles";
import { quotePair } from "@/lib/api";
import type { SubscribeToTrades } from "@/hooks/useMarketData";
import { getThemeColor } from "@/lib/theme";
import { Panel } from "./Panel";

function Chart({
  symbol,
  subscribeToTrades,
}: {
  symbol: string;
  subscribeToTrades: SubscribeToTrades;
}) {
  const [interval, setInterval] = useState<CandleInterval>("1s");
  const { candles, volumes } = useCandles(symbol, interval, subscribeToTrades);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const watermarkVisibleRef = useRef(false);
  const hasDataRef = useRef(false);
  const resizeRafRef = useRef<number | null>(null);

  // Create the chart once; destroy on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const upColor = getThemeColor("--accent");
    const downColor = getThemeColor("--negative");

    const chart = createChart(container, {
      autoSize: false,
      width: container.clientWidth,
      height: container.clientHeight || 300,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(161, 161, 170, 0.9)",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.06)" },
        horzLines: { color: "rgba(255, 255, 255, 0.06)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: true },
    });

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor,
        downColor,
        borderVisible: false,
        wickUpColor: upColor,
        wickDownColor: downColor,
      },
      0,
    );
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" } },
      1,
    );
    chart.panes()[1]?.setHeight(120);

    const watermark = createTextWatermark(chart.panes()[0]!, {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: "Waiting for trades…",
          color: "rgba(161, 161, 170, 0.35)",
          fontSize: 20,
        },
      ],
    });
    watermarkVisibleRef.current = true;

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    watermarkRef.current = watermark;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        if (resizeRafRef.current !== null) {
          cancelAnimationFrame(resizeRafRef.current);
        }
        resizeRafRef.current = requestAnimationFrame(() => {
          resizeRafRef.current = null;
          const entry = entries[entries.length - 1];
          if (!entry || !chartRef.current) return;
          const width = Math.floor(entry.contentRect.width);
          const height = Math.floor(entry.contentRect.height);
          if (width > 0 && height > 0) {
            chartRef.current.resize(width, height);
          }
        });
      });
      ro.observe(container);
    }

    return () => {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      ro?.disconnect();
      watermarkRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chartRef.current = null;
      hasDataRef.current = false;
      watermarkVisibleRef.current = false;
      chart.remove();
    };
  }, []);

  // Full reset when symbol or interval changes.
  React.useEffect(() => {
    try {
      candleSeriesRef.current?.setData([]);
      volumeSeriesRef.current?.setData([]);
    } catch {
      // ignore
    }
    hasDataRef.current = false;
    if (watermarkRef.current && chartRef.current) {
      try {
        if (!watermarkVisibleRef.current) {
          chartRef.current
            .panes()[0]?.attachPrimitive(
              watermarkRef.current as unknown as IPanePrimitive<Time>,
            );
        }
        watermarkVisibleRef.current = true;
      } catch {
        // ignore
      }
    }
  }, [symbol, interval]);

  // Incremental updates: setData only for the first full snapshot, update() after.
  React.useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;
    if (candles.length === 0) return;

    if (!hasDataRef.current) {
      try {
        candleSeries.setData(candles);
        volumeSeries.setData(volumes);
      } catch {
        // ignore
      }
      hasDataRef.current = true;
    } else {
      const lastCandle = candles[candles.length - 1];
      const lastVolume = volumes[volumes.length - 1];
      if (lastCandle) {
        try {
          candleSeries.update(lastCandle);
        } catch {
          try {
            candleSeries.setData(candles);
          } catch {
            // ignore
          }
        }
      }
      if (lastVolume) {
        try {
          volumeSeries.update(lastVolume);
        } catch {
          try {
            volumeSeries.setData(volumes);
          } catch {
            // ignore
          }
        }
      }
    }

    if (watermarkRef.current && chartRef.current) {
      try {
        if (watermarkVisibleRef.current) {
          chartRef.current
            .panes()[0]?.detachPrimitive(
              watermarkRef.current as unknown as IPanePrimitive<Time>,
            );
        }
      } catch {
        // ignore
      }
      watermarkVisibleRef.current = false;
    }
  }, [candles, volumes]);

  return (
    <Panel
      title={quotePair(symbol)}
      className="h-full min-h-0 w-full"
      bodyClassName="flex flex-col"
      actions={
        <Tabs value={interval} onValueChange={(v) => setInterval(v as CandleInterval)}>
          <TabsList className="h-7 gap-1 bg-muted/60 p-0.5">
            {CANDLE_INTERVALS.map((i) => (
              <TabsTrigger key={i} value={i} className="h-6 px-2 text-[11px]">
                {i}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      <div ref={containerRef} className="min-h-80 w-full flex-1" />
      <div className="num flex items-center justify-between border-t border-hairline px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>
          {candles.length > 0
            ? `${candles.length} candle${candles.length === 1 ? "" : "s"} · live`
            : "No candles yet — place orders to generate trades"}
        </span>
        <span>
          {(() => {
            const last = candles[candles.length - 1];
            return last ? last.close.toFixed(2) : "—";
          })()}
        </span>
      </div>
    </Panel>
  );
}

export default React.memo(Chart);
