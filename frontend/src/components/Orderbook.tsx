import React from "react";
import { cn } from "@/lib/utils";
import { useDepth } from "@/hooks/useDepth";
import { quotePair } from "@/lib/api";
import { Button } from "@/components/ui/button";

type SideFilter = "asks" | "bids" | "both";

interface Row {
  price: number;
  size: number;
  total: number;
  maxTotal: number;
}

function buildRows(levels: { price: number; qty: number }[]): Row[] {
  let cumulative = 0;
  const rows: Row[] = [];
  for (const level of levels) {
    if (level.qty <= 0) continue;
    cumulative += level.qty;
    rows.push({ price: level.price, size: level.qty, total: cumulative, maxTotal: level.qty });
  }
  const max = rows.reduce((acc, r) => Math.max(acc, r.total), 0);
  return rows.map((r) => ({ ...r, maxTotal: max }));
}

function DepthTable({
  rows,
  side,
}: {
  rows: Row[];
  side: "asks" | "bids";
}) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {rows.map((row) => (
        <div key={row.price} className="relative flex items-center justify-between px-1 py-0.5">
          <div
            className={cn(
              "absolute inset-y-0 right-0",
              side === "asks" ? "bg-red-500/15" : "bg-green-500/15",
            )}
            style={{ width: `${(row.total / row.maxTotal) * 100}%` }}
          />
          <span className={cn("relative", side === "asks" ? "text-red-500" : "text-green-500")}>
            {row.price}
          </span>
          <span className="relative text-gray-300">{row.size}</span>
          <span className="relative text-gray-400">{row.total}</span>
        </div>
      ))}
    </div>
  );
}

export default function Orderbook({ symbol }: { symbol: string }) {
  const { depth, loading, error } = useDepth(symbol);
  const [filter, setFilter] = React.useState<SideFilter>("both");

  const asks = buildRows(
    (depth?.asks ?? []).sort((a, b) => a.price - b.price),
  );
  const bids = buildRows(
    (depth?.bids ?? []).sort((a, b) => b.price - a.price),
  );

  return (
    <div className="flex min-w-64 max-w-80 flex-col text-white gap-2 rounded-lg bg-slate-950 p-4 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">{quotePair(symbol)}</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 px-2 text-xs", filter === "asks" && "bg-foreground/10")}
            onClick={() => setFilter("asks")}
          >
            Asks
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 px-2 text-xs", filter === "both" && "bg-foreground/10")}
            onClick={() => setFilter("both")}
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 px-2 text-xs", filter === "bids" && "bg-foreground/10")}
            onClick={() => setFilter("bids")}
          >
            Bids
          </Button>
        </div>
      </div>

      <div className="flex justify-between px-1 text-xs text-gray-500">
        <span>Price (USD)</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      {loading && <p className="text-xs text-gray-500">Loading…</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          {(filter === "asks" || filter === "both") && (
            <div className="overflow-y-auto scrollbar-none max-h-50">
              <DepthTable rows={asks} side="asks" />
            </div>
          )}

          <div className={cn("px-1 text-xs", filter === "bids" || filter === "both" ? "flex justify-between" : "hidden")}>
            {depth?.lastPrice != null ? (
              <>
                <span className="text-gray-100">{depth.lastPrice}</span>
                <span className="text-gray-500">LAST</span>
              </>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </div>

          {(filter === "bids" || filter === "both") && (
            <div className="overflow-y-auto scrollbar-none max-h-50">
              <DepthTable rows={bids} side="bids" />
            </div>
          )}
        </>
      )}
    </div>
  );
}