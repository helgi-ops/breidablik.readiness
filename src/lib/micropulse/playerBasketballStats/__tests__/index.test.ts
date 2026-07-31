import { describe, it, expect } from "vitest";
import {
  basketballPositionFamily,
  basketballStatIdsForPosition,
  pickBasketballStats,
  basketballSeasonHeadline,
  BASKETBALL_PROFILE_METRIC_KEYS,
  type SportStatInput,
} from "../index";

describe("basketballPositionFamily", () => {
  it("maps exact codes to the three families", () => {
    expect(basketballPositionFamily("PG")).toBe("GUARD");
    expect(basketballPositionFamily("SG")).toBe("GUARD");
    expect(basketballPositionFamily("G")).toBe("GUARD");
    expect(basketballPositionFamily("SF")).toBe("WING");
    expect(basketballPositionFamily("F")).toBe("WING");
    expect(basketballPositionFamily("PF")).toBe("BIG");
    expect(basketballPositionFamily("C")).toBe("BIG");
  });

  it("takes the first token of a multi-code string", () => {
    expect(basketballPositionFamily("PG/SG")).toBe("GUARD");
    expect(basketballPositionFamily("PF/C")).toBe("BIG");
    expect(basketballPositionFamily("SF, PF")).toBe("WING");
  });

  it("falls back to a balanced default for blank/unknown", () => {
    expect(basketballPositionFamily(null)).toBe("WING");
    expect(basketballPositionFamily("")).toBe("WING");
  });
});

describe("basketballStatIdsForPosition", () => {
  it("gives every family the shared core + 6 extras (12 total)", () => {
    for (const pos of ["PG", "SF", "C"]) {
      const ids = basketballStatIdsForPosition(pos);
      expect(ids.length).toBe(12);
      expect(ids.slice(0, 6)).toEqual(["games", "minutes", "points", "rebounds", "assists", "fgPct"]);
    }
  });

  it("tailors extras by family without duplicating the core", () => {
    const guard = basketballStatIdsForPosition("PG");
    expect(guard).toContain("astTo");
    expect(guard).toContain("threePct");
    const big = basketballStatIdsForPosition("C");
    expect(big).toContain("blocks");
    expect(big).toContain("defReb");
    // no extra repeats a core id
    for (const pos of ["PG", "SF", "C"]) {
      const ids = basketballStatIdsForPosition(pos);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every referenced id resolves to a rendered stat", () => {
    for (const pos of ["PG", "SG", "SF", "PF", "C", null]) {
      const stats = pickBasketballStats({ core: {}, metrics: {} }, pos, "EN");
      expect(stats.length).toBe(basketballStatIdsForPosition(pos).length);
      expect(stats.every((s) => typeof s.label === "string" && s.label.length > 0)).toBe(true);
    }
  });
});

const GUARD: SportStatInput = {
  core: { minutes: 540 },
  metrics: {
    "Games": 18,
    "Points per game": 14.2,
    "Rebounds per game": 3.1,
    "Assists per game": 5.6,
    "Field goals %": 44.8,
    "Three-point %": 37.1,
    "Free throws %": 82,
    "Steals per game": 1.4,
    "Assist to turnover": 2.35,
    "True shooting %": 56.3,
    "Efficiency": 15.4,
    "Turnovers per game": 2.4,
    "Height": 188,
  },
};

describe("pickBasketballStats", () => {
  it("reads core minutes + metrics jsonb and formats by type", () => {
    const stats = pickBasketballStats(GUARD, "PG", "EN");
    const by = new Map(stats.map((s) => [s.id, s]));
    expect(by.get("minutes")!.display).toBe("540");
    expect(by.get("points")!.display).toBe("14.2");
    expect(by.get("fgPct")!.display).toBe("45%");
    expect(by.get("astTo")!.display).toBe("2.35");
    expect(by.get("ts")!.display).toBe("56%");
  });

  it("renders missing values as '–' (never zero) and keeps them", () => {
    const stats = pickBasketballStats({ core: { minutes: 300 }, metrics: { "Points per game": 8 } }, "SF", "EN");
    const by = new Map(stats.map((s) => [s.id, s]));
    expect(by.get("points")!.display).toBe("8");
    expect(by.get("threePct")!.value).toBeNull();
    expect(by.get("threePct")!.display).toBe("–");
  });

  it("parses European-formatted metric strings", () => {
    const stats = pickBasketballStats(
      { core: {}, metrics: { "Field goals %": "44,8%", "Assist to turnover": "2,35" } },
      "PG", "EN",
    );
    const by = new Map(stats.map((s) => [s.id, s]));
    expect(by.get("fgPct")!.value).toBe(44.8);
    expect(by.get("astTo")!.value).toBe(2.35);
  });

  it("localizes labels and jargon tooltips", () => {
    const en = pickBasketballStats(GUARD, "PG", "EN").find((s) => s.id === "ts")!;
    const is = pickBasketballStats(GUARD, "PG", "IS").find((s) => s.id === "ts")!;
    expect(en.label).toBe("True shooting %");
    expect(is.label).toContain("Raunskotnýting");
    expect(en.tip).toContain("Scoring efficiency");
    expect(is.tip).toContain("Skorunar-nýting");
  });

  it("marks turnovers as lower-is-better", () => {
    const t = pickBasketballStats(GUARD, "C", "EN").find((s) => s.id === "turnovers")!;
    expect(t.higherIsBetter).toBe(false);
  });
});

describe("basketballSeasonHeadline", () => {
  it("summarizes with games/minutes + the PTS/REB/AST line", () => {
    const h = basketballSeasonHeadline(GUARD, "PG", "EN");
    expect(h.primary).toBe("18 games · 540 minutes");
    expect(h.secondary).toBe("14.2 pts · 3.1 reb · 5.6 ast");
  });

  it("degrades to '–' without inventing numbers", () => {
    const h = basketballSeasonHeadline({ core: {}, metrics: {} }, "SG", "IS");
    expect(h.primary).toBe("– leikir · – mínútur");
    expect(h.secondary).toBeNull();
  });
});

describe("BASKETBALL_PROFILE_METRIC_KEYS", () => {
  it("excludes bio/profile keys from the on-court details view", () => {
    expect(BASKETBALL_PROFILE_METRIC_KEYS.has("Height")).toBe(true);
    expect(BASKETBALL_PROFILE_METRIC_KEYS.has("Games")).toBe(true);
    expect(BASKETBALL_PROFILE_METRIC_KEYS.has("Points per game")).toBe(false);
  });
});
