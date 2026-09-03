import "dotenv/config";
import {  createClient } from "redis";
import { env } from "./utils/env.js";
import { matchAlgorithm, type Order } from "./utils/matchAlgorithm.js";
import { BALANCES, ORDERBOOKS, ORDERS, type Fill, type OrderType, type Side } from "./store/exchange-store.js";
import { type AggregateFill } from "./utils/matchAlgorithm.js";
import { publishToStream } from "./streams.js";

const assets = ["BTC", "ETH", "SOL"]

function initializeOrderBook () {
  ORDERBOOKS.clear()
  for (const asset of assets) {
    ORDERBOOKS.set(asset, {lastTradedPrice: null, asks: new Map(), bids: new Map()})
  }
}
initializeOrderBook()

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


// 1. Map the request types to their expected property names
type RequestKeyMap = {
  get_order: "orderId";
  cancel_order: "orderId";
  get_user_balance: "userId";
  add_balance: "userId";
};

// 2. Fallback helper: if it's in the map, use it; otherwise default to "symbol"
type GetPayloadKey<T extends string> = T extends keyof RequestKeyMap 
  ? RequestKeyMap[T] 
  : "symbol";

// 3. The Function with Generic narrowing
function isId<K extends string>(
  data: unknown, 
  requestType: K
): data is Record<GetPayloadKey<K>, string> {

  let value: string;
  if (requestType === "get_order" || requestType === "cancel_order") {
    value = "orderId";
  } else if (requestType === "get_user_balance" || requestType === "add_balance") {
    value = "userId";
  } else {
    value = "symbol";
  }

  return (
    typeof data === "object" && 
    data !== null &&
    value in data &&
    typeof (data as Record<string, unknown>)[value] === "string"
  );
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

    if (result.error) {
      return {
        error: result.error,
      };
    }

    let depthUpdates: DepthUpdates = {
      market: order.symbol,
      asks: [],
      bids: []
    }
    const user = BALANCES.get(order.userId)
    if(!user) {
      return {
        error: "User not found"
      }
    }
    result.priceAggregate?.forEach((fills: AggregateFill[], pricekey: number) => {
      let delta = 0;
      fills.forEach((item: any) => {
        const totalQty = item.totalOrderQty;
        delta = totalQty - item.matchedOrders;
        const matchedUser = BALANCES.get(item.matchedUser)

        if(!matchedUser) {
          return "Error: matched user not found"
        }
        // set default balances if they don't exist to 0 so that we don't get undefined errors when updating balances
        user.usd = user.usd || { available: 0, locked: 0 };
        matchedUser.usd = matchedUser.usd || { available: 0, locked: 0 };
        user[order.symbol] = user[order.symbol] || { available: 0, locked: 0 };
        matchedUser[order.symbol] = matchedUser[order.symbol] || { available: 0, locked: 0 };
        
        // settle balances for both users
        if(order.side === "buy") {
          matchedUser[order.symbol]!.locked-= item.matchedOrders;
          user[order.symbol]!.available += item.matchedOrders;
          user.usd.locked -= item.matchedOrders * pricekey;
          matchedUser!.usd.available += item.matchedOrders * pricekey;
        }else {
          matchedUser[order.symbol]!.available += item.matchedOrders;
          user[order.symbol]!.locked -= item.matchedOrders;
          user.usd.available += item.matchedOrders * pricekey;
          matchedUser.usd.locked -= item.matchedOrders * pricekey;
        }

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
    
    if(result.orderStatus === "filled") {
      user.usd!.available += user.usd?.locked || 0;
      user.usd!.locked = 0;
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
      return items.map((item: AggregateFill): Fill => ({
        fillId: crypto.randomUUID(),
        symbol: order.symbol,
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

    const asks: {price: number, qty: number}[] = []
    ORDERBOOKS.get(message.payload.symbol)?.asks.forEach(( order, price) => {
      const qty = order.reduce((acc, item) => acc + ( item.qty - item.filledQty), 0)
      asks.push({price: price, qty})
    })

    const bids: {price: number, qty: number}[] = []
    ORDERBOOKS.get(message.payload.symbol)?.bids.forEach((order, price) => {
      const qty = order.reduce((acc, item) => acc + (item.qty - item.filledQty), 0)
      bids.push({price: price, qty})
    })
          

      return {
        symbol: message.payload.symbol,
        asks,
        bids
      };
    
  } else if(message.type === "get_user_balance") {

    if(!isId(message.payload, message.type)) {
      return {
        error: "invalid userId"
      }
    }
    const balance = BALANCES.get(message.payload.userId)
    return {
      balance
    }
  }else if(message.type === "get_order") {

    if(!isId(message.payload, message.type)) {
      return {
        error: "invalid userId"
      }
    }
    const order = ORDERS.get(message.payload.orderId)

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
    const order = ORDERS.get(message.payload.orderId)
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
    
    const deletedOrder = ORDERS.delete(message.payload.orderId)
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
    const {symbol, amount, userId} = message.payload

    let balance = BALANCES.get(userId)

    if(!balance) {
      BALANCES.set(userId, {})
    }
    balance = BALANCES.get(userId)
    if(!balance) {
      return {
        error: "user not found"
      }
    }
    

    if(!balance[symbol]) {
      balance[symbol] = {
        available: 0,
        locked: 0
      }
    }

    balance[symbol].available += amount
 
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