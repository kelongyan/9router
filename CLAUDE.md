# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

9Router (`9router-app`) — a local AI routing gateway + Next.js dashboard. It exposes one OpenAI-compatible endpoint (`/v1/*`) and routes traffic across 120+ upstream providers (123 registry entries in `open-sse/providers/registry/`) with format translation, model-combo fallback, multi-account fallback, OAuth/API-key credential management, token refresh, quota/usage tracking, and optional cloud sync.

Two published artifacts live in this one repo:
- The **dashboard + gateway** (root `package.json`, `9router-app`) — the Next.js server that does the actual routing.
- The **CLI launcher** (`cli/`, published to npm as `9router`) — a separate package that installs/starts the server and manages the tray. It has its own `package.json`, version, and build.

The code lives in `src/` (Next.js app + dashboard/compat APIs), `open-sse/` (the provider-agnostic routing/translation engine), `cli/` (the launcher package), and `tests/`.

## Commands

Dashboard/gateway (run from repo root):
```bash
cp .env.example .env
npm install
npm run dev                          # dev, Turbopack, port 20127
PORT=20128 npm run build && PORT=20128 HOSTNAME=0.0.0.0 npm run start   # production
```
- `npm run dev` is `next dev` → **Turbopack** in Next 16. Use `npm run dev:webpack` if you specifically need the webpack dev server.
- Bun variants: `npm run dev:bun` / `build:bun` / `start:bun`.
- Scripts hardcode port **20127**; `PORT` overrides it (`.env.example` recommends `20128` for production, and `npm run start` is `node custom-server.js --port 20127`, which honors `PORT`). Dashboard at `/dashboard`, API at `/v1`.
- Lint: `npx eslint .` (config `eslint.config.mjs`, extends `eslint-config-next/core-web-vitals`).

### Build gotcha (Windows)

`npm run build` runs `next build --webpack` — it **forces webpack**. On Windows the webpack build can fail even on a clean tree (`EPERM: … readlink`, or `HookWebpackError` in `FlightClientEntryPlugin`); deleting `.next` does not help. The reliable local build is:

```bash
npx next build                                  # Turbopack (default engine)
node scripts/copy-standalone-assets.mjs         # REQUIRED: npx skips npm's postbuild hook
```

Also: `.next/standalone` is the production runtime dir — Windows locks it while the server runs, so stop the server before rebuilding, and don't run `dev` and `build` at the same time (they share `.next`).

On the local Windows checkout this failure is root-caused (Next's NFT tracing escapes the project root and walks the whole user profile) and patched inside `node_modules`, so `npm run build` works there and runs the postbuild hook itself. Those patches are not committed and are lost on `npm install`; `RULE.md` §1 has the locations and the fallback.

CLI package (`cli/`):
```bash
npm run cli:pack       # build + npm pack from root
cd cli && npm run dev  # nodemon watch
```

Tests (vitest, in `tests/`, an **independent** ESM package — not wired into root `npm test`):
```bash
npm install                             # ROOT deps first — tests import from src/ which needs `open`, `undici`, etc.
cd tests && npm install                 # then tests' own deps (vitest) → tests/node_modules (allowed by tests/.gitignore)
npx vitest run                          # all tests; vitest.config.js resolves the open-sse/@ aliases from the repo root
npx vitest run unit/capabilities.test.js   # single file (path relative to tests/)
```
> **The suite is NOT expected to be all-green on a plain checkout.** The committed snapshot is 674 tests / 26 failing; 24 of those are catalogued in `tests/__baseline__/known-fails.txt` (rtk, oauth-cursor-auto-import, translator-request-normalization, …) and the other 2 (`antigravity-mitm`, `kiro-model-slots`) are uncatalogued but present in the snapshot. Judge regressions with `tests/__baseline__/verify-no-regression.mjs`, not a raw run — it fails only on failures that are absent from known-fails.txt. Also expected red:
> - `unit/embeddings.cloud.test.js` imports `cloud/src/handlers/embeddings.js` — the `cloud/` worker dir is **not in this repo**, so it always fails here.
> - `unit/xai-oauth-service.test.js` times out (5s) when the xAI endpoint-discovery fetch isn't reachable/mocked.
> - `real/*.real.test.js` make live provider calls — need credentials, skip otherwise.
- `*.real.test.js` under `tests/translator/real/` make live provider calls — skip unless credentials are set.
- Regression baselines: `tests/__baseline__/verify-*.mjs` compare against committed snapshots (providers, aliases, OAuth URLs). Run these after touching provider registry / alias logic.

## Architecture

Two authoritative docs already exist — read them before working in these areas rather than re-deriving:
- `docs/ARCHITECTURE.md` — full system: request lifecycle, combo/account fallback, OAuth + token refresh, cloud sync, data model.
- `open-sse/AGENTS.md` — the routing/translation engine's own conventions and "how to add a provider/executor/translator". **Read this before editing anything under `open-sse/`.**

### Request flow (the thing to understand first)
`src/app/api/v1/*` route (Next rewrites in `next.config.mjs` map `/v1/*`, `/v1beta/*`, `/codex/*` and `/responses` → `/api/v1/*`)
→ `src/sse/handlers/chat.js` (parse, combo expansion, account-selection loop)
→ `open-sse/handlers/chatCore.js` (detect source format, translate request, dispatch to executor, retry/refresh, stream setup)
→ `open-sse/executors/*` (per-provider upstream call; `default.js` handles any OpenAI-compatible provider)
→ `open-sse/translator/*` (client format ↔ provider format)
→ SSE back to client.

`src/sse/` is the app-side entry glue; `open-sse/` is the provider-agnostic engine (also usable standalone). Cross that boundary consciously.

### Translator engine (`open-sse/translator/`)
- Pivots through **OpenAI as the intermediate format**. A translator registered on an exact `source:target` pair (e.g. `claude:kiro`) runs as a **direct route**, skipping the lossy double-hop. Prefer a direct route for fragile pairs (thinking blocks, tool ids, non-base64 images, `is_error`).
- Translators **self-register** via `register(from, to, reqFn, resFn)` as an import side effect — a new translator file MUST be imported in `open-sse/translator/index.js` or it never runs.
- Never hardcode role/block/model strings — use `open-sse/translator/schema/` and `open-sse/config/` constants. Config-driven and DRY is enforced by convention here.

### Provider registry (`open-sse/providers/registry/*`)
- One file per provider. `providers/registry/index.js` is an **auto-generated** static import list — regenerate it with `scripts/migrate-registry.mjs` / `injectDisplayToRegistry.mjs`, don't hand-edit.
- Add a provider: copy `providers/REGISTRY_TEMPLATE.js`, add models to `config/providerModels.js`. Only add an executor for non-OpenAI-compatible upstreams.

### Persistence — IMPORTANT
State is **no longer `db.json`**. It's a SQLite layer under `src/lib/db/` with an adapter fallback chain (`driver.js`): `bun:sqlite` → `better-sqlite3` (optional native dep) → `node:sqlite` (Node ≥22.5) → `sql.js` (pure-JS fallback, always works). `better-sqlite3` is deliberately in `optionalDependencies` so install never fails without build tools.
- `src/lib/localDb.js` **and `src/lib/usageDb.js` are both backward-compat shims** re-exporting `src/lib/db/index.js`. New code should import from `@/lib/db/index.js`; per-entity logic lives in `src/lib/db/repos/*`. Schema/migrations in `src/lib/db/migrations/`.
- DB file is `${DATA_DIR}/db/data.sqlite`; `DATA_DIR` resolves in `src/lib/dataDir.js` (env `DATA_DIR` if set/writable, else `%APPDATA%/9router` on Windows, `~/.9router` elsewhere). Paths in `src/lib/db/paths.js`.
- Usage lives in the **same** SQLite file (`usageHistory` / `usageDaily` / `requestDetails`), so it follows `DATA_DIR` too. `db.json`, `usage.json`, `log.txt`, `disabledModels.json`, `request-details.json` are `LEGACY_FILES` — read once by `src/lib/db/migrate.js`, then backed up under `${DATA_DIR}/db/backups/`; they are never written after migration. `appendRequestLog()` is a no-op now — `getRecentLogs()` derives log lines from `usageHistory`.

### Usage data layer (`src/lib/db/repos/usageRepo.js`)
- Two tables: `usageHistory` (per-request detail; feeds the **today/24h** views, computed live) and `usageDaily` (per-day aggregate, `dateKey` = local `YYYY-MM-DD`; feeds **7d/30d/60d/all** views and the heatmap).
- **Field-name trap**: `groupDataByKey` produces grouped summaries keyed `cost`; `totalCost` only exists on the detail items returned by `sortData`. Read grouped cost as `summary.totalCost ?? summary.cost ?? 0`.
- Adding a stats endpoint? Model it on `getHeatmapData()` — it reads only the daily aggregate and does no by-model/by-account re-aggregation, far cheaper than `getUsageStats`.

### Frontend (`src/app/`, `src/shared/`)
- Stack: React 19 + Next 16 App Router + Tailwind 4 + recharts 3 + zustand. Dashboard pages live under the `src/app/(dashboard)/dashboard/*` route group; shared UI in `src/shared/components/`. Components are `"use client"` + PropTypes, matching existing files.
- **recharts 3.x has no `activeIndex`** (v2→v3 removal): highlight sectors with a `shape` function + `props.isActive`; `activeShape`/`inactiveShape` are deprecated.
- **Never put `var(--x)` in an SVG presentation attribute** — it's silently ignored. Use `style={{ fill: "var(--x)" }}` or a literal color; for theme-adaptive blended colors use `color-mix(in srgb, var(--color-primary) 52%, var(--color-surface))` inside `style`.
- Theming is a dual light/dark CSS-variable theme — verify new UI in **both** themes.
- Format token counts with `fmtTokensLocale` (exported from `src/app/(dashboard)/dashboard/usage/components/UsageBreakdown.js`): `亿/万` in zh-CN, `K/M/B` elsewhere.
- **Async-value text nodes**: if a component first renders a string placeholder (`"—"`) and later updates that text node after data arrives, the update can silently fail (component re-renders, DOM doesn't). Render `null` initially so the real value *creates* the node. Creating is reliable, updating isn't.

### i18n (`src/i18n/`, `public/i18n/literals/`)
- Translation is **runtime DOM text-node replacement** (`src/i18n/runtime.js`): keys are the English source strings, dictionaries are `public/i18n/literals/*.json` (34 languages). Missing-key fallback to English is by design.
- Dynamically concatenated strings (`"388 Requests"` as one node) are invisible to DOM translation — call `translate("Requests")` from `@/i18n/runtime` in the component instead, and re-render on locale change.
- SSR renders English and the client swaps it in, so hydration-mismatch warnings (`Overview` vs `概览`) are a known, non-blocking React-recovers phenomenon — **do not "fix"** them.

### RTK token saver (`open-sse/rtk/`)
Pre-translate hooks that compress `tool_result` content in-place to cut tokens. **Fail-open**: any error returns null and leaves the body untouched — never throw out of them. Skips `is_error`/`status:"error"` results to preserve traces.

## Conventions & gotchas

- Plain JavaScript (ESM), no TypeScript. Path aliases (`jsconfig.json`): `@/*` → `src/*`, plus `open-sse` and `open-sse/*` → the engine root.
- `custom-server.js` wraps the Next standalone server to (a) derive the client IP from the TCP socket and strip attacker-controlled `X-Forwarded-For` (trusting forwarding headers only from a loopback reverse proxy), and (b) start the background token-refresh scheduler — a bare `next dev`/`next start` loads neither. Preserve this when touching request/IP/rate-limit code.
- `serverExternalPackages` in `next.config.mjs` keeps `open` external on purpose: webpack rewrites `import.meta.url` in `open` into the *build machine's* absolute path as a string literal, so a macOS-built release throws `File URL path must be absolute` on Windows at import time — killing xAI/Grok token refresh, which transitively imports it. Don't bundle `open`.
- Security-sensitive env: `JWT_SECRET` (session cookie), `INITIAL_PASSWORD` (default `123456` — must override), `API_KEY_SECRET`, `MACHINE_ID_SALT`. Full env contract in `.env.example` and ARCHITECTURE.md's env matrix.
- Binary/protobuf upstreams (kiro EventStream, cursor protobuf, commandcode NDJSON) don't round-trip through OpenAI — they're handled inside their own executor, not the translator.
- **Lint**: the tree carries a large backlog of pre-existing errors (incl. `react-hooks/set-state-in-effect` from the established localStorage-read pattern). Don't introduce new ones, but don't mass-refactor to clear the backlog either — matching existing patterns is acceptable.
- Versioning: root and `cli/` are versioned independently; changes are logged in `CHANGELOG.md`. Commit style is Conventional Commits (`fix(translator): …`, `feat(...)`).
- A local `RULE.md` may exist at the repo root (git-excluded via `.git/info/exclude`) with machine-specific deployment notes for this checkout — build/deploy procedure, prod port, local tooling. It is intentionally not committed; read it if present, never stage it.
