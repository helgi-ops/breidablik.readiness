import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayerWearableRecovery } from "../wearableRecoveryLoad";

/** Fake Supabase query builder returning a fixed wearable_daily_data result. */
function fakeSb(rows: Array<Record<string, unknown>>) {
  const tables: string[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte"]) builder[m] = () => builder;
  builder.order = async () => ({ data: rows, error: null });
  const sb = { from(t: string) { tables.push(t); return builder; } } as unknown as SupabaseClient;
  return { sb, tables };
}

const daily = (date: string, hrv: number | null, rhr: number | null, rec: number | null, extra: Record<string, unknown> = {}) => ({
  measurement_date: date, provider: "whoop", hrv_rmssd_ms: hrv, resting_hr_bpm: rhr, provider_recovery_score: rec,
  stress_avg: null, body_battery: null, ...extra,
});

describe("loadPlayerWearableRecovery", () => {
  it("returns null when the player has no wearable rows (card self-hides)", async () => {
    const { sb } = fakeSb([]);
    expect(await loadPlayerWearableRecovery(sb, "p1", "2026-10-08")).toBeNull();
  });

  it("returns the cited contributor + latest actual reading (today's numbers)", async () => {
    const { sb, tables } = fakeSb([
      daily("2026-10-06", 60, 50, 70),
      daily("2026-10-07", 62, 49, 72),
      daily("2026-10-08", 41, 57, 58, { stress_avg: 44, body_battery: 71 }), // latest
    ]);
    const out = (await loadPlayerWearableRecovery(sb, "p1", "2026-10-08", "player"))!;
    expect(tables).toEqual(["wearable_daily_data"]); // reads only the wearable table
    expect(out.contributor.key).toBe("wearable_recovery");
    // latest = the most recent actual reading, not the rolling mean
    expect(out.latest.date).toBe("2026-10-08");
    expect(out.latest.hrvMs).toBe(41);
    expect(out.latest.restingHr).toBe(57);
    expect(out.latest.recovery).toBe(58);
    expect(out.latest.provider).toBe("whoop");
    expect(out.latest.stress).toBe(44);
    expect(out.latest.bodyBattery).toBe(71);
    // input carries the baselines the card uses for vs-norm arrows
    expect(out.input.hrv.baselineMean).toBeCloseTo((60 + 62 + 41) / 3, 5);
  });

  it("carries forward the latest non-null reading when the newest row misses a metric", async () => {
    const { sb } = fakeSb([
      daily("2026-10-07", 62, 49, 72),
      daily("2026-10-08", null, 57, null), // HRV/recovery missing on the latest row
    ]);
    const out = (await loadPlayerWearableRecovery(sb, "p1", "2026-10-08"))!;
    expect(out.latest.restingHr).toBe(57); // from the newest row
    expect(out.latest.hrvMs).toBe(62);     // carried from the prior day
    expect(out.latest.recovery).toBe(72);
  });
});
