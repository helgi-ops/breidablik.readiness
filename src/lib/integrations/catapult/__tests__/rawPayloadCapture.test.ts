import { test } from "vitest";
import assert from "node:assert/strict";
import {
  normalizeCatapultActivityStats,
  aggregateCatapultMetrics,
  toNormalizedExternalLoad,
} from "../normalize";

// A per-athlete activity record where max HR arrives under a MATCHED name but the
// average-HR param arrives under an UNMATCHED name — exactly the real situation
// (max HR populates, avg HR doesn't). The diagnostic must capture the unmatched
// name so the follow-up can add the alias, WITHOUT changing any field that maps.
function activity(over: Record<string, unknown> = {}) {
  return {
    stats: [
      {
        athlete_id: "cat-athlete-1",
        total_player_load: 412,
        "Heart Rate Max": 180, // matches MAX_HEART_RATE_KEYS
        "Player Heart Rate Average": 152, // NOT in AVG_HEART_RATE_KEYS → stays null
        "Heart Rate Zone 4 Duration": 300, // an HR-zone-ish name to surface
        ...over,
      },
    ],
  };
}

test("capture attaches rawParams + paramKeys without disturbing mapped fields", () => {
  const [metric] = normalizeCatapultActivityStats({ date: "2026-07-22", payload: activity(), activityId: "a1" });

  // Existing behaviour intact.
  assert.equal(metric.playerLoad, 412);
  assert.equal(metric.maxHeartRate, 180);
  assert.equal(metric.avgHeartRate ?? null, null, "unmatched avg-HR name must stay null, never fabricated/0");

  // Diagnostic captured.
  assert.ok(metric.rawParams && typeof metric.rawParams === "object", "rawParams attached");
  assert.ok(Array.isArray(metric.paramKeys), "paramKeys attached");
  assert.ok(metric.paramKeys!.includes("Player Heart Rate Average"), "the unmatched avg-HR name is visible in paramKeys");
  assert.ok(metric.paramKeys!.includes("Heart Rate Zone 4 Duration"));
});

test("toNormalizedExternalLoad carries rawPayload + paramKeys through to the row", () => {
  const [metric] = normalizeCatapultActivityStats({ date: "2026-07-22", payload: activity(), activityId: "a1" });
  const row = toNormalizedExternalLoad(metric, "player-1");
  assert.ok(row.rawPayload && typeof row.rawPayload === "object", "raw_payload_json source is populated");
  assert.ok(Array.isArray(row.paramKeys) && row.paramKeys.includes("Player Heart Rate Average"));
  // Mapped fields still flow.
  assert.equal(row.externalLoad.maxHeartRate, 180);
  assert.equal(row.externalLoad.avgHeartRate ?? null, null);
});

test("aggregate unions paramKeys across a day's activities (HR may live in only one)", () => {
  // Two activities for the same athlete+date: only the second carries the HR params.
  const warmup = normalizeCatapultActivityStats({
    date: "2026-07-22",
    activityId: "warmup",
    payload: { stats: [{ athlete_id: "cat-athlete-1", total_player_load: 40 }] },
  });
  const main = normalizeCatapultActivityStats({ date: "2026-07-22", activityId: "main", payload: activity() });
  const [agg] = aggregateCatapultMetrics([...warmup, ...main]);

  assert.ok(agg.paramKeys!.includes("Player Heart Rate Average"), "unioned keys include the HR name from the main activity");
  assert.equal(agg.maxHeartRate, 180);
});
