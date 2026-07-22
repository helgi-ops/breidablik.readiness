import { test } from "vitest";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildValdDailySnapshot } from "../snapshot";

/**
 * End-to-end proof of the CV gate through the real snapshot pipeline
 * (fetch → trial-average → classify → explanation.cmj.phase), driven by a stub
 * Supabase client so no live/demo data is touched. This is the acceptance test:
 * a 10% move in a LOW-CV metric (peak power, CV 2.7%) must flag `real`, while an
 * equal 10% move in a HIGHER-CV metric (eccentric duration, CV 8%) must NOT.
 */

type Row = Record<string, unknown>;

function trial(rawTestId: string, ts: string, over: Partial<Row>): Row {
  return {
    raw_test_id: rawTestId,
    test_timestamp: ts,
    rsi_mod_source: null,
    is_valid: true,
    jump_height_cm: 32,
    rsi_mod: null,
    time_to_takeoff_ms: 600,
    peak_force_n: 2000,
    concentric_impulse_n_s: 200,
    eccentric_duration_ms: 250,
    concentric_duration_ms: 250,
    peak_power_w: 5000,
    ...over,
  };
}

// 3 steady baseline tests + 1 latest test that drops peak power 10% (worse) and
// lengthens eccentric duration 10% (worse). Two trials per test to exercise the mean.
const CMJ_ROWS: Row[] = [
  trial("A", "2026-07-05T10:00:00Z", { peak_power_w: 4950, eccentric_duration_ms: 248 }),
  trial("A", "2026-07-05T10:01:00Z", { peak_power_w: 5050, eccentric_duration_ms: 252 }),
  trial("B", "2026-07-10T10:00:00Z", { peak_power_w: 5000, eccentric_duration_ms: 250 }),
  trial("B", "2026-07-10T10:01:00Z", { peak_power_w: 5000, eccentric_duration_ms: 250 }),
  trial("C", "2026-07-15T10:00:00Z", { peak_power_w: 4980, eccentric_duration_ms: 249 }),
  trial("C", "2026-07-15T10:01:00Z", { peak_power_w: 5020, eccentric_duration_ms: 251 }),
  // latest test: −10% peak power, +10% eccentric duration
  trial("D", "2026-07-22T10:00:00Z", { peak_power_w: 4500, eccentric_duration_ms: 275 }),
  trial("D", "2026-07-22T10:01:00Z", { peak_power_w: 4500, eccentric_duration_ms: 275 }),
];

function stubClient(dataByTable: Record<string, Row[]>): SupabaseClient {
  const from = (table: string) => {
    const result = { data: dataByTable[table] ?? [], error: null };
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (res: (v: typeof result) => unknown) => Promise.resolve(result).then(res);
          if (prop === "upsert") return () => Promise.resolve({ error: null });
          return () => builder;
        },
      },
    );
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

test("ACCEPTANCE (e2e): 10% drop flags low-CV peak power `real`, 10% rise in high-CV eccentric duration stays `noise`", async () => {
  const client = stubClient({
    vald_forcedecks_results: CMJ_ROWS,
    vald_nordbord_results: [],
    vald_forceframe_results: [],
    vald_daily_player_snapshot: [],
  });

  const snap = await buildValdDailySnapshot("team", "player", "2026-07-22", client);
  const cmj = (snap.explanation as Record<string, unknown>).cmj as Record<string, unknown>;
  const phase = cmj.phase as Record<string, unknown>;

  assert.equal(phase.available, true, "phase data should be available");
  assert.equal((phase as { trial_count: number }).trial_count, 2, "latest test averaged 2 trials");

  const metrics = phase.metrics as Array<{ metric: string; status: string; delta_percent: number | null }>;
  const pp = metrics.find((m) => m.metric === "peakPower");
  const ecc = metrics.find((m) => m.metric === "eccentricDuration");

  assert.ok(pp && ecc, "both metrics present");
  assert.equal(pp!.status, "real", `peak power −10% should be REAL; got ${pp!.status}`);
  assert.equal(ecc!.status, "noise", `eccentric duration +10% must NOT flag (CV 8%); got ${ecc!.status}`);

  // The worst `real` headline exists and points at the metric that cleared the gate.
  const worst = phase.worst_real as { metric: string } | null;
  assert.ok(worst && worst.metric === "peakPower", "worst_real headline is peak power");
});

test("e2e: jump height uses the TRIAL MEAN, not the best trial", async () => {
  const rows: Row[] = [
    trial("A", "2026-07-05T10:00:00Z", { jump_height_cm: 30 }),
    trial("A", "2026-07-05T10:01:00Z", { jump_height_cm: 30 }),
    trial("B", "2026-07-10T10:00:00Z", { jump_height_cm: 30 }),
    trial("B", "2026-07-10T10:01:00Z", { jump_height_cm: 30 }),
    trial("C", "2026-07-15T10:00:00Z", { jump_height_cm: 30 }),
    trial("C", "2026-07-15T10:01:00Z", { jump_height_cm: 30 }),
    // latest test: trials 20 and 40 → mean 30 (a "best trial" read would report 40)
    trial("D", "2026-07-22T10:00:00Z", { jump_height_cm: 20 }),
    trial("D", "2026-07-22T10:01:00Z", { jump_height_cm: 40 }),
  ];
  const client = stubClient({ vald_forcedecks_results: rows, vald_daily_player_snapshot: [] });
  const snap = await buildValdDailySnapshot("team", "player", "2026-07-22", client);
  const cmj = (snap.explanation as Record<string, unknown>).cmj as { latest: number | null };
  assert.equal(cmj.latest, 30, "latest jump height should be the trial mean (30), not the best trial (40)");
});
