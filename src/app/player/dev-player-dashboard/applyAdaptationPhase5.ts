import type { FatigueClassification } from "@/lib/fatigue/types";
import type { ExceptionAction, TrainingAction, TrainingAdaptation } from "@/lib/training/adaptiveEngine";
import { extractPlayerAdaptation as extractSharedPlayerAdaptation } from "@/lib/training/applyAdaptation";
import { classifyExerciseType, humanizeExerciseId, substitutionMap, tissueProtectionMap, type TissueKey } from "@/lib/training/substitutionMap";

type JsonObject = Record<string, unknown>;

export type AdaptiveSubstitution = {
  from: string;
  to: string;
  reason: "tissue_protection" | "ballistic_swap";
};

export type AdaptiveMeta = {
  applied: boolean;
  summary: string;
  rulesApplied: string[];
  notes: string[];
  substitutions: AdaptiveSubstitution[];
};

type ApplyAdaptationInput = {
  basePlan: unknown;
  teamAction?: TrainingAction | null;
  exceptionAction?: ExceptionAction | null;
  fatigue?: FatigueClassification | null;
  adaptation?: TrainingAdaptation | null;
  adaptationSummary?: string | null;
};

type ApplyAdaptationResult = {
  shapedPlan: unknown;
  adaptive_meta: AdaptiveMeta;
};

type ExtractArgs = {
  baseRow?: unknown;
  inputs?: unknown;
  playerId: string;
};

type ExtractResult = ReturnType<typeof extractSharedPlayerAdaptation>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(x: unknown): x is JsonObject {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lowered(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function reducedCount(current: unknown, pct: number): unknown {
  const n = toNum(current);
  if (n == null) return current;
  return Math.max(1, Math.round(n * (1 - pct / 100)));
}

function increasedRest(current: unknown): unknown {
  const n = toNum(current);
  if (n == null) return current;
  return Math.max(1, Math.round(n * 1.25));
}

function read(rec: JsonObject, key: string): unknown {
  return rec[key];
}

function write(rec: JsonObject, key: string, value: unknown) {
  rec[key] = value;
}

function isProtectedBlockTitle(title: string): boolean {
  return (
    title.includes("warmup") ||
    title.includes("upphit") ||
    title.includes("rehab") ||
    title.includes("tendon") ||
    title.includes("neural reset")
  );
}

function getNameField(rec: JsonObject): { key: "name" | "title" | "exercise" | null; value: string } {
  if (typeof read(rec, "name") === "string") return { key: "name", value: String(read(rec, "name")) };
  if (typeof read(rec, "title") === "string") return { key: "title", value: String(read(rec, "title")) };
  if (typeof read(rec, "exercise") === "string") return { key: "exercise", value: String(read(rec, "exercise")) };
  return { key: null, value: "" };
}

function uniquePush(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

function chooseTissueCandidate(tissue: TissueKey): string {
  const candidates = tissueProtectionMap[tissue];
  return humanizeExerciseId(candidates[0]);
}

function chooseBallisticCandidate(category: keyof typeof substitutionMap): string | null {
  const candidates = substitutionMap[category];
  if (!candidates.length) return null;
  return humanizeExerciseId(candidates[0]);
}

function applySafeExerciseSubstitutions(args: {
  plan: unknown;
  adaptation: TrainingAdaptation;
  notes: string[];
  rulesApplied: string[];
  substitutions: AdaptiveSubstitution[];
}) {
  const { plan, adaptation, notes, rulesApplied, substitutions } = args;
  if (!isObject(plan) && !Array.isArray(plan)) return;

  const tissueKey = adaptation.protectTissue ? lowered(adaptation.protectTissue) : "";
  const resolvedTissue: TissueKey | null =
    tissueKey === "achilles" || tissueKey === "hamstring" || tissueKey === "patellar" ? tissueKey : null;

  function walk(node: unknown, blockTitle: string | null) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, blockTitle);
      return;
    }
    if (!isObject(node)) return;

    const maybeBlockTitle = lowered(read(node, "title") ?? read(node, "name") ?? read(node, "block"));
    const currentBlock = maybeBlockTitle || blockTitle;

    const hasExerciseList = Array.isArray(read(node, "items")) || Array.isArray(read(node, "exercises")) || Array.isArray(read(node, "steps"));
    if (hasExerciseList) {
      const keys: Array<"items" | "exercises" | "steps"> = ["items", "exercises", "steps"];
      for (const key of keys) {
        const list = read(node, key);
        if (!Array.isArray(list)) continue;

        for (const item of list) {
          if (!isObject(item)) continue;
          const nameInfo = getNameField(item);
          const currentName = nameInfo.value;
          if (!currentName || !nameInfo.key) continue;
          if (currentBlock && isProtectedBlockTitle(currentBlock)) continue;

          const category = classifyExerciseType({ name: currentName, title: currentName, tags: [] });
          const isBallisticCategory =
            category === "plyometric_vertical" ||
            category === "plyometric_reactive" ||
            category === "sprint_max_velocity" ||
            category === "sprint_acceleration";

          let replacement: string | null = null;
          let reason: AdaptiveSubstitution["reason"] | null = null;

          if (resolvedTissue && isBallisticCategory) {
            replacement = chooseTissueCandidate(resolvedTissue);
            reason = "tissue_protection";
            uniquePush(rulesApplied, "substituteForTissueProtection");
          } else if (adaptation.swapBallistic && isBallisticCategory) {
            replacement = chooseBallisticCandidate(category);
            reason = "ballistic_swap";
            uniquePush(rulesApplied, "substituteBallistic");
          } else if ((resolvedTissue || adaptation.swapBallistic) && category === "unknown") {
            uniquePush(notes, `Could not classify exercise for substitution: ${currentName}`);
          }

          if (replacement && reason && replacement !== currentName) {
            write(item, nameInfo.key, replacement);
            substitutions.push({ from: currentName, to: replacement, reason });
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      walk(read(node, key), currentBlock);
    }
  }

  walk(plan, null);
}

function fallbackSummary(adaptation: TrainingAdaptation): string {
  const parts: string[] = [];
  if (typeof adaptation.reduceVolumePct === "number") parts.push(`-${adaptation.reduceVolumePct}% volume`);
  if (typeof adaptation.reduceContactsPct === "number") parts.push(`-${adaptation.reduceContactsPct}% contacts`);
  if (adaptation.extendRest) parts.push("extended rest");
  if (adaptation.simplifySession) parts.push("simplify session");
  if (adaptation.recoveryBias) parts.push("recovery bias");
  if (adaptation.swapBallistic) parts.push("swap ballistic");
  if (adaptation.protectTissue) parts.push(`protect ${lowered(adaptation.protectTissue)}`);
  if (adaptation.addTendonReload) parts.push("add tendon reload");
  if (adaptation.addNeuralReset) parts.push("add neural reset");
  return parts.length ? parts.join(", ") : "No adaptation";
}

function hasPlanShape(plan: unknown): boolean {
  return isObject(plan) || Array.isArray(plan);
}

function reducePlanNumerics(plan: unknown, adaptation: TrainingAdaptation, rulesApplied: string[]) {
  const volumePct = adaptation.reduceVolumePct ?? null;
  const contactsPct = adaptation.reduceContactsPct ?? null;

  function walk(node: unknown) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isObject(node)) return;

    if (volumePct != null) {
      if ("rounds" in node) write(node, "rounds", reducedCount(read(node, "rounds"), volumePct));
      else if ("sets" in node) write(node, "sets", reducedCount(read(node, "sets"), volumePct));
    }
    if (contactsPct != null) {
      if ("contacts" in node) write(node, "contacts", reducedCount(read(node, "contacts"), contactsPct));
      else if ("reps" in node) write(node, "reps", reducedCount(read(node, "reps"), contactsPct));
    }
    if (adaptation.extendRest) {
      if ("rest" in node) write(node, "rest", increasedRest(read(node, "rest")));
      if ("rest_sec" in node) write(node, "rest_sec", increasedRest(read(node, "rest_sec")));
      if ("rest_seconds" in node) write(node, "rest_seconds", increasedRest(read(node, "rest_seconds")));
    }

    for (const key of Object.keys(node)) walk(read(node, key));
  }

  walk(plan);
  if (volumePct != null) uniquePush(rulesApplied, "reduceVolumePct");
  if (contactsPct != null) uniquePush(rulesApplied, "reduceContactsPct");
  if (adaptation.extendRest) uniquePush(rulesApplied, "extendRest");
}

export function extractPlayerAdaptation(args: ExtractArgs): ExtractResult {
  return extractSharedPlayerAdaptation(args);
}

export function applyAdaptationToPlan(input: ApplyAdaptationInput): ApplyAdaptationResult {
  const adaptation = input.adaptation ?? null;
  const basePlan = input.basePlan;

  if (!adaptation || !hasPlanShape(basePlan)) {
    return {
      shapedPlan: basePlan,
      adaptive_meta: {
        applied: false,
        summary: input.adaptationSummary?.trim() || "No adaptation",
        rulesApplied: [],
        notes: [],
        substitutions: [],
      },
    };
  }

  const shaped = clone(basePlan);
  const notes: string[] = [];
  const rulesApplied: string[] = [];
  const substitutions: AdaptiveSubstitution[] = [];

  // Priority: tissue protection > ballistic swap > volume > rest
  applySafeExerciseSubstitutions({
    plan: shaped,
    adaptation,
    notes,
    rulesApplied,
    substitutions,
  });
  reducePlanNumerics(shaped, adaptation, rulesApplied);

  if (adaptation.simplifySession) uniquePush(rulesApplied, "simplifySession");
  if (adaptation.recoveryBias) uniquePush(rulesApplied, "recoveryBias");
  if (adaptation.addTendonReload) uniquePush(notes, "Include tendon reload block after session.");
  if (adaptation.addNeuralReset) uniquePush(notes, "Include neural reset block after session.");
  if (adaptation.notes?.length) {
    for (const n of adaptation.notes) uniquePush(notes, n);
  }
  if (adaptation.protectTissue) uniquePush(notes, `Protect ${lowered(adaptation.protectTissue)} loading.`);
  if (adaptation.swapBallistic) uniquePush(notes, "Swap ballistic drills for controlled alternatives.");

  const summary = input.adaptationSummary?.trim() || fallbackSummary(adaptation);
  const applied = rulesApplied.length > 0 || substitutions.length > 0;

  return {
    shapedPlan: shaped,
    adaptive_meta: {
      applied,
      summary,
      rulesApplied,
      notes,
      substitutions,
    },
  };
}
