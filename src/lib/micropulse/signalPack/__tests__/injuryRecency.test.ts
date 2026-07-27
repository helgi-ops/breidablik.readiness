import { test } from "vitest";
import assert from "node:assert/strict";
import { injuryRecencyContributor, INJURY_RECENCY_WINDOW } from "../injuryRecency";

test("no injury on record → no signal (never a fabricated 0 days)", () => {
  assert.equal(injuryRecencyContributor({ lastInjuryDate: null, lastReturnDate: null, today: "2026-07-27" }), null);
});

test("recently returned → flagged elevated context, no counterfactual, high confidence", () => {
  const c = injuryRecencyContributor({ lastInjuryDate: "2026-06-01", lastReturnDate: "2026-07-01", today: "2026-07-27", bodyPart: "hamstring" })!;
  assert.equal(c.flagged, true);         // 26 days ago ≤ 90
  assert.equal(c.counterfactual, null);  // context only
  assert.equal(c.confidence, "high");
  assert.match(c.why.en, /26 days ago/);
  assert.match(c.why.en, /hamstring/);
  assert.ok(c.severity > 0);
});

test("counts from the RETURN date when known", () => {
  const fromReturn = injuryRecencyContributor({ lastInjuryDate: "2026-01-01", lastReturnDate: "2026-07-20", today: "2026-07-27" })!;
  assert.match(fromReturn.why.en, /7 days ago/); // return, not injury
});

test("old injury beyond the window → not flagged, severity decayed", () => {
  const c = injuryRecencyContributor({ lastInjuryDate: "2026-01-01", lastReturnDate: null, today: "2026-07-27" })!;
  assert.equal(c.flagged, false); // ~207 days > 90
  assert.ok(c.severity >= 0 && c.severity < 0.1);
});

test("boundary: exactly the window edge still flags", () => {
  const edge = injuryRecencyContributor({ lastInjuryDate: "2026-01-01", lastReturnDate: null, today: "2026-04-01" })!;
  const days = 90; void days;
  // 2026-01-01 → 2026-04-01 is 90 days → flagged (≤ window).
  assert.equal(edge.flagged, true);
  assert.equal(INJURY_RECENCY_WINDOW, 90);
});
