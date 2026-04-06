import type { FatigueClassification } from "@/lib/fatigue/types";
import type { ExceptionAction, TrainingAction, TrainingAdaptation } from "@/lib/training/adaptiveEngine";

type JsonObject = Record<string, unknown>;

export type AdaptiveMeta = {
  applied: boolean;
  summary: string;
  rulesApplied: string[];
  notes: string[];
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

type PlayerAdaptationExtract = {
  adaptation: TrainingAdaptation | null;
  adaptationSummary: string | null;
  teamAction: TrainingAction | null;
  exceptionAction: ExceptionAction | null;
  fatigue: FatigueClassification | null;
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function safeNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function reducedCount(current: unknown, pct: number): unknown {
  const n = safeNum(current);
  if (n == null) return current;
  return Math.max(1, Math.round(n * (1 - pct / 100)));
}

function increasedRest(current: unknown): unknown {
  const n = safeNum(current);
  if (n == null) return current;
  return Math.max(1, Math.round(n * 1.25));
}

function isObject(x: unknown): x is JsonObject {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function hasAnyPlanShape(x: unknown): boolean {
  return Array.isArray(x) || isObject(x);
}

function normToken(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function looksContactSensitive(nameLike: unknown): boolean {
  const s = normToken(nameLike);
  return (
    s.includes("sprint") ||
    s.includes("plyo") ||
    s.includes("jump") ||
    s.includes("react") ||
    s.includes("contact") ||
    s.includes("accel") ||
    s.includes("decel") ||
    s.includes("ballistic")
  );
}

function isMandatoryTitle(nameLike: unknown): boolean {
  const s = normToken(nameLike);
  return (
    s.includes("warm") ||
    s.includes("upphit") ||
    s.includes("main") ||
    s.includes("primary") ||
    s.includes("rehab") ||
    s.includes("tendon") ||
    s.includes("neural") ||
    s.includes("recovery")
  );
}

function getRecordValue(rec: JsonObject, key: string): unknown {
  return rec[key];
}

function setRecordValue(rec: JsonObject, key: string, value: unknown) {
  rec[key] = value;
}

function listFromUnknown(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function shapePlanStructure(plan: unknown, adaptation: TrainingAdaptation, notes: string[], rulesApplied: string[]): unknown {
  if (!hasAnyPlanShape(plan)) return plan;
  const shaped = clone(plan);

  const reduceVolumePct = adaptation.reduceVolumePct ?? null;
  const reduceContactsPct = adaptation.reduceContactsPct ?? null;

  function touchRule(rule: string) {
    if (!rulesApplied.includes(rule)) rulesApplied.push(rule);
  }

  function addNote(note: string) {
    if (!notes.includes(note)) notes.push(note);
  }

  function applyNumericReductions(target: JsonObject) {
    if (reduceVolumePct != null) {
      if ("rounds" in target) setRecordValue(target, "rounds", reducedCount(getRecordValue(target, "rounds"), reduceVolumePct));
      else if ("sets" in target) setRecordValue(target, "sets", reducedCount(getRecordValue(target, "sets"), reduceVolumePct));
    }

    if (adaptation.extendRest) {
      if ("rest" in target) setRecordValue(target, "rest", increasedRest(getRecordValue(target, "rest")));
      if ("rest_sec" in target) setRecordValue(target, "rest_sec", increasedRest(getRecordValue(target, "rest_sec")));
      if ("rest_seconds" in target)
        setRecordValue(target, "rest_seconds", increasedRest(getRecordValue(target, "rest_seconds")));
    }

    if (reduceContactsPct != null) {
      const hasContacts = "contacts" in target;
      const hasReps = "reps" in target;
      const contactKey = hasContacts ? "contacts" : hasReps ? "reps" : null;
      if (contactKey) {
        const nameLike =
          getRecordValue(target, "name") ??
          getRecordValue(target, "title") ??
          getRecordValue(target, "type") ??
          getRecordValue(target, "exercise") ??
          "";
        if (looksContactSensitive(nameLike)) {
          setRecordValue(target, contactKey, reducedCount(getRecordValue(target, contactKey), reduceContactsPct));
          touchRule("reduceContactsPct");
        }
      }
    }
  }

  function walk(node: unknown) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isObject(node)) return;

    applyNumericReductions(node);

    for (const key of Object.keys(node)) {
      const value = getRecordValue(node, key);
      if (Array.isArray(value) || isObject(value)) walk(value);
    }
  }

  if (reduceVolumePct != null) {
    walk(shaped);
    touchRule("reduceVolumePct");
  }

  if (adaptation.extendRest) {
    walk(shaped);
    touchRule("extendRest");
  }

  if (adaptation.simplifySession) {
    const shapedRec = isObject(shaped) ? shaped : null;
    const blockList = shapedRec ? listFromUnknown(getRecordValue(shapedRec, "blocks")) : [];
    const rootList = Array.isArray(shaped) ? shaped : [];
    const blocks = blockList.length ? blockList : rootList.length ? rootList : [];

    if (blocks.length > 2) {
      const keep: unknown[] = [];
      for (const b of blocks) {
        if (!isObject(b)) continue;
        const title = getRecordValue(b, "title") ?? getRecordValue(b, "name") ?? getRecordValue(b, "block") ?? "";
        if (keep.length < 2 || isMandatoryTitle(title)) keep.push(b);
      }
      if (shapedRec && blockList.length) setRecordValue(shapedRec, "blocks", keep);
      else if (Array.isArray(shaped)) {
        shaped.length = 0;
        shaped.push(...keep);
      }
      touchRule("simplifySession");
    } else {
      addNote("Simplify session where optional blocks exist.");
    }
  }

  if (adaptation.recoveryBias) {
    addNote("Session bias: recovery and quality over density.");
    touchRule("recoveryBias");
  }
  if (adaptation.swapBallistic) {
    addNote("Replace ballistic content with controlled alternatives.");
    touchRule("swapBallistic");
  }
  if (adaptation.protectTissue) {
    addNote(`Protect ${adaptation.protectTissue.toLowerCase()} loading.`);
    touchRule("protectTissue");
  }
  if (adaptation.addTendonReload) {
    addNote("Include tendon reload block after session.");
    touchRule("addTendonReload");
  }
  if (adaptation.addNeuralReset) {
    addNote("Include neural reset/downregulation block after session.");
    touchRule("addNeuralReset");
  }
  if (adaptation.notes?.length) {
    for (const n of adaptation.notes) addNote(n);
  }
  if (reduceContactsPct != null && !rulesApplied.includes("reduceContactsPct")) {
    addNote("Reduce sprint/plyo/reactive contacts where identifiable.");
    touchRule("reduceContactsPct");
  }

  return shaped;
}

function fallbackSummary(adaptation: TrainingAdaptation, rulesApplied: string[]): string {
  const parts: string[] = [];
  if (typeof adaptation.reduceVolumePct === "number") parts.push(`-${adaptation.reduceVolumePct}% volume`);
  if (typeof adaptation.reduceContactsPct === "number") parts.push(`-${adaptation.reduceContactsPct}% contacts`);
  if (adaptation.extendRest) parts.push("longer rest");
  if (adaptation.simplifySession) parts.push("simplified structure");
  if (adaptation.recoveryBias) parts.push("recovery bias");
  if (adaptation.swapBallistic) parts.push("replace ballistic");
  if (adaptation.protectTissue) parts.push(`protect ${adaptation.protectTissue.toLowerCase()}`);
  if (adaptation.addTendonReload) parts.push("tendon reload");
  if (adaptation.addNeuralReset) parts.push("neural reset");

  if (parts.length) return parts.join(", ");
  if (rulesApplied.length) return rulesApplied.join(", ");
  return "No adaptation";
}

function asTrainingAction(v: unknown): TrainingAction | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "FULL" || s === "REDUCED" || s === "RECOVERY") return s;
  return null;
}

function asExceptionAction(v: unknown): ExceptionAction | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "NORMAL" || s === "NO_SPRINT" || s === "REDUCE_VOLUME" || s === "RECOVERY_ONLY") return s;
  return null;
}

function asFatigueClassification(v: unknown): FatigueClassification | null {
  return isObject(v) ? (v as FatigueClassification) : null;
}

function asAdaptation(v: unknown): TrainingAdaptation | null {
  return isObject(v) ? (v as TrainingAdaptation) : null;
}

function asObject(v: unknown): JsonObject | null {
  return isObject(v) ? v : null;
}

function getExceptionByPlayer(exceptions: unknown, playerId: string): JsonObject | null {
  if (!Array.isArray(exceptions)) return null;
  for (const ex of exceptions) {
    const rec = asObject(ex);
    if (!rec) continue;
    if (String(getRecordValue(rec, "player_id") ?? "") === playerId) return rec;
  }
  return null;
}

export function extractPlayerAdaptation(input: {
  baseRow?: unknown;
  inputs?: unknown;
  playerId: string;
}): PlayerAdaptationExtract {
  const base = asObject(input.baseRow) ?? {};
  const payload = asObject(input.inputs) ?? {};
  const playerId = String(input.playerId ?? "");

  const directAdaptation = asAdaptation(getRecordValue(base, "adaptation")) ?? asAdaptation(getRecordValue(payload, "adaptation"));
  const directSummary = String(getRecordValue(base, "adaptation_summary") ?? getRecordValue(payload, "adaptation_summary") ?? "").trim() || null;

  const candidates: JsonObject[] = [];
  const pDecision = asObject(getRecordValue(payload, "decision"));
  const pStage4 = asObject(getRecordValue(payload, "stage4"));
  const pResult = asObject(getRecordValue(payload, "result"));
  candidates.push(payload);
  if (pDecision) candidates.push(pDecision);
  if (pStage4) candidates.push(pStage4);
  if (pResult) candidates.push(pResult);

  let pickedException: JsonObject | null = null;
  for (const c of candidates) {
    const ex = getExceptionByPlayer(getRecordValue(c, "exceptions"), playerId);
    if (ex) {
      pickedException = ex;
      break;
    }

    const byPlayer = asObject(getRecordValue(c, "exception_by_player"));
    if (byPlayer) {
      const candidate = asObject(getRecordValue(byPlayer, playerId));
      if (candidate) {
        pickedException = candidate;
        break;
      }
    }
  }

  const adaptation = directAdaptation ?? asAdaptation(getRecordValue(pickedException ?? {}, "adaptation"));
  const exceptionSummary = String(getRecordValue(pickedException ?? {}, "adaptation_summary") ?? "").trim() || null;
  const adaptationSummary = directSummary ?? exceptionSummary ?? null;

  const teamAction =
    asTrainingAction(getRecordValue(base, "team_action")) ??
    asTrainingAction(getRecordValue(payload, "team_action")) ??
    asTrainingAction(getRecordValue(pDecision ?? {}, "team_action")) ??
    null;
  const exceptionAction =
    asExceptionAction(getRecordValue(base, "exception_action")) ??
    asExceptionAction(getRecordValue(pickedException ?? {}, "action")) ??
    null;
  const fatigue =
    asFatigueClassification(getRecordValue(base, "fatigue")) ??
    asFatigueClassification(getRecordValue(payload, "fatigue")) ??
    asFatigueClassification(getRecordValue(pickedException ?? {}, "fatigue")) ??
    null;

  return {
    adaptation,
    adaptationSummary,
    teamAction,
    exceptionAction,
    fatigue,
  };
}

export function applyAdaptationToPlan(input: ApplyAdaptationInput): ApplyAdaptationResult {
  const basePlan = input.basePlan;
  const adaptation = input.adaptation ?? null;

  if (!adaptation || !hasAnyPlanShape(basePlan)) {
    return {
      shapedPlan: basePlan,
      adaptive_meta: {
        applied: false,
        summary: input.adaptationSummary?.trim() || "No adaptation",
        rulesApplied: [],
        notes: [],
      },
    };
  }

  const rulesApplied: string[] = [];
  const notes: string[] = [];
  const shapedPlan = shapePlanStructure(basePlan, adaptation, notes, rulesApplied);
  const summary = input.adaptationSummary?.trim() || fallbackSummary(adaptation, rulesApplied);

  return {
    shapedPlan,
    adaptive_meta: {
      applied: rulesApplied.length > 0,
      summary,
      rulesApplied,
      notes,
    },
  };
}
