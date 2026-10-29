import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { appRouter } from "./routes/index.js";
import { env } from "./utils/env.js";
import {
  connectRedis,
  listenForEngineResponses,
  pingRedis,
} from "./utils/engine-client.js";

await connectRedis();
void listenForEngineResponses();

const app = express();

app.use(cors());
app.use(express.json());

/** Maps a known error message onto a meaningful HTTP status code. */
function statusForError(message: string): number {
  const text = message.toLowerCase();
  if (text.includes("unauthorized") || text.includes("jwt")) return 401;
  if (text.includes("not found")) return 404;
  if (
    text.includes("invalid") ||
    text.includes("insufficient") ||
    text.includes("required") ||
    text.includes("missing")
  ) {
    return 400;
  }
  if (text.includes("timed out")) return 504;
  return 500;
}

app.get("/health", async (_req, res) => {
  await pingRedis();
  res.json({ ok: true });
});

app.use(appRouter);

// Unknown routes must answer with JSON, not the express HTML error page.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "internal_server_error";
  res.status(statusForError(message)).json({ error: message });
});

app.listen(env.port);