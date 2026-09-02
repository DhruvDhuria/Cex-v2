import {type OrderType, type Side, type Balance, type OrderStatus} from "../store/exchange-store.ts";
import { ORDERBOOKS, BALANCES } from "../store/exchange-store.ts";

export interface Order {
    type: OrderType
    side: Side
    symbol: string;
    price: number | null;
    qty: number;
    userId: string
}
export interface AggregateFill {
  matchedOrders: number,
  matchedUser: string,
  totalOrderQty: number,
  orderId: string,
  side: string
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
    const sortedAsks = new Map([...(ORDERBOOKS.get(symbol)?.asks.entries() || [])].sort(
        (a, b) => a[0] - b[0],
      ))
    
    const sortedBids = new Map([...(ORDERBOOKS.get(symbol)?.bids.entries() || [])].sort(
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

  const orderId = crypto.randomUUID();
  let orderStatus: OrderStatus;
  
  let filledQty = 0;
  const user = BALANCES.get(userId)

  if (!user) {
    return { error: "User not found" };
  }

  const asset = ORDERBOOKS.get(symbol);

  if(!asset) {
    return { error: "Asset not found" };
  }
  user.usd = user.usd || { available: 0, locked: 0 };
  user[symbol] = user[symbol] || { available: 0, locked: 0 };

  const priceAggregate: Map<number, AggregateFill[]> = new Map();
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
  
      let delta;

      for (const [askPrice, orders] of sortedAsks) {
        if (filledQty >= qty) break;        
        delta = qty - filledQty 
        
        if(orders.length === 0) { 
          ORDERBOOKS.get(symbol)?.asks.delete(askPrice);
          continue;
        }
        
        if(!priceAggregate.has(askPrice)) {
          priceAggregate.set(askPrice, [])
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

          if(order.qty <= delta){
            let AggreatedOrders = priceAggregate.get(askPrice)?? priceAggregate.set(askPrice, [] ).get(askPrice)!;
            AggreatedOrders.push({
              matchedOrders: matchedOrders,
              totalOrderQty: orders.length,
              matchedUser: sellerId,
              orderId: order.orderId,
              side
            })
            order.filledQty += matchedOrders;
            filledQty += matchedOrders;
            order.status = "filled";
            
            const ordersToUpdate = ORDERBOOKS.get(symbol)!.asks.get(askPrice)!;
            const idx = ordersToUpdate.findIndex((o) => o.orderId === order.orderId);
            if(idx !== -1) {
              ordersToUpdate.splice(idx, 1);
            }
            if(ordersToUpdate.length === 0) {
              ORDERBOOKS.get(symbol)?.asks.delete(askPrice);
            }
            
          }else {
            let AggreatedOrders = priceAggregate.get(askPrice)?? priceAggregate.set(askPrice, [] ).get(askPrice)!;
            AggreatedOrders.push({
              matchedOrders: delta,
              totalOrderQty: orders.length,
              matchedUser: sellerId,
              orderId: order.orderId,
              side
            });
            order.filledQty += delta;
            filledQty += delta;
            break;
          };          
        }
      }
       
      if(filledQty > 0 && filledQty < qty) {
        orderStatus = "partially_filled";
      }if(filledQty === qty) {
        orderStatus = "filled";
      }else {
        orderStatus = "cancelled"
      }
      return {
        filledQty,
        priceAggregate,
        orderId,
        orderStatus
      }
    }else {
      if(asset.bids.size === 0) {
        return { error: "No bids available for market sell orders" };
      }

      if(user[symbol].available < qty) {
        return { error: "Insufficient balance" };
      }

      user[symbol].available -= qty;
      user[symbol].locked += qty;

      const marketPrice = asset.lastTradedPrice ? asset.lastTradedPrice : sortedBids.keys().next().value;

      if(!marketPrice) {
        return { error: "No bids available for market sell orders" };
      }
      let delta;

      for (const [bidPrice, orders] of sortedBids) {
        if (filledQty >= qty) break;        
        delta = qty - filledQty 

        if(orders.length === 0) {
          ORDERBOOKS.get(symbol)?.bids.delete(bidPrice);
          continue;
        }

        for (let i = 0; i < orders.length; i++) {
          const order = orders[i];

          if(!order) continue

          if(order.qty === 0) {
            continue;
          }
          const buyerId = order.userId;
          const buyer = BALANCES.get(buyerId);

          if(!buyer) {
            continue;
          }
          const matchedOrders = Math.min(order.qty, delta);

          if(order.qty <= delta){
            let AggreatedOrders = priceAggregate.get(bidPrice)?? priceAggregate.set(bidPrice, [] ).get(bidPrice)!;
            AggreatedOrders.push({
              matchedOrders: matchedOrders,
              totalOrderQty: orders.length,
              matchedUser: buyerId,
              orderId: order.orderId,
              side
            })
            order.filledQty += matchedOrders;
            filledQty += matchedOrders;
            order.status = "filled";
            
            const ordersToUpdate = ORDERBOOKS.get(symbol)!.bids.get(bidPrice)!;
            const idx = ordersToUpdate.findIndex((o) => o.orderId === order.orderId);
            if (idx !== -1) {
              ordersToUpdate.splice(idx, 1);
            }
            if(ordersToUpdate.length === 0) {
              ORDERBOOKS.get(symbol)?.bids.delete(bidPrice);
            }
          }else {
            let AggreatedOrders = priceAggregate.get(bidPrice)?? priceAggregate.set(bidPrice, [] ).get(bidPrice)!;
            AggreatedOrders.push({
              matchedOrders: delta,
              totalOrderQty: orders.length,
              matchedUser: buyerId,
              orderId: order.orderId,
              side
            })
            order.filledQty += delta;
            filledQty += delta;
            break;
          }
        }
      }

       if (filledQty > 0 && filledQty < qty) {
         orderStatus = "partially_filled";
       }
       if (filledQty === qty) {
         orderStatus = "filled";
       } else {
         orderStatus = "cancelled";
       }

      return {
        filledQty,
        priceAggregate,
        orderId,
        orderStatus
      }
    }

  }else {
    if(!price) {
      return { error: "Missing price" };
    }

    // const priceAggregate: any = []
    
    let orderbookAddUpdate: {
      side: string,
      price: number,
      qty: number
    };
    if(side == "buy") {
      const totalcost = price * qty;
      if(user.usd!.available < totalcost) {
        return { error: "Insufficient balance" };
      }

      user.usd!.available -= totalcost;
      user.usd!.locked += totalcost;
      let delta;

      for (const [askPrice, orders] of sortedAsks) {
        if (filledQty >= qty) break;        
        delta = qty - filledQty

        if(askPrice > price) {
          break;
        }

        if(orders.length === 0) {
          ORDERBOOKS.get(symbol)?.asks.delete(askPrice);
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

          if(order.qty <= delta){
            let AggreatedOrders = priceAggregate.get(askPrice)?? priceAggregate.set(askPrice, [] ).get(askPrice)!;
            AggreatedOrders.push({
              matchedOrders: matchedOrders,
              totalOrderQty: orders.length,
              matchedUser: sellerId,
              orderId: order.orderId,
              side
            })
            order.filledQty += matchedOrders;
            filledQty += matchedOrders;
            order.status = "filled";
            
            const orderstoUpdate = ORDERBOOKS.get(symbol)!.asks.get(askPrice)!;
            const idx = orderstoUpdate.findIndex((o) => o.orderId === order.orderId);
            if (idx !== -1) {
              orderstoUpdate.splice(idx, 1);
            }
            if(orderstoUpdate.length === 0) {
              ORDERBOOKS.get(symbol)?.asks.delete(askPrice);
            }
            
          }else {
            let AggreatedOrders = priceAggregate.get(askPrice)?? priceAggregate.set(askPrice, [] ).get(askPrice)!;
            AggreatedOrders.push({
              matchedOrders: delta,
              totalOrderQty: orders.length,
              matchedUser: sellerId,
              orderId: order.orderId,
              side
            })
            ORDERBOOKS.get(symbol)!.asks.get(askPrice)![i]! = {
              ...order,
              filledQty: order.filledQty + delta,
              status: order.filledQty + delta === order.qty ? "filled" : "partially_filled"
            } 
            order.filledQty += delta;
            filledQty += delta;
            break;
          }
        }


      }

      if(filledQty > 0 && filledQty < qty) {
        orderStatus = "partially_filled";
      }else if(filledQty === qty) {
        orderStatus = "filled";
        return {
          filledQty,
          priceAggregate,
          orderId,
          orderStatus
        }
      }else {
        orderStatus = "open";
      }

      ORDERBOOKS.get(symbol)?.bids.set(price, [...ORDERBOOKS.get(symbol)?.bids.get(price) || [], {side, type, userId, orderId: crypto.randomUUID(), qty: qty - filledQty, filledQty: 0, status: orderStatus, symbol, price, createdAt: Date.now()}]);
      
      orderbookAddUpdate = {
        side, 
        qty: qty - filledQty,
        price
      }
      
      return {
        filledQty,
        priceAggregate,
        orderId,
        orderStatus,
        orderbookAddUpdate
      } 

    }else {
      
      if(user[symbol]!.available < qty) {
        return { error: "Insufficient balance" };
      }

      user[symbol]!.available -= qty;
      user[symbol]!.locked += qty;
      let delta;

      for (const [bidPrice, orders] of sortedBids) {
        if (filledQty >= qty) break;        
        delta = qty - filledQty

        if(bidPrice < price) {
          break;
        }

        if(orders.length === 0) {
          ORDERBOOKS.get(symbol)?.bids.delete(bidPrice);
          continue;
        }

        for (let i = 0; i < orders.length; i++) {
          const order = orders[i];

          if(!order) continue

          if(order.qty === 0) {
            continue;
          }
          const buyerId = order.userId;
          const buyer = BALANCES.get(buyerId);

          if(!buyer) {
            continue;
          }
          const matchedOrders = Math.min(order.qty, delta);

          if(order.qty <= delta){
            let AggreatedOrders = priceAggregate.get(bidPrice)?? priceAggregate.set(bidPrice, [] ).get(bidPrice)!;
            AggreatedOrders.push({
              matchedOrders: matchedOrders,
              totalOrderQty: order.qty,
              matchedUser: buyerId,
              orderId: order.orderId,
              side
            })
            order.filledQty += matchedOrders;
            filledQty += matchedOrders;
            order.status = "filled";
            
            const orderstoUpdate = ORDERBOOKS.get(symbol)!.bids.get(bidPrice)!;
            const idx = orderstoUpdate.findIndex((o) => o.orderId === order.orderId);
            if (idx !== -1) {
              orderstoUpdate.splice(idx, 1);
            }
            if(orderstoUpdate.length === 0) {
              ORDERBOOKS.get(symbol)?.bids.delete(bidPrice);
            }
            
          }else {
            let AggreatedOrders = priceAggregate.get(bidPrice)?? priceAggregate.set(bidPrice, [] ).get(bidPrice)!;
            AggreatedOrders.push({
              matchedOrders: delta,
              totalOrderQty: order.qty,
              matchedUser: buyerId,
              orderId: order.orderId,
              side
            })
            order.filledQty += delta;
            filledQty += delta;
            break;
          }
        }
      }

      if (filledQty > 0 && filledQty < qty) {
        orderStatus = "partially_filled";
      } else if (filledQty === qty) {
        orderStatus = "filled";
        return{
          filledQty,
          priceAggregate,
          orderId,
          orderStatus
        }
      } else {
        orderStatus = "open";
      }

      ORDERBOOKS.get(symbol)?.asks.set(price, [
        ...ORDERBOOKS.get(symbol)?.asks.get(price) || [],
        {
          side,
          type,
          userId,
          orderId,
          qty: qty - filledQty,
          filledQty: 0,
          status: orderStatus,
          symbol,
          price,
          createdAt: Date.now(),
        },
      ]);

      orderbookAddUpdate = {
        side,
        qty: qty - filledQty,
        price,
      };
      return {
        filledQty,
        priceAggregate,
        orderId,
        orderStatus,
        orderbookAddUpdate
      }
    }
  }  
}