import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  persistSleepNights,
  persistDailySummaries,
  deactivateOtherActiveWearables,
} from "../sync";
import type { WearableSleepNight, WearableDailySummary } from "../types";

/** A recording fake Supabase client: captures every .from(table) and chained op. */
function fakeSb() {
  const tables: string[] = [];
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ["update", "eq", "neq"]) builder[m] = (...a: unknown[]) => { calls.push([m, ...a]); return builder; };
  builder.select = (...a: unknown[]) => { calls.push(["select", ...a]); return Promise.resolve({ data: [{ id: "x" }] }); };
  builder.upsert = (...a: unknown[]) => { calls.push(["upsert", ...a]); return Promise.resolve({ error: null }); };
  const sb = { from(table: string) { tables.push(table); return builder; } } as unknown as SupabaseClient;
  return { sb, tables, calls };
}

const ctx = { playerId: "player-1", connectionId: "conn-1", provider: "terra" as const };

const night: WearableSleepNight = {
  sleepDate: "2026-10-07", sleepStartAt: null, sleepEndAt: null, totalSleepMin: 450,
  sleepEfficiencyPct: 92, deepSleepMin: 90, remSleepMin: 100, lightSleepMin: 260, wakeMin: 20,
  providerScore: 88, sourceRecordId: "terra:sleep:1", raw: {},
};
const daily: WearableDailySummary = {
  measurementDate: "2026-10-07", restingHrBpm: 48, hrvRmssdMs: 71, providerRecoveryScore: 66,
  sourceRecordId: "terra:daily:1", raw: {},
};

describe("wearable sink boundary (mandatory)", () => {
  it("persistSleepNights writes ONLY wearable_sleep_data — never readiness_entries", async () => {
    const { sb, tables } = fakeSb();
    await persistSleepNights(sb, ctx, [night]);
    expect(tables).toEqual(["wearable_sleep_data"]);
    expect(tables).not.toContain("readiness_entries");
  });

  it("persistDailySummaries writes ONLY wearable_daily_data — never readiness_entries", async () => {
    const { sb, tables } = fakeSb();
    await persistDailySummaries(sb, ctx, [daily]);
    expect(tables).toEqual(["wearable_daily_data"]);
    expect(tables).not.toContain("readiness_entries");
  });

  it("empty input writes nothing", async () => {
    const { sb, tables } = fakeSb();
    expect(await persistSleepNights(sb, ctx, [])).toBe(0);
    expect(await persistDailySummaries(sb, ctx, [])).toBe(0);
    expect(tables).toEqual([]);
  });
});

describe("one-active-source dedupe", () => {
  it("deactivates OTHER active providers for the profile, keeping the new one", async () => {
    const { sb, tables, calls } = fakeSb();
    const n = await deactivateOtherActiveWearables(sb, "profile-9", "terra");
    expect(tables).toEqual(["wearable_connections"]);
    expect(calls).toContainEqual(["update", { is_active: false }]);
    expect(calls).toContainEqual(["eq", "profile_id", "profile-9"]);
    expect(calls).toContainEqual(["eq", "is_active", true]);
    expect(calls).toContainEqual(["neq", "provider", "terra"]); // never deactivates the new source
    expect(n).toBe(1);
  });
});
