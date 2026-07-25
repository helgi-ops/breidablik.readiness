import { test } from "vitest";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHrForTeam } from "../loadForTeam";

type Rows = Record<string, unknown>[];

// Minimal thenable query-builder stub: every chained method returns itself and the
// builder resolves to the rows preset for its table. Enough for the loader's
// `.from(t).select(...).eq(...).eq/gte(...)` chains under `await` / Promise.all.
function stubClient(tables: Record<string, Rows>): SupabaseClient {
  interface Builder extends PromiseLike<{ data: Rows; error: null }> {
    select(cols?: string): Builder;
    eq(col: string, val: unknown): Builder;
    gte(col: string, val: unknown): Builder;
    maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }>;
  }
  const make = (rows: Rows): Builder => {
    const b: Builder = {
      select: () => b,
      eq: () => b,
      gte: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null as null }),
      then: (onf) => Promise.resolve({ data: rows, error: null as null }).then(onf),
    };
    return b;
  };
  return { from: (t: string) => make(tables[t] ?? []) } as unknown as SupabaseClient;
}

// Four belt sessions for p1 (band-5, 10 min each; max HR 180, avg 150), Catapult
// %HRmax absent. p2 wore no belt.
const beltRows = (playerId: string): Rows =>
  ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"].map((date) => ({
    player_id: playerId, date,
    hr_zone_5_time_s: 600,
    max_heart_rate: 180, avg_heart_rate: 150,
    pct_max_heart_rate: null, pct_avg_heart_rate: null,
  }));

test("only belt-wearing players get a read; rosterCount is the full active squad", async () => {
  const client = stubClient({
    players: [
      { id: "p1", full_name: "Alpha One", position: "MID", hr_max: 200 },
      { id: "p2", full_name: "Beta Two", position: null, hr_max: null },
    ],
    player_external_load_daily: beltRows("p1"), // p2 has no belt rows
    session_rpe_entries: [],
  });
  const { reads, rosterCount } = await loadHrForTeam(client, "team1");
  assert.equal(rosterCount, 2);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].playerId, "p1");
  assert.equal(reads[0].hrMax, 200);
});

test("effective %HRmax fills from configured hr_max when Catapult's value is absent", async () => {
  const client = stubClient({
    players: [{ id: "p1", full_name: "Alpha One", position: "MID", hr_max: 200 }],
    player_external_load_daily: beltRows("p1"),
    session_rpe_entries: [],
  });
  const { reads } = await loadHrForTeam(client, "team1");
  const r = reads[0];
  // 180/200 = 90% peak, 150/200 = 75% avg — computed in-app, not fabricated.
  assert.equal(r.latestHr?.pctMax, 90);
  assert.equal(r.latestHr?.pctAvg, 75);
  // …and that presence lifts the engine's confidence gate off "no %HRmax".
  assert.equal(r.read.dataCoverage.hasPctMax, true);
});

// Four belt sessions with a chosen peak HR (or none), Catapult %HRmax absent.
const beltRowsMax = (playerId: string, maxHr: number | null): Rows =>
  ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"].map((date) => ({
    player_id: playerId, date,
    hr_zone_5_time_s: 600,
    max_heart_rate: maxHr, avg_heart_rate: maxHr != null ? maxHr - 30 : null,
    pct_max_heart_rate: null, pct_avg_heart_rate: null,
  }));

test("no hr_max, no Catapult %HRmax, no observed peak, no age → %HRmax stays null (never fabricated)", async () => {
  const client = stubClient({
    players: [{ id: "p1", full_name: "Alpha One", position: "MID", hr_max: null, date_of_birth: null }],
    player_external_load_daily: beltRowsMax("p1", null), // no max_heart_rate → no observed peak
    session_rpe_entries: [],
  });
  const { reads } = await loadHrForTeam(client, "team1");
  assert.equal(reads[0].latestHr?.pctMax, null);
  assert.equal(reads[0].hrMaxSource, "none");
  assert.equal(reads[0].read.dataCoverage.hasPctMax, false);
});

test("observed belt peak fills HRmax and lifts the gate when no value is set", async () => {
  const client = stubClient({
    players: [{ id: "p1", full_name: "Alpha One", position: "MID", hr_max: null, date_of_birth: "1994-01-01" }],
    player_external_load_daily: beltRowsMax("p1", 190), // peak 190 > Tanaka(~186)
    session_rpe_entries: [],
    teams: [{ gender: "M" }],
  });
  const { reads } = await loadHrForTeam(client, "team1");
  assert.equal(reads[0].hrMaxSource, "observed");
  assert.equal(reads[0].effectiveHrMax, 190);
  assert.equal(reads[0].latestHr?.pctMax, 100); // 190 / 190
  assert.equal(reads[0].read.dataCoverage.hasPctMax, true); // observed peak is real → gate lifts
});

test("age estimate fills the DISPLAY %HRmax but does NOT lift the calibration gate", async () => {
  const client = stubClient({
    players: [{ id: "p1", full_name: "Alpha One", position: "MID", hr_max: null, date_of_birth: "1994-01-01" }],
    player_external_load_daily: beltRowsMax("p1", 165), // never maxed: 165 < Tanaka(208−0.7·32=186)
    session_rpe_entries: [],
    teams: [{ gender: "M" }],
  });
  const { reads } = await loadHrForTeam(client, "team1");
  assert.equal(reads[0].hrMaxSource, "estimated");
  assert.equal(reads[0].effectiveHrMax, 186); // Tanaka wins over the sub-max observed peak
  assert.equal(reads[0].latestHr?.pctMax, 89); // 165 / 186 → 88.7 → 89, honest
  assert.equal(reads[0].read.dataCoverage.hasPctMax, false); // an estimate never counts as calibrated
});

test("women get the Gulati formula, not Tanaka", async () => {
  const client = stubClient({
    players: [{ id: "p1", full_name: "Alpha One", position: "MID", hr_max: null, date_of_birth: "1994-01-01" }],
    player_external_load_daily: beltRowsMax("p1", 150), // sub-max so the estimate wins
    session_rpe_entries: [],
    teams: [{ gender: "F" }],
  });
  const { reads } = await loadHrForTeam(client, "team1");
  assert.equal(reads[0].effectiveHrMax, 178); // Gulati 206 − 0.88·32 = 177.8 → 178 (not Tanaka's 186)
  assert.equal(reads[0].hrMaxSource, "estimated");
});
