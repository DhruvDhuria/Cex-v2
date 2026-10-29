import { commandClient } from "./redis.ts";

export type StreamType = "depthUpdate" | "TradesUpdate";

/** A single price level of the order book, as published on the depth stream. */
export interface DepthLevelUpdate {
  price: number;
  qty: number;
}

/**
 * Depth stream payload.
 *
 * `qty` is the ABSOLUTE quantity resting at `price` after the update, not a
 * signed delta. A level that was fully consumed is published with `qty: 0` so
 * consumers can drop it.
 */
export interface DepthUpdates {
  market: string;
  asks: DepthLevelUpdate[];
  bids: DepthLevelUpdate[];
}

/** Trade stream payload. */
export interface TradeUpdate {
  price: number;
  qty: number;
}

const STREAM_BY_TYPE: Record<StreamType, string> = {
  depthUpdate: "depthStream",
  TradesUpdate: "aggtradesStream",
};

export async function publishToStream(
  market: string,
  data: DepthUpdates | TradeUpdate,
  type: StreamType,
): Promise<void> {
  try {
    await commandClient.xAdd(STREAM_BY_TYPE[type], "*", {
      market,
      data: JSON.stringify(data),
    });
  } catch (error) {
    console.error(`Failed to publish ${type} for ${market}`, error);
  }
}
