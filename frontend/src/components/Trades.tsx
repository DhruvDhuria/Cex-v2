import React from "react";
import { cn } from "@/lib/utils";
import { useTrades } from "@/hooks/useTrades";
import { Panel } from "./Panel";
import { formatNumber } from "./format";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function Trades({ symbol }: { symbol: string }) {
  const { trades } = useTrades(symbol);

  return (
    <Panel title="Trades" className="min-w-64 max-w-75" bodyClassName="flex flex-col">
      <div className="grid grid-cols-3 px-3 py-1.5 text-right text-[10px] tracking-wide text-muted-foreground uppercase">
        <span className="text-left">Price</span>
        <span>Size</span>
        <span>Time</span>
      </div>
      <div className="flex max-h-80 flex-1 flex-col overflow-y-auto scrollbar-none pb-1">
        {trades.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No trades yet</p>
        )}
        {trades.map((trade, i) => {
          const prev = trades[i + 1];
          const up = prev ? trade.price >= prev.price : true;
          return (
            <div
              key={`${trade.ts}-${i}`}
              className={cn(
                "num grid h-5.5 grid-cols-3 items-center px-3 text-right text-[11px] tabular-nums hover:bg-accent/40",
                i === 0 && "animate-in fade-in duration-500",
              )}
            >
              <span className={cn("text-left", up ? "text-buy" : "text-sell")}>
                {formatNumber(trade.price, 2)}
              </span>
              <span className="text-foreground/80">{formatNumber(trade.qty, 4)}</span>
              <span className="text-muted-foreground">{formatTime(trade.ts)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
