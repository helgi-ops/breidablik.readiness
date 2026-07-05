import { test } from "vitest";
import assert from "node:assert/strict";
import { buildEstimateRow, type LoadRowLike } from "../estimatePod";

const META = { teamId: "T", playerId: "P", matchDate: "2026-05-01", coachUserId: "C" };

test("90 min ≈ personal match average; peaks as-is", () => {
  const personalRows: LoadRowLike[] = [{ total_distance: 9000, sprint_distance: 300, max_velocity: 31, ima_accel: 40, jumps: 5 }];
  const { row, baselineUsed } = buildEstimateRow({ ...META, personalRows, squadRows: [], minutes: 90 });
  assert.equal(row.total_distance, 9000);
  assert.equal(row.sprint_distance, 300);
  assert.equal(row.ima_accel, 40);
  assert.equal(row.jumps, 5);
  assert.equal(row.max_velocity, 31); // peak, not scaled
  assert.equal(baselineUsed, "personal");
});

test("half the minutes → half the cumulative, same peaks", () => {
  const personalRows: LoadRowLike[] = [{ total_distance: 9000, sprint_distance: 300, max_velocity: 31, ima_accel: 41 }];
  const { row } = buildEstimateRow({ ...META, personalRows, squadRows: [], minutes: 45 });
  assert.equal(row.total_distance, 4500);
  assert.equal(row.sprint_distance, 150);
  assert.equal(row.ima_accel, 21); // round(41*0.5)=round(20.5)=21 (0 dp)
  assert.equal(row.max_velocity, 31); // peak unchanged by minutes
});

test("averages multiple personal match rows before scaling", () => {
  const personalRows: LoadRowLike[] = [
    { total_distance: 8000, max_velocity: 30 },
    { total_distance: 10000, max_velocity: 32 },
  ];
  const { row } = buildEstimateRow({ ...META, personalRows, squadRows: [], minutes: 90 });
  assert.equal(row.total_distance, 9000); // avg(8000,10000)
  assert.equal(row.max_velocity, 31); // avg(30,32)
});

test("falls back to squad average per column when personal is missing", () => {
  const personalRows: LoadRowLike[] = [{ total_distance: 9000 }]; // no sprint / speed
  const squadRows: LoadRowLike[] = [{ sprint_distance: 260, max_velocity: 29 }, { sprint_distance: 300, max_velocity: 31 }];
  const { row, baselineUsed } = buildEstimateRow({ ...META, personalRows, squadRows, minutes: 90 });
  assert.equal(row.total_distance, 9000); // personal
  assert.equal(row.sprint_distance, 280); // squad avg
  assert.equal(row.max_velocity, 30); // squad avg peak, as-is
  assert.equal(baselineUsed, "mixed");
});

test("marks the row as an estimate with provenance + minutes", () => {
  const { row } = buildEstimateRow({ ...META, personalRows: [{ total_distance: 9000 }], squadRows: [], minutes: 60 });
  assert.equal(row.source, "catapult");
  assert.equal(row.session_duration_minutes, 60);
  const meta = row.raw_payload_json as Record<string, unknown>;
  assert.equal(meta.estimated, true);
  assert.equal(meta.minutes, 60);
  assert.equal(meta.entered_by, "C");
  assert.equal(meta.method, "personal_match_avg_pro_rated_by_minutes");
});

test("no history and no squad → only metadata, no fabricated metrics", () => {
  const { row, baselineUsed } = buildEstimateRow({ ...META, personalRows: [], squadRows: [], minutes: 90 });
  assert.equal(baselineUsed, "none");
  assert.equal(row.total_distance, undefined);
  assert.equal(row.max_velocity, undefined);
  assert.equal(row.source, "catapult"); // still a valid (empty) marked row
});
