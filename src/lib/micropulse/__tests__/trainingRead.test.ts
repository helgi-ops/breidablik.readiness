/**
 * Tests for trainingRead — "How to train this player".
 * Core VERIFY: the same player-logic on a Lite (GPS-only) read omits CoD/asymmetry,
 * lists them under notAssessable, and reports LOWER confidence than a Pro (IMA) read.
 * Run: npx vitest src/lib/micropulse/__tests__/trainingRead.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { computeTrainingRead } from "../trainingRead";
import { QUALITY_KEYS } from "../trainingRead/catalogue";

const S = (z, rich, baselineDays = 20) => ({ z, rich, baselineDays });

// Same player movement; Pro sees all signals (IMA rich), Lite omits the IMA-only
// CoD + L/R asymmetry and reads the rest as GPS proxies.
const PRO = {
  playerId: "p1", position: "RB", firstName: "Jón", gameModel: "possession",
  signals: {
    max_velocity: S(1.2, true), repeated_sprint: S(0.5, true), acceleration: S(0.8, true),
    deceleration: S(1.0, true), change_of_direction: S(1.5, true), lr_asymmetry: S(1.8, true),
    hamstring_resilience: S(1.2, true), aerobic_density: S(0.6, true),
  },
};
const LITE = {
  playerId: "p1", position: "RB", firstName: "Jón", gameModel: "possession",
  signals: {
    max_velocity: S(1.2, false), repeated_sprint: S(0.5, false), acceleration: S(0.8, false),
    deceleration: S(1.0, false), hamstring_resilience: S(1.2, false), aerobic_density: S(0.6, false),
  },
};

describe("trainingRead — Pro vs Lite on the same player", () => {
  const pro = computeTrainingRead(PRO);
  const lite = computeTrainingRead(LITE);

  it("Pro surfaces change-of-direction (possession demands it); Lite never does", () => {
    expect(pro.emphases.map((e) => e.quality)).toContain("change_of_direction");
    expect(lite.emphases.map((e) => e.quality)).not.toContain("change_of_direction");
    expect(lite.emphases.map((e) => e.quality)).not.toContain("lr_asymmetry");
  });

  it("Lite lists CoD + L/R asymmetry under notAssessable with an unlock note", () => {
    const na = lite.notAssessable.map((n) => n.quality);
    expect(na).toContain("change_of_direction");
    expect(na).toContain("lr_asymmetry");
    expect(lite.notAssessable.find((n) => n.quality === "change_of_direction")?.note.EN).toMatch(/IMA/);
    // Pro can see them → not in its notAssessable
    expect(pro.notAssessable.length).toBe(0);
  });

  it("Lite coverage is lower than Pro on the same player", () => {
    expect(lite.confidence.coverage).toBeLessThan(pro.confidence.coverage);
    expect(pro.confidence.coverage).toBe(1);          // 8/8
    expect(lite.confidence.coverage).toBe(0.75);       // 6/8
  });

  it("Lite overall confidence degrades below Pro (proxy evidence caps it)", () => {
    expect(pro.confidence.level).toBe("high");
    expect(lite.confidence.level).toBe("moderate");    // never high on GPS proxies
  });

  it("per-emphasis confidence is lower on the Lite proxy than the Pro rich signal", () => {
    const proDecel = pro.emphases.find((e) => e.quality === "deceleration");
    const liteDecel = lite.emphases.find((e) => e.quality === "deceleration");
    expect(proDecel?.confidence).toBe("high");
    expect(liteDecel?.confidence).toBe("moderate");
  });
});

describe("trainingRead — ranking, gating, explainability", () => {
  it("ranks by game-model demand × his exposure, top 3", () => {
    const r = computeTrainingRead(PRO);
    expect(r.emphases.length).toBeLessThanOrEqual(3);
    // possession's top demand (CoD 0.9) + high exposure → CoD ranks first
    expect(r.emphases[0].quality).toBe("change_of_direction");
  });

  it("immature baseline (<8 days) is not assessed", () => {
    const r = computeTrainingRead({
      playerId: "p1", position: "CM", gameModel: "high_press",
      signals: { repeated_sprint: S(2.0, true, 5) }, // 5 days < MIN_DAYS
    });
    expect(r.emphases.length).toBe(0);
    expect(r.confidence.level).toBe("low");
  });

  it("every emphasis carries a citation, evidence and bilingual headline/why", () => {
    const e = computeTrainingRead(PRO).emphases[0];
    expect(e.citation).toBeTruthy();
    expect(e.evidence.EN).toMatch(/z [+-]/);
    expect(e.headline.EN).toBeTruthy();
    expect(e.headline.IS).toBeTruthy();
    expect(e.why.EN).toMatch(/possession/i); // {model} substituted
  });

  it("a direct-transition model surfaces max-velocity + hamstring-resilience", () => {
    const r = computeTrainingRead({ ...PRO, gameModel: "direct_transition" });
    const keys = r.emphases.map((e) => e.quality);
    expect(keys).toContain("max_velocity");
    expect(keys).toContain("hamstring_resilience");
  });

  it("catalogue stays a closed set (no engine-invented qualities)", () => {
    const r = computeTrainingRead(PRO);
    for (const e of r.emphases) expect(QUALITY_KEYS).toContain(e.quality);
  });

  it("a typical player still gets his top few (his signature), led by his strongest", () => {
    // Average-ish profile: every player should get actionable guidance, not a blank.
    const r = computeTrainingRead({
      playerId: "avg", position: "CM", gameModel: "balanced",
      signals: {
        acceleration: S(0.05, true), deceleration: S(-0.1, true), aerobic_density: S(0.02, true),
        max_velocity: S(0.9, false), repeated_sprint: S(0.3, false),
      },
    });
    expect(r.emphases.length).toBeGreaterThan(0);
    expect(r.emphases[0].quality).toBe("max_velocity"); // his most-distinctive leads
  });

  it("a quality the player is LOW in vs squad (negative z) drops out, not surfaced", () => {
    // Centre-back: low sprint/HSR for the team (z -1.6), high decel for his role.
    const cb = computeTrainingRead({
      playerId: "cb", position: "CB", gameModel: "balanced",
      signals: {
        max_velocity: S(-1.6, true), repeated_sprint: S(-1.4, true), hamstring_resilience: S(-1.5, true),
        deceleration: S(1.3, true), aerobic_density: S(0.9, true), acceleration: S(0.2, true),
      },
    });
    const keys = cb.emphases.map((e) => e.quality);
    // He runs the least sprint → no "protect the hamstrings (sprint)" / max-velocity emphasis
    expect(keys).not.toContain("max_velocity");
    expect(keys).not.toContain("hamstring_resilience");
    expect(keys).not.toContain("repeated_sprint");
    // His actual high-for-role qualities surface instead
    expect(keys).toContain("deceleration");
  });
});
