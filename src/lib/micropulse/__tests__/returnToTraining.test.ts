import { test } from "vitest";
import assert from "node:assert/strict";
import { computeReturnToTraining, injuryRiskProfile, QUALITY_ORDER, type RttSession } from "../returnToTraining";

function session(date: string, o: Partial<RttSession> = {}): RttSession {
  return { date, injured: false, isMatch: false, estimated: false, load: 480, distance: 6000, hsr: 900, sprint: 300, accel: 45, decel: 40, decelHigh: 15, cod: 210, codLeft: 110, codRight: 100, topSpeed: 30, ...o };
}

// A healthy training block (several weeks, a match included) + an injured rehab block.
function fixture(): RttSession[] {
  const healthy = ["2026-05-04", "2026-05-06", "2026-05-11", "2026-05-13", "2026-05-18", "2026-05-20", "2026-05-25", "2026-05-27"].map((d) =>
    session(d, { load: 480, distance: 6400, hsr: 950, sprint: 320, accel: 48, decel: 42, decelHigh: 16, cod: 210, codLeft: 112, codRight: 98, topSpeed: 31 }),
  );
  const match = session("2026-05-16", { isMatch: true, load: 620, distance: 11000, hsr: 1500, sprint: 480, accel: 70, decel: 65, decelHigh: 28, cod: 300, codLeft: 155, codRight: 145, topSpeed: 32 });
  const injured = ["2026-06-15", "2026-06-17", "2026-06-22", "2026-06-24"].map((d) =>
    session(d, { injured: true, load: 300, distance: 3500, hsr: 200, sprint: 0, accel: 10, decel: 8, decelHigh: 1, cod: 0, codLeft: 0, codRight: 0, topSpeed: 20 }),
  );
  return [...healthy, match, ...injured];
}

const START = { refDate: "2026-07-04", currentlyInjured: true, rttStartDate: "2026-07-04" };

test("ceiling is a HEALTHY WEEKLY load (matches included), not a single session or injured time", () => {
  const r = computeReturnToTraining({ sessions: fixture(), ...START });
  assert.ok(r.baseline.builtFromHealthyWeeks >= 3);
  assert.equal(r.unit, "week");
  // weekly distance ceiling > a single healthy session (it sums a week, match included)
  assert.ok(r.baseline.distance > 6400, `weekly distance ceiling ${r.baseline.distance}`);
  assert.ok(r.baseline.topSpeed >= 30 && r.baseline.topSpeed <= 32);
});

test("currently injured with no return date → no plan (coach must start it)", () => {
  const r = computeReturnToTraining({ sessions: fixture(), refDate: "2026-07-04", currentlyInjured: true, rttStartDate: null });
  assert.equal(r.plan, null);
  assert.equal(r.currentlyInjured, true);
  assert.ok(r.baseline.builtFromHealthyWeeks > 0);
});

test("volume unlocks first, high-intensity braking then change-of-direction LAST", () => {
  const weeks = QUALITY_ORDER.length;
  const r = computeReturnToTraining({ sessions: fixture(), ...START });
  assert.ok(r.plan);
  const unlock = (q: string) => r.plan!.weeks.find((w) => w.quality === q)!.unlockWeek;
  assert.equal(unlock("volume"), 1);
  assert.equal(unlock("cod"), weeks); // change-of-direction is the very last quality
  assert.ok(unlock("decelHigh") >= unlock("decel"));
  assert.ok(unlock("cod") >= unlock("decelHigh"));
  const uw = QUALITY_ORDER.map(unlock);
  for (let i = 1; i < uw.length; i++) assert.ok(uw[i] >= uw[i - 1]);
});

test("no week exceeds ACWR ~1.3 on any quality", () => {
  const r = computeReturnToTraining({ sessions: fixture(), ...START });
  for (const w of r.plan!.weeks) assert.ok(w.acwr <= 1.3, `week ${w.week} ${w.quality} acwr ${w.acwr}`);
});

test("targets never exceed the healthy ceiling and locked qualities hold", () => {
  const r = computeReturnToTraining({ sessions: fixture(), ...START });
  for (const w of r.plan!.weeks) {
    if (r.baseline[w.quality] > 0) assert.ok(w.target <= r.baseline[w.quality] + 0.01);
    if (w.locked) assert.ok(w.why.toLowerCase().includes("unlocks"));
  }
});

test("injuryRiskProfile maps tissue → key re-injury qualities (incl. high-intensity braking)", () => {
  assert.deepEqual(new Set(injuryRiskProfile(["hamstring"]).riskQualities), new Set(["hsr", "sprint", "decel", "decelHigh"]));
  const head = injuryRiskProfile(["Concussion"]);
  assert.equal(head.category, "head");
  assert.equal(head.riskQualities.length, 0);
  assert.ok(injuryRiskProfile(["ACL / knee"]).riskQualities.includes("decelHigh"));
  assert.ok(injuryRiskProfile(["ankle sprain"]).riskQualities.includes("cod"));
});

test("the injury's risk qualities ramp slower and are flagged caution", () => {
  const s = fixture();
  const plain = computeReturnToTraining({ sessions: s, ...START });
  const risk = computeReturnToTraining({ sessions: s, ...START, riskQualities: ["hsr"] });
  const hsrRisk = risk.plan!.weeks.filter((w) => w.quality === "hsr" && !w.locked);
  const hsrPlain = plain.plan!.weeks.filter((w) => w.quality === "hsr" && !w.locked);
  assert.ok(hsrRisk.every((w) => w.caution));
  assert.ok(hsrPlain.every((w) => !w.caution));
  for (let i = 0; i < hsrRisk.length; i++) assert.ok(hsrRisk[i].target <= hsrPlain[i].target + 0.01);
});

test("left/right change-of-direction asymmetry is reported (monitored, not ramped)", () => {
  const r = computeReturnToTraining({ sessions: fixture(), ...START });
  assert.ok(r.asymmetry.healthyLeftPct != null);
  assert.ok((r.asymmetry.healthyLeftPct ?? 0) >= 50 && (r.asymmetry.healthyLeftPct ?? 0) <= 55); // ~53% left in the fixture
  // asymmetry is NOT a plan quality
  assert.ok(!r.plan!.weeks.some((w) => (w.quality as string) === "asymmetry"));
});

test("every unlocked target carries a why-line with % of healthy weekly baseline", () => {
  const r = computeReturnToTraining({ sessions: fixture(), ...START });
  const unlocked = r.plan!.weeks.filter((w) => !w.locked && w.target > 0);
  assert.ok(unlocked.length > 0);
  for (const w of unlocked) assert.ok(/of healthy weekly baseline/.test(w.why));
});
