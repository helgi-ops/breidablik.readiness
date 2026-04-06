import type { TrainingAdaptation } from "@/lib/training/adaptiveEngine";
import { applyAdaptationToPlan } from "./applyAdaptationPhase5";

type JsonObject = Record<string, unknown>;

type PlanMetrics = {
  roundsSum: number;
  setsSum: number;
  restSum: number;
  contactsSum: number;
  hasWarmup: boolean;
  hasMain: boolean;
  minWorkingSetOrRound: number | null;
};

type CaseFixture = {
  id: string;
  title: string;
  adaptation: TrainingAdaptation | null;
  adaptationSummary: string;
  basePlan: unknown;
  expectations: {
    expectApplied: boolean;
    expectVolumeReduction?: boolean;
    expectContactReduction?: boolean;
    expectRestExtension?: boolean;
    expectProtectToken?: string | null;
    expectBallisticCaution?: boolean;
    expectRecoveryBias?: boolean;
    expectCorePreserved?: boolean;
  };
};

export type ValidationCaseResult = {
  id: string;
  title: string;
  pass: boolean;
  details: string[];
  baseMetrics: PlanMetrics;
  shapedMetrics: PlanMetrics;
  summary: string;
  rulesApplied: string[];
  substitutions: Array<{ from: string; to: string; reason: string }>;
};

export type ValidationSuiteResult = {
  total: number;
  passed: number;
  failed: number;
  cases: ValidationCaseResult[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function isObject(x: unknown): x is JsonObject {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function readField(rec: JsonObject, key: string): unknown {
  return rec[key];
}

function collectPlanMetrics(plan: unknown): PlanMetrics {
  const out: PlanMetrics = {
    roundsSum: 0,
    setsSum: 0,
    restSum: 0,
    contactsSum: 0,
    hasWarmup: false,
    hasMain: false,
    minWorkingSetOrRound: null,
  };

  function recordWorkingCount(n: number | null) {
    if (n == null) return;
    if (out.minWorkingSetOrRound == null) out.minWorkingSetOrRound = n;
    else out.minWorkingSetOrRound = Math.min(out.minWorkingSetOrRound, n);
  }

  function walk(node: unknown) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isObject(node)) return;

    const title = lower(readField(node, "title") ?? readField(node, "name") ?? readField(node, "block"));
    if (title.includes("warm") || title.includes("upphit")) out.hasWarmup = true;
    if (title.includes("main") || title.includes("primary")) out.hasMain = true;

    const rounds = toNum(readField(node, "rounds"));
    const sets = toNum(readField(node, "sets"));
    const rest = toNum(readField(node, "rest")) ?? toNum(readField(node, "rest_sec")) ?? toNum(readField(node, "rest_seconds"));
    const contacts = toNum(readField(node, "contacts")) ?? toNum(readField(node, "reps"));

    if (rounds != null) {
      out.roundsSum += rounds;
      recordWorkingCount(rounds);
    }
    if (sets != null) {
      out.setsSum += sets;
      recordWorkingCount(sets);
    }
    if (rest != null) out.restSum += rest;
    if (contacts != null) out.contactsSum += contacts;

    for (const key of Object.keys(node)) {
      walk(readField(node, key));
    }
  }

  walk(plan);
  return out;
}

function compareBaseVsShapedPlan(basePlan: unknown, shapedPlan: unknown) {
  const baseMetrics = collectPlanMetrics(basePlan);
  const shapedMetrics = collectPlanMetrics(shapedPlan);

  return {
    baseMetrics,
    shapedMetrics,
    changed: stableStringify(basePlan) !== stableStringify(shapedPlan),
    volumeReduced:
      shapedMetrics.roundsSum < baseMetrics.roundsSum || shapedMetrics.setsSum < baseMetrics.setsSum,
    contactsReduced: shapedMetrics.contactsSum < baseMetrics.contactsSum,
    restExtended: shapedMetrics.restSum > baseMetrics.restSum,
    corePreserved:
      (!baseMetrics.hasWarmup || shapedMetrics.hasWarmup) && (!baseMetrics.hasMain || shapedMetrics.hasMain),
    minFloorKept:
      shapedMetrics.minWorkingSetOrRound == null || shapedMetrics.minWorkingSetOrRound >= 1,
  };
}

function noteContains(notes: string[], token: string): boolean {
  const t = lower(token);
  return notes.some((n) => lower(n).includes(t));
}

function validateAdaptiveMetaConsistency(input: {
  summary: string;
  notes: string[];
  rulesApplied: string[];
  diff: ReturnType<typeof compareBaseVsShapedPlan>;
}) {
  const issues: string[] = [];
  const s = lower(input.summary);

  if (s.includes("volume") && !input.diff.volumeReduced) {
    issues.push("Summary says volume reduction but no measurable rounds/sets reduction.");
  }
  if ((s.includes("rest") || input.rulesApplied.includes("extendRest")) && !input.diff.restExtended) {
    issues.push("Summary/rules include rest extension but rest fields were not increased.");
  }
  if ((s.includes("contacts") || input.rulesApplied.includes("reduceContactsPct")) && !input.diff.contactsReduced) {
    const hasContactFallbackNote = noteContains(input.notes, "contacts") || noteContains(input.notes, "sprint");
    if (!hasContactFallbackNote) {
      issues.push("Contacts reduction declared but no measurable reduction or fallback note.");
    }
  }
  if (input.rulesApplied.length > 0 && !input.diff.changed) {
    issues.push("Rules were applied but shaped plan is identical to base plan.");
  }
  if (!input.diff.minFloorKept) {
    issues.push("Working rounds/sets dropped below safety floor (1).");
  }
  if (!input.diff.corePreserved) {
    issues.push("Warmup/main block was not preserved.");
  }

  return issues;
}

function fixtureCases(): CaseFixture[] {
  const baselinePlan = {
    blocks: [
      { title: "Warmup", rounds: 2, rest_sec: 60, items: [{ name: "Mobility", reps: 8 }] },
      {
        title: "Main Sprint/Plyo",
        rounds: 4,
        rest_sec: 90,
        items: [
          { name: "Sprint 20m", reps: 6 },
          { name: "Depth Jump", contacts: 24 },
        ],
      },
      { title: "Accessory", sets: 3, rest_seconds: 75, items: [{ name: "Core", reps: 12 }] },
      { title: "Optional Finisher", sets: 2, rest: 60, items: [{ name: "Reactive drill", reps: 10 }] },
    ],
  };

  return [
    {
      id: "A",
      title: "Neural fatigue",
      adaptation: {
        reduceVolumePct: 25,
        reduceContactsPct: 40,
        extendRest: true,
      },
      adaptationSummary: "-25% volume, -40% contacts, extended rest",
      basePlan: baselinePlan,
      expectations: { expectApplied: true, expectVolumeReduction: true, expectContactReduction: true, expectRestExtension: true, expectCorePreserved: true },
    },
    {
      id: "B",
      title: "Tissue Achilles",
      adaptation: {
        swapBallistic: true,
        protectTissue: "ACHILLES",
        addTendonReload: true,
      },
      adaptationSummary: "protect achilles, swap ballistic, add tendon reload",
      basePlan: baselinePlan,
      expectations: { expectApplied: true, expectProtectToken: "achilles", expectBallisticCaution: true, expectCorePreserved: true },
    },
    {
      id: "C",
      title: "Tissue Hamstring",
      adaptation: {
        protectTissue: "HAMSTRING",
        swapBallistic: true,
      },
      adaptationSummary: "protect hamstring, swap ballistic",
      basePlan: baselinePlan,
      expectations: { expectApplied: true, expectProtectToken: "hamstring", expectBallisticCaution: true, expectCorePreserved: true },
    },
    {
      id: "D",
      title: "Systemic fatigue",
      adaptation: {
        reduceVolumePct: 35,
        simplifySession: true,
        recoveryBias: true,
      },
      adaptationSummary: "-35% volume, simplify session, recovery bias",
      basePlan: baselinePlan,
      expectations: { expectApplied: true, expectVolumeReduction: true, expectRecoveryBias: true, expectCorePreserved: true },
    },
    {
      id: "E",
      title: "Mixed neural + systemic",
      adaptation: {
        reduceVolumePct: 35,
        reduceContactsPct: 40,
        extendRest: true,
        simplifySession: true,
        recoveryBias: true,
      },
      adaptationSummary: "-35% volume, -40% contacts, extended rest, simplify session, recovery bias",
      basePlan: baselinePlan,
      expectations: { expectApplied: true, expectVolumeReduction: true, expectContactReduction: true, expectRestExtension: true, expectRecoveryBias: true },
    },
    {
      id: "F",
      title: "No-op",
      adaptation: null,
      adaptationSummary: "No adaptation",
      basePlan: baselinePlan,
      expectations: { expectApplied: false },
    },
    {
      id: "G",
      title: "Minimal irregular plan",
      adaptation: { reduceContactsPct: 40, extendRest: true },
      adaptationSummary: "-40% contacts, extended rest",
      basePlan: { weird: [{ label: "x" }, { something: true }] },
      expectations: { expectApplied: true },
    },
    {
      id: "H",
      title: "Ballistic swap only",
      adaptation: { swapBallistic: true },
      adaptationSummary: "swap ballistic",
      basePlan: baselinePlan,
      expectations: { expectApplied: true, expectBallisticCaution: true, expectCorePreserved: true },
    },
    {
      id: "I",
      title: "Sprint protection",
      adaptation: { protectTissue: "HAMSTRING", swapBallistic: true },
      adaptationSummary: "protect hamstring, swap ballistic",
      basePlan: baselinePlan,
      expectations: { expectApplied: true, expectProtectToken: "hamstring", expectBallisticCaution: true },
    },
  ];
}

export function runAdaptationValidationSuite(): ValidationSuiteResult {
  const cases = fixtureCases();
  const results: ValidationCaseResult[] = [];

  for (const fx of cases) {
    const original = clone(fx.basePlan);
    const snapBefore = stableStringify(original);

    const r1 = applyAdaptationToPlan({
      basePlan: original,
      adaptation: fx.adaptation,
      adaptationSummary: fx.adaptationSummary,
    });
    const r2 = applyAdaptationToPlan({
      basePlan: original,
      adaptation: fx.adaptation,
      adaptationSummary: fx.adaptationSummary,
    });

    const snapAfter = stableStringify(original);
    const noMutation = snapBefore === snapAfter;
    const deterministic =
      stableStringify(r1.shapedPlan) === stableStringify(r2.shapedPlan) &&
      stableStringify(r1.adaptive_meta) === stableStringify(r2.adaptive_meta);

    const diff = compareBaseVsShapedPlan(fx.basePlan, r1.shapedPlan);
    const metaIssues = validateAdaptiveMetaConsistency({
      summary: r1.adaptive_meta.summary,
      notes: r1.adaptive_meta.notes,
      rulesApplied: r1.adaptive_meta.rulesApplied,
      diff,
    });

    const checks: string[] = [];
    checks.push(noMutation ? "No-mutation: PASS" : "No-mutation: FAIL");
    checks.push(deterministic ? "Deterministic: PASS" : "Deterministic: FAIL");
    checks.push(
      r1.adaptive_meta.applied === fx.expectations.expectApplied
        ? "Applied-flag: PASS"
        : `Applied-flag: FAIL (expected ${String(fx.expectations.expectApplied)})`,
    );

    if (fx.expectations.expectVolumeReduction) checks.push(diff.volumeReduced ? "Volume: PASS" : "Volume: FAIL");
    if (fx.expectations.expectContactReduction) checks.push(diff.contactsReduced ? "Contacts: PASS" : "Contacts: FAIL");
    if (fx.expectations.expectRestExtension) checks.push(diff.restExtended ? "Rest: PASS" : "Rest: FAIL");
    if (fx.expectations.expectCorePreserved) checks.push(diff.corePreserved ? "Core-preserved: PASS" : "Core-preserved: FAIL");
    if (fx.expectations.expectBallisticCaution) {
      const ok = noteContains(r1.adaptive_meta.notes, "ballistic") || lower(r1.adaptive_meta.summary).includes("ballistic");
      checks.push(ok ? "Ballistic-caution: PASS" : "Ballistic-caution: FAIL");
    }
    if (fx.expectations.expectProtectToken) {
      const token = fx.expectations.expectProtectToken;
      const ok = noteContains(r1.adaptive_meta.notes, token) || lower(r1.adaptive_meta.summary).includes(token);
      checks.push(ok ? `Protect-${token}: PASS` : `Protect-${token}: FAIL`);
    }
    if (fx.expectations.expectRecoveryBias) {
      const ok = noteContains(r1.adaptive_meta.notes, "recovery") || lower(r1.adaptive_meta.summary).includes("recovery");
      checks.push(ok ? "Recovery-bias: PASS" : "Recovery-bias: FAIL");
    }
    if (fx.adaptation?.swapBallistic || fx.adaptation?.protectTissue) {
      checks.push(r1.adaptive_meta.substitutions.length > 0 ? "Substitution-record: PASS" : "Substitution-record: FAIL");
    }

    if (metaIssues.length) {
      for (const issue of metaIssues) checks.push(`Consistency: WARN - ${issue}`);
    }

    const pass = checks.every((x) => x.includes("PASS") || x.includes("WARN"));

    results.push({
      id: fx.id,
      title: fx.title,
      pass,
      details: checks,
      baseMetrics: diff.baseMetrics,
      shapedMetrics: diff.shapedMetrics,
      summary: r1.adaptive_meta.summary,
      rulesApplied: r1.adaptive_meta.rulesApplied,
      substitutions: r1.adaptive_meta.substitutions.map((s) => ({ from: s.from, to: s.to, reason: s.reason })),
    });
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    cases: results,
  };
}
