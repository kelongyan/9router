// Free-model discovery + probe service.
//
// Free offerings on aggregator providers (opencode, cline, …) rotate constantly:
// new ids appear, catalogued ids die, and the static registry cannot keep up.
// The only reliable "is this free model usable right now" signal is a live probe
// through the gateway's own request chain (opencode fingerprint, cline OAuth
// refresh, translators — all apply as usual).
//
// State lives on globalThis (survives Next dev hot reload; single process in
// production) — deliberately NOT SQLite: probe results are a refreshable cache,
// and boot + interval probes make persistence unnecessary.

import { getInternalHeaders, pingModelByKind } from "@/app/api/models/test/ping.js";
import { getProviderConnections } from "@/lib/localDb";
import { fetchClineFreeTierModels } from "open-sse/services/clinepassModels.js";
import REGISTRY from "open-sse/providers/registry/index.js";
import { UPDATER_CONFIG } from "@/shared/constants/config";

const PROBE_BASE_URL = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;
const CANDIDATES_TTL_MS = 10 * 60 * 1000;
const EMPTY_CANDIDATES_TTL_MS = 60 * 1000;
const PROBE_TIMEOUT_MS = 45000;
const PROBE_CONCURRENCY = 4;
const BOOT_DELAY_MS = 15000;
const PROBE_INTERVAL_MS = 6 * 60 * 60 * 1000;

// opencode zen-lane ids served free without the -free suffix (verified live 2026-09-28).
const OPENCODE_EXTRA_FREE_IDS = new Set(["big-pickle"]);

// cline enforces per-account rate limits (a parallel probe burst 429s the whole
// round) — its probes run serially with spacing instead.
const PROVIDER_PROBE_LIMITS = { cline: 1 };
const PROVIDER_PROBE_SPACING_MS = { cline: 1500 };
const RATE_LIMIT_COOLDOWN_MS = 15000;
const RATE_LIMIT_RE = /(\[?429\]?)|(rate.?limit)/i;

// The board's scope: providers with a LIVE free-model feed (rotating free tiers
// that the static registry can't track). Static free/freeTier catalogs were
// dropped on purpose — hundreds of needs-auth entries drowned the two lanes
// that actually matter (opencode, cline). `includeCatalog: false` excludes the
// static registry catalog when it is mostly PAID models (cline's lineup); the
// free tier itself comes from the recommended-models feed.
const LIVE_FEED_PROVIDERS = {
  cline: {
    includeCatalog: false,
    fetch: async () => {
      // One retry: the feed host is slow enough to hit connect timeouts
      // transiently; the second attempt benefits from the warmed DNS cache.
      const models = (await fetchClineFreeTierModels()) || (await fetchClineFreeTierModels());
      return (models || []).map((m) => ({ id: m.id, name: m.name, kind: "llm" }));
    },
  },
  opencode: {
    fetch: async () => {
      const res = await fetch("https://opencode.ai/zen/v1/models", { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];
      const json = await res.json().catch(() => null);
      const list = Array.isArray(json?.data) ? json.data : [];
      return list
        .filter((m) => typeof m?.id === "string" && (m.id.endsWith("-free") || OPENCODE_EXTRA_FREE_IDS.has(m.id)))
        .map((m) => ({ id: m.id, name: m.name || m.id, kind: "llm" }));
    },
  },
};

const g = (globalThis.__freeModelsStateV2 ??= {
  candidates: null, // { at, providers }
  results: [], // latest probe run: [{ key, status, latencyMs, error, probedAt }]
  lastProbeAt: 0,
  probing: false,
  scheduled: false,
});

function providerIsNoAuth(p) {
  return Boolean(p.noAuth || p.transport?.noAuth || p.category === "free");
}

function candidateKey(providerId, modelId) {
  return `${providerId}::${modelId}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Aggregate free-model candidates from static free/freeTier catalogs plus the
 * live feeds into provider groups:
 * [{ id, alias, displayName, category, probeable, models: [{ id, name, kind, source }] }]
 *
 * Live feeds sit behind slow hosts (api.cline.bot can take ~8s to connect), so
 * refreshes run single-flight in the background: `getFreeCandidateGroups()`
 * returns the last snapshot immediately and kicks off a refresh when stale,
 * while runProbe passes wait:true to await the fresh snapshot.
 */
let refreshInFlight = null;

async function refreshCandidates() {
  try {
    const [connections, liveEntries] = await Promise.all([
      getProviderConnections().catch(() => []),
      Promise.all(
        Object.entries(LIVE_FEED_PROVIDERS).map(async ([id, source]) => {
          try {
            return [id, await source.fetch()];
          } catch {
            return [id, []];
          }
        })
      ).then((pairs) => Object.fromEntries(pairs)),
    ]);
    const activeConnectionProviders = new Set(
      (connections || []).filter((c) => c.isActive !== false).map((c) => c.provider)
    );

    const groups = [];
    for (const [id, source] of Object.entries(LIVE_FEED_PROVIDERS)) {
      const p = REGISTRY.find((entry) => entry.id === id);
      if (!p) continue;

      const byId = new Map();
      if (source.includeCatalog !== false) {
        for (const m of p.models || []) {
          if (!m?.id) continue;
          byId.set(m.id, { id: m.id, name: m.name || m.id, kind: m.kind || m.type || "llm", source: "catalog" });
        }
      }
      for (const m of liveEntries[id] || []) {
        const existing = byId.get(m.id);
        if (existing) {
          if (m.name) existing.name = existing.name || m.name;
          existing.source = "live";
        } else {
          byId.set(m.id, { id: m.id, name: m.name || m.id, kind: m.kind || "llm", source: "live" });
        }
      }
      if (byId.size === 0) continue;

      const probeable = providerIsNoAuth(p) || activeConnectionProviders.has(p.id);
      groups.push({
        id: p.id,
        alias: p.alias || p.id,
        displayName: p.display?.name || p.id,
        color: p.display?.color || null,
        textIcon: p.display?.textIcon || null,
        category: p.category,
        probeable,
        models: [...byId.values()],
      });
    }

    g.candidates = { at: Date.now(), providers: groups };
  } finally {
    refreshInFlight = null;
  }
}

export async function getFreeCandidateGroups({ wait = false } = {}) {
  if (g.candidates) {
    const ttl = g.candidates.providers.length > 0 ? CANDIDATES_TTL_MS : EMPTY_CANDIDATES_TTL_MS;
    if (Date.now() - g.candidates.at < ttl) {
      return g.candidates.providers;
    }
  }

  if (refreshInFlight) {
    if (wait) await refreshInFlight;
  } else if (wait) {
    await refreshCandidates();
  } else {
    refreshInFlight = refreshCandidates();
  }
  return g.candidates?.providers || [];
}

/**
 * Probe one model with a streaming chat request through the gateway itself and
 * stop as soon as the first content/reasoning delta arrives (saves quota).
 * Streaming is the probe of record because some free lanes (e.g. cline's
 * cline-free/gemini-3.8-flash) return an empty body for non-stream requests
 * while working fine streamed.
 */
async function pingModelStream(model) {
  const headers = await getInternalHeaders();
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${PROBE_BASE_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 512,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => "");
      let detail = raw;
      try {
        const j = JSON.parse(raw);
        detail = j.error?.message || j.error || raw;
      } catch { /* keep raw */ }
      return {
        ok: false,
        latencyMs: Date.now() - start,
        status: res.status,
        error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk.error) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            status: res.status,
            error: String(chunk.error?.message || chunk.error).slice(0, 240),
          };
        }
        const choice = chunk.choices?.[0] || {};
        const delta = choice.delta || {};
        if (
          delta.content || delta.reasoning || delta.reasoning_content || delta.thinking ||
          delta.thinking_content || choice.message?.content
        ) {
          controller.abort();
          return { ok: true, latencyMs: Date.now() - start, status: res.status };
        }
      }
    }
    return { ok: false, latencyMs: Date.now() - start, status: res.status, error: "No streamed content received" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: String(e?.message || e).slice(0, 240) };
  } finally {
    clearTimeout(timer);
  }
}

async function probeCandidate(group, model) {
  const fullId = `${group.alias}/${model.id}`;
  const probedAt = Date.now();
  let outcome;

  if (model.kind === "llm") {
    outcome = await pingModelStream(fullId);
    if (!outcome.ok) {
      // Rate limits are transient and per-account — a single probe burst can
      // trip them even when the model is healthy. Back off once and re-probe.
      if (RATE_LIMIT_RE.test(String(outcome.error || ""))) {
        await sleep(RATE_LIMIT_COOLDOWN_MS);
        outcome = await pingModelStream(fullId);
      }
      // Provider may not stream at all — the non-stream ping is the arbiter.
      if (!outcome.ok) {
        const fallback = await pingModelByKind(fullId, model.kind, PROBE_BASE_URL);
        outcome = fallback.ok ? { ...fallback, note: "non-stream" } : outcome;
      }
    }
  } else {
    outcome = await pingModelByKind(fullId, model.kind, PROBE_BASE_URL);
  }

  const error = outcome.ok ? null : String(outcome.error || "Unknown error");
  return {
    key: candidateKey(group.id, model.id),
    status: outcome.ok ? "ok" : "fail",
    latencyMs: outcome.latencyMs ?? null,
    error,
    probedAt,
  };
}

/**
 * Run a probe round over all probeable candidate groups (or just `providerId`).
 * Runs in the background: startProbe() returns immediately, GET reports progress.
 */
// Pure network-layer failures (timeouts, connect errors) say nothing about the
// model itself — a slow-network round must not flap verified-usable models off
// the board. Hard upstream rejections (region, credits, unknown model) do.
const TRANSIENT_NETWORK_RE = /(aborted|timeout|connect|fetch failed|socket|econn)/i;

async function runProbe(providerId) {
  const groups = await getFreeCandidateGroups({ wait: true });
  const targets = providerId ? groups.filter((grp) => grp.id === providerId) : groups;
  const results = providerId ? g.results.filter((r) => !r.key.startsWith(`${providerId}::`)) : [];
  const prevOk = new Map(g.results.filter((r) => r.status === "ok").map((r) => [r.key, r]));

  await Promise.all(
    targets.map(async (group) => {
      // No credentials for this provider — probing would only burn requests.
      // The board shows it as a needs-auth hint card instead of listing models.
      if (!group.probeable) return;
      const limit = PROVIDER_PROBE_LIMITS[group.id] ?? PROBE_CONCURRENCY;
      const spacingMs = PROVIDER_PROBE_SPACING_MS[group.id] ?? 0;
      const queue = [...group.models];
      await Promise.all(
        Array.from({ length: Math.min(limit, queue.length) }, async () => {
          for (;;) {
            const model = queue.shift();
            if (!model) return;
            if (spacingMs) await sleep(spacingMs);
            try {
              const res = await probeCandidate(group, model);
              if (res.status === "fail" && TRANSIENT_NETWORK_RE.test(res.error || "") && prevOk.has(res.key)) {
                // Sticky ok: keep the last verified result across network blips.
                results.push(prevOk.get(res.key));
              } else {
                results.push(res);
              }
            } catch (e) {
              results.push({
                key: candidateKey(group.id, model.id),
                status: "fail",
                latencyMs: null,
                error: String(e?.message || e).slice(0, 240),
                probedAt: Date.now(),
              });
            }
          }
        })
      );
    })
  );

  g.results = results;
  g.lastProbeAt = Date.now();
}

/**
 * Kick off a probe round unless one is already running. Returns immediately.
 * @param {string} [providerId] - limit the round to one provider.
 */
export function startProbe(providerId) {
  if (g.probing) return { started: false, probing: true };
  g.probing = true;
  runProbe(providerId)
    .catch((e) => console.error("[free-models] probe round failed:", e?.message || e))
    .finally(() => {
      g.probing = false;
    });
  return { started: true, probing: true };
}

/** Snapshot for the dashboard: candidates merged with latest probe results. */
export async function getFreeModelsSnapshot() {
  const groups = await getFreeCandidateGroups();
  const byKey = new Map(g.results.map((r) => [r.key, r]));
  return {
    probing: g.probing,
    lastProbeAt: g.lastProbeAt || null,
    providers: groups.map((group) => ({
      id: group.id,
      alias: group.alias,
      displayName: group.displayName,
      color: group.color,
      textIcon: group.textIcon,
      category: group.category,
      probeable: group.probeable,
      // Credential-less groups collapse to a needs-auth hint card: no model
      // rows, no probing — just the count of what awaits after login.
      needsAuth: !group.probeable,
      pendingCount: group.probeable ? 0 : group.models.length,
      // The board only renders verified-usable models; failed/unprobed entries
      // stay in the probe state (freshness machinery) but are never listed.
      models: group.probeable
        ? group.models
            .map((model) => {
              const r = byKey.get(candidateKey(group.id, model.id));
              return {
                id: model.id,
                name: model.name,
                kind: model.kind,
                source: model.source,
                status: r?.status || "unprobed",
                latencyMs: r?.latencyMs ?? null,
                error: r?.error || null,
                probedAt: r?.probedAt || null,
              };
            })
            .filter((model) => model.status === "ok")
        : [],
    })),
  };
}

/**
 * Boot + interval probing. Idempotent — safe to call on every initializeApp.
 * The first round is deferred so it never competes with startup work.
 */
export function scheduleFreeModelProbes() {
  if (g.scheduled) return;
  g.scheduled = true;
  setTimeout(() => startProbe(), BOOT_DELAY_MS);
  setInterval(() => startProbe(), PROBE_INTERVAL_MS);
}
