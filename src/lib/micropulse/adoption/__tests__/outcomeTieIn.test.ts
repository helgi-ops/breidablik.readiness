import { test } from "vitest";
import assert from "node:assert/strict";
import {
  computeCohortTieIn,
  type CohortTieInInput,
  TIE_IN_MIN_GROUP,
  TIE_IN_MIN_GAP,
} from "../outcomeTieIn";

function base(over: Partial<CohortTieInInput> = {}): CohortTieInInput {
  return {
    activeTeams: 6,
    inactiveTeams: 4,
    activeMeanCompliance: 0.82,
    inactiveMeanCompliance: 0.55,
    ...over,
  };
}

test("states the tie-in when both groups are big enough and clearly differ", () => {
  const tie = computeCohortTieIn(base());
  assert.ok(tie);
  assert.match(tie!.en, /Across 10 clubs/);
  assert.match(tie!.en, /82%/);
  assert.match(tie!.en, /55%/);
  assert.ok(tie!.is.trim().length > 0);
  assert.notEqual(tie!.en, tie!.is);
});

test("omits it when either group is below the minimum sample", () => {
  assert.equal(computeCohortTieIn(base({ activeTeams: TIE_IN_MIN_GROUP - 1 })), null);
  assert.equal(computeCohortTieIn(base({ inactiveTeams: TIE_IN_MIN_GROUP - 1 })), null);
});

test("omits it when the two groups barely differ (no honest signal)", () => {
  // A 5-point gap is below the 10-point floor → not worth stating.
  assert.equal(computeCohortTieIn(base({ activeMeanCompliance: 0.6, inactiveMeanCompliance: 0.55 })), null);
});

test("omits it when the active group is not higher (never spin a negative into a claim)", () => {
  assert.equal(computeCohortTieIn(base({ activeMeanCompliance: 0.5, inactiveMeanCompliance: 0.8 })), null);
});

test("a gap exactly at the floor is stated", () => {
  const tie = computeCohortTieIn(base({ activeMeanCompliance: 0.7, inactiveMeanCompliance: 0.7 - TIE_IN_MIN_GAP }));
  assert.ok(tie);
});
