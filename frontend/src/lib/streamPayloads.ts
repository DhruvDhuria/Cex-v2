/**
 * Payload shapes pushed by the ws-server.
 *
 * Every frame is `{ stream, data }` where `data` is a JSON string, so each
 * payload is parsed exactly once, here.
 */

export interface TradePayload {
  price: number;
  qty: number;
  ts?: number;
}

/** A single price level of the order book. `qty` is absolute, not a delta. */
export interface DepthLevelPayload {
  price: number;
  qty: number;
}

export interface DepthStreamPayload {
  market?: string;
  asks: DepthLevelPayload[];
  bids: DepthLevelPayload[];
}

export interface TickerPayload {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePercent: number;
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTrade(raw: string): TradePayload | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(data.trades)) {
      return null;
    }
    const price = toNumber(data.price);
    const qty = toNumber(data.qty);
    if (price === null || qty === null) return null;
    const ts = toNumber(data.ts);
    return { price, qty, ts: ts ?? undefined };
  } catch {
    return null;
  }
}

export function parseTradeSnapshot(raw: string): TradePayload[] | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(data.trades)) return null;
    const out: TradePayload[] = [];
    for (const item of data.trades) {
      if (typeof item !== "object" || item === null) continue;
      const t = item as Record<string, unknown>;
      const price = toNumber(t.price);
      const qty = toNumber(t.qty);
      if (price === null || qty === null) continue;
      const ts = toNumber(t.ts);
      out.push({ price, qty, ts: ts ?? undefined });
    }
    return out.length > 0 ? out.reverse() : out;
  } catch {
    return null;
  }
}

export function parseDepth(raw: string): DepthStreamPayload | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const levels = (value: unknown): DepthLevelPayload[] => {
      if (!Array.isArray(value)) return [];
      const out: DepthLevelPayload[] = [];
      for (const item of value) {
        if (typeof item !== "object" || item === null) continue;
        const level = item as Record<string, unknown>;
        const price = toNumber(level.price);
        const qty = toNumber(level.qty);
        if (price === null || qty === null) continue;
        out.push({ price, qty });
      }
      return out;
    };

    return {
      market: typeof data.market === "string" ? data.market : undefined,
      asks: levels(data.asks),
      bids: levels(data.bids),
    };
  } catch {
    return null;
  }
}

export function parseTicker(raw: string): TickerPayload | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const open = toNumber(data.open);
    const high = toNumber(data.high);
    const low = toNumber(data.low);
    const close = toNumber(data.close);
    const volume = toNumber(data.volume);
    const changePercent = toNumber(data.changePercent);
    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null ||
      changePercent === null
    ) {
      return null;
    }
    return { open, high, low, close, volume, changePercent };
  } catch {
    return null;
  }
}
