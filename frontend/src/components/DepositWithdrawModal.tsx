import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addBalance,
  ASSET_LABELS,
  getToken,
  SUPPORTED_ASSETS,
  withdrawBalance,
  type Balances,
  type FundingAsset,
} from "@/lib/api";

type Mode = "add" | "withdraw";

export default function DepositWithdrawModal({
  open,
  onOpenChange,
  initialMode = "add",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: Mode;
  onSuccess?: (balances: Balances) => void;
}) {
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [asset, setAsset] = React.useState<FundingAsset>("usd");
  const [amount, setAmount] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const authed = Boolean(getToken());

  React.useEffect(() => {
    setMode(initialMode);
    setMessage(null);
    setAmount("");
  }, [initialMode, open]);

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
        mode === "add" ? await addBalance(asset, amountNum) : await withdrawBalance(asset, amountNum);
      setMessage({
        ok: true,
        text: `${mode === "add" ? "Deposited" : "Withdrew"} ${amountNum} ${ASSET_LABELS[asset]}`,
      });
      setAmount("");
      onSuccess?.(next);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Deposit" : "Withdraw"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setMode("add")}
              className={cn(
                "rounded px-2 py-1.5 text-xs font-medium transition-colors",
                mode === "add" ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setMode("withdraw")}
              className={cn(
                "rounded px-2 py-1.5 text-xs font-medium transition-colors",
                mode === "withdraw" ? "bg-red-600 text-white" : "text-muted-foreground hover:bg-muted",
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
              <SelectTrigger id="asset" className="w-full">
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
            <p className={cn("text-xs", message.ok ? "text-green-500" : "text-red-500")}>{message.text}</p>
          )}

          <Button
            disabled={!authed || submitting}
            onClick={() => void handleSubmit()}
            className={cn(
              "w-full",
              mode === "add"
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-red-600 text-white hover:bg-red-700",
            )}
          >
            {submitting ? "Processing…" : `${mode === "add" ? "Deposit" : "Withdraw"} ${ASSET_LABELS[asset]}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
