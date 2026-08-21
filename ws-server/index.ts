import Websocket, { WebSocketServer } from "ws";
import {createClient } from "redis";

const ReaderClient = createClient().on("error", error => console.error("redis error",))
await ReaderClient.connect()

async function startReadingStream() {
    const streamKey = "stream:depth"
    let lastSeenId = "$"

    while(true) {
       try {
        const response = await ReaderClient.xRead(
            {
                key: streamKey,
                id: lastSeenId
            },
            {
                COUNT: 1,
                BLOCK: 0
            }
        )
        if (response) {
        // Response format: [{ name: "streamKey", messages: [{ id: "...", message: {...} }] }]
        for (const stream of response) {
          for (const event of stream.messages) {
            console.log(`Received Event [${event.id}]:`, event.message);
            
            // Update pointer so we don't read this event again on the next loop iteration
            lastSeenId = event.id; 
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

const activeSubscriptions: Record<string, Websocket[]> = {};

wss.on("connection", (ws) => {
    ws.on("message", (message) => {
        const parsedData = JSON.parse(message.toString());
        if (parsedData.method === "SUBSCRIBE") {
           parsedData.params.forEach((params: any) => {
                if(!activeSubscriptions[params]) {
                    activeSubscriptions[params] = []
                }else {
                    activeSubscriptions[params].push(ws)
                }
           });
        }else if (parsedData.method === "UNSUBSCRIBE") {
            parsedData.params.forEach((param: any) => {
                
                if (!activeSubscriptions[param]) {
                    activeSubscriptions[param] = []
                }else {
                    const index = activeSubscriptions[param].indexOf(ws);
                    if (index > -1) {
                      activeSubscriptions[param].filter((x) => x !== ws);
                    }
                }
            });;
        }
    });
});
