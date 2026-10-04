import { describe, it, expect, vi, beforeEach } from "vitest";

// Feed-refresh → newcomer-probe chain in src/app/api/free-models/service.js:
// a model that appears in a live feed must get probed right away (targeted
// round over just the new keys), instead of waiting for the 6h scheduler.

// Shared feed fixtures — read by the mocked feed fetchers at call time.
const feedState = { cline: [], opencode: [] };
let chatProbeCalls = 0;

vi.mock("@/app/api/models/test/ping.js", () => ({
  getInternalHeaders: async () => ({}),
  pingModelByKind: async () => ({ ok: true, latencyMs: 5 }),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: async () => [
    { provider: "cline", isActive: true },
    { provider: "opencode", isActive: true },
  ],
}));

vi.mock("open-sse/services/clinepassModels.js", () => ({
  fetchClineFreeTierModels: async () => feedState.cline.map((id) => ({ id, name: id })),
}));

vi.mock("open-sse/providers/registry/index.js", () => ({
  default: [
    { id: "cline", alias: "cline", display: { name: "Cline", color: "#000", textIcon: "C" }, category: "free" },
    { id: "opencode", alias: "opencode", display: { name: "OpenCode", color: "#111", textIcon: "O" } },
  ],
}));

vi.mock("@/shared/constants/config", () => ({ UPDATER_CONFIG: { appPort: 3999 } }));

function stubFetch() {
  chatProbeCalls = 0;
  const encoder = new TextEncoder();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/zen/v1/models")) {
        return {
          ok: true,
          json: async () => ({ data: feedState.opencode.map((id) => ({ id, name: id })) }),
        };
      }
      if (u.includes("/api/v1/chat/completions")) {
        chatProbeCalls += 1;
        const chunk = encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(chunk);
              controller.close();
            },
          }),
        };
      }
      throw new Error(`unexpected fetch: ${u}`);
    })
  );
}

// Fresh module + state per test: the service keeps its state on globalThis so
// it survives dev hot reload — drop it to simulate a cold process.
async function freshService() {
  vi.resetModules();
  delete globalThis.__freeModelsStateV2;
  return import("@/app/api/free-models/service.js");
}

const state = () => globalThis.__freeModelsStateV2;
// vi.waitUntil polls until the callback returns truthy; vi.waitFor instead
// resolves as soon as its callback stops throwing, which passes instantly here.
const waitFor = (fn, opts) => vi.waitUntil(fn, { timeout: 10000, interval: 20, ...opts });

// Force a candidate refresh and wait until it has landed (diff + flush run
// synchronously at the end of refreshCandidates, so a fresh `at` implies the
// flush decision was already made).
async function refreshTo(service, feedPatch) {
  Object.assign(feedState, feedPatch);
  state().candidates.at = 0; // expire the 10-min candidate TTL
  await service.getFreeCandidateGroups({ wait: true });
  expect(state().candidates.at).toBeGreaterThan(0);
}

describe("free-models feed refresh → newcomer probing", () => {
  beforeEach(() => {
    stubFetch();
    feedState.cline = [];
    feedState.opencode = [];
  });

  it("first pull only snapshots candidates and starts no round", async () => {
    feedState.cline = ["a"];
    feedState.opencode = ["x-free"];
    const svc = await freshService();
    await svc.getFreeCandidateGroups({ wait: true });

    expect(state().candidates).not.toBeNull();
    expect(state().probing).toBe(false);
    expect(chatProbeCalls).toBe(0);
  });

  it("a model new to the feed is probed immediately — targeted, lane untouched", async () => {
    feedState.cline = ["a"];
    feedState.opencode = ["x-free"];
    const svc = await freshService();
    await svc.getFreeCandidateGroups({ wait: true });

    await refreshTo(svc, { opencode: ["x-free", "y-free"] });
    expect(state().probing).toBe(true);
    await waitFor(() => state().probing === false);

    const keys = state().results.map((r) => r.key);
    expect(keys).toEqual(["opencode::y-free"]);
    expect(chatProbeCalls).toBe(1);
  });

  it("newcomers found mid-round are probed once, after the running round ends", async () => {
    feedState.cline = ["a"];
    feedState.opencode = ["x-free"];
    const svc = await freshService();
    await svc.getFreeCandidateGroups({ wait: true });

    // Simulate a round already in flight when the feed changes.
    state().probing = true;
    await refreshTo(svc, { cline: ["a", "b"] });
    expect([...state().pendingNewKeys]).toEqual(["cline::b"]);
    expect(state().probing).toBe(true); // flush must not start a second round
    expect(chatProbeCalls).toBe(0);

    state().probing = false;
    svc.startProbe(); // the "in-flight" round ends; a full round follows
    await waitFor(() => state().probing === false);
    expect(state().pendingNewKeys.size).toBe(0);

    const keys = state().results.map((r) => r.key).sort();
    expect(keys).toEqual(["cline::a", "cline::b", "opencode::x-free"]);
    expect(chatProbeCalls).toBe(3); // b probed exactly once — no flush double-tap
  });

  it("a model removed from the feed drops out of candidates", async () => {
    feedState.cline = ["a", "b"];
    feedState.opencode = [];
    const svc = await freshService();
    await svc.getFreeCandidateGroups({ wait: true });

    await refreshTo(svc, { cline: ["a"] });

    const clineGroup = state().candidates.providers.find((grp) => grp.id === "cline");
    expect(clineGroup.models.map((m) => m.id)).toEqual(["a"]);
  });
});
