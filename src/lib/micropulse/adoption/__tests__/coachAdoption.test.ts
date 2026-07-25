import { test } from "vitest";
import assert from "node:assert/strict";
import {
  classifyAdoption,
  type AdoptionInput,
  MIN_HISTORY_DAYS,
  MATURE_HISTORY_DAYS,
  DORMANT_DAYS,
  COMPLIANCE_LOW,
} from "../coachAdoption";

// A healthy, well-used baseline. Individual tests override just the field under test.
function base(over: Partial<AdoptionInput> = {}): AdoptionInput {
  return {
    historyDays: 40,
    daysSinceLastLogin: 0,
    sessionsPerWeek: 5,
    distinctPathsOpened: 6,
    openedAnyIntelligence: true,
    weekSetupPresent: true,
    checkinComplianceNow: 0.85,
    checkinCompliancePrev: 0.85,
    outcomeTieIn: null,
    ...over,
  };
}

test("a coach with no usage in 6+ days gets the dormant nudge", () => {
  const v = classifyAdoption(base({ daysSinceLastLogin: DORMANT_DAYS }));
  assert.equal(v.tier, "dormant");
  assert.equal(v.topNudge?.key, "dormant");
  assert.equal(v.topNudge?.signal, "login_cadence");
  assert.match(v.topNudge!.why.en, /6 days/);
  assert.ok(v.topNudge!.why.is.trim().length > 0);
  assert.equal(v.topNudge?.nextStep.href, "/coach");
});

test("check-ins below the low threshold fire the compliance nudge", () => {
  const v = classifyAdoption(base({ checkinComplianceNow: 0.3, checkinCompliancePrev: 0.8 }));
  assert.equal(v.topNudge?.key, "compliance_drop");
  assert.equal(v.topNudge?.signal, "checkin_compliance");
  assert.match(v.topNudge!.why.en, /30%/);
  assert.match(v.topNudge!.why.en, /were 80%/);
  // Counterfactual is derived from the threshold, not invented.
  assert.match(v.topNudge!.counterfactual!.en, /70%/);
});

test("a large fall in check-ins fires even when the level is still above the floor", () => {
  // 0.8 → 0.55: above COMPLIANCE_LOW, but a >25pt drop is a real regression.
  assert.ok(0.55 >= COMPLIANCE_LOW);
  const v = classifyAdoption(base({ checkinComplianceNow: 0.55, checkinCompliancePrev: 0.8 }));
  assert.equal(v.topNudge?.key, "compliance_drop");
});

test("a brand-new coach with < 2 weeks history is insufficient / low confidence, not scolded", () => {
  const v = classifyAdoption(base({
    historyDays: MIN_HISTORY_DAYS - 1,
    daysSinceLastLogin: 10,        // would be dormant…
    checkinComplianceNow: 0.1,     // …and low compliance…
    weekSetupPresent: false,       // …and no week setup —
    openedAnyIntelligence: false,  // …but we do NOT scold in week 1.
  }));
  assert.equal(v.tier, "insufficient");
  assert.equal(v.confidence, "low");
  assert.equal(v.topNudge, null);
});

test("no week setup fires the week nudge when nothing worse is wrong", () => {
  const v = classifyAdoption(base({ weekSetupPresent: false }));
  assert.equal(v.topNudge?.key, "week_not_set");
  assert.equal(v.topNudge?.nextStep.href, "/coach/week-setup");
});

test("never opening a deeper surface fires the gentlest breadth nudge", () => {
  const v = classifyAdoption(base({ openedAnyIntelligence: false }));
  assert.equal(v.topNudge?.key, "unused_key_surface");
  assert.equal(v.topNudge?.severity, "info");
});

test("a well-used account is quiet — no nudge", () => {
  const v = classifyAdoption(base());
  assert.equal(v.tier, "strong");
  assert.equal(v.confidence, "high");
  assert.equal(v.topNudge, null);
});

test("worst-first: dormant beats a simultaneous compliance and week gap", () => {
  const v = classifyAdoption(base({
    daysSinceLastLogin: 8,
    checkinComplianceNow: 0.2,
    weekSetupPresent: false,
  }));
  assert.equal(v.topNudge?.key, "dormant");
});

test("worst-first: compliance beats a simultaneous week + breadth gap", () => {
  const v = classifyAdoption(base({
    checkinComplianceNow: 0.2,
    weekSetupPresent: false,
    openedAnyIntelligence: false,
  }));
  assert.equal(v.topNudge?.key, "compliance_drop");
});

test("the outcome tie-in is only attached when the data layer supplies a real one", () => {
  const withoutTie = classifyAdoption(base({ checkinComplianceNow: 0.3 }));
  assert.equal(withoutTie.topNudge?.outcomeTieIn, null);

  const tie = { en: "Clubs above 70% keep confidence high.", is: "Félög yfir 70% halda öryggi háu." };
  const withTie = classifyAdoption(base({ checkinComplianceNow: 0.3, outcomeTieIn: tie }));
  assert.deepEqual(withTie.topNudge?.outcomeTieIn, tie);
});

test("confidence is medium for young history and high once mature", () => {
  const young = classifyAdoption(base({ historyDays: MIN_HISTORY_DAYS, weekSetupPresent: false }));
  assert.equal(young.confidence, "medium");
  const mature = classifyAdoption(base({ historyDays: MATURE_HISTORY_DAYS, weekSetupPresent: false }));
  assert.equal(mature.confidence, "high");
});

test("low sessions/week with recent login still reads as dormant", () => {
  const v = classifyAdoption(base({ daysSinceLastLogin: 0, sessionsPerWeek: 0.5 }));
  assert.equal(v.tier, "dormant");
  // Not the dormant NUDGE (login is recent) — the tier reflects thin use, and the
  // next real gap (if any) surfaces instead.
  assert.notEqual(v.topNudge?.key, "dormant");
});
