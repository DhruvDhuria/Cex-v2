import "dotenv/config";
import { env } from "./utils/env.ts";
import { brokerClient, commandClient } from "./redis.ts";
import { matchAlgorithm, type AggregateFill, type Order } from "./utils/matchAlgorithmOptimized.ts";
import {
  BALANCES,
  FILLS,
  ORDERBOOKS,
  ORDERS,
  type Fill,
  type OrderStatus,
  type RestingOrder,
} from "./store/exchange-store.ts";
import { publishToStream, type DepthUpdates, type TradeUpdate } from "./streams.ts";

const assets = ["BTC", "ETH", "SOL"];

function initializeOrderBook() {
  ORDERBOOKS.clear();
  for (const asset of assets) {
    ORDERBOOKS.set(asset, { lastTradedPrice: null, asks: new Map(), bids: new Map() });
  }
}
initializeOrderBook();

export type EngineCommandType =
  | "create_order"
  | "get_depth"
  | "get_user_balance"
  | "get_order"
  | "cancel_order"
  | "add_balance"
  | "withdraw_balance";

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
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;

  if (o.type !== "limit" && o.type !== "market") return false;
  if (o.side !== "buy" && o.side !== "sell") return false;
  if (typeof o.symbol !== "string" || o.symbol.length === 0) return false;
  if (typeof o.qty !== "number" || !Number.isFinite(o.qty) || o.qty <= 0) return false;
  if (typeof o.userId !== "string" || o.userId.length === 0) return false;

  if (o.type === "limit") {
    return typeof o.price === "number" && Number.isFinite(o.price) && o.price > 0;
  }
  return o.price === null || o.price === undefined;
}

function isAddBalanceRequest(
  data: unknown,
): data is { symbol: string; amount: number; userId: string } {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.symbol === "string" &&
    o.symbol.length > 0 &&
    typeof o.amount === "number" &&
    Number.isFinite(o.amount) &&
    o.amount > 0 &&
    typeof o.userId === "string" &&
    o.userId.length > 0
  );
}

// 1. Map the request types to their expected property names
type RequestKeyMap = {
  get_order: "orderId";
  cancel_order: "orderId";
  get_user_balance: "userId";
  add_balance: "userId";
  withdraw_balance: "userId";
};

// 2. Fallback helper: if it's in the map, use it; otherwise default to "symbol"
type GetPayloadKey<T extends string> = T extends keyof RequestKeyMap
  ? RequestKeyMap[T]
  : "symbol";

// 3. The Function with Generic narrowing
function isId<K extends string>(
  data: unknown,
  requestType: K,
): data is Record<GetPayloadKey<K>, string> {
  const value: string =
    requestType === "get_order" || requestType === "cancel_order"
      ? "orderId"
      : requestType === "get_user_balance" ||
          requestType === "add_balance" ||
          requestType === "withdraw_balance"
        ? "userId"
        : "symbol";

  return (
    typeof data === "object" &&
    data !== null &&
    value in data &&
    typeof (data as Record<string, unknown>)[value] === "string"
  );
}

function hasUserId(
  data: unknown,
): data is Record<string, unknown> & { userId: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>).userId === "string"
  );
}

function isErrorResult(data: unknown): data is { error: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  );
}

/** Absolute quantity resting at a price level. */
function levelQty(orders: RestingOrder[] | undefined): number {
  if (!orders) return 0;
  return orders.reduce((acc, item) => acc + (item.qty - item.filledQty), 0);
}

function statusFor(filledQty: number, qty: number): OrderStatus {
  if (filledQty >= qty) return "filled";
  if (filledQty > 0) return "partially_filled";
  return "open";
}

async function handleEngineRequest(message: EngineRequest): Promise<unknown> {
  if (message.type === "create_order") {
    if (!isOrder(message.payload)) {
      return { error: "invalid order" };
    }

    const order: Order = {
      ...message.payload,
      symbol: message.payload.symbol.toUpperCase(),
    };

    const result = matchAlgorithm(order);

    if (result.error) {
      return { error: result.error };
    }

    const user = BALANCES.get(order.userId);
    if (!user) {
      return { error: "User not found" };
    }

    const book = ORDERBOOKS.get(order.symbol);
    if (!book) {
      return { error: "Asset not found" };
    }

    const touchedAsks = new Set<number>();
    const touchedBids = new Set<number>();
    const fills: Fill[] = [];

    if (result.priceAggregate) {
      for (const [priceKey, items] of result.priceAggregate) {
        if (order.side === "buy") {
          touchedAsks.add(priceKey);
        } else {
          touchedBids.add(priceKey);
        }

        for (const item of items as AggregateFill[]) {
          const matchedQty = item.matchedOrders;
          const matchedUser = BALANCES.get(item.matchedUser);
          if (!matchedUser) {
            console.error("Matched user not found", item.matchedUser);
            continue;
          }

          // set default balances if they don't exist to 0 so that we don't get undefined errors when updating balances
          user.usd = user.usd || { available: 0, locked: 0 };
          matchedUser.usd = matchedUser.usd || { available: 0, locked: 0 };
          user[order.symbol] = user[order.symbol] || { available: 0, locked: 0 };
          matchedUser[order.symbol] = matchedUser[order.symbol] || { available: 0, locked: 0 };

          // settle balances for both users
          if (order.side === "buy") {
            matchedUser[order.symbol]!.locked -= matchedQty;
            user[order.symbol]!.available += matchedQty;
            user.usd.locked -= matchedQty * priceKey;
            matchedUser.usd.available += matchedQty * priceKey;
          } else {
            matchedUser[order.symbol]!.available += matchedQty;
            user[order.symbol]!.locked -= matchedQty;
            user.usd.available += matchedQty * priceKey;
            matchedUser.usd.locked -= matchedQty * priceKey;
          }

          // keep the maker's order record in sync with what just happened
          const makerRecord = ORDERS.get(item.orderId);
          if (makerRecord) {
            makerRecord.filledQty += matchedQty;
            makerRecord.status = statusFor(makerRecord.filledQty, makerRecord.qty);
          }

          const fill: Fill = {
            fillId: crypto.randomUUID(),
            symbol: order.symbol,
            price: priceKey,
            qty: matchedQty,
            type: order.type,
            orderId: item.orderId,
            createdAt: Date.now(),
          };
          FILLS.push(fill);
          fills.push(fill);
          makerRecord?.fills.push(fill);

          book.lastTradedPrice = priceKey;

          const tradeUpdate: TradeUpdate = { price: priceKey, qty: matchedQty };
          await publishToStream(order.symbol, tradeUpdate, "TradesUpdate");
        }
      }
    }

    if (result.orderStatus === "filled") {
      user.usd!.available += user.usd?.locked || 0;
      user.usd!.locked = 0;
    }

    const averagePrice = result.filledQty
      ? Array.from(result.priceAggregate!.entries()).reduce(
          (acc: number, [priceKey, items]) => {
            const levelMatchedOrders = items.reduce(
              (sum, item) => sum + item.matchedOrders,
              0,
            );
            return acc + priceKey * levelMatchedOrders;
          },
          0,
        ) / result.filledQty
      : 0;
    const price = averagePrice.toFixed(2);

    if (result.orderbookAddUpdate) {
      const { side, price: levelPrice } = result.orderbookAddUpdate;
      if (side === "buy") {
        touchedBids.add(levelPrice);
      } else {
        touchedAsks.add(levelPrice);
      }
    }

    const depthUpdates: DepthUpdates = {
      market: order.symbol,
      asks: [...touchedAsks].map((levelPrice) => ({
        price: levelPrice,
        qty: levelQty(book.asks.get(levelPrice)),
      })),
      bids: [...touchedBids].map((levelPrice) => ({
        price: levelPrice,
        qty: levelQty(book.bids.get(levelPrice)),
      })),
    };

    await publishToStream(order.symbol, depthUpdates, "depthUpdate");

    ORDERS.set(result.orderId!.toString(), {
      userId: order.userId,
      side: order.side,
      type: order.type,
      symbol: order.symbol,
      price: order.price,
      qty: order.qty,
      filledQty: result.filledQty ?? 0,
      status: result.orderStatus ?? "open",
      fills,
      createdAt: Date.now(),
    });

    return {
      orderId: result.orderId,
      status: result.orderStatus,
      filledQty: result.filledQty,
      averagePrice: price,
      fills: fills,
    };
  } else if (message.type === "get_depth") {
    if (!isId(message.payload, message.type)) {
      return { error: "invalid symbol" };
    }

    const symbol = message.payload.symbol.toUpperCase();
    const book = ORDERBOOKS.get(symbol);

    const asks: { price: number; qty: number }[] = [];
    book?.asks.forEach((orders, price) => {
      const qty = levelQty(orders);
      if (qty > 0) asks.push({ price, qty });
    });

    const bids: { price: number; qty: number }[] = [];
    book?.bids.forEach((orders, price) => {
      const qty = levelQty(orders);
      if (qty > 0) bids.push({ price, qty });
    });

    asks.sort((a, b) => a.price - b.price);
    bids.sort((a, b) => b.price - a.price);

    return {
      symbol,
      asks,
      bids,
    };
  } else if (message.type === "get_user_balance") {
    if (!isId(message.payload, message.type)) {
      return { error: "invalid userId" };
    }
    const balance = BALANCES.get(message.payload.userId);
    return {
      balance: balance ?? {},
    };
  } else if (message.type === "get_order") {
    if (!isId(message.payload, message.type) || !hasUserId(message.payload)) {
      return { error: "invalid orderId" };
    }
    const order = ORDERS.get(message.payload.orderId);
    if (!order) {
      return { error: "order not found" };
    }
    if (order.userId !== message.payload.userId) {
      return { error: "order not found" };
    }
    return {
      order,
    };
  } else if (message.type === "cancel_order") {
    if (!isId(message.payload, message.type) || !hasUserId(message.payload)) {
      return { error: "invalid orderId" };
    }

    const orderId = message.payload.orderId;
    const userId = message.payload.userId;
    const order = ORDERS.get(orderId);
    if (!order) {
      return { error: "order not found" };
    }
    if (order.userId !== userId) {
      return { error: "order not found" };
    }
    if (order.status === "filled") {
      return { error: "order is already filled" };
    }
    if (order.status === "cancelled") {
      return { error: "order is already cancelled" };
    }

    const remaining = order.qty - order.filledQty;
    const book = ORDERBOOKS.get(order.symbol);
    const side = order.side === "buy" ? "bids" : "asks";
    const levelPrice = order.price;
    let removed = false;

    if (book && levelPrice !== null) {
      const level = book[side].get(levelPrice);
      if (level) {
        const index = level.findIndex((resting) => resting.orderId === orderId);
        if (index !== -1) {
          level.splice(index, 1);
          removed = true;
        }
        if (level.length === 0) {
          book[side].delete(levelPrice);
        }
      }
    }

    if (removed) {
      // release the funds this order was holding
      const user = BALANCES.get(userId);
      if (user) {
        if (order.side === "buy") {
          user.usd = user.usd || { available: 0, locked: 0 };
          user.usd.locked -= remaining * (levelPrice ?? 0);
        } else {
          user[order.symbol] = user[order.symbol] || { available: 0, locked: 0 };
          user[order.symbol]!.locked -= remaining;
        }
      }
    }

    order.status = "cancelled";

    if (book && levelPrice !== null) {
      const depthUpdates: DepthUpdates = {
        market: order.symbol,
        asks:
          order.side === "sell"
            ? [{ price: levelPrice, qty: levelQty(book.asks.get(levelPrice)) }]
            : [],
        bids:
          order.side === "buy"
            ? [{ price: levelPrice, qty: levelQty(book.bids.get(levelPrice)) }]
            : [],
      };
      await publishToStream(order.symbol, depthUpdates, "depthUpdate");
    }

    return {
      order,
    };
  } else if (message.type === "add_balance") {
    if (!isId(message.payload, message.type) || !isAddBalanceRequest(message.payload)) {
      return { error: "invalid payload" };
    }
    const { symbol, amount, userId } = message.payload;

    let balance = BALANCES.get(userId);
    if (!balance) {
      balance = {};
      BALANCES.set(userId, balance);
    }
    if (!balance[symbol]) {
      balance[symbol] = { available: 0, locked: 0 };
    }

    balance[symbol].available += amount;

    return {
      balance,
    };
  } else if (message.type === "withdraw_balance") {
    if (!isId(message.payload, message.type) || !isAddBalanceRequest(message.payload)) {
      return { error: "invalid payload" };
    }
    const { symbol, amount, userId } = message.payload;

    let balance = BALANCES.get(userId);
    if (!balance) {
      balance = {};
      BALANCES.set(userId, balance);
    }
    if (!balance[symbol]) {
      balance[symbol] = { available: 0, locked: 0 };
    }

    if (balance[symbol].available < amount) {
      return { error: "insufficient balance" };
    }

    balance[symbol].available -= amount;

    return {
      balance,
    };
  }

  return { error: `unsupported command: ${message.type}` };
}

async function sendResponse(responseQueue: string, response: EngineResponse): Promise<void> {
  await commandClient.lPush(responseQueue, JSON.stringify(response));
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
    const data = await handleEngineRequest(message);
    if (isErrorResult(data)) {
      await sendResponse(message.responseQueue, {
        correlationId: message.correlationId,
        ok: false,
        error: data.error,
      });
    } else {
      await sendResponse(message.responseQueue, {
        correlationId: message.correlationId,
        ok: true,
        data,
      });
    }
  } catch (error) {
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok: false,
      error: error instanceof Error ? error.message : "engine_error",
    });
  }
}