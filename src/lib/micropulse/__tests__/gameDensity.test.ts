import { test } from "vitest";
import assert from "node:assert/strict";
import {
  expectedWeekShape,
  flagWeekAnomaly,
  benchTopUpCandidates,
  CHRONIC_DRIFT_THRESHOLD,
  type Bi,
} from "../weekSetup/gameDensity";
import { WEEK_TYPES, gameCount } from "../weekSetup/weekType";

// A returned message must exist, and be genuinely translated, in both languages.
function assertBilingual(b: Bi | null | undefined, label: string) {
  assert.ok(b, `${label}: missing bilingual object`);
  assert.ok(b!.en && b!.en.trim().length > 0, `${label}: empty EN`);
  assert.ok(b!.is && b!.is.trim().length > 0, `${label}: empty IS`);
  assert.notEqual(b!.en, b!.is, `${label}: IS is a copy of EN`);
}

// ── gameCount ────────────────────────────────────────────────────────────────

test("gameCount maps each week type to its game count", () => {
  assert.equal(gameCount("NO_MATCH"), 0);
  assert.equal(gameCount("ONE_MATCH"), 1);
  assert.equal(gameCount("TWO_MATCHES"), 2);
  assert.equal(gameCount("THREE_MATCHES"), 3);
});

// ── expectedWeekShape ────────────────────────────────────────────────────────

test("football returns null for every week type — the MD-day model stays authoritative", () => {
  for (const wt of WEEK_TYPES) {
    assert.equal(expectedWeekShape("football", wt), null, `football ${wt} must be a no-op`);
  }
});

test("basketball returns a distinct, cited, bilingual shape for every week type", () => {
  const headlines = new Set<string>();
  for (const wt of WEEK_TYPES) {
    const shape = expectedWeekShape("basketball", wt);
    assert.ok(shape, `basketball ${wt} must return a shape`);
    assert.equal(shape!.weekType, wt);
    assertBilingual(shape!.headline, `${wt} headline`);
    assertBilingual(shape!.detail, `${wt} detail`);
    assert.ok(shape!.citation.length > 0, `${wt} citation missing`);
    headlines.add(shape!.headline.en);
  }
  assert.equal(headlines.size, WEEK_TYPES.length, "each week type needs its own headline");
});

test("the no-game week warns that internal/perceived load peaks (Salazar)", () => {
  const shape = expectedWeekShape("basketball", "NO_MATCH")!;
  assert.match(shape.detail.en, /internal|perceived/i);
  assert.match(shape.citation, /Salazar/);
});

test("the three-game week is framed as the heaviest and cites the tapering evidence", () => {
  const shape = expectedWeekShape("basketball", "THREE_MATCHES")!;
  assert.match(shape.headline.en, /heaviest|highest/i);
  assert.match(shape.detail.en, /third game/i);
  assert.match(shape.citation, /Power/);
});

test("the one-game week is cited as carrying more total load than two-game (Conte)", () => {
  const shape = expectedWeekShape("basketball", "ONE_MATCH")!;
  assert.match(shape.citation, /Conte/);
});

// ── flagWeekAnomaly: chronic drift ───────────────────────────────────────────

test("chronic drift flags above ~10% week-on-week but not at or below it", () => {
  const base = { sport: "basketball" as const, weekType: "ONE_MATCH" as const };
  const drift = (loads: number[]) =>
    flagWeekAnomaly({ ...base, weeklyLoads: loads }).flags.filter((f) => f.kind === "chronic_drift");

  assert.equal(drift([100, 109]).length, 0, "9% must not flag");
  assert.equal(drift([100, 110]).length, 0, "exactly 10% must not flag (not > threshold)");
  assert.equal(drift([100, 111]).length, 1, "11% must flag");
  // Downward drift is just as much a signal.
  const down = drift([100, 85]);
  assert.equal(down.length, 1, "−15% must flag");
  assert.ok(down[0].driftPct! < 0);
  assertBilingual(down[0].headline, "chronic_drift headline");
  assert.match(down[0].citation, /Paulauskas/);
});

test("chronic drift threshold constant is 10%", () => {
  assert.equal(CHRONIC_DRIFT_THRESHOLD, 0.1);
});

test("flagWeekAnomaly is a no-op for football and for thin inputs", () => {
  assert.deepEqual(
    flagWeekAnomaly({ sport: "football", weekType: "TWO_MATCHES", weeklyLoads: [100, 200] }).flags,
    [],
    "football must never flag",
  );
  assert.deepEqual(
    flagWeekAnomaly({ sport: "basketball", weekType: "ONE_MATCH", weeklyLoads: [] }).flags,
    [],
    "empty series must not flag",
  );
  assert.deepEqual(
    flagWeekAnomaly({ sport: "basketball", weekType: "ONE_MATCH", weeklyLoads: [120] }).flags,
    [],
    "single week can't drift",
  );
});

test("a three-game week below the team's own average is flagged as a shape mismatch", () => {
  // priors mean = 100; current three-game week only 70 → below usual → flag.
  const res = flagWeekAnomaly({
    sport: "basketball",
    weekType: "THREE_MATCHES",
    weeklyLoads: [100, 100, 100, 70],
  });
  const shape = res.flags.filter((f) => f.kind === "shape_mismatch");
  assert.equal(shape.length, 1);
  assertBilingual(shape[0].headline, "shape_mismatch headline");
  // A three-game week at/above the usual average is NOT a mismatch.
  const ok = flagWeekAnomaly({
    sport: "basketball",
    weekType: "THREE_MATCHES",
    weeklyLoads: [100, 100, 100, 140],
  });
  assert.equal(ok.flags.filter((f) => f.kind === "shape_mismatch").length, 0);
});

// ── benchTopUpCandidates ─────────────────────────────────────────────────────

test("bench top-up finds the under-loaded players in a two-game week (Conte)", () => {
  const res = benchTopUpCandidates({
    weekType: "TWO_MATCHES",
    minutesByPlayer: [
      { playerId: "a", minutes: 34 },
      { playerId: "b", minutes: 30 },
      { playerId: "c", minutes: 28 },
      { playerId: "d", minutes: 4 },
      { playerId: "e", minutes: 2 },
    ],
  });
  // median = 28, cutoff = 14; d (4) and e (2) are under it, sorted ascending.
  assert.deepEqual(res.candidates.map((c) => c.playerId), ["e", "d"]);
  assertBilingual(res.reason, "bench reason");
  assert.match(res.citation, /Conte/);
});

test("bench top-up is a no-op outside two-game weeks and for thin squads", () => {
  const mins = [
    { playerId: "a", minutes: 30 },
    { playerId: "b", minutes: 2 },
  ];
  for (const wt of ["NO_MATCH", "ONE_MATCH", "THREE_MATCHES"] as const) {
    const r = benchTopUpCandidates({ weekType: wt, minutesByPlayer: mins });
    assert.deepEqual(r.candidates, [], `${wt} must not produce candidates`);
    assert.equal(r.reason, null);
  }
  // Empty and single-player squads can't establish a squad norm.
  assert.deepEqual(benchTopUpCandidates({ weekType: "TWO_MATCHES", minutesByPlayer: [] }).candidates, []);
  assert.deepEqual(
    benchTopUpCandidates({ weekType: "TWO_MATCHES", minutesByPlayer: [{ playerId: "a", minutes: 5 }] }).candidates,
    [],
  );
});

test("bench top-up returns no candidates when minutes are evenly shared", () => {
  const res = benchTopUpCandidates({
    weekType: "TWO_MATCHES",
    minutesByPlayer: [
      { playerId: "a", minutes: 20 },
      { playerId: "b", minutes: 22 },
      { playerId: "c", minutes: 18 },
    ],
  });
  assert.deepEqual(res.candidates, []);
  assert.equal(res.reason, null);
});
