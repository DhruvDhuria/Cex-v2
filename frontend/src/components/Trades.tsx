import React from "react";
import { cn } from "@/lib/utils";
import { useTrades } from "@/hooks/useTrades";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function Trades({ symbol }: { symbol: string }) {
  const { trades } = useTrades(symbol);

  return (
    <div className="flex min-w-56 max-w-72 flex-col gap-2 rounded-lg bg-slate-950 text-white p-4 text-sm">
      <span className="text-sm font-semibold">Trades</span>
      <div className="flex justify-between px-1 text-xs text-gray-500">
        <span>Price (USD)</span>
        <span>Qty</span>
        <span>Time</span>
      </div>
      <div className="scrollbar-none flex max-h-96 flex-col gap-0.5 overflow-y-auto text-xs">
        {trades.length === 0 && <p className="px-1 text-gray-500">No trades yet</p>}
        {trades.map((trade, i) => {
          const prev = trades[i + 1];
          const up = prev ? trade.price >= prev.price : true;
          return (
            <div key={`${trade.ts}-${i}`} className="flex items-center justify-between px-1 py-0.5">
              <span className={cn(up ? "text-green-500" : "text-red-500")}>{trade.price}</span>
              <span className="text-gray-300">{trade.qty}</span>
              <span className="text-gray-500">{formatTime(trade.ts)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}