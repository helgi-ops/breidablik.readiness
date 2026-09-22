import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { recommendSessionForDay, recommendWeekSessions, pickDrillsForBlend, type ClassifiedDrill } from "../weekSessionPlan";

describe("recommendSessionForDay — theme/MD → stimulus type", () => {
  it("FORCE / MD-4 → mechanical-dominant", () => {
    const r = recommendSessionForDay({ date: "2026-09-16", dayType: "FORCE" });
    expect(r.sessionType).toBe("mechanical");
    expect(r.blend.mechanical).toBe(2);
    expect(r.note.en).toMatch(/FORCE/);
  });
  it("NEURAL_VELOCITY / MD-3 → mixed", () => {
    expect(recommendSessionForDay({ date: "2026-09-17", dayType: "NEURAL_VELOCITY" }).sessionType).toBe("mixed");
  });
  it("ACTIVATION / MD-1 → technical (the taper)", () => {
    const r = recommendSessionForDay({ date: "2026-09-19", mdDay: "MD-1" });
    expect(r.sessionType).toBe("technical");
    expect(r.note.en).toMatch(/taper/i);
  });
  it("match day → no session type", () => {
    expect(recommendSessionForDay({ date: "2026-09-20", dayType: "GAME" }).sessionType).toBeNull();
  });
  it("real week-setup labels win over the MD tier (coach's own labelling)", () => {
    // MD-3 labelled "Mechanical" by the coach → mechanical, not the generic MD-3 mixed.
    expect(recommendSessionForDay({ date: "d", mdDay: "MD-3", dayType: "MIN Mechanical" }).sessionType).toBe("mechanical");
    expect(recommendSessionForDay({ date: "d", mdDay: "MD-2", dayType: "MIN Locomotive" }).sessionType).toBe("locomotive");
    // "Game Preparation" is a taper day, not a match.
    expect(recommendSessionForDay({ date: "d", mdDay: "MD-1", dayType: "MIN Game Preparation" }).sessionType).toBe("technical");
    // MD+1 is a top-up (load non-starters toward match demand — both HSR + accel/decel), flagged recovery.
    const md1 = recommendSessionForDay({ date: "d", mdDay: "MD+1", dayType: "MIN Recovery" });
    expect(md1.sessionType).toBe("mixed");
    expect(md1.recovery).toBe(true);
    expect(md1.blend).toMatchObject({ locomotive: 1, mechanical: 1 });
    // A real match day ("Game" + OFF) → no session.
    expect(recommendSessionForDay({ date: "d", mdDay: "MD", dayType: "OFF Game" }).sessionType).toBeNull();
  });
  it("mdDay wins over an absent theme; unknown → null type with a prompt", () => {
    expect(recommendSessionForDay({ date: "2026-09-18", mdDay: "MD-2" }).sessionType).toBe("locomotive"); // MD-2 = speed day (open/high-speed proxy)
    expect(recommendSessionForDay({ date: "2026-09-99", dayType: null, mdDay: null }).sessionType).toBeNull();
  });
  it("carries the target Player Load through", () => {
    expect(recommendSessionForDay({ date: "d", mdDay: "MD-4", targetPl: 520 }).targetPl).toBe(520);
  });
});

describe("recommendWeekSessions", () => {
  it("maps + date-sorts the whole week", () => {
    const w = recommendWeekSessions([
      { date: "2026-09-19", mdDay: "MD-1" },
      { date: "2026-09-16", dayType: "FORCE" },
      { date: "2026-09-20", dayType: "GAME" },
    ]);
    expect(w.map((d) => d.date)).toEqual(["2026-09-16", "2026-09-19", "2026-09-20"]);
    expect(w[0].sessionType).toBe("mechanical");
    expect(w[2].sessionType).toBeNull();
  });
});

describe("pickDrillsForBlend", () => {
  const drills: ClassifiedDrill[] = [
    { id: "a", name: "Squat circuit", stimulus: "mechanical" },
    { id: "b", name: "Accel ladder", stimulus: "mechanical" },
    { id: "c", name: "SSG 6v6", stimulus: "mixed" },
    { id: "d", name: "Rondo", stimulus: "technical" },
    { id: "e", name: "Tempo runs", stimulus: "locomotive" },
  ];
  it("takes up to the requested count per stimulus, deduped", () => {
    const picked = pickDrillsForBlend(drills, { mechanical: 2, mixed: 1 });
    expect(picked.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });
  it("stops when a type runs out, never fabricates", () => {
    const picked = pickDrillsForBlend(drills, { locomotive: 3 });
    expect(picked.map((d) => d.id)).toEqual(["e"]);
  });
});

describe("boundary — week→session plan never reaches readiness / decision modules", () => {
  it("weekSessionPlan.ts imports nothing from those engines", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../weekSessionPlan.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "decision"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});
