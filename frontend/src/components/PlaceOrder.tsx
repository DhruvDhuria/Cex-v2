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
import { getToken, placeOrder, type OrderSide, type OrderType } from "@/lib/api";

export default function PlaceOrder({ symbol }: { symbol: string }) {
  const [type, setType] = React.useState<OrderType>("limit");
  const [side, setSide] = React.useState<OrderSide>("buy");
  const [price, setPrice] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const authed = Boolean(getToken());

  React.useEffect(() => {
    setMessage(null);
  }, [type, side, price, qty]);

  const handleSubmit = async () => {
    if (!authed) return;
    setMessage(null);

    const qtyNum = Number(qty);
    if (!(qtyNum > 0)) {
      setMessage({ ok: false, text: "Enter a quantity greater than 0" });
      return;
    }

    let priceNum: number | undefined;
    if (type === "limit") {
      priceNum = Number(price);
      if (!(priceNum > 0)) {
        setMessage({ ok: false, text: "Enter a positive price" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await placeOrder({ type, side, symbol, qty: qtyNum, price: priceNum });
      setMessage({ ok: true, text: `${side === "buy" ? "Buy" : "Sell"} order ${res.status} (${res.filledQty} filled)` });
      setQty("");
      if (type === "limit") setPrice("");
    } catch (err) {
      const detail =
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "Order failed";
      setMessage({ ok: false, text: detail });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-w-56 max-w-72 flex-col gap-3 text-white rounded-lg bg-slate-950 p-4 text-sm">
      <span className="text-sm font-semibold">Place Order</span>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-type" className="text-xs text-gray-400">
          Type
        </Label>
        <Select value={type} onValueChange={(v) => setType(v as OrderType)}>
          <SelectTrigger id="order-type" className="w-full dark:bg-input/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="limit">Limit</SelectItem>
            <SelectItem value="market">Market</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md bg-input/30 p-1">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={cn(
            "rounded px-2 py-1.5 text-xs font-medium transition-colors",
            side === "buy" ? "bg-green-600 text-white" : "text-gray-300 hover:bg-input/40",
          )}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={cn(
            "rounded px-2 py-1.5 text-xs font-medium transition-colors",
            side === "sell" ? "bg-red-600 text-white" : "text-gray-300 hover:bg-input/40",
          )}
        >
          Sell
        </button>
      </div>

      {type === "limit" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price" className="text-xs text-gray-400">
            Price (USD)
          </Label>
          <Input
            id="price"
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!authed}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="qty" className="text-xs text-gray-400">
          Quantity
        </Label>
        <Input
          id="qty"
          type="number"
          min="0"
          step="any"
          placeholder="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          disabled={!authed}
        />
      </div>

      {!authed && <p className="text-xs text-gray-500">Sign in to place orders.</p>}
      {message && (
        <p className={cn("text-xs", message.ok ? "text-green-500" : "text-red-500")}>{message.text}</p>
      )}

      <Button
        disabled={!authed || submitting}
        onClick={() => void handleSubmit()}
        className={cn(
          "w-full",
          side === "buy" ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700",
        )}
      >
        {submitting ? "Placing…" : `${side === "buy" ? "Buy" : "Sell"} ${symbol}`}
      </Button>
    </div>
  );
}