import { test } from "vitest";
import assert from "node:assert/strict";
import { exposuresFromTlyp, shapeDirsFromShape, assembleTrainingNeeds } from "../index";

test("exposuresFromTlyp: maps under/gap metrics to axes; skips ok/none and axis-less metrics", () => {
  const exps = exposuresFromTlyp({
    hsr_dist: { flag: "under", pct: 42 },     // → hsr
    ima_decel: { flag: "gap", pct: 68 },       // → mech
    player_load: { flag: "ok", pct: 95 },      // ok → skipped
    top_speed: { flag: "none", pct: null },    // none → skipped
    pl_per_min: { flag: "under", pct: 40 },    // no axis (rate) → skipped
    unknown_metric: { flag: "under", pct: 10 },// no axis → skipped
  });
  assert.equal(exps.length, 2);
  assert.equal(exps.find((e) => e.key === "hsr_dist")!.axis, "hsr");
  assert.equal(exps.find((e) => e.key === "ima_decel")!.axis, "mech");
  assert.ok(!exps.some((e) => e.key === "pl_per_min" || e.key === "player_load" || e.key === "unknown_metric"));
});

test("shapeDirsFromShape: keeps the 12 known clock directions, drops unknowns", () => {
  const dirs = shapeDirsFromShape([{ dir: "3", delta: 0.06 }, { dir: "99", delta: 0.1 }, { dir: "12", delta: 0.04 }]);
  assert.equal(dirs.length, 2);
  assert.deepEqual(dirs.map((d) => d.dir).sort(), ["12", "3"]);
});

test("assembleTrainingNeeds: tolerates null inputs", () => {
  const n = assembleTrainingNeeds(null, null);
  assert.deepEqual(n, { exposures: [], shapeDirs: [] });
});
