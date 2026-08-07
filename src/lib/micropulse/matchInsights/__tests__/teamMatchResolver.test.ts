import { describe, it, expect } from "vitest";
import { buildResolvedFromSbRows } from "../teamMatchResolver";

describe("buildResolvedFromSbRows (StatsBomb per-match resolver)", () => {
  const rows = [
    { match_date: "2026-08-04", opponent: "Thor Akureyri", goals: 0, goals_against: 1, xg: 1.61, xg_against: 1.62, shots: 14, shots_against: 13, possession_proxy_pct: 60.8, crosses: 17, box_touches: 39, obv: 0.76, opposition_obv: 2.19, set_piece_xg: 1.1, opp_set_piece_xg: 0.92, pressures: 106, deep_progressions: 46, passes_into_box: 36, updated_at: "2026-08-05T00:00:00Z" },
    { match_date: "2026-07-27", opponent: "ÍBV", goals: 1, goals_against: 0, xg: 0.77, xg_against: 1.01, shots: 10, shots_against: 11, possession_proxy_pct: 50.4, crosses: 18, box_touches: 36, obv: 2.64, opposition_obv: 1.67, set_piece_xg: 0.08, opp_set_piece_xg: 0.41, pressures: 126, deep_progressions: 40, passes_into_box: 30, updated_at: "2026-07-28T00:00:00Z" },
  ];

  it("builds provider-agnostic maps + StatsBomb extras", () => {
    const r = buildResolvedFromSbRows(rows)!;
    expect(r.source).toBe("statsbomb");
    expect(r.own.get("2026-08-04")?.xg).toBe(1.61);
    expect(r.own.get("2026-08-04")?.possession_pct).toBe(60.8);     // proxy → possession
    expect(r.own.get("2026-08-04")?.touches_in_box).toBe(39);       // box_touches → touches_in_box
    expect(r.own.get("2026-08-04")?.ppda).toBeNull();               // StatsBomb per-match has no PPDA
    expect(r.xgAgainst.get("2026-08-04")).toBe(1.62);
    expect(r.oppGoals.get("2026-08-04")).toBe(1);
    expect(r.shotsAgainst.get("2026-08-04")).toBe(13);
    expect(r.extras.get("2026-08-04")?.obv).toBe(0.76);
    expect(r.extras.get("2026-08-04")?.setPieceXgAgainst).toBe(0.92);
    expect(r.lastImport).toBe("2026-08-05T00:00:00Z");
  });

  it("returns null when there are no StatsBomb rows (caller falls back to Wyscout)", () => {
    expect(buildResolvedFromSbRows([])).toBeNull();
  });
});
