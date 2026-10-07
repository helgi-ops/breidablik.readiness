import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WearableConnectionState, WearableProvider } from "../types";

// ── Hoisted fakes for the module-level createClient + registry ───────────────
const h = vi.hoisted(() => {
  const tables: string[] = [];
  const state = {
    connRow: null as Record<string, unknown> | null,
    playerId: "player-1" as string | null,
  };
  let current = "";
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq", "neq", "order"]) builder[m] = () => builder;
  builder.maybeSingle = async () =>
    current === "profiles" ? { data: { player_id: state.playerId } } : { data: state.connRow };
  builder.upsert = async () => ({ error: null });
  builder.then = (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null });
  const sb = { from: (t: string) => { current = t; tables.push(t); return builder; } } as unknown as SupabaseClient;
  return { tables, state, sb };
});

const prov = vi.hoisted(() => ({ refreshCalls: 0, sleepCalls: 0 }));

vi.mock("@supabase/supabase-js", () => ({ createClient: () => h.sb }));
vi.mock("../registry", () => ({
  getWearableProvider: () => ({
    key: "whoop",
    authorizeUrl: () => "",
    exchangeCode: async () => ({}),
    disconnect: async () => {},
    async fetchSleep() {
      prov.sleepCalls++;
      if (prov.sleepCalls === 1) throw new Error("Whoop /v1/activity/sleep failed: 401 Unauthorized — {}");
      return [];
    },
    async fetchDailySummary() { return []; },
    async refreshAccessToken(s: WearableConnectionState) {
      prov.refreshCalls++;
      return { ...s, accessToken: "new", refreshToken: "r2", expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    },
  }),
}));

import { ensureFreshState, syncConnection } from "../sync";

/** Minimal recording Supabase client for the ensureFreshState unit tests. */
function fakeSb() {
  const tables: string[] = [];
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ["update", "eq"]) builder[m] = (...a: unknown[]) => { calls.push([m, ...a]); return builder; };
  (builder as Record<string, unknown>).then = (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null });
  const sb = { from(t: string) { tables.push(t); return builder; } } as unknown as SupabaseClient;
  return { sb, tables, calls };
}

const baseState: WearableConnectionState = {
  providerUserId: "u1", accessToken: "a", refreshToken: "r1",
  expiresAt: null, scopes: ["offline"], deviceLabel: "Whoop",
};

const refresher = (): WearableProvider => ({
  key: "whoop",
  authorizeUrl: () => "",
  exchangeCode: async () => baseState,
  fetchSleep: async () => [],
  fetchDailySummary: async () => [],
  disconnect: async () => {},
  refreshAccessToken: async (s) => ({ ...s, accessToken: "fresh", refreshToken: "r2", expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
});

beforeEach(() => {
  prov.refreshCalls = 0;
  prov.sleepCalls = 0;
  h.tables.length = 0;
});

describe("ensureFreshState", () => {
  it("refreshes + persists when the token is expired (and writes ONLY wearable_connections)", async () => {
    const { sb, tables, calls } = fakeSb();
    const expired = { ...baseState, expiresAt: new Date(Date.now() - 1000).toISOString() };
    const out = await ensureFreshState(sb, "conn-1", refresher(), expired);
    expect(out.refreshed).toBe(true);
    expect(out.state.accessToken).toBe("fresh");
    expect(tables).toEqual(["wearable_connections"]); // boundary: never readiness_entries
    expect(calls).toContainEqual(["eq", "id", "conn-1"]);
  });

  it("does NOT refresh when the token is still comfortably valid", async () => {
    const { sb, tables } = fakeSb();
    const spy = vi.fn();
    const p = refresher();
    p.refreshAccessToken = async (s) => { spy(); return s; };
    const valid = { ...baseState, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    const out = await ensureFreshState(sb, "conn-1", p, valid);
    expect(out.refreshed).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(tables).toEqual([]);
  });

  it("is a no-op (no call, no throw) when there is no stored refresh token", async () => {
    const { sb } = fakeSb();
    const out = await ensureFreshState(sb, "conn-1", refresher(), { ...baseState, refreshToken: null, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(out.refreshed).toBe(false);
    expect(out.state.accessToken).toBe("a");
  });

  it("leaves providers without refreshAccessToken untouched", async () => {
    const { sb } = fakeSb();
    const noRefresh = refresher();
    delete noRefresh.refreshAccessToken;
    const out = await ensureFreshState(sb, "conn-1", noRefresh, { ...baseState, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(out.refreshed).toBe(false);
  });
});

describe("syncConnection reactive 401 refresh", () => {
  beforeEach(() => {
    h.state.connRow = {
      id: "conn-1", profile_id: "prof-1", provider: "whoop", provider_user_id: "u1",
      access_token: "a", refresh_token: "r1",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), // valid → forces the REACTIVE path, not pre-emptive
      scopes: ["offline"], device_label: "Whoop",
    };
    h.state.playerId = "player-1";
  });

  it("refreshes once on a 401 and retries the fetch a single time", async () => {
    const res = await syncConnection("conn-1");
    expect(res.ok).toBe(true);
    expect(prov.refreshCalls).toBe(1); // exactly one refresh
    expect(prov.sleepCalls).toBe(2);   // first (401) + one retry
  });

  it("never touches the readiness colour tables during sync/refresh", async () => {
    await syncConnection("conn-1");
    expect(h.tables).not.toContain("readiness_entries");
    expect(h.tables).not.toContain("v_coach_readiness_today_v8");
    expect(h.tables).toContain("wearable_connections");
  });
});
