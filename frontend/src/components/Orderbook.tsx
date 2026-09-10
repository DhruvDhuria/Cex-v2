import React from "react";
import { ArrowDown, ArrowUp, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDepth } from "@/hooks/useDepth";
import { quotePair } from "@/lib/api";
import { Panel } from "./Panel";
import { formatNumber } from "./format";
import { Button } from "@/components/ui/button";

type SideFilter = "asks" | "bids" | "both";

interface Row {
  price: number;
  size: number;
  total: number;
}

function buildRows(levels: { price: number; qty: number }[]): Row[] {
  let cumulative = 0;
  const rows: Row[] = [];
  for (const level of levels) {
    if (level.qty <= 0) continue;
    cumulative += level.qty;
    rows.push({ price: level.price, size: level.qty, total: cumulative });
  }
  return rows;
}

export default function Orderbook({ symbol }: { symbol: string }) {
  const { depth, loading, error } = useDepth(symbol);
  const [filter, setFilter] = React.useState<SideFilter>("both");
  const [hovered, setHovered] = React.useState<{ side: "bid" | "ask"; index: number } | null>(null);

  const asks = React.useMemo(
    () => buildRows((depth?.asks ?? []).slice().sort((a, b) => a.price - b.price)),
    [depth],
  );
  const bids = React.useMemo(
    () => buildRows((depth?.bids ?? []).slice().sort((a, b) => b.price - a.price)),
    [depth],
  );

  const maxTotal = Math.max(asks[asks.length - 1]?.total ?? 0, bids[bids.length - 1]?.total ?? 0, 1);
  const spread = (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0);
  const askVisible = filter !== "bids";
  const bidVisible = filter !== "asks";

  const renderRows = (data: Row[], side: "bid" | "ask", reverse: boolean) => {
    const list = reverse ? [...data].reverse() : data;
    return list.map((row) => {
      const index = data.indexOf(row);
      const highlighted = hovered?.side === side && index <= (hovered?.index ?? -1);
      return (
        <div
          key={`${side}-${row.price}`}
          onMouseEnter={() => setHovered({ side, index })}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "num relative grid h-5.5 w-full grid-cols-3 items-center px-3 text-right text-[11px] tabular-nums transition-colors",
            highlighted ? "bg-accent/60" : "hover:bg-accent/40",
          )}
        >
          <span
            className="absolute inset-y-0 right-0"
            style={{
              width: `${(row.total / maxTotal) * 100}%`,
              backgroundColor: side === "ask" ? "var(--sell-muted)" : "var(--buy-muted)",
            }}
          />
          <span className={cn("z-10 text-left", side === "ask" ? "text-sell" : "text-buy")}>
            {formatNumber(row.price, 2)}
          </span>
          <span className="z-10 text-muted-foreground">{formatNumber(row.size, 4)}</span>
          <span className="z-10 text-muted-foreground">{formatNumber(row.total, 4)}</span>
        </div>
      );
    });
  };

  return (
    <Panel
      title={quotePair(symbol)}
      className="min-w-64 max-w-75"
      bodyClassName="flex flex-col"
      actions={
        <div className="flex items-center rounded border border-hairline p-0.5">
          {(
            [
              { key: "both", icon: Rows3, label: "Both sides" },
              { key: "bids", icon: ArrowUp, label: "Bids only" },
              { key: "asks", icon: ArrowDown, label: "Asks only" },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <Button
              key={key}
              type="button"
              size="icon"
              variant="ghost"
              aria-label={label}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "size-5 rounded-sm text-muted-foreground hover:text-foreground",
                filter === key && "bg-accent text-foreground",
              )}
            >
              <Icon className="size-3" />
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-3 px-3 py-1.5 text-right text-[10px] tracking-wide text-muted-foreground uppercase">
        <span className="text-left">Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}

      {!loading && !error && (
        <div className="flex flex-1 flex-col justify-center">
          {askVisible && (
            <div className="flex max-h-50 flex-col overflow-y-auto scrollbar-none">
              {renderRows(asks, "ask", true)}
            </div>
          )}

          <div className="num flex items-center justify-between border-y border-hairline px-3 py-1.5">
            {depth?.lastPrice != null ? (
              <span className="text-sm font-semibold text-foreground">
                {formatNumber(depth.lastPrice, 2)}
              </span>
            ) : (
              <span className="text-sm font-semibold text-muted-foreground">—</span>
            )}
            <span className="text-[10px] text-muted-foreground">
              Spread {formatNumber(spread, 2)}
            </span>
          </div>

          {bidVisible && (
            <div className="flex max-h-50 flex-col overflow-y-auto scrollbar-none">
              {renderRows(bids, "bid", false)}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
