import type { Request, Response } from "express";
import {
  addBalanceBodySchema,
  orderBodySchema,
  orderIdParamSchema,
  symbolParamSchema,
  withdrawBalanceBodySchema,
} from "../types/exchange-schema.js";
import { sendToEngine } from "../utils/engine-client.js";
import { sendValidationError } from "../utils/validation.js";
import { prisma } from "../db.js";
import { OrderSide, OrderStatus, OrderType, FillType } from "../prisma/generated/prisma/client.js";

function getUserId(req: Request): string {
  if (!req.userId) throw new Error("Missing authenticated user");
  return req.userId;
}

async function ensureStock(symbol: string) {
  try {
    await prisma.stock.upsert({
      where: { symbol },
      update: {},
      create: {
        name: symbol,
        symbol,
      },
    });
  } catch (e) {
    // ignore if already exists
  }
}

function mapEngineOrderStatusToDb(status: string | undefined): OrderStatus {
  if (status === "filled") return OrderStatus.FILLED;
  if (status === "cancelled") return OrderStatus.CANCELLED;
  if (status === "partially_filled") return OrderStatus.OPEN;
  if (status === "open") return OrderStatus.OPEN;
  return OrderStatus.OPEN;
}

function mapTypeToDb(type: string): OrderType {
  if (type === "market") return OrderType.MARKET;
  return OrderType.LIMIT;
}

function mapSideToDb(side: string): OrderSide {
  if (side === "sell") return OrderSide.SELL;
  return OrderSide.BUY;
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);

  const parsedBody = orderBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { type, side, symbol, qty } = parsedBody.data;
  const price = type === "market" ? null : parsedBody.data.price;

  const engineResponse = await sendToEngine("create_order", {
    userId,
    type,
    side,
    symbol,
    price: type === "market" ? null : price,
    qty,
  });

  if (engineResponse.ok && engineResponse.data) {
    try {
      const data: any = engineResponse.data;
      const orderId = data.orderId;
      const orderSymbol = (symbol || data.symbol || "").toString().toUpperCase();
      if (orderId && orderSymbol) {
        await ensureStock(orderSymbol);
        const dbStatus = mapEngineOrderStatusToDb(data.status);
        const filledQty = Number(data.filledQty || 0);
        const orderPrice = type === "market" ? null : price != null ? Math.round(Number(price)) : null;
        await prisma.order.upsert({
          where: { id: orderId },
          update: {
            filledQuantity: filledQty,
            status: dbStatus,
          },
          create: {
            id: orderId,
            userId,
            market: orderSymbol,
            price: orderPrice,
            quantity: Number(qty),
            type: mapTypeToDb(type),
            side: mapSideToDb(side),
            filledQuantity: filledQty,
            status: dbStatus,
          },
        });
        // Create fills for the taker's order
        if (Array.isArray(data.fills)) {
          for (const f of data.fills) {
            try {
              const fillId = f.fillId || crypto.randomUUID();
              const fillQty = Number(f.qty || f.quantity || 0);
              const fillPrice = Math.round(Number(f.price || 0));
              if (fillQty <= 0) continue;
              // Avoid duplicates
              const existing = await prisma.fill.findFirst({
                where: { id: fillId },
              }).catch(() => null);
              if (existing) continue;
              await prisma.fill.create({
                data: {
                  id: fillId,
                  quantity: fillQty,
                  side: mapSideToDb(side),
                  type: FillType.TAKER,
                  userId,
                  price: fillPrice,
                  asset: orderSymbol,
                  orignalOrderId: orderId,
                },
              });
            } catch (e) {
              // continue on fill persistence errors
            }
          }
        }
      }
    } catch (e) {
      // Don't fail the request if DB persistence fails
    }
  }

  res.status(engineResponse.ok ? 200 : 400).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}

export async function getDepth(req: Request, res: Response): Promise<void> {
  const parsedParams = symbolParamSchema.safeParse(req.params);
  
  if (!parsedParams.success) {
    sendValidationError(res, parsedParams.error);
    return;
  }

  const { symbol } = parsedParams.data;
  const engineResponse = await sendToEngine("get_depth", { symbol });
  res.status(engineResponse.ok ? 200 : 400).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}

export async function getBalance(req: Request, res: Response): Promise<void> {
  const engineResponse = await sendToEngine("get_user_balance", {
    userId: getUserId(req),
  });

  res.status(engineResponse.ok ? 200 : 400).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const parsedParams = orderIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    sendValidationError(res, parsedParams.error);
    return;
  }

  const { orderId } = parsedParams.data;
  const engineResponse = await sendToEngine("get_order", {
    userId: getUserId(req),
    orderId,
  });

  res.status(engineResponse.ok ? 200 : 404).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const parsedParams = orderIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    sendValidationError(res, parsedParams.error);
    return;
  }

  const { orderId } = parsedParams.data;
  const engineResponse = await sendToEngine("cancel_order", {
    userId: getUserId(req),
    orderId,
  });

  res.status(engineResponse.ok ? 200 : 400).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}

export async function addBalance(req: Request, res: Response): Promise<void> {
  const parsedBody = addBalanceBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { symbol, amount } = parsedBody.data;
  const engineResponse = await sendToEngine("add_balance", {
    userId: getUserId(req),
    symbol,
    amount,
  });
  res.status(engineResponse.ok ? 200 : 400).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}

export async function withdrawBalance(req: Request, res: Response): Promise<void> {
  const parsedBody = withdrawBalanceBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { symbol, amount } = parsedBody.data;
  const engineResponse = await sendToEngine("withdraw_balance", {
    userId: getUserId(req),
    symbol,
    amount,
  });
  res.status(engineResponse.ok ? 200 : 400).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}

async function syncOrderFromEngine(userId: string, orderId: string) {
  try {
    const engineResponse = await sendToEngine("get_order", { userId, orderId });
    if (engineResponse.ok && engineResponse.data) {
      const data: any = engineResponse.data;
      const order = data.order || data;
      if (order) {
        const status = mapEngineOrderStatusToDb(order.status);
        const filledQty = Number(order.filledQty || order.filledQuantity || 0);
        await prisma.order.update({
          where: { id: orderId },
          data: {
            filledQuantity: filledQty,
            status,
          },
        }).catch(() => {});
      }
    }
  } catch (e) {
    // ignore
  }
}

export async function getOrders(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { id: "desc" },
    });
    // Sync open/partially filled orders from engine
    await Promise.all(
      orders
        .filter((o) => o.status === OrderStatus.OPEN)
        .slice(0, 20)
        .map((o) => syncOrderFromEngine(userId, o.id))
    );
    const updated = await prisma.order.findMany({
      where: { userId },
      orderBy: { id: "desc" },
    });
    res.json({ orders: updated });
  } catch (e) {
    res.status(500).json({ error: "failed to fetch orders" });
  }
}

export async function getOpenOrders(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  try {
    const orders = await prisma.order.findMany({
      where: { userId, status: OrderStatus.OPEN },
      orderBy: { id: "desc" },
    });
    await Promise.all(orders.map((o) => syncOrderFromEngine(userId, o.id)));
    const updated = await prisma.order.findMany({
      where: { userId, status: OrderStatus.OPEN },
      orderBy: { id: "desc" },
    });
    res.json({ orders: updated });
  } catch (e) {
    res.status(500).json({ error: "failed to fetch open orders" });
  }
}

export async function getFills(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  try {
    const fills = await prisma.fill.findMany({
      where: { userId },
      orderBy: { id: "desc" },
    });
    res.json({ fills });
  } catch (e) {
    res.status(500).json({ error: "failed to fetch fills" });
  }
}