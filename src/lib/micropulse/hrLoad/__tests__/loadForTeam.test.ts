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
  }
  const make = (rows: Rows): Builder => {
    const b: Builder = {
      select: () => b,
      eq: () => b,
      gte: () => b,
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

test("no hr_max and no Catapult %HRmax → %HRmax stays null (never fabricated)", async () => {
  const client = stubClient({
    players: [{ id: "p1", full_name: "Alpha One", position: "MID", hr_max: null }],
    player_external_load_daily: beltRows("p1"),
    session_rpe_entries: [],
  });
  const { reads } = await loadHrForTeam(client, "team1");
  assert.equal(reads[0].latestHr?.pctMax, null);
  assert.equal(reads[0].read.dataCoverage.hasPctMax, false);
});
