import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel } from "./Panel";
import { formatNumber, formatUsd } from "./format";
import {
  fetchBalance,
  getToken,
  placeOrder,
  type Balances,
  type OrderSide,
  type OrderType,
} from "@/lib/api";

export default function PlaceOrder({ symbol }: { symbol: string }) {
  const [type, setType] = React.useState<OrderType>("limit");
  const [side, setSide] = React.useState<OrderSide>("buy");
  const [price, setPrice] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const authed = Boolean(getToken());
  const base = symbol;
  const quote = "USD";
  const [balances, setBalances] = React.useState<Balances>({});

  const refreshBalances = React.useCallback(async () => {
    if (!authed) {
      setBalances({});
      return;
    }
    try {
      setBalances(await fetchBalance());
    } catch {
      setBalances({});
    }
  }, [authed]);

  React.useEffect(() => {
    void refreshBalances();
  }, [refreshBalances, symbol]);

  React.useEffect(() => {
    setMessage(null);
  }, [type, side, price, qty]);

  const qtyNum = Number(qty);
  const priceNum = Number(price);
  const effectivePrice = type === "market" ? null : priceNum > 0 ? priceNum : null;
  const orderValue = effectivePrice != null && qtyNum > 0 ? qtyNum * effectivePrice : null;
  const estFee = orderValue != null ? orderValue * 0.0005 : null;
  const available = side === "buy" ? (balances["usd"]?.available ?? 0) : (balances[base]?.available ?? 0);

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
      void refreshBalances();
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
    <Panel className="h-3/4 min-w-72 max-w-80" bodyClassName="flex flex-col">
      <Tabs value={side} onValueChange={(value) => setSide(value as OrderSide)}>
        <TabsList className="h-16 w-full rounded-none border-b border-hairline bg-transparent p-0">
          <TabsTrigger
            value="buy"
            className="h-12 flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent text-sm  font-semibold data-[state=active]:border-buy data-[state=active]:bg-buy/10 data-[state=active]:text-buy data-[state=active]:shadow-none"
          >
            Buy
          </TabsTrigger>
          <TabsTrigger
            value="sell"
            className="h-12 flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent text-sm font-semibold data-[state=active]:border-sell data-[state=active]:bg-sell/10 data-[state=active]:text-sell data-[state=active]:shadow-none"
          >
            Sell
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 p-3">
        <Tabs value={type} onValueChange={(value) => setType(value as OrderType)}>
          <TabsList className="h-9 w-fit gap-2 bg-muted/60 p-0.5">
            <TabsTrigger value="limit" className="h-8 px-3 text-[11px]">
              Limit
            </TabsTrigger>
            <TabsTrigger value="market" className="h-8 px-3 text-[11px]">
              Market
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Available</span>
          <span className="num text-foreground">
            {formatNumber(available, side === "buy" ? 2 : 4)} {side === "buy" ? quote : base}
          </span>
        </div>

        {type === "limit" ? (
          <Field label="Price" suffix={quote}>
            <Input
              id="price"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={!authed}
              className="num h-9 border-0 bg-transparent pr-14 text-right text-sm shadow-none focus-visible:ring-0"
            />
          </Field>
        ) : (
          <div className="flex h-9 items-center justify-between rounded-md border border-hairline bg-background/60 px-3 text-[11px] text-muted-foreground">
            <span>Price</span>
            <span className="num text-foreground">Market</span>
          </div>
        )}

        <Field label="Size" suffix={base}>
          <Input
            id="qty"
            type="number"
            min="0"
            step="any"
            placeholder="0.0000"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            disabled={!authed}
            className="num h-9 border-0 bg-transparent pr-14 text-right text-sm shadow-none focus-visible:ring-0"
          />
        </Field>

        <div className="flex flex-col gap-1 border-t border-hairline pt-3 text-[11px]">
          <Row label="Order value" value={orderValue != null ? formatUsd(orderValue) : "—"} />
          <Row label="Est. fee" value={estFee != null ? formatUsd(estFee) : "—"} />
        </div>

        {!authed && <p className="text-xs text-muted-foreground">Sign in to place orders.</p>}
        {message && (
          <p className={cn("text-xs", message.ok ? "text-buy" : "text-sell")}>{message.text}</p>
        )}

        <Button
          type="button"
          disabled={!authed || submitting}
          onClick={() => void handleSubmit()}
          className={cn(
            "h-10 w-full text-sm font-semibold",
            side === "buy"
              ? "bg-buy text-background hover:bg-buy/90"
              : "bg-sell text-background hover:bg-sell/90",
          )}
        >
          {submitting ? "Placing…" : `${side === "buy" ? "Buy" : "Sell"} ${symbol}`}
        </Button>
      </div>
    </Panel>
  );
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-md border border-hairline bg-background/60 focus-within:border-ring">
      <Label className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
      <span className="num pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-foreground">{value}</span>
    </div>
  );
}
