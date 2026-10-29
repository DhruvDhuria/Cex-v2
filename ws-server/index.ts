// import "dotenv/config";
import Websocket, { WebSocketServer } from "ws";
import { createClient } from "redis";
import { TickerManager, type TickerPayload } from "./utils/tickerManager.ts";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const MAX_TRADE_BUFFER = 50;

/**
 * Channel keys are `<kind>.<SYMBOL>_USD`.
 * `kind` is always lowercase, the pair is always uppercase.
 * Subscribe and broadcast MUST both go through this function — a mismatch
 * silently delivers nothing to the client.
 */
function normalizeChannel(channel: string): string {
  const [kind, pair] = channel.split(".");
  if (!kind || !pair) return channel;
  return `${kind.toLowerCase()}.${pair.toUpperCase()}`;
}

// Active client subscriptions mapping: e.g., { "ticker.BTC_USD": [ws, ws] }
const activeSubscriptions: Record<string, Websocket[]> = {};

// Local registry of TickerManager instances, one per market pair
const tickerRegistry: Map<string, TickerManager> = new Map();
const tradeBuffers: Map<string, Array<{ price: number; qty: number; ts: number }>> = new Map();

/** Sockets that answered the last heartbeat ping. */
const alive = new WeakSet<Websocket>();

function broadcastToSubscribers(channelName: string, payload: string) {
  const subscribers = activeSubscriptions[normalizeChannel(channelName)];
  if (!subscribers || subscribers.length === 0) return;

  subscribers.forEach((ws) => {
    if (ws.readyState === Websocket.OPEN) {
      ws.send(payload);
    }
  });
}

function handleDepthEvent(message: Record<string, string>) {
  const symbol = message.market;
  if (!symbol) return;

  const updateName = normalizeChannel(`depth.${symbol}_USD`);

  const payload = JSON.stringify({
    stream: updateName,
    data: message.data,
  });
  broadcastToSubscribers(updateName, payload);
}

function handleTradesEvent(message: Record<string, string>) {
  const symbol = message.market;
  if (!symbol) return;

  const normalizedMarket = `${symbol.toUpperCase()}_USD`;

  // --- TICKER ENGINE INTEGRATION ---
  // message.data is a JSON string published by the engine, parse it first
  if (typeof message.data !== "string") return;
  let trade: { price?: unknown; qty?: unknown };
  try {
    trade = JSON.parse(message.data);
  } catch {
    return;
  }

  const tradePrice = parseFloat(String(trade.price));
  const tradeQty = parseFloat(String(trade.qty));
  if (isNaN(tradePrice) || isNaN(tradeQty)) return;

  if (!tickerRegistry.has(normalizedMarket)) {
    tickerRegistry.set(normalizedMarket, new TickerManager());
  }
  const manager = tickerRegistry.get(normalizedMarket)!;

  const updated24hTicker: TickerPayload = manager.update(tradePrice, tradeQty);

  // raw trades
  const updateName = normalizeChannel(`trades.${normalizedMarket}`);
  const tradeWithTs = { price: tradePrice, qty: tradeQty, ts: Date.now() };
  let buffer = tradeBuffers.get(normalizedMarket);
  if (!buffer) {
    buffer = [];
    tradeBuffers.set(normalizedMarket, buffer);
  }
  buffer.unshift(tradeWithTs);
  if (buffer.length > MAX_TRADE_BUFFER) {
    buffer.length = MAX_TRADE_BUFFER;
  }

  const rawTradePayload = JSON.stringify({
    stream: updateName,
    data: JSON.stringify({ price: tradePrice, qty: tradeQty, ts: tradeWithTs.ts }),
  });
  broadcastToSubscribers(updateName, rawTradePayload);

  const tickerChannelName = normalizeChannel(`ticker.${normalizedMarket}`);
  const tickerPayload = JSON.stringify({
    stream: tickerChannelName,
    // `data` is always a JSON string so clients parse it exactly once
    data: JSON.stringify(updated24hTicker),
  });
  broadcastToSubscribers(tickerChannelName, tickerPayload);
}

/**
 * Reads one Redis stream forever with its own cursor.
 *
 * Each stream gets an independent blocking read so a busy stream can never
 * starve the other one, and each cursor only ever moves forward — an entry
 * published while the reader was blocked on another stream is never skipped.
 */
async function readStreamForever(
  key: string,
  onEvent: (message: Record<string, string>) => void,
) {
  // Each stream needs its own connection: a blocking XREAD holds the socket
  // until it returns, so sharing one client makes the second read wait forever.
  const reader = createClient({ url: REDIS_URL }).on("error", (error) =>
    console.error(`redis error (${key})`, error),
  );
  await reader.connect();

  let lastId = "$";

  for (;;) {
    try {
      const response = await reader.xRead([{ key, id: lastId }], {
        COUNT: 50,
        BLOCK: 0,
      });
      if (!response) continue;

      for (const stream of response) {
        for (const event of stream.messages) {
          lastId = event.id;
          onEvent(event.message as Record<string, string>);
        }
      }
    } catch (error) {
      console.error(`Stream read error (${key}):`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

void readStreamForever("depthStream", handleDepthEvent);
void readStreamForever("aggtradesStream", handleTradesEvent);

const wss = new WebSocketServer({ port: 8080 });

// Reap sockets that stopped answering pings (half-open connections).
// const heartbeat = setInterval(() => {
//   for (const client of wss.clients) {
//     if (!alive.has(client)) {
//       client.terminate();
//       continue;
//     }
//     alive.delete(client);
//     client.ping();
//   }
// }, 30_000);
// wss.on("close", () => clearInterval(heartbeat));

wss.on("connection", (ws) => {
  alive.add(ws);
  ws.on("pong", () => alive.add(ws));

  ws.on("message", (message) => {
    // Handled params structural examples: depth.BTC_USD, trades.BTC_USD, ticker.BTC_USD
    try {
      const parsedData = JSON.parse(message.toString());

      if (parsedData.method === "SUBSCRIBE") {
        parsedData.params.forEach((param: string) => {
          const normalizedParam = normalizeChannel(param);
          if (!activeSubscriptions[normalizedParam]) {
            activeSubscriptions[normalizedParam] = [];
          }
          if (!activeSubscriptions[normalizedParam].includes(ws)) {
            activeSubscriptions[normalizedParam].push(ws);
          }

          // Send snapshots for trades/ticker on subscribe
          try {
            const parts = normalizedParam.split(".");
            if (parts.length === 2) {
              const kind = parts[0]!.toLowerCase();
              const pair = parts[1]!.toUpperCase();
              const market = pair.replace("_USD", "");
              if (kind === "trades") {
                const buffer = tradeBuffers.get(pair);
                if (buffer && buffer.length > 0) {
                  const snapshot = {
                    stream: normalizedParam,
                    data: JSON.stringify({ trades: buffer }),
                  };
                  if (ws.readyState === Websocket.OPEN) {
                    ws.send(JSON.stringify(snapshot));
                  }
                }
              } else if (kind === "ticker") {
                const manager = tickerRegistry.get(pair);
                const cached = manager?.getTicker?.();
                if (cached) {
                  const snapshot = {
                    stream: normalizedParam,
                    data: JSON.stringify(cached),
                  };
                  if (ws.readyState === Websocket.OPEN) {
                    ws.send(JSON.stringify(snapshot));
                  }
                }
              }
            }
          } catch (e) {
            // ignore snapshot errors
          }
        });
      } else if (parsedData.method === "UNSUBSCRIBE") {
        parsedData.params.forEach((param: string) => {
          const normalizedParam = normalizeChannel(param);
          if (activeSubscriptions[normalizedParam]) {
            activeSubscriptions[normalizedParam] = activeSubscriptions[
              normalizedParam
            ].filter((x) => x !== ws);
            if (activeSubscriptions[normalizedParam].length === 0) {
              delete activeSubscriptions[normalizedParam];
            }
          }
        });
      }
    } catch (error) {
      console.error("Error processing WS message:", error);
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("close", () => {
    Object.keys(activeSubscriptions).forEach((param) => {
      activeSubscriptions[param] = activeSubscriptions[param]!.filter(
        (client) => client !== ws,
      );
      if (activeSubscriptions[param].length === 0) {
        delete activeSubscriptions[param];
      }
    });
  });
});
