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

export type Recommendation = { template: TemplateLite; score: number; family: string; reasons: string[] };

/**
 * Rank the trainer's templates against the selected goals.
 * @returns recommendations sorted best-first (score > 0 only).
 */
export function recommendProgrammes(goalIds: GoalId[], templates: TemplateLite[]): Recommendation[] {
  const active = goalIds.filter((g) => g !== "keep_lean");
  const keepLean = goalIds.includes("keep_lean");
  if (active.length === 0) return [];

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
    return { template: t, score: Math.round(score * 10) / 10, family, reasons };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

  return recs;
}
