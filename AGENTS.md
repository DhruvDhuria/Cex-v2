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
- Message types: `create_order`, `get_depth`, `get_user_balance`, `get_order`, `get_user_fills`, `cancel_order`, plus non-standard `add_balance` and `withdraw_balance` the engine supports for funding (backend `POST /balance` and `/balance/withdraw`). The engine keys cash as `usd` (lowercase) — fund that key for fiat to be usable by the matcher.
- The backend type mirror lives in `backend/src/types/engine.ts`; **both** it and `engine/src/index.ts` must list a command, or the engine rejects it as unsupported.

## Engine specifics

- All state is in-memory in `engine/src/store/exchange-store.ts` (`BALANCES`, `ORDERBOOKS`, `ORDERS`, `FILLS`) — **lost on restart**. No persistence. Funding happens only via `add_balance`.
- `engine/src/index.ts` hardcodes assets and initializes order books only for `BTC`, `ETH`, `SOL` — adding a new symbol requires editing this list.
- There is **one matching implementation**: `utils/matchAlgorithmOptimized.ts` (imported by `index.ts`). The older `utils/matchAlgorithm.ts` has been deleted — do not restore it.
- Balance settlement between matched users lives in `index.ts` (not in the matcher); the matcher only returns aggregate fills and mutates the book.
- Fills are created in `index.ts` as **two records per match**: a `maker` fill for the resting order's user and a `taker` fill for the incoming order's user. Each `Fill` carries `fillId`, `symbol`, `price`, `qty`, `type`, `fillType` (`"maker" | "taker"`), `side`, `userId`, `orderId`, `createdAt`. `create_order` returns all fills created by the match (both sides); `get_user_fills` filters the in-memory `FILLS` array by `userId`.
- `engine/src/streams.ts` publishes to two Redis streams — `depthStream` (absolute per-level qty) and `aggtradesStream` (`{price, qty}`, no timestamp; consumers derive it from the stream entry id) — consumed by `ws-server` and the backend trade-history endpoint. There is **no `booktickerStream`**; it was replaced by the 24h `ticker` channel.
- `aggtradesStream` is **not trimmed** and acts as the de-facto trade log. It survives engine restarts as long as Redis persists, but `FILLS`/`ORDERS` in memory do not.

## ws-server

- Reads 2 Redis streams (`depthStream`, `aggtradesStream`) with **one independent blocking cursor per stream** and fans out to WebSocket clients by subscription key of the form `depth.BTC_USD`, `trades.BTC_USD`, `ticker.BTC_USD`.
- Channel keys are normalised to `<kind lowercase>.<PAIR uppercase>`. Subscribe and broadcast MUST both go through `normalizeChannel` — a mismatch silently delivers nothing.
- Every frame is `{ stream, data }` where `data` is always a **JSON string** (the client parses it once).
- The 24h ticker is computed in-process by `utils/tickerManager.ts` from the trade stream. Its window is "since ws-server boot" and resets on restart.
- On subscribe it sends only an in-memory **50-trade snapshot** (Trades panel) and cached ticker — it does **not** replay full history. Long-range history comes from the backend REST endpoint below.

## Trade history & chart

- `GET /trades/:symbol?limit=` (public) is implemented by `getTradeHistory` in `backend/src/controllers/exchange-controller.ts`; it calls `readTradeHistory` in `backend/src/utils/engine-client.ts`, which `XREVRANGE`s `aggtradesStream`, filters by `market`, derives `ts` from the stream entry id (`<ms>-<seq>`), and returns ascending `{price, qty, ts}`. Default limit 1000, max 5000.
- `frontend/src/hooks/useCandles.ts` builds OHLCV from two sources: localStorage cache (`cex_candles:<SYMBOL>:<interval>`) for instant paint, then `GET /trades/:symbol` history which wins over the overlapping cache window (older cached bars are kept). Live trades arriving during hydration are queued and replayed. There is **no dummy seed data** — an empty market renders an empty chart.
- Cache writes are debounced and capped at 500 bars; the chart no longer resets to fake data on refresh.

## Backend / Prisma gotchas

- Prisma client is **generated into a custom path**: `backend/prisma/generated/prisma` (set in `schema.prisma` generator `output`). `db.ts` imports `../prisma/generated/prisma/client`. Run `prisma generate` after any schema change, and ensure the generated dir exists before running.
- `db.ts` uses the pg adapter and requires `DATABASE_URL`.
- Numeric columns (`Order.price/quantity/filledQuantity`, `Fill.price/quantity`) are **`Float`**, not `Int`, so decimal orders persist. Migration `20261029080146_float_order_numbers` has been applied; re-run `bun x prisma migrate dev` if the DB is reset.
- Auth: passwords bcrypt-hashed; JWT via `createToken` in `backend/src/utils/auth.ts`. `/signup` and `/signin` are DB-only; `GET /depth/:symbol` and `GET /trades/:symbol` are public; all other exchange routes require `Authorization: Bearer <jwt>`.

## Dashboard & DB persistence (recent updates)

- **Backend persistence**: On `POST /order`, backend persists orders/fills to Postgres via Prisma. It ensures `Stock` rows exist, creates/updates the `Order` row, and writes **both maker and taker fills** returned by the engine via `persistEngineFills` (deduped by `fillId`, each row keyed by its own `userId`/`orderId`/`side`/`fillType`). Referenced orders must already exist.
- **Fill reconciliation**: `GET /fills` first calls the engine's `get_user_fills` and persists any unseen fills (e.g. a resting limit order filled later). Reconciliation errors are ignored so Postgres fills still return if the engine is down.
- **Dashboard API endpoints** (auth required): `GET /orders` (all orders for user), `GET /orders/open` (open orders), `GET /fills` (all fills for user). Open-order status/filled qty is synced from the engine on fetch. Routes in `backend/src/routes/exchange-routes.ts`, implemented in `backend/src/controllers/exchange-controller.ts`. Prisma models: `Order`, `Fill`, `Stock`.
- **Auth**: `POST /signin` returns `userId` and `username` in addition to `token` (for client profile display).
- **Frontend dashboard**: `frontend/src/pages/Dashboard.tsx` has a profile header (initials + username), balances panel (`BalancesPanel.tsx`), orders/fills tabs, and a deposit/withdraw dialog (`DepositWithdrawModal.tsx`, which has its own Deposit/Withdraw toggle). Username is stored in `localStorage` as `cex_username`. API helpers live in `frontend/src/lib/api.ts`.

## Frontend layout & UI notes

- `App.tsx` `<main>` is **not** vertically centered; Trade/Dashboard start at the top. Only the auth pages (`pages/auth/SigninPage.tsx`, `SignupPage.tsx`) center their card with `flex flex-1 items-center justify-center`.
- Navbar signed-in action is a single **Deposit/withdraw** link to `/dashboard?mode=add`, which opens the modal. `ProfileHeader` intentionally renders no deposit/withdraw buttons.
- `console.log` statements have been removed across all subprojects; use `console.error` only for real errors.
