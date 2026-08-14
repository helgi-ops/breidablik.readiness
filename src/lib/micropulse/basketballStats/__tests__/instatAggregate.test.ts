import { describe, it, expect } from "vitest";
import { avgFactors, aggregateAdvancedShots, zonesFromAdvanced, playerZonesFromRows, hasZones } from "../instatAggregate";

describe("instatAggregate", () => {
  it("avgFactors averages metric-wise, skipping nulls", () => {
    const f = avgFactors([{ efg_pct: 56, to_pct: 14, ppp: 1.0 }, { efg_pct: 60, to_pct: null, ppp: 1.1 }]);
    expect(f.efgPct).toBe(58);       // (56+60)/2
    expect(f.toPct).toBe(14);        // only one value
    expect(f.ppp).toBe(1.05);
    expect(f.games).toBe(2);
  });

  it("aggregateAdvancedShots sums made/att, ranks by volume, computes % + share", () => {
    const rows = [
      { advanced: { pt_iso_m: 3, pt_iso_a: 5, pt_transition_m: 2, pt_transition_a: 2 } },
      { advanced: { pt_iso_m: 1, pt_iso_a: 5 } },
    ];
    const out = aggregateAdvancedShots(rows, "pt");
    expect(out[0].key).toBe("iso");      // most attempts
    expect(out[0].made).toBe(4); expect(out[0].att).toBe(10);
    expect(out[0].pct).toBe(40);
    expect(out[0].sharePct).toBe(83.3); // 10 of 12 total attempts
    expect(out.find((r) => r.key === "transition")?.pct).toBe(100);
  });

  it("ignores the other prefix", () => {
    const out = aggregateAdvancedShots([{ advanced: { eff_positional_m: 4, eff_positional_a: 7 } }], "pt");
    expect(out).toHaveLength(0);
  });

  it("zonesFromAdvanced sums per zone in map order and drops empty zones", () => {
    const z = zonesFromAdvanced([{ zone_paint_m: 2, zone_paint_a: 3, zone_3pt_lt8m_m: 1, zone_3pt_lt8m_a: 4 }]);
    expect(z.map((x) => x.key)).toEqual(["paint", "3pt_lt8m"]);
    expect(z[0]).toEqual({ key: "paint", made: 2, att: 3, pct: 66.7 });
  });

  it("hasZones + playerZonesFromRows group by player", () => {
    expect(hasZones({ zone_paint_a: 3 })).toBe(true);
    expect(hasZones({ points: 5 })).toBe(false);
    const players = playerZonesFromRows([
      { source_player_name: "A", advanced: { zone_paint_m: 2, zone_paint_a: 3 } },
      { source_player_name: "A", advanced: { zone_paint_m: 1, zone_paint_a: 1 } },
      { source_player_name: "B", advanced: { points: 5 } }, // no zones → dropped
    ]);
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ name: "A", totalMade: 3, totalAtt: 4 });
  });
});
