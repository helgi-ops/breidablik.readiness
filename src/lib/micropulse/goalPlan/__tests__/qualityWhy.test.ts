import { describe, expect, it } from "vitest";
import { QUALITY_WHY, WHY_FOOTER, knownRef, refShort, whyTitles } from "../qualityWhy";
import { GOAL_QUALITIES } from "../types";

const all = () => GOAL_QUALITIES.flatMap((q) => {
  const w = QUALITY_WHY[q];
  return [w.matters, ...w.improves, ...(w.limit ? [w.limit] : [])];
});

describe("why each quality matters (lota 7b)", () => {
  it("every quality has a 'matters' line and 3–4 'what improves it' lines", () => {
    for (const q of GOAL_QUALITIES) {
      expect(QUALITY_WHY[q].matters.text.en.length).toBeGreaterThan(20);
      expect(QUALITY_WHY[q].improves.length).toBeGreaterThanOrEqual(3);
      expect(QUALITY_WHY[q].improves.length).toBeLessThanOrEqual(4);
    }
  });

  it("every line cites a study the plans already cite (no unknown keys)", () => {
    for (const l of all()) {
      expect(l.refs.length).toBeGreaterThan(0);
      for (const k of l.refs) expect(knownRef(k), k).toBe(true);
    }
    expect(refShort(["malone2017", "buchheit2023"])).toBe("(Malone 2017; Buchheit 2023)");
  });

  it("injury wording never claims prevention, prediction or cause", () => {
    for (const l of all()) {
      expect(l.text.en).not.toMatch(/\b(prevent|prevents|predict|predicts|causes?)\b/i);
      expect(l.text.is).not.toMatch(/kemur í veg|spáir|veldur/i);
    }
  });

  it("a sled is never said to beat the same sprints without one", () => {
    expect(QUALITY_WHY.acceleration.improves.some((l) => /no better than the same sprints without one/.test(l.text.en))).toBe(true);
  });

  it("braking says what the research does not show yet", () => {
    expect(QUALITY_WHY.braking.limit?.refs).toEqual(["marvin2024"]);
  });

  it("titles and footer in both languages; footer says it is not AI", () => {
    expect(whyTitles("acceleration")).toEqual({
      matters: { en: "Why acceleration matters", is: "Af hverju hröðun skiptir máli" },
      improves: { en: "What improves acceleration?", is: "Hvað bætir hröðun?" },
    });
    expect(whyTitles("top_speed").improves.is).toBe("Hvað bætir hámarkshraða?");
    expect(WHY_FOOTER.en).toMatch(/not AI/);
    expect(WHY_FOOTER.is).toMatch(/ekki gervigreind/);
  });

  it("no placeholders or sport-science jargon in the player's words", () => {
    for (const l of all()) {
      for (const t of [l.text.en, l.text.is]) {
        expect(t).not.toMatch(/\((ur|n|s)\)|ACWR|IMA|eccentric|plyometric|RSI|CMJ/i);
      }
    }
  });
});
