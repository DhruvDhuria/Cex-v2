import { ORDERBOOKS, BALANCES } from "../store/exchange-store.js";


export function get_Depth(symbol: string) {
    return {
      asks: ORDERBOOKS.get(symbol)?.asks.forEach((price) => {
        return {
          price: price[0],
          qty: price.length,
        };
      }),
      bids: ORDERBOOKS.get(symbol)?.bids.forEach((price) => {
        return {
          price: price[0],
          qty: price.length,
        };
      }),
    };
}