import { describe, it, expect } from "vitest";
import { CATAPULT_DAILY_LOAD_SELECT, normalizeCatapultDailyLoadRow } from "@/lib/micropulse/externalLoad/baselines";

/**
 * CATAPULT_DAILY_LOAD_SELECT replaced `select("*")` on player_external_load_daily (the raw blob is ~45 KB/row).
 * If the normaliser starts reading a new column, this test fails until the column is added to the list —
 * otherwise that field would silently come back null on Today and in the decision route.
 */
function rowFromSelect(): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const part of CATAPULT_DAILY_LOAD_SELECT.split(",")) {
    const key = part.includes(":") ? part.split(":")[0] : part;
    row[key] = 1;
  }
  row.player_id = "p1";
  row.team_id = "t1";
  row.date = "2026-11-13";
  row.source = "catapult";
  row.movement_profile = { settled: 1, low: 1, mid: 1, high: 1 };
  return row;
}

describe("CATAPULT_DAILY_LOAD_SELECT", () => {
  it("never selects the raw blobs whole", () => {
    const parts = CATAPULT_DAILY_LOAD_SELECT.split(",");
    expect(parts).not.toContain("*");
    expect(parts).not.toContain("raw_payload_json");
    expect(parts).not.toContain("ima_fr_raw");
  });

  it("feeds every field the normaliser produces", () => {
    const out = normalizeCatapultDailyLoadRow(rowFromSelect());
    expect(out).not.toBeNull();
    const missing = Object.entries(out as Record<string, unknown>)
      .filter(([, v]) => v === null || v === undefined)
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it("reads movement_profile from the full blob too (callers still selecting *)", () => {
    const out = normalizeCatapultDailyLoadRow({
      player_id: "p1",
      date: "2026-11-13",
      raw_payload_json: { movement_profile: { settled: 4, low: 3, mid: 2, high: 1 } },
    });
    expect([out?.settledMin, out?.lowActiveMin, out?.midActiveMin, out?.highActiveMin]).toEqual([4, 3, 2, 1]);
  });
});
