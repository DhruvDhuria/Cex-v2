import { type OrderType, type Side, type Balance, type OrderStatus, type RestingOrder } from "../store/exchange-store.ts";
import { ORDERBOOKS, BALANCES } from "../store/exchange-store.ts";

export interface Order {
  type: OrderType;
  side: Side;
  symbol: string;
  price: number | null;
  qty: number;
  userId: string;
}

export interface AggregateFill {
  matchedOrders: number;
  matchedUser: string;
  totalOrderQty: number;
  orderId: string;
  side: string;
}

export interface MatchResponse {
  filledQty?: number;
  priceAggregate?: Map<number, AggregateFill[]>;
  orderId?: string;
  orderStatus?: OrderStatus;
  orderbookAddUpdate?: { side: string; price: number; qty: number };
  error?: string;
  message?: string;
}

interface MatchState {
  filledQty: number;
  priceAggregate: Map<number, AggregateFill[]>;
  remainingQty: number;
}

function getSortedLevels(
  book: Map<number, RestingOrder[]>,
  ascending: boolean
): [number, RestingOrder[]][] {
  const entries = [...book.entries()];
  entries.sort((a, b) => (ascending ? a[0] - b[0] : b[0] - a[0]));
  return entries;
}

function removeOrderFromLevel(
  orders: RestingOrder[],
  orderId: string
): void {
  const idx = orders.findIndex((o) => o.orderId === orderId);
  if (idx === -1) return;
  // splice (not swap-with-last) so price-time priority inside a level survives
  orders.splice(idx, 1);
}

function matchAgainstOrders(
  sortedLevels: [number, RestingOrder[]][],
  incomingQty: number,
  incomingSide: Side,
  counterpartyBook: Map<number, RestingOrder[]>,
  priceGuard?: (levelPrice: number) => boolean
): MatchState {
  const state: MatchState = {
    filledQty: 0,
    priceAggregate: new Map(),
    remainingQty: incomingQty,
  };

  for (const [levelPrice, orders] of sortedLevels) {
    if (state.remainingQty <= 0) break;
    if (priceGuard && !priceGuard(levelPrice)) break;

    let levelRemaining = 0;
    for (const o of orders) {
      const avail = o.qty - o.filledQty;
      if (avail > 0) levelRemaining += avail;
    }

    for (let i = 0; i < orders.length && state.remainingQty > 0; ) {
      const restingOrder = orders[i]!;
      const orderQty = restingOrder.qty - restingOrder.filledQty;

      if (orderQty <= 0) {
        removeOrderFromLevel(orders, restingOrder.orderId);
        continue;
      }

      const counterparty = BALANCES.get(restingOrder.userId);
      if (!counterparty) {
        removeOrderFromLevel(orders, restingOrder.orderId);
        continue;
      }

      const matchedQty = Math.min(orderQty, state.remainingQty);

      const agg: AggregateFill = {
        matchedOrders: matchedQty,
        totalOrderQty: levelRemaining,
        matchedUser: restingOrder.userId,
        orderId: restingOrder.orderId,
        side: incomingSide,
      };

      const existing = state.priceAggregate.get(levelPrice);
      if (existing) {
        existing.push(agg);
      } else {
        state.priceAggregate.set(levelPrice, [agg]);
      }

      restingOrder.filledQty += matchedQty;
      state.filledQty += matchedQty;
      state.remainingQty -= matchedQty;
      levelRemaining -= matchedQty;

      if (restingOrder.filledQty >= restingOrder.qty) {
        restingOrder.status = "filled";
        removeOrderFromLevel(orders, restingOrder.orderId);
      } else {
        restingOrder.status = "partially_filled";
        i++;
      }
    }

    if (orders.length === 0) {
      counterpartyBook.delete(levelPrice);
    }
  }

  return state;
}

function deductBalance(balance: Balance, qty: number): boolean {
  if (balance.available < qty) return false;
  balance.available -= qty;
  balance.locked += qty;
  return true;
}

function resolveStatus(filledQty: number, totalQty: number, forMarket: boolean): OrderStatus {
  if (filledQty === totalQty) return "filled";
  if (filledQty > 0) return "partially_filled";
  return forMarket ? "cancelled" : "open";
}

interface HandlerCtx {
  user: Record<string, Balance>;
  asset: { lastTradedPrice: number | null; bids: Map<number, RestingOrder[]>; asks: Map<number, RestingOrder[]> };
  symbol: string;
  side: Side;
  isBuy: boolean;
  orderId: string;
  qty: number;
  userId: string;
  counterBook: Map<number, RestingOrder[]>;
  sortedLevels: [number, RestingOrder[]][];
}

function handleMarketOrder(ctx: HandlerCtx): MatchResponse {
  const { user, asset, symbol, side, isBuy, orderId, qty, counterBook, sortedLevels } = ctx;

  if (counterBook.size === 0) {
    return { error: `No ${isBuy ? "asks" : "bids"} available for market ${side} orders` };
  }

  if (isBuy) {
    const marketPrice = asset.lastTradedPrice ?? sortedLevels[0]?.[0];
    if (!marketPrice) return { error: "No asks available for market buy orders" };

    const estimatedCost = marketPrice * qty * 1.03;
    if (!deductBalance(user.usd!, estimatedCost)) {
      return { error: "Insufficient balance" };
    }
  } else {
    const assetBalance = user[symbol]!;
    if (assetBalance.available < qty) {
      return { error: "Insufficient balance" };
    }
    assetBalance.available -= qty;
    assetBalance.locked += qty;
  }

  const state = matchAgainstOrders(sortedLevels, qty, side, counterBook);

  return {
    filledQty: state.filledQty,
    priceAggregate: state.priceAggregate,
    orderId,
    orderStatus: resolveStatus(state.filledQty, qty, true),
  };
}

function handleLimitOrder(ctx: HandlerCtx & { price: number }): MatchResponse {
  const { user, asset, symbol, side, isBuy, orderId, price, qty, userId, counterBook, sortedLevels } = ctx;

  const priceGuard = isBuy
    ? (lp: number) => lp <= price
    : (lp: number) => lp >= price;

  if (isBuy) {
    if (!deductBalance(user.usd!, price * qty)) {
      return { error: "Insufficient balance" };
    }
  } else {
    const assetBalance = user[symbol]!;
    if (assetBalance.available < qty) {
      return { error: "Insufficient balance" };
    }
    assetBalance.available -= qty;
    assetBalance.locked += qty;
  }

  const state = matchAgainstOrders(sortedLevels, qty, side, counterBook, priceGuard);
  const orderStatus = resolveStatus(state.filledQty, qty, false);

  if (state.filledQty === qty) {
    return {
      filledQty: state.filledQty,
      priceAggregate: state.priceAggregate,
      orderId,
      orderStatus: "filled",
    };
  }

  const remaining = qty - state.filledQty;
  const restingOrder: RestingOrder = {
    side,
    type: "limit",
    userId,
    orderId,
    qty: remaining,
    filledQty: 0,
    status: orderStatus,
    symbol,
    price,
    createdAt: Date.now(),
  };

  const ownBookSide = isBuy ? asset.bids : asset.asks;
  const existing = ownBookSide.get(price);
  if (existing) {
    existing.push(restingOrder);
  } else {
    ownBookSide.set(price, [restingOrder]);
  }

  return {
    filledQty: state.filledQty,
    priceAggregate: state.priceAggregate,
    orderId,
    orderStatus,
    orderbookAddUpdate: { side, qty: remaining, price },
  };
}

export function matchAlgorithm(order: Order): MatchResponse {
  const { type, side, symbol, price, qty, userId } = order;

  const user = BALANCES.get(userId);
  if (!user) return { error: "User not found" };

  const asset = ORDERBOOKS.get(symbol);
  if (!asset) return { error: "Asset not found" };

  user.usd = user.usd || { available: 0, locked: 0 };
  user[symbol] = user[symbol] || { available: 0, locked: 0 };

  const orderId = crypto.randomUUID();
  const isBuy = side === "buy";

  const counterBook = isBuy ? asset.asks : asset.bids;
  const sortedLevels = getSortedLevels(counterBook, isBuy);

  const ctx: HandlerCtx & { price?: number } = {
    user, asset, symbol, side, isBuy, orderId, qty, userId, counterBook, sortedLevels,
    ...(price != null ? { price } : {}),
  };

  return type === "market"
    ? handleMarketOrder(ctx as HandlerCtx)
    : handleLimitOrder(ctx as HandlerCtx & { price: number });
}
