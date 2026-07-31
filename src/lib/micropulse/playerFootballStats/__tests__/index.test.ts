import { describe, it, expect } from "vitest";
import {
  positionFamily,
  statIdsForPosition,
  pickPlayerFootballStats,
  seasonHeadline,
  PROFILE_METRIC_KEYS,
  type FootballStatInput,
} from "../index";

describe("positionFamily", () => {
  it("maps exact DB codes to families", () => {
    expect(positionFamily("GK")).toBe("GK");
    expect(positionFamily("CB")).toBe("CB");
    expect(positionFamily("RB")).toBe("FB");
    expect(positionFamily("LB")).toBe("FB");
    expect(positionFamily("CM")).toBe("MID");
    expect(positionFamily("AM")).toBe("MID");
    expect(positionFamily("MF")).toBe("MID");
    expect(positionFamily("LW")).toBe("WING");
    expect(positionFamily("RW")).toBe("WING");
    expect(positionFamily("RAM")).toBe("WING");
    expect(positionFamily("CF")).toBe("FW");
    expect(positionFamily("FWD")).toBe("FW");
  });

  it("takes the first token of a multi-code string (Wyscout 'RW, RAMF')", () => {
    expect(positionFamily("RW, RAMF")).toBe("WING");
    expect(positionFamily("CB / RCB")).toBe("CB");
  });

  it("falls back to keyword matching for unknown variants", () => {
    expect(positionFamily("RCMF")).toBe("MID");
    expect(positionFamily("RWB")).toBe("FB");
    expect(positionFamily("SS")).toBe("FW");
  });

  it("returns OUTFIELD for null/blank position", () => {
    expect(positionFamily(null)).toBe("OUTFIELD");
    expect(positionFamily("")).toBe("OUTFIELD");
    expect(positionFamily("   ")).toBe("OUTFIELD");
  });
});

describe("statIdsForPosition", () => {
  it("gives outfield players the shared core + 6 extras (12 total)", () => {
    const ids = statIdsForPosition("CF");
    expect(ids.length).toBe(12);
    expect(ids.slice(0, 6)).toEqual(["matches", "minutes", "goals", "assists", "xg", "passAcc"]);
  });

  it("gives goalkeepers their bespoke set (no attacking core)", () => {
    const ids = statIdsForPosition("GK");
    expect(ids).toContain("saveRate");
    expect(ids).toContain("cleanSheets");
    expect(ids).not.toContain("goals");
    expect(ids).not.toContain("xg");
  });

  it("tailors extras by family", () => {
    expect(statIdsForPosition("CB")).toContain("aerialWon");
    expect(statIdsForPosition("CB")).toContain("padjInter");
    expect(statIdsForPosition("LW")).toContain("dribbleSucc");
    expect(statIdsForPosition("CM")).toContain("progPassesP90");
    expect(statIdsForPosition("RB")).toContain("crossAcc");
  });

  it("every referenced stat id resolves to a rendered stat", () => {
    for (const pos of ["GK", "CB", "RB", "CM", "LW", "CF", null]) {
      const stats = pickPlayerFootballStats({ core: {}, metrics: {} }, pos, "EN");
      expect(stats.length).toBe(statIdsForPosition(pos).length);
      // No undefined labels ⇒ no dangling catalog ids.
      expect(stats.every((s) => typeof s.label === "string" && s.label.length > 0)).toBe(true);
    }
  });
});

const AGUST: FootballStatInput = {
  core: { minutes: 1659, goals: 7, assists: 6, xg: 4, passAccuracyPct: 78 },
  metrics: {
    "Matches played": 21,
    "xG per 90": 0.22,
    "xA per 90": 0.31,
    "Key passes per 90": 0.45,
    "Successful dribbles, %": 61,
    "Progressive runs per 90": 3.1,
    "Crosses per 90": 2.4,
    "Touches in box per 90": 4.2,
    "Age": 24,
    "Market value": 250000,
    "Foot": "right",
  },
};

describe("pickPlayerFootballStats", () => {
  it("reads core columns and metrics jsonb, formatting each by type", () => {
    const stats = pickPlayerFootballStats(AGUST, "RW", "EN");
    const by = new Map(stats.map((s) => [s.id, s]));
    expect(by.get("goals")!.display).toBe("7");
    expect(by.get("xg")!.display).toBe("4"); // xg fmt keeps 1 decimal but trims trailing zero
    expect(by.get("passAcc")!.display).toBe("78%");
    expect(by.get("dribbleSucc")!.display).toBe("61%");
    expect(by.get("progRuns")!.display).toBe("3.1");
    expect(by.get("xaP90")!.display).toBe("0.31");
  });

  it("renders missing values as '–' (never zero) and keeps them in the list", () => {
    const stats = pickPlayerFootballStats({ core: { goals: 3 }, metrics: {} }, "CF", "EN");
    const by = new Map(stats.map((s) => [s.id, s]));
    expect(by.get("goals")!.display).toBe("3");
    expect(by.get("xgP90")!.value).toBeNull();
    expect(by.get("xgP90")!.display).toBe("–");
  });

  it("parses European-formatted metric strings (comma decimal, % suffix)", () => {
    const stats = pickPlayerFootballStats(
      { core: {}, metrics: { "Successful dribbles, %": "61%", "xA per 90": "0,31" } },
      "LW", "EN",
    );
    const by = new Map(stats.map((s) => [s.id, s]));
    expect(by.get("dribbleSucc")!.value).toBe(61);
    expect(by.get("xaP90")!.value).toBe(0.31);
  });

  it("localizes labels and jargon tooltips", () => {
    const en = pickPlayerFootballStats(AGUST, "RW", "EN").find((s) => s.id === "xg")!;
    const is = pickPlayerFootballStats(AGUST, "RW", "IS").find((s) => s.id === "xg")!;
    expect(en.label).toBe("xG");
    expect(is.label).toContain("vænt mörk");
    expect(en.tip).toContain("Expected goals");
    expect(is.tip).toContain("Vænt mörk");
  });

  it("marks lower-is-better GK stats", () => {
    const stats = pickPlayerFootballStats(
      { core: {}, metrics: { "Conceded goals": 12, "xG against": 14.3, "Save rate, %": 71 } },
      "GK", "EN",
    );
    const by = new Map(stats.map((s) => [s.id, s]));
    expect(by.get("conceded")!.higherIsBetter).toBe(false);
    expect(by.get("xgAgainst")!.higherIsBetter).toBe(false);
    expect(by.get("saveRate")!.higherIsBetter).toBe(true);
  });
});

describe("seasonHeadline", () => {
  it("summarizes an outfield player's season with goals + assists", () => {
    const h = seasonHeadline(AGUST, "RW", "EN");
    expect(h.primary).toBe("21 matches · 1,659 minutes");
    expect(h.secondary).toBe("7 goals · 6 assists");
  });

  it("summarizes a goalkeeper with clean sheets + save rate", () => {
    const h = seasonHeadline(
      { core: { minutes: 1800 }, metrics: { "Matches played": 20, "Clean sheets": 8, "Save rate, %": 74 } },
      "GK", "IS",
    );
    expect(h.primary).toContain("20 leikir");
    expect(h.secondary).toContain("8 hreinar skjaldir");
    expect(h.secondary).toContain("74% varið");
  });

  it("degrades to '–' without inventing numbers", () => {
    const h = seasonHeadline({ core: {}, metrics: {} }, "CM", "EN");
    expect(h.primary).toBe("– matches · – minutes");
    expect(h.secondary).toBeNull();
  });
});

describe("PROFILE_METRIC_KEYS", () => {
  it("excludes profile/market keys from the on-pitch details view", () => {
    expect(PROFILE_METRIC_KEYS.has("Market value")).toBe(true);
    expect(PROFILE_METRIC_KEYS.has("Age")).toBe(true);
    expect(PROFILE_METRIC_KEYS.has("Matches played")).toBe(true);
    expect(PROFILE_METRIC_KEYS.has("Goals per 90")).toBe(false);
  });
});
