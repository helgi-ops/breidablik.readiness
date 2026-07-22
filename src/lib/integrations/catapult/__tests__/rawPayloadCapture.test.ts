import { test } from "vitest";
import assert from "node:assert/strict";
import {
  normalizeCatapultActivityStats,
  aggregateCatapultMetrics,
  toNormalizedExternalLoad,
  extractHeartRateMetrics,
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

test("maps Catapult's REAL HR field names: mean_heart_rate, 8 bands, %HRmax, min", () => {
  const hr = extractHeartRateMetrics({
    mean_heart_rate: 152, // avg HR — the alias that was missing
    max_heart_rate: 181, // already worked
    min_heart_rate: 61,
    // 8 bands, total_duration in seconds → 1:1 into the _time_s columns
    heart_rate_band1_total_duration: 300,
    heart_rate_band2_total_duration: 250,
    heart_rate_band3_total_duration: 200,
    heart_rate_band4_total_duration: 150,
    heart_rate_band5_total_duration: 120,
    heart_rate_band6_total_duration: 90,
    heart_rate_band7_total_duration: 60,
    heart_rate_band8_total_duration: 30,
    percentage_max_heart_rate: 94,
    percentage_avg_heart_rate: 79,
  });
  assert.equal(hr.avgHeartRate, 152, "mean_heart_rate now maps to avg HR");
  assert.equal(hr.maxHeartRate, 181, "max HR unchanged");
  assert.equal(hr.minHeartRate, 61);
  assert.equal(hr.hrZone1TimeS, 300); // seconds, no conversion
  assert.equal(hr.hrZone5TimeS, 120);
  assert.equal(hr.hrZone8TimeS, 30, "band 8 preserved, not collapsed into 5");
  assert.equal(hr.pctMaxHeartRate, 94);
  assert.equal(hr.pctAvgHeartRate, 79);
});

test("missing HR fields stay null, never 0 (null-vs-zero)", () => {
  const hr = extractHeartRateMetrics({ max_heart_rate: 180 });
  assert.equal(hr.avgHeartRate, null);
  assert.equal(hr.hrZone3TimeS, null);
  assert.equal(hr.hrZone8TimeS, null);
  assert.equal(hr.pctMaxHeartRate, null);
  assert.equal(hr.maxHeartRate, 180);
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
