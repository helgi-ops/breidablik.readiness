import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  deriveFitnessTrendSignal, deriveBodyCompSignal, deriveSpeedZonesSignal,
  derivePositionFitnessSignal, deriveStrength1rmSignal, deriveStrengthPhaseSignal,
  deriveCccGateTeamSignal, derivePlayerCccGateSignals,
  deriveLoadAcwrTeamSignal, derivePlayerLoadAcwrSignals,
  deriveSprintDropTeamSignal, derivePlayerSprintDropSignals,
  deriveStrideFatigueTeamSignal, derivePlayerStrideFatigueSignals,
  type FitnessTrendLite, type BodyCompLite, type SpeedZonesLite,
  type PositionFitnessLite, type CccGateReadLite, type LoadAcwrLite, type SprintDropLite,
  type StrideFatigueLite,
} from "../index";

const fit = (over: Partial<FitnessTrendLite> = {}): FitnessTrendLite =>
  ({ playerId: "p1", name: "Jón", dir: "stable", metricEn: "VAMEVAL (MAS)", metricIs: "VAMEVAL (MAS)", seasonDeltaPct: 0, swcPct: 3, ...over });

describe("deriveFitnessTrendSignal", () => {
  it("no down trend → steady (no chip)", () => {
    expect(deriveFitnessTrendSignal([fit({ dir: "stable" }), fit({ dir: "up" })]).level).toBe("steady");
  });
  it("a down trend → watch/elevated with label, href, counterfactual", () => {
    const one = deriveFitnessTrendSignal([fit({ dir: "down", seasonDeltaPct: -3.7 })]);
    expect(one.level).toBe("watch");
    expect(one.engine).toBe("fitness_trend");
    expect(one.href).toBe("/coach/conditioning");
    expect(one.counterfactual?.en).toMatch(/retest/i);
    expect(one.why.en[0]).toMatch(/drop beyond test error/i);
    const two = deriveFitnessTrendSignal([fit({ dir: "down" }), fit({ dir: "down", playerId: "p2", name: "Ari" })]);
    expect(two.level).toBe("elevated");
  });
});

const bc = (over: Partial<BodyCompLite> = {}): BodyCompLite => ({ playerId: "p1", name: "Jón", deltaPct: 0, bandPct: 4, ...over });

describe("deriveBodyCompSignal", () => {
  it("within the error band → steady", () => {
    expect(deriveBodyCompSignal([bc({ deltaPct: 2 }), bc({ deltaPct: -3 })]).level).toBe("steady");
  });
  it("beyond the band → watch, and the wording is NEUTRAL (no target/eval)", () => {
    const s = deriveBodyCompSignal([bc({ deltaPct: -6 })]);
    expect(s.level).toBe("watch");
    expect(s.engine).toBe("body_comp");
    const text = `${s.label.en} ${s.why.en.join(" ")} ${s.counterfactual?.en ?? ""}`.toLowerCase();
    for (const banned of ["target", "ideal", "too high", "too fat", "overweight", "goal", "rank"]) {
      expect(text.includes(banned)).toBe(false);
    }
    expect(text).toMatch(/no ideal|no target|trend/);
  });
});

const sz = (over: Partial<SpeedZonesLite> = {}): SpeedZonesLite => ({ playerId: "p1", name: "Jón", hasMas: true, hasZones: true, ...over });

describe("deriveSpeedZonesSignal", () => {
  it("no team member uses zones → steady (don't nudge a team not using them)", () => {
    expect(deriveSpeedZonesSignal([sz({ hasMas: true, hasZones: false })]).level).toBe("steady");
  });
  it("team uses zones + a member has MAS but no zones → watch setup nudge", () => {
    const s = deriveSpeedZonesSignal([sz({ hasZones: true }), sz({ playerId: "p2", name: "Ari", hasMas: true, hasZones: false })]);
    expect(s.level).toBe("watch");
    expect(s.engine).toBe("speed_zones");
    expect(s.href).toBe("/coach/conditioning");
    expect(s.counterfactual?.en).toMatch(/max-sprint|GPS top speed|MSS/i);
  });
});

const pf = (over: Partial<PositionFitnessLite> = {}): PositionFitnessLite =>
  ({ playerId: "p1", name: "Jón", belowTop: false, weakestEn: "Aerobic endurance", weakestIs: "Loftháð þol", roleEn: "full-back", roleIs: "bakvörður", ...over });

describe("derivePositionFitnessSignal", () => {
  it("nobody below their top requirement → steady", () => {
    expect(derivePositionFitnessSignal([pf({ belowTop: false })]).level).toBe("steady");
  });
  it("a player below → watch/elevated, physical-only counterfactual, role-demand-fit href", () => {
    const one = derivePositionFitnessSignal([pf({ belowTop: true })]);
    expect(one.level).toBe("watch");
    expect(one.engine).toBe("position_fitness");
    expect(one.href).toBe("/coach/role-demand-fit");
    expect(one.counterfactual?.en).toMatch(/necessary, not sufficient/i);
    const three = derivePositionFitnessSignal([pf({ belowTop: true }), pf({ playerId: "p2", belowTop: true }), pf({ playerId: "p3", belowTop: true })]);
    expect(three.level).toBe("elevated");
  });
});

describe("deriveStrength1rmSignal", () => {
  it("no lift needs a 1RM → steady", () => {
    expect(deriveStrength1rmSignal([{ playerId: "p1", name: "Jón", liftsNeedingOneRm: [] }]).level).toBe("steady");
  });
  it("a lift needs a 1RM → watch setup nudge, strength href", () => {
    const s = deriveStrength1rmSignal([{ playerId: "p1", name: "Jón", liftsNeedingOneRm: ["back squat"] }]);
    expect(s.level).toBe("watch");
    expect(s.engine).toBe("strength_1rm");
    expect(s.href).toBe("/coach/strength");
    expect(s.counterfactual?.en).toMatch(/near-max|tested 1RM|%1RM/i);
  });
});

describe("deriveStrengthPhaseSignal", () => {
  it("silent outside pre-season (steady)", () => {
    expect(deriveStrengthPhaseSignal({ phase: "competitive", needBodyComp: 5, total: 20, weeksToOpener: null }).level).toBe("steady");
    expect(deriveStrengthPhaseSignal({ phase: null, needBodyComp: 0, total: 0, weeksToOpener: null }).level).toBe("steady");
  });
  it("pre-season → a task chip naming the body-comp gap + weeks to opener", () => {
    const s = deriveStrengthPhaseSignal({ phase: "preseason", needBodyComp: 3, total: 22, weeksToOpener: 4 });
    expect(s.level).toBe("task");
    expect(s.engine).toBe("strength_phase");
    expect(s.href).toContain("/coach/periodization-hub");
    expect(s.why.en[0]).toMatch(/3 of 22/);
    expect(s.why.en[0]).toMatch(/4 weeks/);
  });
});

const ccc = (over: Partial<CccGateReadLite> = {}): CccGateReadLite =>
  ({ playerId: "p1", name: "Andri Rafn", phase: { en: "Moderate control", is: "Miðlungs stjórn" }, nextPhase: { en: "Moderate chaos", is: "Miðlungs óreiða" }, allMet: true, evaluable: true, ...over });

describe("deriveCccGateTeamSignal (return-to-running phase gate)", () => {
  it("nobody cleared → steady (no chip)", () => {
    expect(deriveCccGateTeamSignal([ccc({ allMet: false })]).level).toBe("steady");
    expect(deriveCccGateTeamSignal([]).level).toBe("steady");
  });
  it("gate met but not evaluable (no force-plate) → steady — never fires on unevaluated criteria", () => {
    expect(deriveCccGateTeamSignal([ccc({ allMet: true, evaluable: false })]).level).toBe("steady");
  });
  it("at the final phase (no next) → steady — nothing to progress to", () => {
    expect(deriveCccGateTeamSignal([ccc({ nextPhase: null })]).level).toBe("steady");
  });
  it("a cleared player → a task naming him, RTT href, beside the colour", () => {
    const s = deriveCccGateTeamSignal([ccc()]);
    expect(s.level).toBe("task");
    expect(s.engine).toBe("ccc_gate");
    expect(s.href).toBe("/coach/return-to-training");
    expect(s.why.en[0]).toMatch(/Andri/);
    expect(s.counterfactual?.en.toLowerCase()).toMatch(/never the readiness colour/);
  });
});

describe("derivePlayerCccGateSignals (attention-row enrichment)", () => {
  it("one task chip per cleared player, deep-linked, phase→phase in the why", () => {
    const rows = derivePlayerCccGateSignals([ccc(), ccc({ playerId: "p2", allMet: false })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("p1");
    expect(rows[0].signal.level).toBe("task");
    expect(rows[0].signal.href).toBe("/coach/return-to-training/p1");
    expect(rows[0].signal.why.en[0]).toMatch(/Moderate control.*Moderate chaos/);
  });
});

const acwr = (over: Partial<LoadAcwrLite> = {}): LoadAcwrLite =>
  ({ playerId: "p1", name: "Jón Þór", ratio: 1.6, band: "RISK", severity: "concern", acuteMean: 520, chronicMean: 325, daysObserved: 20, estimatedDays: 0, awayDays: 0, stale: false, ...over });

describe("deriveLoadAcwrTeamSignal (external-load spike)", () => {
  it("no flagged player → steady (the loader only hands over WATCH/RISK, so [] = quiet)", () => {
    expect(deriveLoadAcwrTeamSignal([]).level).toBe("steady");
  });
  it("a stale window is dropped — never fires a spike on an empty acute window", () => {
    expect(deriveLoadAcwrTeamSignal([acwr({ stale: true })]).level).toBe("steady");
  });
  it("a lone WATCH-band climb stays steady at team level (over-flagging guard)", () => {
    expect(deriveLoadAcwrTeamSignal([acwr({ band: "WATCH", severity: "watch", ratio: 1.35 })]).level).toBe("steady");
  });
  it("a clean RISK spike → elevated, cited, decel href, beside the colour", () => {
    const s = deriveLoadAcwrTeamSignal([acwr()]);
    expect(s.level).toBe("elevated");
    expect(s.engine).toBe("load_acwr");
    expect(s.href).toBe("/coach/decel-intelligence");
    expect(s.why.en[0]).toMatch(/sharp load spike/i);
    expect(s.counterfactual?.en).toMatch(/Gabbett 2016/);
    expect(s.counterfactual?.en.toLowerCase()).toMatch(/never the readiness colour/);
  });
  it("a RISK spike resting ≥½ on estimated/away never escalates past watch + loses confidence (#2.2-aware)", () => {
    const s = deriveLoadAcwrTeamSignal([acwr({ daysObserved: 10, estimatedDays: 6, awayDays: 0 })]);
    expect(s.level).toBe("watch");
    expect(s.confidence).toBe("low");
    expect(s.why.en.join(" ")).toMatch(/estimated/);
  });
  it("two WATCH-band climbs → watch cluster", () => {
    const s = deriveLoadAcwrTeamSignal([acwr({ band: "WATCH", severity: "watch", ratio: 1.35 }), acwr({ playerId: "p2", name: "Ari", band: "WATCH", severity: "watch", ratio: 1.4 })]);
    expect(s.level).toBe("watch");
  });
});

describe("derivePlayerLoadAcwrSignals (attention-row enrichment)", () => {
  it("one chip per clean RISK spike; WATCH-band and stale are skipped", () => {
    const rows = derivePlayerLoadAcwrSignals([acwr(), acwr({ playerId: "p2", band: "WATCH", severity: "watch", ratio: 1.35 }), acwr({ playerId: "p3", stale: true })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("p1");
    expect(rows[0].signal.level).toBe("elevated");
    expect(rows[0].signal.why.en[0]).toMatch(/ACWR 1\.60/);
    expect(rows[0].signal.href).toBe("/coach/decel-intelligence");
  });
  it("a diluted RISK spike drops to watch + low confidence with a provenance note", () => {
    const rows = derivePlayerLoadAcwrSignals([acwr({ daysObserved: 8, estimatedDays: 5 })]);
    expect(rows[0].signal.level).toBe("watch");
    expect(rows[0].signal.confidence).toBe("low");
    expect(rows[0].signal.why.en.join(" ")).toMatch(/5 estimated of 8 days/);
  });
});

const sd = (over: Partial<SprintDropLite> = {}): SprintDropLite =>
  ({ playerId: "p1", name: "Jón Þór", sustainedDropPct: 13.5, recentMeanMs: 8.0, referenceMs: 9.25, severity: "high", refSessionCount: 6, ...over });

describe("deriveSprintDropTeamSignal (sustained max-velocity suppression)", () => {
  it("no flagged player → steady (loader hands over sustained ≥7% only, so [] = quiet)", () => {
    expect(deriveSprintDropTeamSignal([]).level).toBe("steady");
  });
  it("a lone milder sustained drop (7–12%) stays steady at team level (over-flagging guard)", () => {
    expect(deriveSprintDropTeamSignal([sd({ severity: "watch", sustainedDropPct: 9 })]).level).toBe("steady");
  });
  it("two milder sustained drops → watch cluster", () => {
    const s = deriveSprintDropTeamSignal([sd({ severity: "watch", sustainedDropPct: 8 }), sd({ playerId: "p2", name: "Ari", severity: "watch", sustainedDropPct: 10 })]);
    expect(s.level).toBe("watch");
  });
  it("a HIGH sustained drop → elevated, cited, decel href, beside the colour", () => {
    const s = deriveSprintDropTeamSignal([sd()]);
    expect(s.level).toBe("elevated");
    expect(s.engine).toBe("sprint_speed_drop");
    expect(s.href).toBe("/coach/decel-intelligence");
    expect(s.why.en[0]).toMatch(/sustained sprint-speed drop vs personal peak/i);
    expect(s.counterfactual?.en).toMatch(/Edouard 2019/);
    expect(s.counterfactual?.en.toLowerCase()).toMatch(/never the readiness colour/);
  });
});

describe("derivePlayerSprintDropSignals (attention-row enrichment)", () => {
  it("one chip per HIGH sustained drop; a milder sustained drop is skipped", () => {
    const rows = derivePlayerSprintDropSignals([sd(), sd({ playerId: "p2", severity: "watch", sustainedDropPct: 9 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("p1");
    expect(rows[0].signal.level).toBe("elevated");
    expect(rows[0].signal.why.en[0]).toMatch(/Sprint −13\.5% sustained vs peak \(28\.8 vs 33\.3 km\/h, last ~3 sessions\)/);
    expect(rows[0].signal.counterfactual?.en).toMatch(/Avoid maximal sprint/i);
  });
});

const stf = (over: Partial<StrideFatigueLite> = {}): StrideFatigueLite =>
  ({ playerId: "p1", name: "Jón Þór", deltaPct: -7.8, kind: "match", confidence: 0.9, reason: "His strides are 7.8% shorter than his usual match pattern.", reasonIs: "Skrefin hans eru 7,8% styttri en venjulega í leik.", ...over });

describe("deriveStrideFatigueTeamSignal (shortened high-cadence strides)", () => {
  it("no flagged player → steady (loader hands over shortened+confident only)", () => {
    expect(deriveStrideFatigueTeamSignal([]).level).toBe("steady");
  });
  it("one shortened → watch; cited, decel href, beside the colour", () => {
    const s = deriveStrideFatigueTeamSignal([stf()]);
    expect(s.level).toBe("watch");
    expect(s.engine).toBe("stride_fatigue");
    expect(s.href).toBe("/coach/decel-intelligence");
    expect(s.why.en[0]).toMatch(/shortened high-cadence strides vs their own norm/i);
    expect(s.counterfactual?.en).toMatch(/McBurnie 2022/);
    expect(s.counterfactual?.en.toLowerCase()).toMatch(/never the readiness colour/);
  });
  it("two or more shortened → elevated", () => {
    const s = deriveStrideFatigueTeamSignal([stf(), stf({ playerId: "p2", name: "Ari" })]);
    expect(s.level).toBe("elevated");
  });
});

describe("derivePlayerStrideFatigueSignals (attention-row enrichment)", () => {
  it("one watch chip per shortened read, carrying the engine's own plain why", () => {
    const rows = derivePlayerStrideFatigueSignals([stf()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("p1");
    expect(rows[0].signal.level).toBe("watch");
    expect(rows[0].signal.why.en[0]).toMatch(/7\.8% shorter/);
    expect(rows[0].signal.confidence).toBe("high"); // 0.9 → high
    expect(rows[0].signal.href).toBe("/coach/decel-intelligence");
  });
});

describe("all new signals — never the readiness colour, always a drill-down href", () => {
  it("carry engine + href, and stay beside the colour", () => {
    const all = [
      deriveFitnessTrendSignal([fit({ dir: "down" })]),
      deriveBodyCompSignal([bc({ deltaPct: -6 })]),
      deriveSpeedZonesSignal([sz({ hasZones: true }), sz({ playerId: "p2", hasMas: true, hasZones: false })]),
      derivePositionFitnessSignal([pf({ belowTop: true })]),
      deriveStrength1rmSignal([{ playerId: "p1", name: "Jón", liftsNeedingOneRm: ["bench press"] }]),
      deriveStrengthPhaseSignal({ phase: "preseason", needBodyComp: 2, total: 20, weeksToOpener: 5 }),
    ];
    for (const s of all) {
      expect(s.href.startsWith("/coach/")).toBe(true);
      expect(s.counterfactual?.en.toLowerCase()).toMatch(/never the readiness colour|descriptive/);
    }
  });
});

describe("boundary — derive functions never import readiness/decision modules", () => {
  it("index.ts + newEngineLoads.ts import no readiness/decision engine", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ["../index.ts", "../newEngineLoads.ts"]) {
      const src = readFileSync(resolve(here, file), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "athleteState"]) {
        expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
      }
    }
  });
});
