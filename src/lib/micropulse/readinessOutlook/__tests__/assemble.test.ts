import { test } from "vitest";
import assert from "node:assert/strict";
import { buildOutlookInputs, mdOffsetForDate, parseMdOffset } from "../assemble";

test("parseMdOffset: MD/MD-n/MD+n and junk", () => {
  assert.equal(parseMdOffset("MD"), 0);
  assert.equal(parseMdOffset("MD-2"), -2);
  assert.equal(parseMdOffset("MD+1"), 1);
  assert.equal(parseMdOffset("md-4"), -4);
  assert.equal(parseMdOffset(null), null);
  assert.equal(parseMdOffset("rest"), null);
});

test("mdOffsetForDate: match day, lead-in, day-after, and far-out default", () => {
  const matches = ["2026-06-06", "2026-06-13"]; // two Saturdays
  assert.equal(mdOffsetForDate("2026-06-06", matches), 0);   // MD
  assert.equal(mdOffsetForDate("2026-06-11", matches), -2);  // MD-2 (before 13th)
  assert.equal(mdOffsetForDate("2026-06-07", matches), 1);   // MD+1 (day after 6th)
  assert.equal(mdOffsetForDate("2026-05-01", matches), -5);  // far from any match → default
});

test("buildOutlookInputs: sums same-day load, counts weeks, builds weekly loads", () => {
  const players = [{ id: "p1", full_name: "Alpha" }, { id: "p2", full_name: null }];
  const rpeRows = [
    { player_id: "p1", session_date: "2026-06-01", session_load: 300 },
    { player_id: "p1", session_date: "2026-06-01", session_load: 200 }, // same day → summed
    { player_id: "p1", session_date: "2026-06-09", session_load: 400 },
    { player_id: "p1", session_date: "bad", session_load: null },       // ignored
  ];
  const wellnessRows = [
    { player_id: "p1", entry_date: "2026-06-01", total_score: 18 },
    { player_id: "p1", entry_date: "2026-06-09", total_score: 12 },
    { player_id: "p2", entry_date: "2026-06-02", total_score: null },   // ignored
  ];
  const inputs = buildOutlookInputs({ players, rpeRows, wellnessRows, matchDates: ["2026-06-07"] });
  const p1 = inputs.find((i) => i.playerId === "p1")!;
  assert.equal(p1.playerName, "Alpha");
  assert.equal(p1.history.loadByDate.get("2026-06-01"), 500); // summed
  assert.equal(p1.history.wellnessByDate.get("2026-06-09"), 12);
  assert.equal(p1.weeksOfData, 2); // Jun-01 and Jun-09 are different weeks
  assert.ok(p1.weeklyLoads.length >= 1 && p1.weeklyLoads.every((v) => v > 0));
  // p2 has a null full_name → "Player", and no usable rows → empty history.
  const p2 = inputs.find((i) => i.playerId === "p2")!;
  assert.equal(p2.playerName, "Player");
  assert.equal(p2.weeksOfData, 0);
  assert.equal(p2.history.loadByDate.size, 0);
});
