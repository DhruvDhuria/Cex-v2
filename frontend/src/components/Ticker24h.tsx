import React from "react";
import { cn } from "@/lib/utils";
import { useTicker } from "@/hooks/useTicker";
import { quotePair } from "@/lib/api";
import { formatCompact, formatNumber } from "./format";

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5 px-4">
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className={cn("num text-xs font-semibold", className)}>{value}</span>
    </div>
  );
}

/**
 * Rolling 24h statistics pushed by the ws-server on the `ticker.<PAIR>_USD`
 * channel. The window covers "since the ws-server started" and resets when the
 * ws-server restarts.
 */
function Ticker24h({ symbol }: { symbol: string }) {
  const ticker = useTicker(symbol);
  const change = ticker?.changePercent ?? 0;
  const positive = change >= 0;

  return (
    <div className="flex h-16 items-center divide-x divide-hairline overflow-x-auto rounded-md border border-hairline bg-surface scrollbar-none">
      <Stat
        label={`${quotePair(symbol)} last`}
        value={ticker ? formatNumber(ticker.close, 2) : "—"}
      />
      <Stat
        label="24h change"
        value={
          ticker
            ? `${positive ? "+" : ""}${formatNumber(change, 2)}%`
            : "—"
        }
        className={ticker ? (positive ? "text-buy" : "text-sell") : undefined}
      />
      <Stat
        label="24h high"
        value={ticker ? formatNumber(ticker.high, 2) : "—"}
      />
      <Stat
        label="24h low"
        value={ticker ? formatNumber(ticker.low, 2) : "—"}
      />
      <Stat
        label="24h open"
        value={ticker ? formatNumber(ticker.open, 2) : "—"}
      />
      <Stat
        label={`24h volume (${symbol})`}
        value={ticker ? formatCompact(ticker.volume) : "—"}
      />
      <div className="ml-auto hidden shrink-0 px-4 text-[10px] text-muted-foreground lg:block">
        rolling window · since server start
      </div>
    </div>
  );
}

export default React.memo(Ticker24h);
