import { describe, expect, it } from "vitest";
import { FLYING_SPRINT_DOSE, FLYING_REPS_X_ZONE, range } from "../flyingDose";
import { MAX_FLYING_M_PER_SESSION, MIN_DAYS_BETWEEN_TOP_SPEED, SPEED_METHOD_BY_KEY, SPEED_REFS } from "../index";
import { PRESCRIPTIONS } from "@/lib/micropulse/trainingPrescriptions";
import { ATHLETE_LEVERS } from "@/lib/micropulse/playerAnalysis/developmentLevers";
import { buildAssessmentRecommendation } from "@/lib/micropulse/physicalAssessment/recommend";
import { ROBUSTNESS_DRILLS } from "@/lib/micropulse/robustness/catalog";

const D = FLYING_SPRINT_DOSE;
const zone = `${range(D.reps)} × ${range(D.fastZoneM)} m`;
const buildUp = `${range(D.buildUpM)} m`;

/** The dose every flying-sprint surface must carry, in both languages. */
function expectDose(text: string) {
  expect(text).toContain(zone);
  expect(text).toContain(buildUp);
  expect(text).toMatch(/4\+ (min|mín)/);
}

describe("flying-sprint dose: one source", () => {
  it("matches Haugen 2019 as the library cites it", () => {
    expect(D.cite).toBe(SPEED_REFS.haugen2019.short);
    expect(range(D.fastZoneM)).toBe("10–30");
    expect(range(D.buildUpM)).toBe("20–40");
    expect(range(D.sessionM)).toBe("50–150");
    expect(D.reps.max * D.fastZoneM.max).toBeLessThanOrEqual(D.sessionM.max);
    expect(MAX_FLYING_M_PER_SESSION).toBe(D.sessionM.max);
    expect(MIN_DAYS_BETWEEN_TOP_SPEED).toBe(2);
  });

  it("the library's flying-sprint card reads the shared dose", () => {
    const m = SPEED_METHOD_BY_KEY.flying_sprints;
    expect(m.dose.en).toContain(`${range(D.reps)} runs of ${range(D.fastZoneM)} m`);
    expect(m.dose.is).toContain(`${range(D.reps)} sprettir ${range(D.fastZoneM)} m`);
    expect(m.summary.en).toContain(buildUp);
  });

  it("Train like you Play top-speed prescription uses the dose, EN + IS, cited", () => {
    const p = PRESCRIPTIONS.top_speed;
    expectDose(p.method.EN);
    expectDose(p.method.IS);
    expect(p.cite).toContain("Haugen 2019");
  });

  it("speed development lever uses the dose, EN + IS, cited", () => {
    const l = ATHLETE_LEVERS.speed;
    expectDose(l.en);
    expectDose(l.is);
    expect(l.cite).toContain("Haugen 2019");
  });

  it("assessment top-speed focus area uses the dose, EN + IS, cited", () => {
    const rec = buildAssessmentRecommendation({
      metrics: [{ code: "flying_20m_s", nameEN: "Flying 20 m", nameIS: "Fljúgandi 20 m", percentile: 10, direction: "static" }],
    } as never);
    const f = rec.focusAreas.find((a) => a.code === "max_velocity");
    expect(f).toBeDefined();
    expectDose(f!.emphasisEN);
    expectDose(f!.emphasisIS);
    expect(f!.emphasisEN).toContain("Haugen 2019");
  });

  it("robustness sprint drill uses the dose, cited", () => {
    const d = ROBUSTNESS_DRILLS.find((x) => x.id === "sprint_strides")!;
    expect(d.dose).toBe(FLYING_REPS_X_ZONE);
    expect(d.cue.en).toContain(buildUp);
    expect(d.cue.is).toContain(buildUp);
    expect(d.evidence).toContain("Haugen 2019");
  });

  it("no surface keeps the old flying-sprint numbers", () => {
    const old = [/flying 20–40 m runs/, /\(20–40 m\) at 95–100%/, /20–30 m build-ups/, /4 × 25m/, /~90% over 20–30m/];
    const texts = [
      PRESCRIPTIONS.top_speed.method.EN,
      ATHLETE_LEVERS.speed.en,
      ...ROBUSTNESS_DRILLS.flatMap((x) => [x.dose, x.cue.en]),
    ];
    for (const t of texts) for (const re of old) expect(t).not.toMatch(re);
  });
});
