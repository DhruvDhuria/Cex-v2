import Denque from "denque"; // High performance double-ended queue

export interface MinuteBucket {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerPayload {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePercent: number;
}

export class TickerManager {
  private bucketQueue: Denque<MinuteBucket> = new Denque();
  private cachedTicker: TickerPayload = {
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
    changePercent: 0,
  };

  public getTicker(): TickerPayload | null {
    return this.bucketQueue.length === 0 ? null : this.cachedTicker;
  }

  public update(price: number, qty: number): TickerPayload {
    const now = Date.now();
    const currentMinuteMs = Math.floor(now / 60000) * 60000;

    let activeBucket = this.bucketQueue.peekBack();

    if (!activeBucket || activeBucket.timestamp !== currentMinuteMs) {
      activeBucket = {
        timestamp: currentMinuteMs,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: qty,
      };
      this.bucketQueue.push(activeBucket);
    } else {
      activeBucket.volume += qty;
      activeBucket.high = Math.max(activeBucket.high, price);
      activeBucket.low = Math.min(activeBucket.low, price);
      activeBucket.close = price;
    }

    // Slide Window (Prune older than 24h)
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    while (
      this.bucketQueue.length > 0 &&
      this.bucketQueue.peekFront()!.timestamp < twentyFourHoursAgo
    ) {
      this.bucketQueue.shift();
    }

    // Aggregate
    let rollingVolume = 0;
    let rollingHigh = -Infinity;
    let rollingLow = Infinity;
    const rollingOpen = this.bucketQueue.peekFront()!.open;
    const rollingClose = this.bucketQueue.peekBack()!.close;

    for (let i = 0; i < this.bucketQueue.length; i++) {
      const bucket = this.bucketQueue.peekAt(i)!;
      rollingVolume += bucket.volume;
      if (bucket.high > rollingHigh) rollingHigh = bucket.high;
      if (bucket.low < rollingLow) rollingLow = bucket.low;
    }

    const priceChange = rollingClose - rollingOpen;
    const changePercent =
      rollingOpen !== 0 ? (priceChange / rollingOpen) * 100 : 0;

    this.cachedTicker = {
      open: rollingOpen,
      high: rollingHigh,
      low: rollingLow,
      close: rollingClose,
      volume: rollingVolume,
      changePercent: parseFloat(changePercent.toFixed(2)),
    };

    return this.cachedTicker;
  }
}
