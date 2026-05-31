/**
 * Build-time Program Auditor — movement-pattern balance.
 *
 * Reads a PlanBuilder `weeks` structure and reports how training volume (working
 * sets) is distributed across the six coach-readable movement families, plus the
 * push:pull and knee:hip ratios and single-leg coverage. It then raises plain
 * "balance flags", each with a concrete fix (the counterfactual the manifesto
 * asks for): "No hinge work → add an RDL / hip thrust".
 *
 * This is uniquely possible because every library exercise carries a
 * movement_family / movement_pattern tag (see exercise_library). Rules decide,
 * the UI explains — no AI needed here, just the coach's own program audited
 * against itself before it is ever assigned.
 *
 * Volume unit = number of working sets (robust across kg / %1RM / velocity / RPE
 * load types, which can't be summed into a single tonnage at template time).
 */

export type MovementFamily = "squat" | "hinge" | "push" | "pull" | "core" | "carry";

export const AUDIT_FAMILIES: MovementFamily[] = ["squat", "hinge", "push", "pull", "core", "carry"];

/** The major families a balanced strength plan is expected to train. */
const MAJOR_FAMILIES: MovementFamily[] = ["squat", "hinge", "push", "pull"];

export type AuditExercise = {
  exerciseId?: string;
  sets?: number;
  movementFamily?: MovementFamily | string | null;
  isBilateral?: boolean | null;
};
export type AuditGroup = { exercises: AuditExercise[] };
export type AuditSession = { groups: AuditGroup[] };
export type AuditWeek = { week?: number; sessions: AuditSession[] };

export type AuditFlagCode =
  | "missing_family"
  | "push_heavy"
  | "pull_heavy"
  | "knee_heavy"
  | "no_core"
  | "low_unilateral"
  | "volume_spike";

export type AuditFlag = {
  code: AuditFlagCode;
  severity: "warn" | "info";
  /** Family the flag is about (for missing_family). */
  family?: MovementFamily;
  /** Numeric context (ratio or percentage), already rounded. */
  value?: number;
  /** Week number the flag is about (for volume_spike). */
  week?: number;
};

/** Week-over-week set-volume increase (fraction) above which we flag a spike.
 *  Deterministic, template-level proxy for the Gabbett "don't ramp load too
 *  fast" guardrail — no athlete data required. */
export const VOLUME_SPIKE_THRESHOLD = 1.3;

export type ProgramAudit = {
  /** Total working sets across all filled slots. */
  totalSets: number;
  /** Working sets from exercises that carry a movement family. */
  taggedSets: number;
  /** Working sets per movement family. */
  byFamily: Record<MovementFamily, number>;
  /** push ÷ pull (sets). null if no pull and no push. Infinity if push but no pull. */
  pushPullRatio: number | null;
  /** squat(knee) ÷ hinge(hip). Same null/Infinity rules. */
  kneeHipRatio: number | null;
  unilateralSets: number;
  /** Unilateral share of tagged sets (0–100). */
  unilateralPct: number;
  /** Total working sets per week, in order (load-progression trend). */
  weeklyVolume: number[];
  flags: AuditFlag[];
};

function zeroByFamily(): Record<MovementFamily, number> {
  return { squat: 0, hinge: 0, push: 0, pull: 0, core: 0, carry: 0 };
}

// ── Free-text → movement family ────────────────────────────────────────────
// For builders (e.g. custom-templates) where exercises are free-text lines, not
// library FKs. Ordered most-specific → least; first match wins. Covers every
// curated and library exercise name in the system. Deterministic, no network.

const FAMILY_RULES: Array<[RegExp, MovementFamily]> = [
  // Specific conflicts resolved first (these names also contain "press"/"curl").
  [/pallof/i, "core"],
  [/leg press/i, "squat"],
  // Hinge / hip-dominant (incl. Olympic pulls) — checked before "pull" so
  // "Mid-Thigh Pull" / "Clean Pull" don't fall into the pull family.
  [/(deadlift|romanian|\brdl\b|\bdl\b|leg curl|hip[ -]?thrust|glute bridge|good morning|kettlebell|\bswing\b|nordic|hamstring|back extension|hang[ -]?(power )?clean|power clean|\bclean\b|snatch|mid[ -]?thigh pull|clean pull|snatch pull|hip[ -]?hinge)/i, "hinge"],
  // Pull
  [/(pull[ -]?up|pullup|chin[ -]?up|lat[ -]?pull|pulldown|face pull|inverted row|seated (cable )?row|bent[ -]?over row|t[ -]?bar row|\brow\b|biceps curl|\bcurl\b)/i, "pull"],
  // Push
  [/(bench|push[ -]?press|overhead|shoulder press|military|\bpress\b|push[ -]?up|pushup|press[ -]?up|\bdip\b|\bthrow\b|med[ -]?ball slam|\bslam\b)/i, "push"],
  // Knee-dominant (incl. lower-body plyometrics)
  [/(squat|lunge|step[ -]?up|leg press|leg extension|pistol|split squat|box jump|depth jump|broad jump|hurdle|bound|reactive hop|\bhop\b|\bjump\b|wall sit|knee extension|rfess)/i, "squat"],
  // Core / anti- / rotation
  [/(plank|pallof|dead bug|ab wheel|rollout|woodchop|russian twist|leg raise|anti[ -]?rotation|rotational|\bcore\b)/i, "core"],
  // Loaded carries
  [/(farmer|suitcase|loaded carry|\bcarry\b)/i, "carry"],
];

/** A free-text exercise name → its movement family, or null if unrecognised. */
export function resolveFamilyFromName(name: string): MovementFamily | null {
  const n = String(name ?? "").toLowerCase();
  for (const [re, fam] of FAMILY_RULES) if (re.test(n)) return fam;
  return null;
}

/** Heuristic: is this a single-leg / single-arm movement? */
function isUnilateralName(name: string): boolean {
  return /(\/\s*(side|leg|hlið)|\bsplit\b|bulgarian|single[ -]?leg|single[ -]?arm|pistol|step[ -]?up|\blunge\b|rfess|\/hlið)/i.test(name);
}

/** Parse one free-text exercise line ("Back Squat · 3–4 sets × 3–5 · …"). */
export function parseAuditLine(line: string): { name: string; family: MovementFamily | null; sets: number; unilateral: boolean } {
  const name = String(line ?? "").split("·")[0].trim();
  const family = resolveFamilyFromName(name);
  // First number in an "X sets" token; default 1 so the family still registers.
  const m = String(line ?? "").match(/(\d+)\s*(?:[–-]\s*\d+)?\s*sets?\b/i);
  const sets = m ? Number(m[1]) : 1;
  return { name, family, sets: sets > 0 ? sets : 1, unilateral: isUnilateralName(name) };
}

/** Audit a flat list of free-text exercise lines (custom-templates blocks). */
export function auditLines(lines: Array<string | null | undefined>): ProgramAudit {
  const exercises: AuditExercise[] = [];
  for (const raw of lines ?? []) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    const { family, sets, unilateral } = parseAuditLine(line);
    if (!family) continue;
    exercises.push({ exerciseId: "line", sets, movementFamily: family, isBilateral: unilateral ? false : null });
  }
  return auditWeeks([{ sessions: [{ groups: [{ exercises }] }] }]);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ratio(a: number, b: number): number | null {
  if (b > 0) return a / b;
  return a > 0 ? Infinity : null;
}

/** Audit a PlanBuilder weeks structure for movement-pattern balance. */
export function auditWeeks(weeks: AuditWeek[] | null | undefined): ProgramAudit {
  const byFamily = zeroByFamily();
  let totalSets = 0;
  let taggedSets = 0;
  let unilateralSets = 0;
  const weeklyVolume: number[] = [];

  for (const w of weeks ?? []) {
    let weekSets = 0;
    for (const s of w.sessions ?? []) {
      for (const g of s.groups ?? []) {
        for (const ex of g.exercises ?? []) {
          if (!ex.exerciseId) continue; // empty slot
          const sets = Number(ex.sets);
          const n = Number.isFinite(sets) && sets > 0 ? sets : 0;
          totalSets += n;
          weekSets += n;
          const fam = (ex.movementFamily ?? "") as MovementFamily;
          if (AUDIT_FAMILIES.includes(fam)) {
            byFamily[fam] += n;
            taggedSets += n;
            if (ex.isBilateral === false) unilateralSets += n;
          }
        }
      }
    }
    weeklyVolume.push(weekSets);
  }

  const unilateralPct = taggedSets > 0 ? Math.round((unilateralSets / taggedSets) * 100) : 0;
  const flags: AuditFlag[] = [];

  // Only audit balance once there is something to balance.
  if (taggedSets > 0) {
    for (const fam of MAJOR_FAMILIES) {
      if (byFamily[fam] === 0) flags.push({ code: "missing_family", severity: "warn", family: fam });
    }
    if (byFamily.push > 0 && byFamily.pull > 0) {
      const r = byFamily.push / byFamily.pull;
      if (r >= 2) flags.push({ code: "push_heavy", severity: "warn", value: round1(r) });
      else if (r <= 0.5) flags.push({ code: "pull_heavy", severity: "info", value: round1(1 / r) });
    }
    if (byFamily.squat > 0 && byFamily.hinge > 0) {
      const r = byFamily.squat / byFamily.hinge;
      if (r >= 2) flags.push({ code: "knee_heavy", severity: "warn", value: round1(r) });
    }
    if (byFamily.core === 0) flags.push({ code: "no_core", severity: "info" });
    if (unilateralPct < 15) flags.push({ code: "low_unilateral", severity: "info", value: unilateralPct });
  }

  // Load-progression guardrail: flag any week that ramps total set-volume too
  // steeply vs the week before (deterministic Gabbett-style spike check).
  for (let i = 1; i < weeklyVolume.length; i++) {
    const prev = weeklyVolume[i - 1];
    const cur = weeklyVolume[i];
    if (prev > 0 && cur / prev >= VOLUME_SPIKE_THRESHOLD) {
      flags.push({
        code: "volume_spike",
        severity: "warn",
        value: Math.round((cur / prev - 1) * 100),
        week: (weeks?.[i]?.week ?? i + 1),
      });
    }
  }

  return {
    totalSets,
    taggedSets,
    byFamily,
    pushPullRatio: ratio(byFamily.push, byFamily.pull),
    kneeHipRatio: ratio(byFamily.squat, byFamily.hinge),
    unilateralSets,
    unilateralPct,
    weeklyVolume,
    flags,
  };
}
