import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addBalance,
  ASSET_LABELS,
  fetchBalance,
  getToken,
  SUPPORTED_ASSETS,
  withdrawBalance,
  type Balances,
  type FundingAsset,
} from "@/lib/api";

type Mode = "add" | "withdraw";

export default function Balance({ initialMode = "add" }: { initialMode?: Mode }) {
  const [balances, setBalances] = React.useState<Balances>({});
  const [loadingBalances, setLoadingBalances] = React.useState(true);
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [asset, setAsset] = React.useState<FundingAsset>("usd");
  const [amount, setAmount] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const authed = Boolean(getToken());

  const refresh = React.useCallback(async () => {
    if (!authed) {
      setBalances({});
      setLoadingBalances(false);
      return;
    }
    try {
      setBalances(await fetchBalance());
    } catch {
      setBalances({});
    } finally {
      setLoadingBalances(false);
    }
  }, [authed]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = async () => {
    const amountNum = Number(amount);
    if (!(amountNum > 0)) {
      setMessage({ ok: false, text: "Enter an amount greater than 0" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const next =
        mode === "add"
          ? await addBalance(asset, amountNum)
          : await withdrawBalance(asset, amountNum);
      setBalances(next);
      setMessage({
        ok: true,
        text: `${mode === "add" ? "Added" : "Withdrew"} ${amountNum} ${ASSET_LABELS[asset]}`,
      });
      setAmount("");
    } catch (err) {
      const detail =
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : `${mode === "add" ? "Deposit" : "Withdrawal"} failed`;
      setMessage({ ok: false, text: detail });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-80 flex-col gap-3 rounded-lg bg-panel p-4 text-sm">
      <span className="text-sm font-semibold">Wallet</span>

      <div className="flex flex-col gap-1">
        {loadingBalances && <p className="text-xs text-muted-foreground">Loading balances…</p>}
        {!loadingBalances && (
          <div className="flex flex-col gap-0.5 text-xs">
            {SUPPORTED_ASSETS.map((a) => {
              const bal = balances[a];
              const available = bal?.available ?? 0;
              const locked = bal?.locked ?? 0;
              return (
                <div key={a} className="flex items-center justify-between px-1 py-0.5">
                  <span className="text-muted-foreground">{ASSET_LABELS[a]}</span>
                  <span className="text-foreground">
                    {available}
                    {locked > 0 && (
                      <span className="text-muted-foreground"> ({locked} locked)</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md bg-input/30 p-1">
        <button
          type="button"
          onClick={() => setMode("add")}
          className={cn(
            "rounded border border-transparent px-2 py-1.5 text-xs font-medium transition-colors",
            mode === "add"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-input/40",
          )}
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setMode("withdraw")}
          className={cn(
            "rounded border border-transparent px-2 py-1.5 text-xs font-medium transition-colors",
            mode === "withdraw"
              ? "border-white/10 bg-surface-raised text-foreground"
              : "text-muted-foreground hover:bg-input/40",
          )}
        >
          Withdraw
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="asset" className="text-xs text-muted-foreground">
          Asset
        </Label>
        <Select value={asset} onValueChange={(v) => setAsset(v as FundingAsset)} disabled={!authed}>
          <SelectTrigger id="asset" className="w-full dark:bg-input/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_ASSETS.map((a) => (
              <SelectItem key={a} value={a}>
                {ASSET_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount" className="text-xs text-muted-foreground">
          Amount
        </Label>
        <Input
          id="amount"
          type="number"
          min="0"
          step="any"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!authed}
        />
      </div>

      {!authed && <p className="text-xs text-muted-foreground">Sign in to manage balances.</p>}
      {message && (
        <p className={cn("text-xs", message.ok ? "text-accent" : "text-negative")}>
          {message.text}
        </p>
      )}

      <Button
        disabled={!authed || submitting}
        onClick={() => void handleSubmit()}
        variant={mode === "add" ? "default" : "outline"}
        className={cn("w-full", mode === "withdraw" && "border-white/15")}
      >
        {submitting
          ? "Processing…"
          : `${mode === "add" ? "Add" : "Withdraw"} ${ASSET_LABELS[asset]}`}
      </Button>
    </div>
  );
}