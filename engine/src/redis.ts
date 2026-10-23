import { createClient } from "redis";
import { env } from "./utils/env.ts";

/**
 * The engine needs two connections:
 * - `brokerClient` is dedicated to the blocking `brPop` on the request queue.
 *   A blocked client cannot serve other commands.
 * - `commandClient` serves every non-blocking command (reply pushes and stream
 *   publishes) and is safe to share.
 */
export const brokerClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis broker client error", error);
});

export const commandClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis command client error", error);
});

await Promise.all([brokerClient.connect(), commandClient.connect()]);
