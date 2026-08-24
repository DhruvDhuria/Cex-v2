import redis from 'redis'
import {env} from "./utils/env.ts"

const depthClient = redis.createClient({ url: env.redisUrl })
depthClient.on("error", (error) => {
    console.error("Redis depth client error", error);
});
const BookTickerClient = redis.createClient({ url: env.redisUrl })
depthClient.on("error", (error) => {
    console.error("Redis depth client error", error);
});
const AggTradesClient = redis.createClient({ url: env.redisUrl })
depthClient.on("error", (error) => {
    console.error("Redis depth client error", error);
});

await Promise.all([depthClient.connect(), BookTickerClient.connect(), AggTradesClient.connect()])

export type StreamType = "depthUpdate" | "bookTickerUpdate" | "TradesUpdate"

export function publishToStream(market: string, data: any, type: StreamType) {

    if(type === "depthUpdate") {
        depthClient.xAdd(
            `depth.${market}`,
            "*",
            data
        )
    }else if(type === "bookTickerUpdate"){ 
        BookTickerClient.xAdd(
            `bookticker.${market}`,
            "*",
            data
        )
    }else {
        AggTradesClient.xAdd(
            `aggtrades.${market}`,
            "*",
            data
        )
    }
}
