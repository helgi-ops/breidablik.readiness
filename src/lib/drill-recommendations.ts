/**
 * Drill Format Recommendations
 *
 * Byggt á:
 *   Lacome M, Simpson BM, Cholley Y, Lambert P, Buchheit M.
 *   Small-Sided Games in elite soccer: Does one size fits all?
 *   Int J Sports Physiol Perform (2018).
 *
 *   López-Fernández J et al. Pitch Size and Game Surface in Different
 *   Small-Sided Games. J Strength Cond Res 33(3):831-838 (2019).
 *
 * Lacome (PSG) sýndi að SSG formattin hafa mjög mismunandi samanburð
 * við leik-álag:
 *   - 4v4 (25×30, ~70 m²/leikm): MechW hærri en leikur, TD/HS lægri
 *     → strength/mechanical focus, stuttar bouts (<5 mín, 90-120s hvíld)
 *   - 6v6 (30×40, ~87 m²): svipað HS, MechW hærri fyrir CD
 *     → aerobic, lengri (>8 mín), overloadar varnarmenn
 *   - 8v8 (40×40, ~106 m²): lægra TD/HS en leikur
 *     → match-like stimulus (>15 mín)
 *   - 10v10 (102×67, ~311 m²): svipað TD/HS og leikur
 *     → endurance/locomotor, lengsta format
 *
 * López-Fernández sýndi að pitch-area plateau er ~75 m²/leikm í 4v4.
 * Að stækka úr 600→800 m² (75→100 m²/leikm) gaf EKKI aukið álag.
 */

export type FormatGoal = "strength" | "aerobic" | "match_like" | "endurance" | "technical" | null;
export type PositionImpact = "overload" | "underload" | "neutral";

export interface FormatRecommendation {
  /** Auðkennt format (e.g. "4v4") eða null */
  format: string | null;
  /** Main fitness goal sem þetta format hentar best */
  goal: FormatGoal;
  goalLabel: string;
  /** Tillaga um bout-lengd og hvíld */
  boutGuidance: string | null;
  /** Position-specific emphasis */
  positionEmphasis: Record<"CD" | "WD" | "CM" | "AM" | "ST", PositionImpact> | null;
  /** Position-emphasis í styttri texta (t.d. "Overloadar CD · Underloadar CM") */
  positionSummary: string | null;
  /** Varnarorð */
  warnings: string[];
  /** Tilvitnun */
  citation: string;
}

/** Reiknar "per team" stærð frá heildar leikmannafjölda */
function perTeam(totalPlayers: number): number {
  return Math.round(totalPlayers / 2);
}

/** Finnur nafn á format, t.d. 4v4, 6v6, 10v10 */
function formatLabel(totalPlayers: number): string {
  const pt = perTeam(totalPlayers);
  return `${pt}v${pt}`;
}

function emphasisSummary(
  emphasis: Record<"CD" | "WD" | "CM" | "AM" | "ST", PositionImpact> | null
): string | null {
  if (!emphasis) return null;
  const over: string[] = [];
  const under: string[] = [];
  for (const [pos, imp] of Object.entries(emphasis)) {
    if (imp === "overload") over.push(pos);
    if (imp === "underload") under.push(pos);
  }
  const parts: string[] = [];
  if (over.length) parts.push(`Overloadar ${over.join("/")}`);
  if (under.length) parts.push(`Underloadar ${under.join("/")}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Skilar ráðleggingum fyrir tiltekið SSG format.
 */
export function getFormatRecommendation(
  totalPlayers: number | null | undefined,
  areaPerPlayerM2: number | null | undefined
): FormatRecommendation | null {
  if (!totalPlayers || totalPlayers < 2) return null;
  const pt = perTeam(totalPlayers);
  const warnings: string[] = [];

  // Pitch-size plateau warning (López-Fernández)
  if (areaPerPlayerM2 != null && areaPerPlayerM2 > 110 && pt <= 5) {
    warnings.push(
      "Völlur er stór miðað við leikmannafjölda — intensity getur lækkað aftur ef hann er of stór (López-Fernández et al.)"
    );
  }
  if (areaPerPlayerM2 != null && areaPerPlayerM2 < 50 && pt >= 3) {
    warnings.push(
      "Völlur er mjög þröngur — hátt mechanical álag en takmarkað HSR"
    );
  }

  let rec: Omit<FormatRecommendation, "warnings" | "citation" | "format"> | null = null;

  if (pt <= 4) {
    // 2v2, 3v3, 4v4 → mechanical/strength
    rec = {
      goal: "strength",
      goalLabel: "Strength / Mechanical",
      boutGuidance:
        "3-5 mín bouts með 90-120s hvíld fyrir peak mechanical stimulus",
      positionEmphasis: {
        CD: "overload",
        WD: "overload",
        CM: "overload",
        AM: "overload",
        ST: "overload",
      },
      positionSummary: "Mechanical overload fyrir allar positionir (stuttar bouts)",
    };
  } else if (pt >= 5 && pt <= 6) {
    // 5v5, 6v6 → aerobic, position-specific
    rec = {
      goal: "aerobic",
      goalLabel: "Aerobic",
      boutGuidance:
        ">8 mín bouts fyrir endurance stimulus, shorter fyrir CD mechanical overload",
      positionEmphasis: {
        CD: "overload",
        WD: "neutral",
        CM: "underload",
        AM: "neutral",
        ST: "neutral",
      },
      positionSummary: "Overloadar CD (MechW) · Underloadar CM",
    };
  } else if (pt >= 7 && pt <= 8) {
    // 7v7, 8v8 → match-like, position-specific
    rec = {
      goal: "match_like",
      goalLabel: "Match-like",
      boutGuidance: "10-15 mín bouts fyrir match-specific stimulus",
      positionEmphasis: {
        CD: "overload",
        WD: "neutral",
        CM: "underload",
        AM: "neutral",
        ST: "neutral",
      },
      positionSummary: "Overloadar CD (HS) · Underloadar CM (MechW)",
    };
  } else if (pt >= 9) {
    // 9v9, 10v10, 11v11 → endurance/locomotor
    rec = {
      goal: "endurance",
      goalLabel: "Endurance / Locomotor",
      boutGuidance:
        "Lengri bouts (15+ mín) fyrir volume-oriented TD/HS overload",
      positionEmphasis: null,
      positionSummary: "Svipað og leikur fyrir allar positionir",
    };
  }

  if (!rec) return null;

  return {
    format: formatLabel(totalPlayers),
    ...rec,
    warnings,
    citation: "Lacome et al. (2018), López-Fernández et al. (2019)",
  };
}

/** Skil styttri "headline" recommendation tag (fyrir drill-card) */
export interface FormatTag {
  format: string;
  goalLabel: string;
  goal: FormatGoal;
}

export function getFormatTag(
  totalPlayers: number | null | undefined
): FormatTag | null {
  if (!totalPlayers || totalPlayers < 4) return null;
  const rec = getFormatRecommendation(totalPlayers, null);
  if (!rec || !rec.format) return null;
  return {
    format: rec.format,
    goalLabel: rec.goalLabel,
    goal: rec.goal,
  };
}

export function formatGoalColorClasses(goal: FormatGoal): {
  bg: string;
  text: string;
  border: string;
} {
  switch (goal) {
    case "strength":
      return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
    case "aerobic":
      return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    case "match_like":
      return { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" };
    case "endurance":
      return { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" };
    case "technical":
    default:
      return { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
  }
}

/** Check ef drill er Mechanical/4v4-style og bout-lengd er of löng */
export function checkBoutDuration(
  totalPlayers: number | null | undefined,
  durationMin: number | null | undefined
): string | null {
  if (!totalPlayers || !durationMin) return null;
  const pt = perTeam(totalPlayers);
  if (pt <= 4 && durationMin > 5) {
    return `Fyrir peak mechanical stimulus í ${pt}v${pt} er mælt með <5 mín bouts með 90-120s hvíld (Lacome et al.)`;
  }
  if (pt >= 5 && pt <= 6 && durationMin < 4) {
    return `${pt}v${pt} er best nýtt í lengri bouts (>4 mín) fyrir aerobic stimulus (Lacome et al.)`;
  }
  return null;
}
