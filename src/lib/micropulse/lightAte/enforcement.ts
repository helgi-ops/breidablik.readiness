import type { LightAteModifiers } from "./types";

export type EnforcedSessionState = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type EnforcedSessionMode = "full" | "modified" | "recovery" | "pending";

export type EnforcedSessionPlan = {
  state: EnforcedSessionState;
  sessionMode: EnforcedSessionMode;
  adjustments: {
    setReduction?: number;
    velocityLossCap?: number | null;
    extraRestSeconds?: number;
    disablePlyo?: boolean;
    disableBallistic?: boolean;
    forceRecoveryBlocks?: boolean;
  };
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function decrementSetCountInText(line: string, by: number): string {
  if (by <= 0) return line;

  let updated = line.replace(/(\d+)\s*[x×]\s*(\d+)/i, (_, sets, reps) => {
    const nextSets = Math.max(1, Number(sets) - by);
    return `${nextSets}x${reps}`;
  });

  updated = updated.replace(/(\d+)\s*sets?/i, (_, sets) => {
    const nextSets = Math.max(1, Number(sets) - by);
    return `${nextSets} set${nextSets === 1 ? "" : "s"}`;
  });

  return updated;
}

function bumpRestInText(line: string, extraSeconds: number): string {
  if (extraSeconds <= 0) return line;

  const secMatch = line.match(/(rest|hvíld)\s*(\d+)\s*s(ec)?/i);
  if (secMatch) {
    const oldSec = Number(secMatch[2]);
    const nextSec = oldSec + extraSeconds;
    return line.replace(secMatch[0], `${secMatch[1]} ${nextSec}s`);
  }

  if (/(rest|hvíld)/i.test(line)) {
    return `${line} (+${extraSeconds}s)`;
  }

  return line;
}

function capVelocityLossInText(line: string, cap: number): string {
  if (!Number.isFinite(cap) || cap <= 0) return line;
  const capPct = Math.round(cap * 100);
  if (/vl\s*[<≤=]/i.test(line)) {
    return line.replace(/vl\s*[<≤=]\s*\d+%/i, `VL ≤ ${capPct}%`);
  }
  return line;
}

function isHighOutputLabel(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("ballistic") ||
    t.includes("plyo") ||
    t.includes("explosive") ||
    t.includes("contrast") ||
    t.includes("primer")
  );
}

function isHardMainForceLabel(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("main force") || t.includes("heavy force");
}

function shouldKeepBlock(title: string, plan: EnforcedSessionPlan): boolean {
  if (plan.sessionMode === "pending") return false;

  if (plan.adjustments.forceRecoveryBlocks) {
    const t = title.toLowerCase();
    if (isHighOutputLabel(t) || isHardMainForceLabel(t)) return false;
    if (t.includes("recovery") || t.includes("reset") || t.includes("warmup") || t.includes("iso") || t.includes("mobility")) return true;
    return false;
  }

  if (plan.adjustments.disableBallistic && isHighOutputLabel(title)) return false;
  if (plan.adjustments.disablePlyo && title.toLowerCase().includes("plyo")) return false;
  return true;
}

function reduceNumericSets(value: unknown, by: number): number | unknown {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.max(1, Math.round(n) - by);
}

function applyAdjustmentsToLine(line: string, plan: EnforcedSessionPlan): string {
  const setReduction = plan.adjustments.setReduction ?? 0;
  const extraRest = plan.adjustments.extraRestSeconds ?? 0;
  const vlCap = plan.adjustments.velocityLossCap ?? null;
  let next = decrementSetCountInText(line, setReduction);
  next = bumpRestInText(next, extraRest);
  if (typeof vlCap === "number") next = capVelocityLossInText(next, vlCap);
  return next;
}

function buildPendingStructure() {
  return [
    {
      block: "Check-In Required",
      items: ["Complete readiness check before training to unlock today's plan."],
    },
  ];
}

export function buildEnforcedSessionPlan(args: {
  ateState?: string | null;
  modifiers?: LightAteModifiers | null;
  fallbackSessionMode?: EnforcedSessionMode | null;
  hasCheckIn?: boolean;
}): EnforcedSessionPlan {
  const rawState = String(args.ateState ?? "").trim().toUpperCase();
  const state: EnforcedSessionState =
    rawState === "RED" ? "RED" : rawState === "YELLOW" ? "YELLOW" : rawState === "GREEN" || rawState === "GREEN_PLUS" ? "GREEN" : "GRAY";

  let sessionMode: EnforcedSessionMode =
    state === "GREEN" ? "full" : state === "YELLOW" ? "modified" : state === "RED" ? "recovery" : "pending";
  if (state === "GRAY" && args.fallbackSessionMode) sessionMode = args.fallbackSessionMode;
  if (!args.hasCheckIn && state === "GRAY") sessionMode = "pending";

  const modifiers = args.modifiers ?? null;
  const setReduction = clampInt(toPositiveNumber(modifiers?.reduceSetsBy) ?? 0, 0, 1);
  const extraRestSeconds = clampInt(toPositiveNumber(modifiers?.extendRestSeconds) ?? 0, 0, 60);

  const adjustments: EnforcedSessionPlan["adjustments"] = {
    setReduction: setReduction || undefined,
    velocityLossCap: typeof modifiers?.velocityLossCap === "number" ? modifiers.velocityLossCap : null,
    extraRestSeconds: extraRestSeconds || undefined,
    disablePlyo: modifiers?.disableContrast === true || sessionMode === "recovery",
    disableBallistic: modifiers?.replaceBallisticPrimer === true || sessionMode === "recovery",
    forceRecoveryBlocks: sessionMode === "recovery",
  };

  return {
    state,
    sessionMode,
    adjustments,
  };
}

export function enforceLegacyStructureBlocks(structure: unknown, plan: EnforcedSessionPlan): unknown {
  if (!Array.isArray(structure)) return structure;
  if (plan.sessionMode === "pending") return buildPendingStructure();

  const nextBlocks = structure
    .map((raw) => (raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : null))
    .filter((b): b is Record<string, unknown> => !!b)
    .filter((b) => shouldKeepBlock(String(b.block ?? b.title ?? ""), plan))
    .map((b) => {
      const title = String(b.block ?? b.title ?? "");
      const rawItems = Array.isArray(b.items) ? b.items : [];
      const items = rawItems.map((item) => applyAdjustmentsToLine(String(item), plan));
      if (items.length === 0) {
        b.items = ["Follow controlled execution and coach cues."];
      } else {
        b.items = items;
      }
      b.block = title;
      return b;
    });

  return nextBlocks.length ? nextBlocks : buildPendingStructure();
}

export function enforceTemplateStructureBlocks(structure: unknown, plan: EnforcedSessionPlan): unknown {
  if (!structure || typeof structure !== "object") return structure;
  const root = structure as Record<string, unknown>;
  if (!Array.isArray(root.blocks)) return structure;
  if (plan.sessionMode === "pending") {
    return {
      ...root,
      blocks: [
        {
          title: "Check-In Required",
          exercises: [{ name: "Complete readiness check before training." }],
        },
      ],
    };
  }

  const setReduction = plan.adjustments.setReduction ?? 0;
  const extraRestSeconds = plan.adjustments.extraRestSeconds ?? 0;
  const vlCap = plan.adjustments.velocityLossCap ?? null;

  const blocks = root.blocks
    .map((raw) => (raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : null))
    .filter((b): b is Record<string, unknown> => !!b)
    .filter((b) => shouldKeepBlock(String(b.title ?? b.type ?? b.block ?? ""), plan))
    .map((b) => {
      if (b.protocol && typeof b.protocol === "object") {
        const protocol = { ...(b.protocol as Record<string, unknown>) };
        if (setReduction > 0) protocol.sets = reduceNumericSets(protocol.sets, setReduction);
        if (extraRestSeconds > 0) {
          const currentRest = Number(protocol.rest_seconds);
          if (Number.isFinite(currentRest)) protocol.rest_seconds = currentRest + extraRestSeconds;
        }
        b.protocol = protocol;
      }

      if (Array.isArray(b.exercises)) {
        b.exercises = b.exercises
          .map((exercise) => (exercise && typeof exercise === "object" ? { ...(exercise as Record<string, unknown>) } : null))
          .filter((exercise): exercise is Record<string, unknown> => !!exercise)
          .filter((exercise) => {
            const name = String(exercise.name ?? "");
            if (plan.adjustments.disableBallistic && isHighOutputLabel(name)) return false;
            if (plan.adjustments.disablePlyo && name.toLowerCase().includes("plyo")) return false;
            return true;
          })
          .map((exercise) => {
            if (setReduction > 0) exercise.sets = reduceNumericSets(exercise.sets, setReduction);

            const restSec = Number(exercise.rest_seconds ?? exercise.rest_sec);
            if (extraRestSeconds > 0 && Number.isFinite(restSec)) {
              exercise.rest_seconds = restSec + extraRestSeconds;
            }

            if (typeof vlCap === "number") {
              const vl = Number(exercise.vl_threshold);
              if (Number.isFinite(vl)) exercise.vl_threshold = Math.min(vl, vlCap);
            }

            return exercise;
          });
      }

      return b;
    });

  return {
    ...root,
    blocks,
  };
}
