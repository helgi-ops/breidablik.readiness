import { test } from "vitest";
import assert from "node:assert/strict";
import { weekConfirmLabel, weekConfirmShort, weekConfirmState, weekConfirmStatuses } from "../confirmation";

test("weekConfirmState: confirmed, changed after it, never confirmed", () => {
  assert.equal(weekConfirmState(null, ["2026-11-24T10:00:00Z"]), "unconfirmed");
  assert.equal(weekConfirmState("2026-11-24T12:00:00Z", ["2026-11-24T10:00:00Z", null]), "confirmed");
  assert.equal(weekConfirmState("2026-11-24T12:00:00Z", ["2026-11-24T12:30:00Z"]), "changed");
});

test("weekConfirmStatuses: days and the week setup both count, per week", () => {
  const out = weekConfirmStatuses({
    setups: [{ week_start: "2026-11-23", confirmed_at: "2026-11-24T12:00:00Z" }, { week_start: "2026-11-30", confirmed_at: "2026-11-24T12:00:00Z" }],
    plans: [{ day_date: "2026-11-25", updated_at: "2026-11-24T11:00:00Z" }, { day_date: "2026-12-03", updated_at: "2026-11-25T08:00:00Z" }],
    coachSetups: [{ week_start_date: "2026-11-23", updated_at: "2026-11-24T11:59:00Z" }],
  });
  assert.deepEqual(out.map((s) => [s.weekStart, s.state]), [["2026-11-23", "confirmed"], ["2026-11-30", "changed"]]);
  const viaSetup = weekConfirmStatuses({ setups: [{ week_start: "2026-11-23", confirmed_at: "2026-11-24T12:00:00Z" }], plans: [], coachSetups: [{ week_start_date: "2026-11-23", updated_at: "2026-11-24T13:00:00Z" }] });
  assert.equal(viaSetup[0].state, "changed");
});

test("weekConfirmLabel: the words on the badge", () => {
  assert.equal(weekConfirmLabel(null, true), "Óstaðfest");
  assert.equal(weekConfirmLabel(null, false), "Not confirmed");
  assert.equal(weekConfirmLabel({ state: "changed", confirmedAt: "2026-11-24T12:00:00Z" }, true), "Breytt frá staðfestingu");
  assert.equal(weekConfirmLabel({ state: "confirmed", confirmedAt: "2026-11-24T12:00:00" }, true), "Staðfest · 24. nóv");
  assert.equal(weekConfirmLabel({ state: "confirmed", confirmedAt: "2026-11-24T12:00:00" }, false), "Confirmed · 24 Nov");
});

test("weekConfirmShort: one word for the week strip", () => {
  assert.equal(weekConfirmShort(null, true), "Óstaðfest");
  assert.equal(weekConfirmShort({ state: "confirmed" }, true), "✓ Staðfest");
  assert.equal(weekConfirmShort({ state: "changed" }, false), "Changed");
});
