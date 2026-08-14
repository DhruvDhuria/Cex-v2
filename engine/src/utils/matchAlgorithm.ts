import {type OrderType, type Side, type OrderStatus, type Balance} from "../store/exchange-store.ts";
import { ORDERBOOKS, BALANCES } from "../store/exchange-store.ts";

interface Order {
    type: OrderType
    side: Side
    symbol: string;
    price: number | null;
    qty: number;
    userId: string
}

export interface MatchResponse {
  filledQty?: number;
  priceAggregate?: {
    levelPrice: number;
    matchedOrders: number;
    orderId?: string;
    matchedUser: string;
  }[];
  error?: string;
  message?: string;
};

function SortAsksAndBids(symbol: string) {
    const sortedAsks = new Map(
      [...(ORDERBOOKS.get(symbol)?.asks.entries() || [])].sort(
        (a, b) => a[0] - b[0],
      ),
    );
    const sortedBids = new Map(
      [...(ORDERBOOKS.get(symbol)?.bids.entries() || [])].sort(
        (a, b) => b[0] - a[0],
    ))

    return {
        sortedAsks,
        sortedBids
    }
}

export function matchAlgorithm(order: Order) {
  
  const {type, side, symbol, price, qty, userId} = order
  const {sortedAsks, sortedBids} = SortAsksAndBids(symbol)


  let filledQty = 0;
  const user = BALANCES.get(order.userId)

  if (!user) {
    return { error: "User not found" };
  }

  const asset = ORDERBOOKS.get(order.symbol);

  if(!asset) {
    return { error: "Asset not found" };
  }

  if(type === "market"){

    if(side === "buy"){
      if(asset.asks.size === 0) {
        return { error: "No asks available for market buy orders" };
      }

      const marketPrice = asset.lastTradedPrice ? asset.lastTradedPrice : sortedAsks.keys().next().value;

      if(!marketPrice) {
        return { error: "No asks available for market buy orders" };
      }


      const estimatedPrice = marketPrice * qty;
      const bufferPrice = estimatedPrice * 0.03;

      const userUsd = user.usd!

      if (userUsd.available < estimatedPrice + bufferPrice) {
        return { error: "Insufficient balance" };
      }

      userUsd.available -= estimatedPrice + bufferPrice;
      userUsd.locked += estimatedPrice + bufferPrice;

      
      const priceAggregate: any = [];
      let delta;

      for (const [price, orders] of sortedAsks) {
        if (filledQty >= qty) break;        
        delta = qty - filledQty 

        if(orders.length === 0) {
          continue;
        }

        for (let i = 0; i < orders.length; i++) {
          const order = orders[i];

          if(!order) continue

          if(order.qty === 0) {
            continue;
          }
          const sellerId = order.userId;
          const seller = BALANCES.get(sellerId);

          if(!seller) {
            continue;
          }
          const matchedOrders = Math.min(order.qty, delta);

          const deductableAmt = price * matchedOrders;
          if(order.qty <= delta){
            userUsd.locked -= deductableAmt;
            seller.usd!.available += deductableAmt;
            user.market!.available += matchedOrders;
            seller.market!.locked -= matchedOrders;
            priceAggregate.push({
              levelPrice: price,
              matchedOrders: matchedOrders,
              matchedUser: sellerId,
              orderId: order.orderId
            })
            order.filledQty += matchedOrders;
            filledQty += matchedOrders;
            order.status = "filled";
            
            order.status = "filled";
            orders.slice(i, 1);
            
          }else {
            userUsd.locked -= deductableAmt;
            seller.usd!.available += deductableAmt;
            user.market!.available += delta;
            seller.market!.locked -= delta;
            priceAggregate.push({
              levelPrice: price,
              matchedOrders: delta,
              matchedUser: sellerId,
              orderId: order.orderId
            })
            order.filledQty += delta;
            filledQty += delta;
            break;
          }


          
        }

      }
     
  
    }
  }

    
}