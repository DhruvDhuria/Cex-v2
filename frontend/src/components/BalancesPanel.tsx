import React from "react";
import { fetchBalance, type Balances } from "@/lib/api";

const ASSET_LABELS: Record<string, string> = {
  usd: "USD",
  BTC: "BTC",
  ETH: "ETH",
  SOL: "SOL",
};

const SUPPORTED = ["usd", "BTC", "ETH", "SOL"];

export default function BalancesPanel({ refreshKey }: { refreshKey?: number }) {
  const [balances, setBalances] = React.useState<Balances>({});
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setBalances(await fetchBalance());
    } catch {
      setBalances({});
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="w-full overflow-hidden rounded-md border border-hairline bg-surface">
      <div className="flex h-9 items-center justify-between border-b border-hairline px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">Balances</h2>
      </div>
      <div className="p-3">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
        {!loading && (
          <div className="flex flex-col gap-1 text-sm">
            {SUPPORTED.map((a) => {
              const bal = balances[a];
              const available = bal?.available ?? 0;
              const locked = bal?.locked ?? 0;
              return (
                <div key={a} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{ASSET_LABELS[a] || a.toUpperCase()}</span>
                  <span>
                    {available}
                    {locked > 0 && <span className="text-muted-foreground"> ({locked} locked)</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
