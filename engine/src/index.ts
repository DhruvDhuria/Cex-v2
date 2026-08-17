import "dotenv/config";
import { createClient } from "redis";
import { env } from "./utils/env.js";
import { matchAlgorithm, type Order } from "./utils/matchAlgorithm.js";

import { ORDERS, type Fill, type OrderType, type Side } from "./store/exchange-store.js";
import { get_Depth } from "./utils/orderbook.js";

export type EngineCommandType =
  | "create_order"
  | "get_depth"
  | "get_user_balance"
  | "get_order"
  | "cancel_order";

export interface EngineRequest {
  correlationId: string;
  responseQueue: string;
  type: EngineCommandType;
  payload: Record<string, unknown>;
}

export interface EngineResponse {
  correlationId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

function isOrder(data: unknown): data is Order {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    "side" in data &&
    "symbol" in data &&
    typeof (data as any).symbol === "string" &&
    "qty" in data &&
    typeof (data as any).qty === "number" &&
    "userId" in data &&
    typeof (data as any).userId === "string" &&
    ("price" in data ? (data as any).price === null || typeof (data as any).price === "number" : false)
  );
}

function isSymbol(data: unknown): data is { symbol: string } {
  return (
    typeof data === "object" && data !== null &&
    "symbol" in data &&

    typeof (data as any).symbol === "string"
  )
}

const brokerClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis broker client error", error);
});

const responseClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis response client error", error);
});

await Promise.all([brokerClient.connect(), responseClient.connect()]);

// :-)) I added this just to check the flow, remove it when you start
const DUMMY_SELL_ORDER = {
  orderId: "dummy-sell-order-1",
  userId: "dummy-seller",
  type: "limit",
  side: "sell",
  symbol: "BTC",
  price: 100,
  qty: 1,
  filledQty: 0,
  status: "open",
};

async function sendResponse(responseQueue: string, response: EngineResponse): Promise<void> {
  await responseClient.lPush(responseQueue, JSON.stringify(response));
}

function handleEngineRequest(message: EngineRequest): unknown {
  /**
   * TODO(student):
   * 1. Check _message.type.
   * 2. Read _message.payload.
   * 3. Call your order book / balance / order logic.
   * 4. Return the data that should go back to the backend.
   *
   * Required message types:
   * - create_order
   * - get_depth
   * - get_user_balance
   * - get_order
   * - cancel_order
   */

  // just checking the flow, remove this when you start implementing the logic
  if (message.type === "create_order") {

    const order = message.payload
    
    if(!isOrder(order)) {
      return {
        error: "invalid order"
      }
    }

    const result = matchAlgorithm(order)

    if(!result) {
      return{
        error: "something went wrong"
      }
    }
    if (result.error) {
      return {
        error: result.error,
      };
    }

    const averagePrice = result.priceAggregate.reduce((acc: number, curr: any) => acc + curr.levelPrice * curr.matchedOrders, 0) / result.filledQty!;
    const price = averagePrice.toFixed(2);


    const fills: Fill[] = result.priceAggregate.map((item: any) => ({
      fillId: crypto.randomUUID(),
      symbol: item.symbol,
      price: item.levelPrice,
      qty: item.matchedOrders,
      orderId: item.orderId,
      type: order.type,
      cretaedAt: Date.now(),
    }));

    ORDERS.set(result.orderId?.toString()!, {
      userId: order.userId,
      side: order.side,
      type: order.type,
      symbol: order.symbol,
      price: order.price,
      qty: order.qty,
      filledQty: result.filledQty || 0,
      status: result.orderStatus!,
      fills: fills,
      createdAt: Date.now(),
    });
    
    return {
      orderId: result.orderId,
      status: result.orderStatus,
      filledQty: result.filledQty,
      averagePrice: price,
      fills: fills,
    };
  }else if(message.type === "get_depth") {

    if(!isSymbol(message.payload)) {
      return {
        error: "invalid symbol"
      }
    }
    const depth = get_Depth(message.payload.symbol)
    return {
      symbol: message.payload.symbol,
      asks: depth.asks,
      bids: depth.bids
    }
  }
}

console.log(`Engine listening on Redis queue: ${env.incomingQueue}`);

for (;;) {
  const item = await brokerClient.brPop(env.incomingQueue, 0);
  if (!item) continue;

  let message: EngineRequest;

  try {
    message = JSON.parse(item.element) as EngineRequest;
  } catch {
    console.error("Skipping invalid broker message");
    continue;
  }

  try {
    const data = handleEngineRequest(message);
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok: true,
      data,
    });
  } catch (error) {
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok: false,
      error: error instanceof Error ? error.message : "engine_error",
    });
  }
}