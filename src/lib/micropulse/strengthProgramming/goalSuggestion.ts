/**
 * DSI suggests an 8-week gym goal (2026-11-17; pointed at the 8-week goals on 2026-11-18, goals step 3). Pure — no DB.
 *
 * The coach's rule: the force-plate tests SUGGEST a goal; the player chooses; the coach sees both. Rules, not AI.
 *
 * Dynamic Strength Index (DSI) = jump (CMJ) peak force ÷ mid-thigh pull (IMTP) peak force (Suchomel et al. 2016).
 * It is read against the player's own team (lower / upper third, the same squad read the coach's DSI chip and the
 * 8-week goal plans use), never against the textbook 0.6 / 0.8 cut: the stored CMJ peak sits above that band, so an
 * absolute cut would call nearly everyone "max strength". Splitting the team into thirds is our rule, not a study's.
 *
 *   lower third → "Explosive power"   (strong for how explosive they are: fast force is the next gain)
 *   upper third → "Maximal strength"  (already uses their strength fast: more strength is the next gain)
 *   middle      → no suggestion       (both qualities are in balance — the player picks freely)
 *
 * The strength test first (brief §4a, 2026-11-23): a mid-thigh pull per kg of body weight in the lower third of the team
 * suggests "Maximal strength" whatever the DSI says, as Suchomel 2020 advises reading the ratio with the strength test
 * (a low ratio often means a strong pull, not a weak jump — a weak pull is the gap). It needs only the pull (within 12
 * months) and 4 or more tested team-mates. The thirds are our rule, not a study's.
 *
 * Until 2026-11-18 this pointed at the old "+1 set" goals (More explosive / Stronger legs), now retired. The 8-week
 * plan itself also reads DSI to pick where it starts (gymGoals.ts); this is only the suggestion of WHICH goal. No
 * suggestion when the team read is missing (fewer than 4 tested), when either test is missing, or when either test is
 * older than 12 months.
 */

import { deriveDsiForPlayer, type DsiCoverageInput, type SquadDsiThresholds } from "./deriveDsi";
import type { GoalQuality } from "@/lib/micropulse/goalPlan/types";

/** A test older than this does not suggest anything (the player may have changed since). */
export const SUGGESTION_MAX_TEST_AGE_DAYS = 365;

export const DSI_SUGGESTION_SOURCE =
  "Dynamic Strength Index: jump (CMJ) peak force ÷ mid-thigh pull (IMTP) peak force (Suchomel et al. 2016), compared within the team (thirds — our rule, not from a study).";

export const IMTP_SUGGESTION_SOURCE =
  "Mid-thigh pull (IMTP) peak force per kg of body weight, compared within the team (lower third — our rule, not from a study). The strength test is read first, as Suchomel 2020 advises.";

/** The team's IMTP N/kg read: the lower-third cut, from 4 or more tested players. */
export type SquadImtpThreshold = { lower: number; n: number };

/** The lower third of the team's IMTP N/kg (null with fewer than 4 tested). */
export function squadImtpThreshold(values: Array<number | null | undefined>): SquadImtpThreshold | null {
  const vals = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (vals.length < 4) return null;
  const i = (vals.length - 1) / 3;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return { lower: lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (i - lo), n: vals.length };
}

export type GoalSuggestion = {
  /** The 8-week gym goal the tests point to. */
  goal: Extract<GoalQuality, "explosive" | "max_strength">;
  reasonEN: string;
  reasonIS: string;
  /** Dates of the tests the suggestion rests on (YYYY-MM-DD). `cmjDate` is null when the pull alone decided. */
  cmjDate: string | null;
  imtpDate: string;
  /** What decided: the pull per kg (lower third) or the DSI. */
  basis?: "imtp" | "dsi";
  /** Players on the team with both tests (the team read). */
  tested: number;
  /** "high" = at least 3 good tries in both tests; otherwise "moderate". */
  confidence: "high" | "moderate";
  source: string;
};

export type DsiSuggestionInput = DsiCoverageInput & { cmjTestDate?: string | null; imtpTestDate?: string | null; imtpRelNkg?: number | null };

const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);

function ageDays(dateIso: string, todayIso: string): number {
  return Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dateIso}T00:00:00Z`)) / 86_400_000);
}

const fresh = (d: string, todayIso: string) => {
  const age = ageDays(d, todayIso);
  return Number.isFinite(age) && age <= SUGGESTION_MAX_TEST_AGE_DAYS;
};

export function suggestGoalFromDsi(
  inp: DsiSuggestionInput | null | undefined,
  squad: SquadDsiThresholds | null | undefined,
  todayIso: string,
  imtpSquad?: SquadImtpThreshold | null,
): GoalSuggestion | null {
  if (!inp) return null;
  const cmjDate = day(inp.cmjTestDate);
  const imtpDate = day(inp.imtpTestDate);
  if (!imtpDate || !fresh(imtpDate, todayIso)) return null;
  // The strength test first: a pull per kg in the team's lower third → more strength.
  const rel = inp.imtpRelNkg;
  if (imtpSquad && typeof rel === "number" && Number.isFinite(rel) && rel < imtpSquad.lower) {
    return {
      goal: "max_strength",
      basis: "imtp",
      cmjDate: cmjDate && fresh(cmjDate, todayIso) ? cmjDate : null,
      imtpDate,
      tested: imtpSquad.n,
      confidence: (inp.imtpTrialCount ?? 0) >= 3 ? "high" : "moderate",
      source: IMTP_SUGGESTION_SOURCE,
      reasonEN: `Your mid-thigh pull is ${rel.toFixed(1)} N per kg of body weight, in the lower third of your team. More strength is the next step.`,
      reasonIS: `Togið þitt frá miðju læri er ${rel.toFixed(1).replace(".", ",")} N á hvert kg líkamsþyngdar, í neðsta þriðjungi liðsins. Meiri styrkur er næsta skref.`,
    };
  }
  if (!squad || !cmjDate || !fresh(cmjDate, todayIso)) return null;
  const read = deriveDsiForPlayer(inp, squad);
  if (read.basis !== "squad" || !read.dsi) return null;

  const base = {
    basis: "dsi" as const,
    cmjDate,
    imtpDate,
    tested: squad.n,
    confidence: read.confidence === "high" ? "high" as const : "moderate" as const,
    source: DSI_SUGGESTION_SOURCE,
  };
  if (read.dsi.tier === "ballistic") {
    return {
      ...base,
      goal: "explosive",
      reasonEN: "Your force-plate tests show a lot of strength for how explosive you are (lower third of your team). Getting more explosive is the next step.",
      reasonIS: "Kraftplötuprófin þín sýna mikinn styrk miðað við sprengikraft (neðsti þriðjungur liðsins). Meiri sprengikraftur er næsta skref.",
    };
  }
  if (read.dsi.tier === "max_strength") {
    return {
      ...base,
      goal: "max_strength",
      reasonEN: "Your force-plate tests show you already use your strength fast (upper third of your team). More strength is the next step.",
      reasonIS: "Kraftplötuprófin þín sýna að þú nýtir styrkinn hratt nú þegar (efsti þriðjungur liðsins). Meiri styrkur er næsta skref.",
    };
  }
  return null;
}
