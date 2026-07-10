import { describe, it, expect } from "vitest";
import { oneRowPerDate, oneRowPerPlayerDate } from "../oneRowPerDate";

describe("oneRowPerDate", () => {
  it("prefers a manual row over catapult for the same date (Andri 2026-07-08)", () => {
    const rows = [
      { date: "2026-07-08", source: "catapult", total_distance: 1 }, // broken pod
      { date: "2026-07-08", source: "manual", total_distance: 2274 }, // coach correction
    ];
    const out = oneRowPerDate(rows);
    expect(out).toHaveLength(1);
    expect(out[0].total_distance).toBe(2274);
    expect(out[0].source).toBe("manual");
  });

  it("wins regardless of row order (manual first)", () => {
    const rows = [
      { date: "2026-07-08", source: "manual", total_distance: 2274 },
      { date: "2026-07-08", source: "catapult", total_distance: 1 },
    ];
    expect(oneRowPerDate(rows)[0].total_distance).toBe(2274);
  });

  it("counts a two-source date once and keeps other dates", () => {
    const rows = [
      { date: "2026-07-07", source: "catapult", total_distance: 3000 },
      { date: "2026-07-08", source: "catapult", total_distance: 1 },
      { date: "2026-07-08", source: "manual", total_distance: 2274 },
      { date: "2026-07-09", source: "catapult", total_distance: 2500 },
    ];
    const out = oneRowPerDate(rows);
    expect(out.map((r) => r.date)).toEqual(["2026-07-07", "2026-07-08", "2026-07-09"]);
    expect(out.map((r) => r.total_distance)).toEqual([3000, 2274, 2500]);
  });

  it("keeps a lone catapult row untouched", () => {
    const rows = [{ date: "2026-07-08", source: "catapult", total_distance: 3000 }];
    expect(oneRowPerDate(rows)).toEqual(rows);
  });

  it("returns rows sorted by date ascending", () => {
    const rows = [
      { date: "2026-07-09", source: "catapult", total_distance: 1 },
      { date: "2026-07-07", source: "catapult", total_distance: 2 },
      { date: "2026-07-08", source: "catapult", total_distance: 3 },
    ];
    expect(oneRowPerDate(rows).map((r) => r.date)).toEqual(["2026-07-07", "2026-07-08", "2026-07-09"]);
  });
});

describe("oneRowPerPlayerDate", () => {
  it("dedupes per player-date (manual wins) but never across players", () => {
    const rows = [
      { player_id: "A", date: "2026-07-08", source: "catapult", total_distance: 1 },
      { player_id: "A", date: "2026-07-08", source: "manual", total_distance: 2274 },
      { player_id: "B", date: "2026-07-08", source: "catapult", total_distance: 3000 },
    ];
    const out = oneRowPerPlayerDate(rows);
    expect(out).toHaveLength(2); // one per player for the shared date
    const a = out.find((r) => r.player_id === "A");
    const b = out.find((r) => r.player_id === "B");
    expect(a?.total_distance).toBe(2274);
    expect(b?.total_distance).toBe(3000);
  });
});
