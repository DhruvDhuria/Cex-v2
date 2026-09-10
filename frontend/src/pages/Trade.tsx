import React, { useState } from "react";
import Chart from "@/components/Chart";
import Orderbook from "@/components/Orderbook";
import Trades from "@/components/Trades";
import PlaceOrder from "@/components/PlaceOrder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_SYMBOLS, type Symbol_ } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
type UpdateType = "Orderbook" | "Trades";

export default function Trade() {
  const [symbol, setSymbol] = React.useState<Symbol_>("BTC");
  const [update, setUpdate] = useState<UpdateType>("Orderbook");

  return (
    <div className="flex flex-col ">
      {/* <div className="flex items-center justify-center">
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
      </div> */}

      <div className="flex bg-pink-300 h-[90vh] justify-center">
        <div className="flex flex-col bg-green-300 gap-4 h-full w-3/4">
          <div className="bg-red-50 h-16">bookticker</div>
          <div className="flex h-screen bg-purple-300 ">
            <div className="w-2/3 min-h-0">
              <Chart symbol={symbol} />
            </div>
            <div className="flex flex-col h-full p-3 w-1/3 bg-surface-raised">
              <Tabs
                value={update}
                onValueChange={(v) => setUpdate(v as UpdateType)}
              >
                <TabsList className="bg-hairline h-9 rounded-xl m-2 mb-1">
                  <TabsTrigger value="Orderbook">Orderbook</TabsTrigger>
                  <TabsTrigger value="Trades">Trades</TabsTrigger>
                </TabsList>
                {update === "Orderbook" ? (
                  <Orderbook symbol={symbol} />
                ) : (
                  <Trades symbol={symbol} />
                )}
              </Tabs>
            </div>
          </div>
        </div>
        <div className="flex flex-col h-full w-1/4 justify-center items-center bg-blue-300 gap">
          <PlaceOrder symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
