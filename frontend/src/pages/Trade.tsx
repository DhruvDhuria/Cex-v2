import React, { useState } from "react";
import Chart from "@/components/Chart";
import Orderbook from "@/components/Orderbook";
import Trades from "@/components/Trades";
import PlaceOrder from "@/components/PlaceOrder";
import Ticker24h from "@/components/Ticker24h";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_SYMBOLS, type Symbol_ } from "@/lib/api";
import { useMarketData } from "@/hooks/useMarketData";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
type UpdateType = "Orderbook" | "Trades";

export default function Trade() {
  const [symbol, setSymbol] = React.useState<Symbol_>("BTC");
  const [update, setUpdate] = useState<UpdateType>("Orderbook");
  const { trades, lastPrice, subscribeToTrades } = useMarketData(symbol);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-center">
        <Select value={symbol} onValueChange={(v) => setSymbol(v as Symbol_)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_SYMBOLS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-4">
        <div className="flex w-3/4 flex-col gap-4">
          <Ticker24h symbol={symbol} />
          <div className="flex h-[calc(100vh-14rem)] gap-4">
            <div className="w-2/3 min-h-0">
              <Chart symbol={symbol} subscribeToTrades={subscribeToTrades} />
            </div>
            <div className="flex h-full w-1/3 flex-col rounded-md border border-hairline bg-surface-raised p-3">
              <Tabs
                value={update}
                onValueChange={(v) => setUpdate(v as UpdateType)}
              >
                <TabsList className="bg-hairline m-0 mb-1 h-9 rounded-xl">
                  <TabsTrigger value="Orderbook">Orderbook</TabsTrigger>
                  <TabsTrigger value="Trades">Trades</TabsTrigger>
                </TabsList>
                {update === "Orderbook" ? (
                  <Orderbook symbol={symbol} lastPrice={lastPrice} />
                ) : (
                  <Trades trades={trades} />
                )}
              </Tabs>
            </div>
          </div>
        </div>
        <div className="flex h-full w-1/4 flex-col items-center justify-center gap">
          <PlaceOrder symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
