import { test } from "vitest";
import assert from "node:assert/strict";
import { boundRawPayload, RAW_PAYLOAD_MAX_BYTES } from "../rawPayloadCapture";

test("small payload is kept whole", () => {
  const small = { athlete_id: "a1", mean_heart_rate: 152, total_player_load: 400 };
  assert.deepEqual(boundRawPayload(small), small);
});

test("large payload → HR-focused slice WITH VALUES + activity context + key list", () => {
  // Bloat it past the cap with a big non-HR object, plus real HR + context scalars.
  const bloat: Record<string, unknown> = {};
  for (let i = 0; i < 4000; i++) bloat[`filler_metric_${i}`] = i;
  const raw = {
    ...bloat,
    activity_name: "Æfing 22. júlí",
    period_name: "SSG 6v6",
    activity_count: 1,
    athlete_id: "a1",
    mean_heart_rate: 152,
    max_heart_rate: 181,
    min_heart_rate: 61,
    heart_rate_band1_total_duration: 300,
    heart_rate_band8_total_duration: 30,
    percentage_max_heart_rate: 94,
    athlete_max_hr: 195,
    total_player_load: 412, // non-HR scalar → dropped from the slice, present in keys
  };

  const out = boundRawPayload(raw) as Record<string, unknown>;
  assert.equal(out._truncated, true);
  assert.ok((out._bytes as number) > RAW_PAYLOAD_MAX_BYTES);

  const hr = out.hr as Record<string, unknown>;
  // HR VALUES are readable straight from the row — the whole point.
  assert.equal(hr.mean_heart_rate, 152);
  assert.equal(hr.heart_rate_band1_total_duration, 300);
  assert.equal(hr.heart_rate_band8_total_duration, 30);
  assert.equal(hr.percentage_max_heart_rate, 94);
  assert.equal(hr.athlete_max_hr, 195);
  // "threshold"-style false positives must NOT leak in as HR.
  assert.ok(!("total_player_load" in hr));

  // Session context so belt data ties to an activity.
  const ctx = out.context as Record<string, unknown>;
  assert.equal(ctx.activity_name, "Æfing 22. júlí");
  assert.equal(ctx.period_name, "SSG 6v6");

  // Full key list still present for any future name diagnostic.
  const keys = out.keys as string[];
  assert.ok(keys.includes("total_player_load"));
  assert.ok(keys.includes("mean_heart_rate"));
});

test("null → null; the slice never invents values", () => {
  assert.equal(boundRawPayload(null), null);
  assert.equal(boundRawPayload(undefined), null);
});
