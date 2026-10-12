import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// /v1/models (src/app/api/v1/models/route.js) used to take 20+s when the local
// proxy was slow: every compatible-node /models lookup and every live resolver
// ran serially through the env proxy, each timing out in turn. The fix has
// three parts under test here:
//   1. fetchCompatibleModelIds: two stages (short proxy budget → direct retry)
//      with INDEPENDENT AbortControllers — a shared signal would already be
//      aborted when the direct retry starts and kill it instantly.
//   2. buildModelsList: per-provider upstream work runs in parallel.
//   3. buildModelsList: export-path results cached for a short TTL.

// ─── undici mock: record dispatcher kind + signal freshness per call ────────
const state = {
  connections: [],
  fetchCalls: [],
  fetchImpl: null,
};

vi.mock("undici", () => ({
  Agent: class Agent { constructor() { this.kind = "direct"; } },
  ProxyAgent: class ProxyAgent { constructor(opts) { this.kind = "proxy"; this.uri = opts?.uri; } },
  fetch: (url, opts) => state.fetchImpl(url, opts),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => state.connections,
  getCombos: async () => [],
  getCustomModels: async () => [],
  getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
// [local] pass the whitelist/alias layers through untouched
vi.mock("@/lib/modelWhitelist", () => ({ applyWhitelist: async (models) => models }));
vi.mock("@/lib/modelAliases", () => ({ applyModelAliases: (models) => models }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { buildModelsList, __test__ } = await import("@/app/api/v1/models/route.js");

function makeConnection(id, baseUrl, apiKey = "sk-test") {
  return {
    id,
    provider: `openai-compatible-pool-${id}`,
    isActive: true,
    apiKey,
    providerSpecificData: { baseUrl },
  };
}

function jsonResponse(models) {
  return {
    ok: true,
    json: async () => ({ data: models.map((id) => ({ id })) }),
  };
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  __test__.clearModelsListCache();
  state.connections = [];
  state.fetchCalls = [];
  state.fetchImpl = async (url, opts) => {
    state.fetchCalls.push({
      url,
      dispatcher: opts?.dispatcher?.kind,
      signalAborted: opts?.signal?.aborted === true,
      startedAt: Date.now(),
    });
    await sleep(50);
    return jsonResponse([`model-of-${new URL(url).hostname}`]);
  };
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("fetchCompatibleModelIds: two-stage proxy → direct fallback", () => {
  it("short-circuits on the proxy stage when it succeeds", async () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    process.env.NO_PROXY = "";
    state.connections = [makeConnection("a", "https://pool-a.example.com/v1")];

    const models = await buildModelsList(["llm"]);

    const proxyCalls = state.fetchCalls.filter((c) => c.dispatcher === "proxy");
    const directCalls = state.fetchCalls.filter((c) => c.dispatcher === "direct");
    expect(proxyCalls).toHaveLength(1);
    expect(directCalls).toHaveLength(0);
    expect(models.some((m) => m.id.includes("model-of-pool-a.example.com"))).toBe(true);
  });

  it("falls back to direct with a FRESH (non-aborted) signal when the proxy stage fails", async () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    process.env.NO_PROXY = "";
    state.connections = [makeConnection("a", "https://pool-a.example.com/v1")];
    // Proxy stage behaves like a dead/slow proxy: the fetch is aborted.
    state.fetchImpl = async (url, opts) => {
      state.fetchCalls.push({
        url,
        dispatcher: opts?.dispatcher?.kind,
        signalAborted: opts?.signal?.aborted === true,
        startedAt: Date.now(),
      });
      if (opts?.dispatcher?.kind === "proxy") {
        throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
      }
      await sleep(50);
      return jsonResponse(["direct-model-a"]);
    };

    const models = await buildModelsList(["llm"]);

    expect(state.fetchCalls.map((c) => c.dispatcher)).toEqual(["proxy", "direct"]);
    // The retry's signal must NOT inherit the aborted state of the stage-1
    // signal — that was the failure mode that made the old fallback a no-op.
    const directCall = state.fetchCalls[1];
    expect(directCall.signalAborted).toBe(false);
    expect(models.some((m) => m.id.includes("direct-model-a"))).toBe(true);
  });

  it("returns [] without throwing when both stages fail", async () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    process.env.NO_PROXY = "";
    state.connections = [makeConnection("a", "https://pool-a.example.com/v1")];
    state.fetchImpl = async (url, opts) => {
      state.fetchCalls.push({ url, dispatcher: opts?.dispatcher?.kind, startedAt: Date.now() });
      throw new Error("fetch failed");
    };

    const models = await buildModelsList(["llm"]);

    expect(state.fetchCalls.map((c) => c.dispatcher)).toEqual(["proxy", "direct"]);
    expect(models).toHaveLength(0);
  });

  it("skips the proxy stage entirely when no env proxy is set", async () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.ALL_PROXY;
    state.connections = [makeConnection("a", "https://pool-a.example.com/v1")];

    await buildModelsList(["llm"]);

    const directCalls = state.fetchCalls.filter((c) => c.dispatcher === "direct");
    const proxyCalls = state.fetchCalls.filter((c) => c.dispatcher === "proxy");
    expect(directCalls).toHaveLength(1);
    expect(proxyCalls).toHaveLength(0);
  });

  it("respects NO_PROXY: a matching host goes direct only", async () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
    process.env.NO_PROXY = ".example.com";
    state.connections = [makeConnection("a", "https://pool-a.example.com/v1")];

    await buildModelsList(["llm"]);

    expect(state.fetchCalls.map((c) => c.dispatcher)).toEqual(["direct"]);
  });
});

describe("buildModelsList: parallel provider resolution + TTL cache", () => {
  it("runs compatible-node fetches concurrently, not serially", async () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.ALL_PROXY;
    state.connections = [
      makeConnection("a", "https://pool-a.example.com/v1"),
      makeConnection("b", "https://pool-b.example.com/v1"),
      makeConnection("c", "https://pool-c.example.com/v1"),
    ];
    // Each lookup is slow on its own (300ms). Serial: ~900ms. Parallel: ~300ms.
    state.fetchImpl = async (url, opts) => {
      state.fetchCalls.push({ url, dispatcher: opts?.dispatcher?.kind, startedAt: Date.now() });
      await sleep(300);
      return jsonResponse(["slow-model"]);
    };

    const t0 = Date.now();
    const models = await buildModelsList(["llm"]);
    const elapsed = Date.now() - t0;

    expect(state.fetchCalls).toHaveLength(3);
    // All three started within the same 100ms window ⇒ concurrent starts.
    const starts = state.fetchCalls.map((c) => c.startedAt - t0);
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThan(100);
    expect(elapsed).toBeLessThan(600);
    expect(models.length).toBeGreaterThan(0);
  });

  it("serves repeat export-path calls from the TTL cache (no upstream re-fetch)", async () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.ALL_PROXY;
    state.connections = [makeConnection("a", "https://pool-a.example.com/v1")];

    const first = await buildModelsList(["llm"]);
    const firstCallCount = state.fetchCalls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    const second = await buildModelsList(["llm"]);
    expect(state.fetchCalls.length).toBe(firstCallCount); // cache hit
    expect(second).toEqual(first);
  });

  it("bypasses the cache for skipWhitelist (dashboard admin) calls", async () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.ALL_PROXY;
    state.connections = [makeConnection("a", "https://pool-a.example.com/v1")];

    await buildModelsList(["llm"]); // warm the export cache
    const before = state.fetchCalls.length;

    await buildModelsList(["llm"], { skipWhitelist: true });
    expect(state.fetchCalls.length).toBeGreaterThan(before); // fresh fetch
  });
});
