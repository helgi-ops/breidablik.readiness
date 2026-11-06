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

const jump = (id: string, ts: string, cm: number) => trial(id, ts, { jump_height_cm: cm });

test("e2e: a jump 6% down flags while the test is fresh, and stops counting when it is older than 7 days", async () => {
  const rows = [
    jump("D", "2026-07-22T10:00:00Z", 28.2),
    jump("C", "2026-07-15T10:00:00Z", 30),
    jump("B", "2026-07-10T10:00:00Z", 30),
    jump("A", "2026-07-05T10:00:00Z", 30),
  ];
  const fresh = await buildValdDailySnapshot("team", "player", "2026-07-22", stubClient({ vald_forcedecks_results: rows }));
  assert.equal(fresh.neuromuscularFlag, "yellow");
  assert.equal(fresh.overallValdStatus, "yellow");

  const old = await buildValdDailySnapshot("team", "player", "2026-07-30", stubClient({ vald_forcedecks_results: rows }));
  assert.equal(old.cmjFreshnessStatus, "stale");
  assert.equal(old.neuromuscularFlag, null, "8 days old is not today's state");
  assert.equal(old.overallValdStatus, null);
  const cmj = (old.explanation as Record<string, unknown>).cmj as { test_flag: string; message: string };
  assert.equal(cmj.test_flag, "yellow", "what the test showed stays in the explanation");
  assert.match(cmj.message, /Last jump test 8 days ago/);
});

test("e2e: a first jump after a gap gets the plain comparison, no flag, however far down it is", async () => {
  const rows = [
    jump("N", "2026-10-14T10:00:00Z", 24),
    jump("D", "2026-08-27T10:00:00Z", 30),
    jump("C", "2026-08-22T10:00:00Z", 30),
    jump("B", "2026-08-14T10:00:00Z", 30),
    jump("A", "2026-08-07T10:00:00Z", 30),
  ];
  const snap = await buildValdDailySnapshot("team", "player", "2026-10-14", stubClient({ vald_forcedecks_results: rows }));
  assert.equal(snap.cmjFreshnessStatus, "fresh");
  assert.equal(snap.neuromuscularFlag, null, "20% down, but 48 days since the last test");
  const cmj = (snap.explanation as Record<string, unknown>).cmj as {
    baseline: number | null; delta_percent: number | null; baseline_status: string; message: string;
    return_read: { baseline: number; delta_percent: number; compared_tests: number; message: { is: string } };
    phase: { available: boolean };
  };
  assert.equal(cmj.baseline_status, "gap");
  assert.equal(cmj.baseline, null);
  assert.equal(cmj.delta_percent, null, "nothing downstream reads it as a fatigue drop");
  assert.equal(cmj.phase.available, false, "phase metrics use the same rule");
  assert.equal(cmj.return_read.baseline, 30);
  assert.equal(cmj.return_read.delta_percent, -20);
  assert.equal(cmj.return_read.compared_tests, 4);
  assert.match(cmj.message, /First jump test in 48 days: 24\.0 cm, 20\.0% below the last 4 tests/);
  assert.match(cmj.return_read.message.is, /Fyrsta hoppróf í 48 daga/);
});

test("e2e: tests every 2-3 weeks can flag, using only the last 5 from the past 90 days", async () => {
  const rows = [
    jump("F", "2026-08-27T10:00:00Z", 28),
    jump("E", "2026-08-07T10:00:00Z", 30),
    jump("D", "2026-07-18T10:00:00Z", 30),
    jump("C", "2026-06-29T10:00:00Z", 30),
    jump("OLD", "2026-05-01T10:00:00Z", 60), // past 90 days: must not move the baseline
  ];
  const snap = await buildValdDailySnapshot("team", "player", "2026-08-27", stubClient({ vald_forcedecks_results: rows }));
  assert.equal(snap.neuromuscularFlag, "yellow");
  assert.equal(((snap.explanation as Record<string, unknown>).cmj as { baseline: number }).baseline, 30);
});

test("e2e: an old strength gap is not today's state, says it needs a new test, and leaves the overall empty", async () => {
  const strength = { is_valid: true, left_peak_force_n: 300, right_peak_force_n: 400, test_timestamp: "2025-01-30T10:00:00Z" };
  const snap = await buildValdDailySnapshot("team", "player", "2026-11-06", stubClient({
    vald_forcedecks_results: [],
    vald_nordbord_results: [strength],
    vald_forceframe_results: [strength],
  }));
  assert.equal(snap.nordbordFreshnessStatus, "stale");
  assert.equal(snap.hamstringFlag, null);
  assert.equal(snap.groinFlag, null);
  assert.equal(snap.overallValdStatus, null);
  const expl = snap.explanation as { nordbord: { test_flag: string; retest_needed: boolean; test_age_days: number; message: string }; forceframe: { retest_needed: boolean; message: string } };
  assert.equal(expl.nordbord.test_flag, "red", "25% gap stays on record");
  assert.equal(expl.nordbord.retest_needed, true);
  assert.equal(expl.nordbord.test_age_days, 645);
  assert.match(expl.nordbord.message, /Last hamstring test 645 days ago: 25% left\/right gap\. Too old to read today, needs a new test\./);
  assert.equal(expl.forceframe.retest_needed, true);
  assert.match(expl.forceframe.message, /Last groin test 645 days ago/);
});

test("e2e: a fresh strength gap still flags", async () => {
  const strength = { is_valid: true, left_peak_force_n: 300, right_peak_force_n: 400, test_timestamp: "2026-11-01T10:00:00Z" };
  const snap = await buildValdDailySnapshot("team", "player", "2026-11-06", stubClient({ vald_nordbord_results: [strength] }));
  assert.equal(snap.hamstringFlag, "red");
  assert.equal(snap.overallValdStatus, "red");
  const expl = snap.explanation as { nordbord: { retest_needed: boolean } };
  assert.equal(expl.nordbord.retest_needed, false);
});
