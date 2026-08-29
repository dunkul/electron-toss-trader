# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Nextron (Electron + Next.js) desktop app that watches Toss Securities (토스증권) Open API market
data and fires local alerts (desktop notification/sound/in-app) when a user-defined strategy condition
is met. Phase 1 (current, in progress) is **read-only / alert-only — it never places orders**. Order
placement, conditional orders, and an automated trading engine are an explicitly deferred phase 2; see
`docs/PLAN.md` (Korean) for the full design rationale, DB schema origin, and phase 2 plans. Treat
`docs/PLAN.md` as a living design doc, not a strict changelog — it's kept in sync with the codebase at a
point in time, but still cross-check anything load-bearing against the actual code before relying on it.

## Commands

```
npm run dev           # nextron dev — runs Next.js renderer + Electron main with hot reload
npm run build         # nextron build — production Electron build via electron-builder
npm run lint          # eslint .
npm run lint:fix
npm run format        # prettier --write .
npm run format:check
```

There is no test suite/framework configured in this repo.

Dev mode serves the renderer on a local port (nextron picks one, commonly 8888) and Electron loads
`http://localhost:<port>/home`. If dev startup fails because the port is stuck, `scripts/kill-port-8888.ps1`
(or the `.bat` wrapper) frees it.

`TOSS_CLIENT_ID`/`TOSS_CLIENT_SECRET` are configured from the app's 설정(Settings) tab (encrypted at
rest via `safeStorage`, see below) rather than `.env` — without them, `main.ts` skips starting the
strategy engine/WS client/stock-master sync, and the renderer forces navigation to `/settings` and
disables every other nav tab until a connection test succeeds. `.env`'s `TOSS_CLIENT_ID`/`SECRET` (see
`.env.example`) still work as a dev-only fallback when nothing has been saved via Settings yet.

## Architecture

Standard Electron split: **`main/`** (TypeScript, Node context, compiled to `app/main.js`) talks to the
Toss API and SQLite; **`renderer/`** (Next.js pages, compiled to static export in `app/`) is pure UI.
They communicate only via IPC through `main/preload.ts` (`contextIsolation: true`, `nodeIntegration:
false`) — the renderer never imports main-process code at runtime, only types.

### IPC contract — the duplication you must keep in sync by hand

- `main/ipc/channels.ts` (`IPC_CHANNELS`) and `renderer/lib/ipc.ts` (`CHANNELS`) each define the **same
  channel-name strings independently**. There's no shared module because renderer code can't import
  main code (different build targets/processes) — only `import type` re-exports of interfaces/rows
  work across the boundary. When adding/renaming a channel, edit both files' string tables.
- `main/ipc/register.ts` wires each channel to a handler (`ipcMain.handle`), typically delegating
  straight to a `main/db/repositories/*.ts` function or a `main/toss-api/endpoints/*.ts` call.
- `renderer/lib/ipc.ts` exposes a typed `api.*` object that pages call instead of touching
  `window.ipc` directly. Push events (main → renderer, e.g. `strategy:signal`) go through
  `webContents.send` in `main/notify/notifier.ts` and are subscribed to via `onStrategySignal()`.

### Toss API client (`main/toss-api/`)

- `token-manager.ts` — OAuth2 client-credentials token fetch/cache in SQLite (`oauth_tokens` table),
  refreshed on 401 with a safety margin before expiry. There is no refresh-token flow; expiry always
  means re-requesting a fresh token.
- `rate-limiter.ts` — one token-bucket per `ApiGroup` (`AUTH`, `ACCOUNT`, `ASSET`, `STOCK`,
  `STOCK_ALL`, `MARKET_DATA`, `MARKET_DATA_CHART`), capacities matching Toss's per-group TPS limits.
  `ACCOUNT` is capped at 1 TPS — anything touching account data must be cached, not polled tightly.
  Order-related groups (`ORDER`, `ORDER_INFO`, `CONDITIONAL_ORDER`) are intentionally not registered
  since phase 1 never calls those endpoints.
- `http-client.ts` (`tossRequest`) — the single entry point for all calls: acquires the group's rate
  limit, attaches the bearer token, retries once on 401 via forced token refresh, and retries on 429
  with exponential backoff + jitter (honoring `Retry-After`). Non-2xx responses are logged to
  `system_logs` and thrown as `TossApiError`. Always route new endpoint calls through this function
  rather than calling `fetch` directly.
- `endpoints/*.ts` — thin wrappers per resource (`account.ts`, `market.ts`, `stocks.ts`) built on
  `tossRequest`; `paths.ts` centralizes URL path templates.
- `stock-cache.ts` — syncs the full tradable-stock master list (all KR/US markets) into the `stocks`
  table once/day (`STOCK_ALL` is 1 TPS, so 7 markets naturally paces to ~7s); used for search/autocomplete
  so the UI never round-trips to the API for a symbol lookup.

### Strategy engine (`main/engine/`)

`StrategyEngine` (`scheduler.ts`) runs a single `setInterval` tick (30s) that: loads all active
strategies, batch-fetches current prices for their distinct symbols in one `getPrices` call, then
evaluates each strategy against a pluggable `StrategyModule` looked up by `strategy_type` in
`STRATEGY_REGISTRY` (`strategies/index.ts`). A strategy already mid-evaluation is skipped on the next
tick (`runningStrategyIds` guard) rather than queued. Only `PRICE_TARGET` (`strategies/price-target.ts`)
is implemented; `MA_CROSS`, `RSI`, `GRID` are declared in the `StrategyType` union and DB schema but have
no registered module yet — the scheduler logs a warning and skips them if referenced.

Adding a new strategy type: implement `StrategyModule.evaluate(context): { signal, reason? }`
(`engine/types.ts`), register it in `STRATEGY_REGISTRY`, and it's picked up by the scheduler
automatically — no scheduler changes needed.

Signals (BUY/SELL) are always recorded to `strategy_signals`, but the notification/cooldown split
matters: `notified` is `0` when the cooldown (`cooldown_sec`, per-strategy) hasn't elapsed since the
strategy's last signal — the signal is still logged for history, just not re-alerted.

### Database (`main/db/`)

Uses Node's built-in `node:sqlite` (`DatabaseSync`) as the driver, with Kysely as a type-safe query
builder on top (no full ORM). `connection.ts` opens the DB at Electron's `userData` path (or `DB_PATH` env
override), enables WAL + foreign keys, and runs `migrations.ts`'s array of `{version, sql}` entries
inside a transaction, tracked in a `schema_migrations` table. **To change schema: append a new
versioned entry to `MIGRATIONS` in `migrations.ts` and update the corresponding row type in
`schema.ts` — never edit an already-applied migration's SQL.** Each table has a thin
`db/repositories/*.ts` module of hand-written prepared-statement functions; IPC handlers and the engine
call these directly rather than writing SQL inline elsewhere.

In dev, `main/env-setup.ts` redirects `userData` to a `(development)`-suffixed sibling directory so the
dev DB never collides with a packaged build's DB — this must run before any module that reads
`app.getPath('userData')` at import time, hence its import at the very top of `main.ts`.

### Secrets and logging

`main/toss-api/config.ts` is the single choke point for `TOSS_CLIENT_ID`/`TOSS_CLIENT_SECRET` — nothing
else reads `process.env.TOSS_CLIENT_ID`/`SECRET` or the credential settings rows directly.
`loadTossApiCredentials(db)` runs once at boot (`main.ts`, before the `hasTossApiCredentials()` gate):
it decrypts whatever's stored in the `settings` table (keys `toss_client_id_enc`/`toss_client_secret_enc`,
`safeStorage.encryptString(...)` output as base64) into an in-memory cache, falling back to `.env` only
if nothing's saved yet. `saveTossApiCredentials(db, id, secret)` (called from the
`settings:saveCredentials` IPC handler, after `credentials-test.ts` verifies the values against the real
API) re-encrypts and overwrites those same rows, then updates the cache. `getTossApiConfig()`/
`hasTossApiCredentials()` read only the in-memory cache — synchronous, no DB round-trip — since
`http-client.ts`/`token-manager.ts` need them on every request. There's no live-reload path for
newly-saved credentials: the Settings page relaunches the app (`app:relaunch` IPC) after a successful
save so `strategyEngine`/`wsClient` boot fresh with the new values. Never log `client_secret`, decrypted
values, or access tokens; `logger.ts` (pino) is the shared logger — use it instead of `console.*` in
`main/`.

### Renderer (`renderer/`)

Next.js pages under `renderer/pages/*.tsx` map to the sidebar sections from `docs/PLAN.md` §6
(`home`, `market`, `strategies`, `history`, `logs`, `settings`), wrapped in `AppLayout.tsx`. UI is Ant
Design (`antd`) with SCSS modules; charts use `lightweight-charts`. State is Zustand where needed;
most data comes straight from the `api.*` IPC calls in `lib/ipc.ts` (no client-side cache layer beyond
component state). `renderer/CLAUDE.md`/`AGENTS.md` are auto-generated by `next dev` (git-ignored,
unrelated to this file) — don't hand-edit them.

#### Frontend conventions

`docs/toss-frontend-rules.mdc` is a general frontend design-guideline reference (readability/
predictability/cohesion/coupling patterns). Treat it as inspiration, not a checklist to satisfy
mechanically — only adopt a pattern from it where it's a genuine duplication or readability win in
this codebase, which is already fairly clean (named constants, discriminated-union-ish return types,
`React.memo` with custom comparators, IIFEs for nested ternaries, etc. are already the norm). Patterns
actually adopted here, worth following for new code of the same shape:

- **Extract logic duplicated verbatim across files into `lib/`, not into a shared prop/component.**
  e.g. `lib/market-data.ts`'s `resolveMarketsBySymbol()` (symbol → exchange via the local stock cache)
  and `lib/format.ts`'s `stockCacheMissError()` (the "종목 캐시에 없는 종목이라..." message) exist
  because the same lookup/message had been independently copy-pasted across `WatchlistPanel.tsx`,
  `home.tsx`, and `RankingCard.tsx`. Check `lib/market-data.ts`/`lib/format.ts` before writing a new
  symbol/market lookup or user-facing error string that might already exist there.
- **Popup windows (`pages/*-window.tsx`) share their bootstrap** via `hooks/usePopupWindowStock.ts`
  (query-string → state, then swap on a `WINDOW_*_UPDATE_EVENT` if the window is reused for another
  symbol) and `components/PopupWindowShell.tsx` (empty-state / `<Head>` / full-height wrapper). A new
  popup page (see `chart-window.tsx`/`daily-prices-window.tsx`) should reuse both instead of
  re-deriving the pattern.
- **Name a magic number once it's reused or non-obvious** (`RELAUNCH_DELAY_MS`, `SEARCH_DEBOUNCE_MS`,
  `TABLE_HEADER_HEIGHT_SM`, `CANDLE_PAGE_SIZE`, ...) — but don't invent a constant for an
  obviously-local one-off literal (e.g. a single `marginBottom: 16`).
- **Don't extract duplication that might diverge.** Similar-looking logic across pages that isn't tied
  to a fixed external contract (an IPC call shape, a fixed API response) is usually left duplicated on
  purpose in this codebase — e.g. each `*Card.tsx` component still does its own loading/error-message
  handling rather than sharing a generic "async load" hook, since their failure UX has already diverged
  once (different error messages, different empty states). Only dedupe when the logic is truly
  identical, not just similar-shaped.
- `eslint.config.mjs` disables `@next/next/no-img-element` project-wide (this is an Electron desktop
  app, not a web app served over a network, so `next/image`'s LCP/bandwidth optimization is moot) —
  don't re-silence it per-file with an inline comment; the global override is intentional.
