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
            `depthStream`,
            "*",
            {                   
                market,
                data: JSON.stringify(data)
            }
        )
    }else if(type === "bookTickerUpdate"){ 
        BookTickerClient.xAdd(
            `booktickerStream`,
            "*",
            {   
                market,
                data: JSON.stringify(data)
            }
        )
    }else {
        AggTradesClient.xAdd(
            `aggtradesStream`,
            "*",
            {
                
                market,
                data: JSON.stringify(data)
            }
        )
    }
}
