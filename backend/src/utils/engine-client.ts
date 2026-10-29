import { createClient } from "redis";
import { env } from "./env.js";
import {
  resolveEngineResponse,
  waitForEngineResponse,
} from "../store/pending-responses.js";
import type {
  EngineCommandType,
  EngineRequest,
  EngineResponse,
} from "../types/engine.js";

const publisher = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis publisher error", error);
});

const subscriber = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis subscriber error", error);
});

export async function connectRedis(): Promise<void> {
  await Promise.all([publisher.connect(), subscriber.connect()]);
}

export async function pingRedis(): Promise<string> {
  return publisher.ping();
}

export interface TradeHistoryEntry {
  price: number;
  qty: number;
  ts: number;
}

const TRADES_STREAM = "aggtradesStream";

/**
 * Reads recent trades for a market straight from the engine's Redis stream.
 *
 * The stream retains every published trade, so this is the source of truth for
 * chart history. `ts` comes from the stream entry id (`<ms>-<seq>`), which is
 * the moment the engine published the trade.
 */
export async function readTradeHistory(
  symbol: string,
  limit: number,
): Promise<TradeHistoryEntry[]> {
  const normalized = symbol.toUpperCase();
  // The stream is shared by every market, so over-fetch before filtering.
  const entries = await publisher.xRevRange(TRADES_STREAM, "+", "-", {
    COUNT: limit * 4,
  });

  const trades: TradeHistoryEntry[] = [];
  for (const entry of entries) {
    if (trades.length >= limit) break;

    const message = entry.message as Record<string, string>;
    if ((message.market ?? "").toUpperCase() !== normalized) continue;

    let parsed: { price?: unknown; qty?: unknown };
    try {
      parsed = JSON.parse(message.data ?? "{}") as { price?: unknown; qty?: unknown };
    } catch {
      continue;
    }

    const price = Number(parsed.price);
    const qty = Number(parsed.qty);
    const ts = Number(entry.id.split("-")[0]);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(ts)) {
      continue;
    }

    trades.push({ price, qty, ts });
  }

  return trades.reverse();
}

export async function sendToEngine(
  type: EngineCommandType,
  payload: Record<string, unknown>,
): Promise<EngineResponse> {
  const correlationId = crypto.randomUUID();
  const responsePromise = waitForEngineResponse(correlationId, env.engineTimeoutMs);

  const message: EngineRequest = {
    correlationId,
    responseQueue: env.responseQueue,
    type,
    payload,
  };

  await publisher.lPush(env.incomingQueue, JSON.stringify(message));
  return responsePromise;
}

export async function listenForEngineResponses(): Promise<void> {
  for (;;) {
    const response = await subscriber.brPop(env.responseQueue, 0);
    if (!response) continue;

    try {
      const parsedResponse = JSON.parse(response.element) as EngineResponse;
      if (
        !parsedResponse ||
        typeof parsedResponse.correlationId !== "string" ||
        typeof parsedResponse.ok !== "boolean"
      ) {
        console.error("Malformed engine response", response.element);
        continue;
      }
      resolveEngineResponse(parsedResponse);
    } catch (error) {
      console.error("Invalid engine response", error);
    }
  }
}
