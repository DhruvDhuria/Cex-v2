# AGENTS.md

Mini centralized exchange (Harkirat bootcamp CEX assignment). Four independent Bun projects — there is **no root package.json / workspace**, so there are no root scripts, linters, or tests. Verification is manual: run the services and hit endpoints (Postman / curl); typecheck each subproject with `bun x tsc --noEmit`.

## Layout & runtime

- All four subprojects are **Bun** projects, not Node/npm. Run everything with `bun`, not `npm`/`node`.
- Source files use explicit `.ts`/`.js` extensions on imports (Bun resolves both). Don't strip them.
- `backend/` — Express API on port 3000 (auth + exchange routes). Does NOT do matching.
- `engine/` — background worker process. Owns all exchange state in memory.
- `ws-server/` — WebSocket server on port 8080, forwards Redis stream events to clients.
- `frontend/` — React 19 + Tailwind v4 + shadcn-style UI (Bun dev/build, not Vite).

## Running (3+ services, separate terminals)

Requires Redis and Postgres running first. `frontend` needs `bun run dev`; `ws-server` needs the engine to be publishing streams.

```bash
cd backend && bun install && bun run dev        # http://localhost:3000
cd engine && bun install && bun run dev         # consumes backend-to-engine-broker
cd ws-server && bun install && bun run index.ts # ws://localhost:8080
cd frontend && bun install && bun dev
```

Copy `.env.example` → `.env` in `backend/`, `engine/`, and optionally `ws-server/` first. The backend and engine `env.ts` files use `readRequiredEnv` and **crash on startup** if a required var is missing. `backend/src/utils/env.ts` requires `REDIS_URL` + `JWT_SECRET` (and `DATABASE_URL` de facto, read with a `!` assertion in `db.ts`). `engine/src/utils/env.ts` requires **only `REDIS_URL`**. `ws-server` falls back to `redis://127.0.0.1:6379`.

## Backend ⇄ Engine protocol (Redis, not HTTP)

- Backend pushes requests to Redis queue `backend-to-engine-broker` (list `lPush`); engine blocks on `brPop`.
- Every request carries `correlationId`, `responseQueue`, `type`, `payload`.
- Engine MUST reply to `responseQueue` with the same `correlationId` (backend matches replies by it, `store/pending-responses.ts`).
- Each backend process uses its own queue `response-queue-<BACKEND_QUEUE_ID>`; the `responseQueue` env var falls back to a random UUID, so set `BACKEND_QUEUE_ID` for stability.
- Backend times out (`ENGINE_TIMEOUT_MS`, default 30000) if the engine doesn't answer.
- Message types: `create_order`, `get_depth`, `get_user_balance`, `get_order`, `cancel_order`, plus non-standard `add_balance` and `withdraw_balance` the engine supports for funding (backend `POST /balance` and `/balance/withdraw`). The engine keys cash as `usd` (lowercase) — fund that key for fiat to be usable by the matcher.

## Engine specifics

- All state is in-memory in `engine/src/store/exchange-store.ts` (`BALANCES`, `ORDERBOOKS`, `ORDERS`, `FILLS`) — **lost on restart**. No persistence. Funding happens only via `add_balance`.
- `engine/src/index.ts` hardcodes assets and initializes order books only for `BTC`, `ETH`, `SOL` — adding a new symbol requires editing this list.
- There is **one matching implementation**: `utils/matchAlgorithmOptimized.ts` (imported by `index.ts`). The older `utils/matchAlgorithm.ts` has been deleted — do not restore it.
- Balance settlement between matched users lives in `index.ts` (not in the matcher); the matcher only returns aggregate fills and mutates the book.
- `engine/src/streams.ts` publishes to two Redis streams — `depthStream` (absolute per-level qty) and `aggtradesStream` (`{price, qty}`) — consumed by `ws-server`. There is **no `booktickerStream`**; it was replaced by the 24h `ticker` channel.

## ws-server

- Reads 2 Redis streams (`depthStream`, `aggtradesStream`) with **one independent blocking cursor per stream** and fans out to WebSocket clients by subscription key of the form `depth.BTC_USD`, `trades.BTC_USD`, `ticker.BTC_USD`.
- Channel keys are normalised to `<kind lowercase>.<PAIR uppercase>`. Subscribe and broadcast MUST both go through `normalizeChannel` — a mismatch silently delivers nothing.
- Every frame is `{ stream, data }` where `data` is always a **JSON string** (the client parses it once).
- The 24h ticker is computed in-process by `utils/tickerManager.ts` from the trade stream. Its window is "since ws-server boot" and resets on restart.

## Backend / Prisma gotchas

- Prisma client is **generated into a custom path**: `backend/prisma/generated/prisma` (set in `schema.prisma` generator `output`). `db.ts` imports `../prisma/generated/prisma/client`. Run `prisma generate` after any schema change, and ensure the generated dir exists before running.
- `db.ts` uses the pg adapter and requires `DATABASE_URL`.
- Auth: passwords bcrypt-hashed; JWT via `createToken` in `backend/src/utils/auth.ts`. `/signup` and `/signin` are DB-only; `GET /depth/:symbol` is public; all other exchange routes require `Authorization: Bearer <jwt>`.

## Dashboard & DB persistence (recent updates)

- **Backend persistence**: On `POST /order`, backend now persists orders/fills to Postgres via Prisma. Ensures `Stock` rows exist, creates/updates `Order` records, and writes `Fill` records for fills returned by the engine. For existing resting orders that get filled later, dashboard endpoints sync status from the engine.
- **Dashboard API endpoints** (auth required): `GET /orders` (all orders for user), `GET /orders/open` (open orders), `GET /fills` (all fills for user). Routes added in `backend/src/routes/exchange-routes.ts`, implemented in `backend/src/controllers/exchange-controller.ts`. Prisma models used: `Order`, `Fill`, `Stock` (see `backend/prisma/schema.prisma`).
- **Auth**: `POST /signin` now returns `userId` and `username` in addition to `token` (for client profile display).
- **Frontend dashboard**: Redesigned at `frontend/src/pages/Dashboard.tsx` with profile header (initials + username), balances panel (`frontend/src/components/BalancesPanel.tsx`), orders/fills tabs, and a deposit/withdraw popup modal (`frontend/src/components/DepositWithdrawModal.tsx`, `frontend/src/components/ui/dialog.tsx`). Username stored in `localStorage` as `cex_username`. API helpers added in `frontend/src/lib/api.ts` for fetching orders/fills.
