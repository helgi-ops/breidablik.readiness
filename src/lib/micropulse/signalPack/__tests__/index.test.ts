import { test } from "vitest";
import assert from "node:assert/strict";
import { computeSignalPack, type SignalPackInput } from "../index";

function base(): SignalPackInput {
  const flat28 = new Array(35).fill(200);
  return {
    today: "2026-07-27",
    load: { daily: flat28, coverageDays: 30 },
    decel: { daily: new Array(35).fill(20), coverageDays: 30 },
    hsr: { daily: new Array(35).fill(400), coverageDays: 30 },
    weekLoads: [0, 600, 100, 500, 0, 400],
    monotonyNorm: 1.2, monotonyCoverageDays: 25,
    injury: { lastInjuryDate: null, lastReturnDate: null },
    sleep: { recent: 4, baselineMean: 4, baselineSd: 0.5, coverageDays: 20 },
    cmjJump: { latest: 38, baselineMean: 38, baselineSd: 2, testCount: 8 },
    cmjAsym: { asymPct: 5, testCount: 3 },
  };
}

test("all-normal player: contributors present but none flagged", () => {
  const p = computeSignalPack(base());
  assert.ok(p.contributors.length >= 5, `expected several contributors, got ${p.contributors.length}`);
  assert.equal(p.flaggedCount, 0);
  assert.ok(p.contributors.every((c) => !c.flagged));
});

test("flagged contributors rank first, then by severity", () => {
  const inp = base();
  // Spike decel load hard, drop sleep, add a recent injury.
  inp.decel = { daily: [...new Array(28).fill(15), 60, 60, 60, 60, 60, 60, 60], coverageDays: 30 };
  inp.sleep = { recent: 2.5, baselineMean: 4, baselineSd: 0.5, coverageDays: 20 };
  inp.injury = { lastInjuryDate: "2026-06-10", lastReturnDate: "2026-07-05" };
  const p = computeSignalPack(inp);
  assert.ok(p.flaggedCount >= 3, `expected ≥3 flags, got ${p.flaggedCount}`);
  // Every flagged contributor sorts before every unflagged one.
  const firstUnflagged = p.contributors.findIndex((c) => !c.flagged);
  const lastFlagged = p.contributors.map((c) => c.flagged).lastIndexOf(true);
  assert.ok(firstUnflagged === -1 || lastFlagged < firstUnflagged, "flagged must precede unflagged");
  // Within the flagged block, severity is non-increasing.
  const flagged = p.contributors.filter((c) => c.flagged);
  for (let i = 1; i < flagged.length; i++) assert.ok(flagged[i - 1].severity >= flagged[i].severity);
  // The decel spike must be one of them, with a counterfactual + citation.
  const decel = p.contributors.find((c) => c.key === "decel_acwr")!;
  assert.equal(decel.flagged, true);
  assert.ok(decel.counterfactual && /Saberisani/.test(decel.citation));
});

test("player voice is second-person; coach voice is third-person (same flags)", () => {
  const inp = base();
  inp.decel = { daily: [...new Array(28).fill(15), 60, 60, 60, 60, 60, 60, 60], coverageDays: 30 };
  inp.sleep = { recent: 2.5, baselineMean: 4, baselineSd: 0.5, coverageDays: 20 };
  inp.injury = { lastInjuryDate: "2026-06-10", lastReturnDate: "2026-07-05" };

  const coach = computeSignalPack({ ...inp });
  const player = computeSignalPack({ ...inp, voice: "player" });

  // Same signals flag regardless of voice — voice only changes the words.
  assert.equal(player.flaggedCount, coach.flaggedCount);
  assert.deepEqual(player.contributors.map((c) => c.key), coach.contributors.map((c) => c.key));

  const cSleep = coach.contributors.find((c) => c.key === "sleep")!;
  const pSleep = player.contributors.find((c) => c.key === "sleep")!;
  assert.ok(/His sleep/.test(cSleep.why.en), `coach EN: ${cSleep.why.en}`);
  assert.ok(/Your sleep/.test(pSleep.why.en), `player EN: ${pSleep.why.en}`);
  assert.ok(/þinn/.test(pSleep.why.is), `player IS should use 2nd-person possessive: ${pSleep.why.is}`);
  assert.ok(!/ hans /.test(pSleep.why.is), `player IS must not use 3rd-person "hans": ${pSleep.why.is}`);

  // Decel spike counterfactual is second-person in player voice.
  const pDecel = player.contributors.find((c) => c.key === "decel_acwr")!;
  assert.ok(pDecel.counterfactual && /Your deceleration load/.test(pDecel.counterfactual.en));
});

test("no-data inputs produce no contributor (never a fabricated zero)", () => {
  const inp = base();
  inp.decel = { daily: [], coverageDays: 0 };      // no GPS → no decel signal
  inp.cmjJump = { latest: null, baselineMean: null, baselineSd: null, testCount: 0 }; // no CMJ
  inp.injury = { lastInjuryDate: null, lastReturnDate: null };                        // no history
  const p = computeSignalPack(inp);
  assert.ok(!p.contributors.some((c) => c.key === "decel_acwr"));
  assert.ok(!p.contributors.some((c) => c.key === "cmj_jump"));
  assert.ok(!p.contributors.some((c) => c.key === "injury_recency"));
});
