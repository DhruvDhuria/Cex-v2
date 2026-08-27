import "dotenv/config";
import { createClient } from "redis";
import { env } from "./utils/env.js";
import { matchAlgorithm, type Order } from "./utils/matchAlgorithm.js";
import { BALANCES, ORDERBOOKS, ORDERS, type Fill, type OrderType, type Side } from "./store/exchange-store.js";
import { get_Depth } from "./utils/orderbook.js";
import { type AggregateFill } from "./utils/matchAlgorithm.js";
import { publishToStream } from "./streams.js";

export type EngineCommandType =
  | "create_order"
  | "get_depth"
  | "get_user_balance"
  | "get_order"
  | "cancel_order"
  | "add_balance";

export interface EngineRequest {
  correlationId: string;
  responseQueue: string;
  type: EngineCommandType;
  payload: Record<string, unknown>;
}

interface DepthUPdateObject {
  levelprice: number,
  delta: number
}
interface DepthUpdates {
  market: string,
  asks: DepthUPdateObject[],
  bids: DepthUPdateObject[]
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

function isAddBalanceRequest(data: unknown): data is { symbol: string, amount: number, userId: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "symbol" in data &&
    "amount" in data &&
    "userId" in data &&
    typeof (data as any).symbol === "string" &&
    typeof (data as any).amount === "number" &&
    typeof (data as any).userId === "string"
  )
}


function isId(data: unknown, requestType: string): data is { value: string } {

  let value;
  if(requestType === "get_order" || requestType === "cancel_order") {
    value = "orderId";
  }else if(requestType === "get_user_balance" || requestType === "add_balance") {
    value = "userId";
  }else {
    value = "symbol";
  }
  return (
    typeof data === "object" && data !== null &&
    value in data &&
    typeof (data as any)[value] === "string"
  )
}

const brokerClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis broker client error", error);
});

const responseClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis response client error", error);
});


await Promise.all([brokerClient.connect(), responseClient.connect()]);

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

    const averagePrice =
      Array.from(result.priceAggregate!.entries()).reduce(
        (acc: number, [priceKey, fills]) => {
          const levelMatchedOrders = fills.reduce(
            (sum, item) => sum + item.matchedOrders,
            0,
          );

          return acc + priceKey * levelMatchedOrders;
        },
        0,
      ) / result.filledQty!
    const price = averagePrice.toFixed(2);

    let depthUpdates: DepthUpdates = {
      market: order.symbol,
      asks: [],
      bids: []
    }
    
    result.priceAggregate?.forEach((fills: AggregateFill[], pricekey: number) => {
      let delta = 0;
      fills.forEach((item: any) => {
        const totalQty = item.totalOrderQty;
        delta = totalQty - item.matchedOrders;
        const tradeUpdate = {
          price: pricekey,
          qty: item.matchedOrders,
        }
        publishToStream(order.symbol ,tradeUpdate, "TradesUpdate")

      })
      if(fills[0]!.side === "buy") {
        depthUpdates.asks.push({
          levelprice: pricekey,
          delta: delta
        })
      }else {
        depthUpdates.bids.push({
          levelprice: pricekey,
          delta: delta
        })
      }


    })

    if(result.orderbookAddUpdate) {
      if(result.orderbookAddUpdate.side === "buy") {
        depthUpdates.bids.push({
          levelprice: result.orderbookAddUpdate.price,
          delta: result.orderbookAddUpdate.qty
        })
      }else {
        depthUpdates.asks.push({
          levelprice: result.orderbookAddUpdate.price,
          delta: result.orderbookAddUpdate.qty,
        })
      }
    }


    publishToStream(order.symbol, depthUpdates, "depthUpdate")

    const fills: Fill[] = Array.from(
      result.priceAggregate?.entries() || [],
    ).flatMap(([priceKey, items]) => {
      return items.map((item: any) => ({
        fillId: crypto.randomUUID(),
        symbol: item.symbol,
        price: priceKey,
        qty: item.matchedOrders,
        orderId: item.orderId,
        type: order.type,
        createdAt: Date.now()
      }));
    });


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

    if(!isId(message.payload, message.type)) {
      return {
        error: "invalid symbol"
      }
    }
    const depth = get_Depth(message.payload.value)
    return {
      symbol: message.payload.value,
      asks: depth.asks,
      bids: depth.bids
    }
  } else if(message.type === "get_user_balance") {

    if(!isId(message.payload, message.type)) {
      return {
        error: "invalid userId"
      }
    }
    const balance = BALANCES.get(message.payload.value)
    return {
      balance
    }
  }else if(message.type === "get_order") {

    if(!isId(message.payload, message.type)) {
      return {
        error: "invalid userId"
      }
    }
    const order = ORDERS.get(message.payload.value)

    if(!order) {
      return {error: "order not found"}
    }
    return {
      order
    }
  }else if(message.type === "cancel_order") {

    if(!isId(message.payload, message.type)) {
      return {
        error: "invalid userId"
      }
    }
    const order = ORDERS.get(message.payload.value)
    if(!order) {
      return {error: "order not found"}
    }
    const side = order.side === 'buy'? 'bids': 'asks'

    const orderbookOrder = ORDERBOOKS.get(order.symbol)?.[side].get(order.price!)?.filter(item => item.orderId !== ORDERS.keys().find(item => item === message.payload.value))

    if(!orderbookOrder) {
      return {error: "order not found"}
    }

    const depthUpdates: DepthUpdates = {
      market: order.symbol,
      asks: [],
      bids: []
    } 
    if(side === "bids") {
      depthUpdates.bids.push({
        levelprice: order.price!,
        delta: 0
      })
    }else {
      depthUpdates.asks.push({
        levelprice: order.price!,
        delta: 0
      })
    }
    
    const deletedOrder = ORDERS.delete(message.payload.value)
    if(!deletedOrder) {
      return {error: "order not found"}
    }
    return {
      order
    }
  }else if(message.type === "add_balance") {
    if(!isId(message.payload, message.type)) {
      return {
        error: "invalid userId"
      }
    }
    if(!isAddBalanceRequest(message.payload)) {
      return {
        error: "invalid payload"
      }
    }
    const {symbol, amount} = message.payload

    const balance = BALANCES.get(message.payload.value)
    if(!balance) {
      return {error: "user not found"}
    }
    balance[symbol]!.available += amount
    
    return {
      balance
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