import Websocket, { WebSocketServer } from "ws";
import {createClient } from "redis";

const ReaderClient = createClient().on("error", error => console.error("redis error",))
await ReaderClient.connect()

const streamState = [
    { key: "depthStream", id: "$" },
    { key: "booktickerStream", id: "$"},
    { key: "aggtradesStream", id: "$"}
]

const activeSubscriptions: Record<string, Websocket[]> = {};

async function startReadingStream() {
    console.log("Stream loop started...")

    while(true) {
       try {
        const response = await ReaderClient.xRead(
          streamState,
          {
            COUNT: 1,
            BLOCK: 0,
          },
        );
        if (response) {
        // Response format: [{ name: "streamKey", messages: [{ id: "...", message: {...} }] }]
        for (const stream of response) {
            const streamName:
              | "depthStream"
              | "booktickerStream"
              | "aggtradesStream" = stream.name;
          for (const event of stream.messages) {
            let updateName: string;
            if(streamName === "depthStream") {
                const symbol = event.message.market
                updateName = `depth.${symbol.toUpperCase()}_USD`
                
            }else if(streamName === "booktickerStream") {
                const symbol = event.message.market
                updateName = `bookticker.${symbol.toUpperCase()}_USD`
            }else { 
                const symbol = event.message.market
                updateName = `trades.${symbol.toUpperCase()}_USD`
            }
            

            const payload = JSON.stringify({stream: updateName, data: event.message.data})
            
            // Send data to all subscribers
            const subscribers = activeSubscriptions[updateName]
            if(subscribers && subscribers.length > 0) {
                subscribers.forEach((ws) => {
                    if(ws.readyState === Websocket.OPEN) {
                        ws.send(payload)
                    }
                })
            }

            const stateItem = streamState.find((item) => item.key === streamName);
            if (stateItem) {
              stateItem.id = event.id;
            }

          }
        }
      }
       } catch (error) {
        console.error("Stream read error:", error);
      // Short delay before retrying to prevent CPU melting if Redis connection drops
        await new Promise((resolve) => setTimeout(resolve, 1000));
       } 
    }
}

startReadingStream()

const wss = new WebSocketServer({ port: 8080 });


wss.on("connection", (ws) => {
    ws.on("message", (message) => {
        //examples params: depth.BTC_USDC, bookticker.BTC_USDC, trades.BTC_USDC
        try {
            const parsedData = JSON.parse(message.toString());

            if (parsedData.method === "SUBSCRIBE") {
              parsedData.params.forEach((params: any) => {
                if (!activeSubscriptions[params]) {
                  activeSubscriptions[params] = [];
                }
                if (!activeSubscriptions[params].includes(ws)) {
                  activeSubscriptions[params].push(ws);
                }
              });
            } else if (parsedData.method === "UNSUBSCRIBE") {
              parsedData.params.forEach((param: any) => {
                if (!activeSubscriptions[param]) {
                  activeSubscriptions[param] = [];
                } else {
                  const index = activeSubscriptions[param].indexOf(ws);
                  if (index > -1) {
                    activeSubscriptions[param] = activeSubscriptions[
                      param
                    ].filter((x) => x !== ws);
                  }
                }
              });
            }
        } catch (error) {
            console.error("Error processing WS message:", error);
        }
    });
    ws.on('close', () => {
        Object.keys(activeSubscriptions).forEach((param) => {
          activeSubscriptions[param] = activeSubscriptions[param]!.filter(
            (client) => client !== ws
          );
          if (activeSubscriptions[param].length === 0) {
            delete activeSubscriptions[param];
          }
        });
    })
});

