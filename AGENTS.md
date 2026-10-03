# AGENTS.md

Local AI routing gateway (OpenAI-compatible `/v1/*` endpoint, 120+ upstream providers) + Next.js dashboard, published as two packages from this one repo:

- **`9router-app`** (root `package.json`) — the Next.js server that does the routing. Code in `src/` (app + dashboard APIs) and `open-sse/` (provider-agnostic engine, usable standalone).
- **`9router`** (`cli/`) — the npm launcher that installs/starts the server and manages the tray. Its own `package.json`, version, and build (`npm run cli:pack` from root).

## Read these first (in this order)

1. **`CLAUDE.md`** (root) — the comprehensive guide: request lifecycle, persistence layer, frontend/i18n conventions, the full gotcha list. Most of what you need is there.
2. **`open-sse/AGENTS.md`** — mandatory before touching anything under `open-sse/`: translator self-registration, how to add a provider/executor, config-driven conventions.
3. `docs/ARCHITECTURE.md` (system design) and `docs/CUSTOMIZATION.md` (UI customization vs. upstream-sync rules).
4. `tests/translator/AGENTS.md` — translator test conventions.
5. **`RULE.md`** — machine-specific deployment notes for *this* Windows checkout (prod runs on port 20128 from this very tree). Git-excluded via `.git/info/exclude`: read it, never stage it.

## Commands

```bash
npm install
npm run dev                 # Turbopack, port 20127; dashboard /dashboard, API /v1
npm run start               # prod: node custom-server.js --port 20127 (honors PORT)
npx eslint .                # lint (config: eslint.config.mjs)
```

Build (production): `npm run build` = `next build --webpack` + a `postbuild` hook that runs `scripts/copy-standalone-assets.mjs`. That hook is npm-only — if you build with bare `npx next build`, run the copy script yourself or the standalone output is incomplete. Windows: the webpack build can fail on a clean tree (`EPERM readlink` / OOM from Next's NFT tracing escaping the project root); `RULE.md §1` has the root cause. Fallback: `npx next build` (Turbopack) + `node scripts/copy-standalone-assets.mjs`. `.next/standalone` is the runtime dir — Windows locks it while the server runs, so stop the server before rebuilding, and never run `dev` and `build` together (they share `.next`).

Tests (vitest, in `tests/`) are a **separate ESM package, not wired into root `npm test`**:

```bash
npm install                 # ROOT deps first — tests import from src/ and open-sse/
cd tests && npm install     # vitest → tests/node_modules (allowed by tests/.gitignore)
npx vitest run                                  # all tests
npx vitest run unit/capabilities.test.js        # single file (path relative to tests/)
```

**The suite is not all-green on a plain checkout, by design.** A committed snapshot of expected failures lives in `tests/__baseline__/` (`known-fails.txt`). Judge regressions with `node tests/__baseline__/verify-no-regression.mjs` (fails only on *new* failures), not with a raw `npx vitest run`. Also expected red: `embeddings.cloud.test.js` (imports a `cloud/` dir not in this repo), `xai-oauth-service.test.js` (times out when xAI's endpoint isn't reachable), and `**/*.real.test.js` (live provider calls needing credentials). After touching the provider registry or alias logic, run the `verify-providers.mjs` / `verify-alias.mjs` / `verify-oauth-urls.mjs` baselines.

## Architecture in one breath

Next rewrites (`next.config.mjs`) map `/v1/*`, `/v1beta/*`, `/codex/*`, `/responses` → `/api/v1/*` → `src/sse/handlers/chat.js` (parse, combo expansion, account-selection loop) → `open-sse/handlers/chatCore.js` (detect source format, pre-translate RTK hooks, translate, dispatch to executor, retry/refresh, stream) → `open-sse/executors/*` (upstream call) → `open-sse/translator/*` (client format ↔ provider format, pivoting through OpenAI) → SSE back. `src/sse/` is app-side glue; `open-sse/` is the engine. Cross that boundary consciously.

## Highest-cost traps (each has bitten someone)

- **Adding a DB export? Touch four files or the API route breaks at runtime** with `(0, e.xx) is not a function` — the build stays green: `src/lib/db/repos/*.js` → `src/lib/db/index.js` → the shim list in `src/lib/localDb.js` → `src/models/index.js` (routes import `@/models`, which re-exports *from* `@/lib/localDb`, not from `db/index.js`).
- **State is SQLite** (`src/lib/db/`, file at `${DATA_DIR}/db/data.sqlite`), not `db.json`. `localDb.js`/`usageDb.js` are backward-compat shims — new code imports `@/lib/db/index.js`. Legacy `db.json`/`usage.json`/etc. are read once by `src/lib/db/migrate.js` and never written again.
- **`custom-server.js` is not optional**: it derives the client IP from the TCP socket (stripping attacker-controlled `X-Forwarded-For`) and starts the background token-refresh scheduler. Bare `next dev`/`next start` loads neither.
- **Never bundle `open`** — it's in `serverExternalPackages` on purpose: webpack turns its `import.meta.url` into the build machine's absolute path, so a macOS-built release throws `File URL path must be absolute` on Windows at import time, killing xAI/Grok token refresh transitively.
- **A new translator file that isn't imported in `open-sse/translator/index.js` never runs** — translators self-register via `register(...)` as an import side effect. Same idea for providers: `providers/registry/index.js` is auto-generated — regenerate with `scripts/migrate-registry.mjs`, don't hand-edit.
- **i18n is runtime DOM text-node replacement** (`src/i18n/runtime.js`, dictionaries in `public/i18n/literals/*.json`). Dynamically concatenated strings (`"388 Requests"` as one node) are invisible to it — call `translate("Requests")` in the component instead. SSR renders English and the client swaps it in, so hydration-mismatch warnings are expected and **non-blocking — do not "fix" them**.
- **Async-value text nodes**: a component that renders a string placeholder (`"—"`) then updates it after data arrives can silently fail to update the DOM. Render `null` initially so the real value *creates* the node.
- **Frontend stack quirks**: recharts 3 has no `activeIndex` (use a `shape` function + `props.isActive`); never put `var(--x)` in an SVG presentation attribute (use `style`); theming is dual light/dark CSS variables — verify new UI in **both** themes. Format token counts with `fmtTokensLocale` (from `UsageBreakdown.js`).
- **Usage stats field-name trap**: grouped summaries from `groupDataByKey` key cost as `cost`; `totalCost` only exists on `sortData` detail items. Read grouped cost as `summary.totalCost ?? summary.cost ?? 0`.
- **Lint carries a large pre-existing backlog** (144 errors / 211 warnings as of 2026-10-03, incl. `react-hooks/set-state-in-effect` from the established localStorage-read pattern). Don't introduce new errors, but don't mass-refactor to clear the backlog either — matching existing patterns is acceptable.

## Conventions

- Plain ESM JavaScript, no TypeScript. Path aliases (`jsconfig.json`): `@/*` → `src/*`, plus `open-sse` and `open-sse/*`.
- Never hardcode role/block/model strings under `open-sse/` — use `open-sse/translator/schema/` and `open-sse/config/` constants.
- Components are `"use client"` + PropTypes, matching existing files in `src/shared/components/`.
- Commits: Conventional Commits in English (`feat(scope): …`, `fix(translator): …`). See `CHANGELOG.md`.
- Security first on any change: audit auth, credential/token storage and leaks, `X-Forwarded-For` handling, and SSRF before functional logic, and flag risks explicitly when reporting (per `CLAUDE.md`).
- `INITIAL_PASSWORD` defaults to `123456` — always override via `.env`; full env contract in `.env.example`.
- Git remotes: **`origin` = `github.com/kelongyan/9router`** (push here), **`upstream` = `github.com/decolua/9router`** (the source project — never push to it). Default branch is `master`.
