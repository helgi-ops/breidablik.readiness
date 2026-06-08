/**
 * src/lib/trainer/goalRecommend
 *
 * Maps a PT client's training goals (trainer-ticked) to a ranked recommendation
 * of the programmes already in the trainer's library. Deterministic and
 * explainable: each recommendation carries the reasons it scored.
 *
 * Programme "qualities" are inferred from the template name/notes keywords
 * (contrast, french, preparatory, explosive, vertical/jump, …) so it works on
 * the existing strength templates without a structure fetch.
 */

export type GoalId =
  | "strength" | "power" | "speed" | "agility" | "hypertrophy" | "conditioning" | "injury_prevention" | "keep_lean";

export type Goal = { id: GoalId; label: { EN: string; IS: string }; modifier?: boolean };

export const GOALS: Goal[] = [
  { id: "strength", label: { EN: "Max strength", IS: "Hámarksstyrkur" } },
  { id: "power", label: { EN: "Explosive power / RFD", IS: "Sprengikraftur" } },
  { id: "speed", label: { EN: "Speed / sprint", IS: "Hraði / spretthraði" } },
  { id: "agility", label: { EN: "Agility / change of direction", IS: "Snerpa / stefnubreytingar" } },
  { id: "hypertrophy", label: { EN: "Muscle mass", IS: "Vöðvamassi" } },
  { id: "conditioning", label: { EN: "Conditioning / work capacity", IS: "Þol / úthald" } },
  { id: "injury_prevention", label: { EN: "Robustness / injury prevention", IS: "Meiðslavarnir" } },
  { id: "keep_lean", label: { EN: "Stay lean / light", IS: "Halda léttleika" }, modifier: true },
];

type Quality = "strength" | "power" | "speed" | "agility" | "hypertrophy" | "conditioning" | "injury";

/** How strongly each goal wants each quality. */
const GOAL_WANTS: Record<Exclude<GoalId, "keep_lean">, Partial<Record<Quality, number>>> = {
  strength: { strength: 3, hypertrophy: 1 },
  power: { power: 3 },
  speed: { speed: 3, power: 1 },
  agility: { agility: 3, power: 1 },
  hypertrophy: { hypertrophy: 3, strength: 1 },
  conditioning: { conditioning: 3 },
  injury_prevention: { injury: 3, strength: 1 },
};

export type TemplateLite = {
  id: string;
  name: string;
  notes?: string | null;
  plan_type?: string | null;
  sessions_per_week?: number | null;
  duration_weeks?: number | null;
  /** Which library the candidate comes from. "custom" = the trainer's own
   *  training_plan_templates (assigned via PlanAssigner); "starter" = a
   *  ready-made pt_explosive starter programme (assigned by programme_key +
   *  level). Drives which assign flow the "Use this" CTA uses. */
  source?: "custom" | "starter";
  /** Starter only: the programme_key + available levels for direct assign. */
  programmeKey?: string;
  levels?: string[];
};

/** Infer a programme's quality vector from its name/notes keywords. */
function programmeQualities(t: TemplateLite): { q: Partial<Record<Quality, number>>; family: string } {
  const s = `${t.name} ${t.notes ?? ""}`.toLowerCase();
  // Order matters: specific method/quality keywords are checked before the
  // generic "base" preparatory fallback so e.g. "Conditioning Base" is read as
  // conditioning, not as a base-strength block.
  if (s.includes("french")) return { family: "French contrast", q: { power: 3, speed: 2, agility: 2, strength: 1 } };
  if (s.includes("contrast")) return { family: "Contrast", q: { strength: 2, power: 2, agility: 1, speed: 1 } };
  if (s.includes("vertical") || s.includes("jump")) return { family: "Jump / plyometric", q: { power: 3, speed: 1, agility: 1 } };
  if (s.includes("condition") || s.includes("endurance") || s.includes("aerobic")) return { family: "Conditioning", q: { conditioning: 3 } };
  if (s.includes("explosive") || s.includes("power") || s.includes("velocity") || s.includes("vbt")) return { family: "Explosive power", q: { power: 3, speed: 2, agility: 1 } };
  if (s.includes("hypertroph") || s.includes("mass")) return { family: "Hypertrophy", q: { hypertrophy: 3, strength: 1 } };
  if (s.includes("prepar") || s.includes("base") || s.includes("gpp") || s.includes("foundation")) return { family: "Preparatory / base", q: { strength: 2, hypertrophy: 2, injury: 1 } };
  return { family: "General strength", q: { strength: 1 } };
}

const QUALITY_LABEL: Record<Quality, string> = {
  strength: "strength", power: "power", speed: "speed", agility: "agility",
  hypertrophy: "muscle mass", conditioning: "conditioning", injury: "robustness",
};

export type Experience = "beginner" | "intermediate" | "advanced";

/** Training-method demand tier (1 = foundational/safe for everyone … 3 =
 *  advanced, high neural/technical demand needing a solid base). Drives the
 *  age/experience appropriateness gate. */
const FAMILY_TIER: Record<string, number> = {
  "Preparatory / base": 1,
  "Hypertrophy": 1,
  "Conditioning": 1,
  "General strength": 1,
  "Jump / plyometric": 2,
  "Contrast": 2,
  "Explosive power": 2,
  "French contrast": 3,
};
function familyTier(family: string): number {
  return FAMILY_TIER[family] ?? 1;
}

/** The highest method tier appropriate for a client, from age + experience.
 *  Unknown values don't restrict. <18 caps at intermediate (no max-CNS
 *  complexes); <16 caps at foundational. Beginner caps at foundational. */
export function allowedTier(opts?: { age?: number | null; experience?: Experience | null }): number {
  const expTier = opts?.experience === "beginner" ? 1 : opts?.experience === "intermediate" ? 2 : opts?.experience === "advanced" ? 3 : 3;
  const age = opts?.age ?? null;
  const ageCap = age == null ? 3 : age < 16 ? 1 : age < 18 ? 2 : 3;
  return Math.min(expTier, ageCap);
}

export type Recommendation = {
  template: TemplateLite;
  score: number;
  family: string;
  reasons: string[];
  /** Method demand tier (1–3). */
  tier: number;
  /** True when this programme's method is above the client's allowed tier. */
  blocked: boolean;
  /** Why it's blocked (bilingual), present only when blocked. */
  blockReason?: { EN: string; IS: string };
};

/**
 * Rank the trainer's templates against the selected goals.
 *
 * If age/experience are supplied, programmes whose method demand exceeds what's
 * appropriate (e.g. French Contrast for an under-18 beginner) are flagged
 * `blocked` with a reason — never silently recommended. Returns blocked recs
 * too so the UI can explain why they're held back; non-blocked come first.
 *
 * @returns recommendations sorted best-first (score > 0 only).
 */
export function recommendProgrammes(
  goalIds: GoalId[],
  templates: TemplateLite[],
  opts?: { age?: number | null; experience?: Experience | null },
): Recommendation[] {
  const active = goalIds.filter((g) => g !== "keep_lean");
  const keepLean = goalIds.includes("keep_lean");
  if (active.length === 0) return [];
  const maxTier = allowedTier(opts);

  const recs = templates.map((t) => {
    const { q, family } = programmeQualities(t);
    let score = 0;
    const covered: Record<string, number> = {};
    for (const g of active) {
      const wants = GOAL_WANTS[g as Exclude<GoalId, "keep_lean">] ?? {};
      for (const [qual, w] of Object.entries(wants) as Array<[Quality, number]>) {
        let contribution = w * (q[qual] ?? 0);
        if (keepLean && qual === "hypertrophy") contribution *= 0.4; // de-emphasise mass when staying lean
        if (contribution > 0) {
          score += contribution;
          covered[qual] = (covered[qual] ?? 0) + contribution;
        }
      }
    }
    // Build human reasons from the qualities that contributed most.
    const top = Object.entries(covered).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([qq]) => QUALITY_LABEL[qq as Quality]);
    const reasons: string[] = [];
    if (top.length) reasons.push(`Trains ${top.join(", ")} — a strong fit for the selected goals.`);
    if (keepLean && (q.hypertrophy ?? 0) >= 2) reasons.push("Note: leans toward muscle mass — pair with controlled volume to stay lean.");
    if (keepLean && (q.hypertrophy ?? 0) < 2) reasons.push("Power/speed emphasis keeps the athlete lean and fast.");
    const tier = familyTier(family);
    const blocked = tier > maxTier;
    const blockReason = blocked
      ? {
          EN: `${family} is an advanced method — needs a solid strength base and training maturity; not suited to this client's age/experience.`,
          IS: `${family} er háþróuð aðferð — þarf góðan styrkgrunn og reynslu; hentar ekki aldri/reynslu þessa viðskiptavinar.`,
        }
      : undefined;
    return { template: t, score: Math.round(score * 10) / 10, family, reasons, tier, blocked, blockReason };
  }).filter((r) => r.score > 0)
    // Allowed programmes first (best score within each), blocked ones after.
    .sort((a, b) => (a.blocked === b.blocked ? b.score - a.score : a.blocked ? 1 : -1));

  return recs;
}
