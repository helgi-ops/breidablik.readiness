import { test } from "vitest";
import assert from "node:assert/strict";
import { computeReturnToTraining, injuryRiskProfile, QUALITY_ORDER, type RttSession } from "../returnToTraining";

function session(date: string, o: Partial<RttSession> = {}): RttSession {
  return { date, injured: false, isMatch: false, estimated: false, load: 480, distance: 6000, hsr: 900, sprint: 300, accel: 45, decel: 40, cod: 200, topSpeed: 30, ...o };
}

// A healthy training block + an injured rehab block (lower everything) + a big match.
function fixture(): RttSession[] {
  const healthy = ["2026-05-09", "2026-05-12", "2026-05-15", "2026-05-19", "2026-05-22", "2026-05-26", "2026-05-28"].map((d) =>
    session(d, { load: 480, distance: 6400, hsr: 950, sprint: 320, accel: 48, decel: 42, cod: 210, topSpeed: 31 }),
  );
  const match = session("2026-05-24", { isMatch: true, load: 620, distance: 11000, hsr: 1500, sprint: 480, accel: 70, decel: 65, cod: 300, topSpeed: 32 });
  const injured = ["2026-06-15", "2026-06-18", "2026-06-22"].map((d) =>
    session(d, { injured: true, load: 300, distance: 3500, hsr: 200, sprint: 0, accel: 10, decel: 8, cod: 0, topSpeed: 20 }),
  );
  return [...healthy, match, ...injured];
}

test("ceiling is built from healthy, non-match, real sessions only — not injured or match", () => {
  const r = computeReturnToTraining({ sessions: fixture(), refDate: "2026-07-04", currentlyInjured: false, rttStartDate: "2026-07-04" });
  assert.equal(r.baseline.builtFromHealthySessions, 7); // the 7 healthy training days
  // ~p85 of healthy distance (6400), NOT the injured 3500 nor the 11000 match.
  assert.ok(r.baseline.distance >= 6000 && r.baseline.distance <= 6600);
  assert.ok(r.baseline.topSpeed >= 30 && r.baseline.topSpeed <= 31.5);
});

test("currently injured with no return date → no plan (coach must start it)", () => {
  const r = computeReturnToTraining({ sessions: fixture(), refDate: "2026-07-04", currentlyInjured: true, rttStartDate: null });
  assert.equal(r.plan, null);
  assert.equal(r.currentlyInjured, true);
  assert.ok(r.baseline.builtFromHealthySessions > 0); // baseline still computed
});

test("volume unlocks first, IMA accel/decel then change-of-direction LAST", () => {
  const weeks = QUALITY_ORDER.length; // default: one quality per week
  const r = computeReturnToTraining({ sessions: fixture(), refDate: "2026-07-04", currentlyInjured: true, rttStartDate: "2026-07-04" });
  assert.ok(r.plan);
  const unlock = (q: string) => r.plan!.weeks.find((w) => w.quality === q)!.unlockWeek;
  assert.equal(unlock("volume"), 1);
  assert.equal(unlock("cod"), weeks); // change-of-direction is the very last quality
  // the IMA mechanical qualities come after sprint, COD after accel & decel
  assert.ok(unlock("accel") > unlock("sprint"));
  assert.ok(unlock("decel") >= unlock("accel"));
  assert.ok(unlock("cod") >= unlock("decel"));
  // order is non-decreasing across the clinical qualities
  const uw = QUALITY_ORDER.map(unlock);
  for (let i = 1; i < uw.length; i++) assert.ok(uw[i] >= uw[i - 1]);
});

test("no week exceeds ACWR ~1.3 on any quality", () => {
  const r = computeReturnToTraining({ sessions: fixture(), refDate: "2026-07-04", currentlyInjured: true, rttStartDate: "2026-07-04", weeks: 5 });
  for (const w of r.plan!.weeks) assert.ok(w.acwr <= 1.3, `week ${w.week} ${w.quality} acwr ${w.acwr}`);
});

test("targets never exceed the healthy ceiling and locked qualities hold", () => {
  const r = computeReturnToTraining({ sessions: fixture(), refDate: "2026-07-04", currentlyInjured: true, rttStartDate: "2026-07-04", weeks: 5 });
  for (const w of r.plan!.weeks) {
    if (r.baseline[w.quality] > 0) assert.ok(w.target <= r.baseline[w.quality] + 0.01);
    if (w.locked) assert.ok(w.why.toLowerCase().includes("unlocks"));
  }
});

test("injuryRiskProfile maps tissue → key re-injury qualities", () => {
  assert.deepEqual(new Set(injuryRiskProfile(["hamstring"]).riskQualities), new Set(["hsr", "sprint", "decel"]));
  const head = injuryRiskProfile(["Concussion"]);
  assert.equal(head.category, "head");
  assert.equal(head.riskQualities.length, 0); // symptom-limited, handled as a ceiling
  assert.ok(injuryRiskProfile(["ACL / knee"]).riskQualities.includes("cod"));
  assert.ok(injuryRiskProfile(["ankle sprain"]).riskQualities.includes("decel"));
});

test("the injury's risk qualities ramp slower and are flagged caution", () => {
  const s = fixture();
  const plain = computeReturnToTraining({ sessions: s, refDate: "2026-07-04", currentlyInjured: true, rttStartDate: "2026-07-04" });
  const risk = computeReturnToTraining({ sessions: s, refDate: "2026-07-04", currentlyInjured: true, rttStartDate: "2026-07-04", riskQualities: ["hsr"] });
  const hsrRisk = risk.plan!.weeks.filter((w) => w.quality === "hsr" && !w.locked);
  const hsrPlain = plain.plan!.weeks.filter((w) => w.quality === "hsr" && !w.locked);
  assert.ok(hsrRisk.every((w) => w.caution));
  assert.ok(hsrPlain.every((w) => !w.caution));
  // a risk quality's target never exceeds the same week's non-risk target
  for (let i = 0; i < hsrRisk.length; i++) assert.ok(hsrRisk[i].target <= hsrPlain[i].target + 0.01);
  // non-risk qualities are unaffected
  const volRisk = risk.plan!.weeks.find((w) => w.quality === "volume" && w.week === 3)!;
  const volPlain = plain.plan!.weeks.find((w) => w.quality === "volume" && w.week === 3)!;
  assert.equal(volRisk.target, volPlain.target);
});

test("every unlocked target carries a why-line with % of healthy baseline", () => {
  const r = computeReturnToTraining({ sessions: fixture(), refDate: "2026-07-04", currentlyInjured: true, rttStartDate: "2026-07-04" });
  const unlocked = r.plan!.weeks.filter((w) => !w.locked && w.target > 0);
  assert.ok(unlocked.length > 0);
  for (const w of unlocked) assert.ok(/of healthy baseline/.test(w.why));
});
