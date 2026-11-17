/**
 * DSI suggests a strength goal (2026-11-17). Pure — no DB.
 *
 * The coach's rule: the force-plate tests SUGGEST a goal; the player chooses; the coach sees both. Rules, not AI.
 *
 * Dynamic Strength Index (DSI) = jump (CMJ) peak force ÷ mid-thigh pull (IMTP) peak force (Suchomel et al. 2016).
 * It is read against the player's own team (lower / upper third, the same squad read the coach's DSI chip and the
 * 8-week goal plans use), never against the textbook 0.6 / 0.8 cut: the stored CMJ peak sits above that band, so an
 * absolute cut would call nearly everyone "max strength". Splitting the team into thirds is our rule, not a study's.
 *
 *   lower third → "More explosive" (strong for how explosive they are: fast force is the next gain)
 *   upper third → "Stronger legs"  (already uses their strength fast: more strength is the next gain)
 *   middle      → no suggestion    (both qualities are in balance — the player picks freely)
 *
 * "Stronger hamstrings" is never suggested from DSI (DSI says nothing about hamstrings). No suggestion when the team
 * read is missing (fewer than 4 tested), when either test is missing, or when either test is older than 12 months.
 */

import { deriveDsiForPlayer, type DsiCoverageInput, type SquadDsiThresholds } from "./deriveDsi";
import type { StrengthGoal } from "./playerPicks";

/** A test older than this does not suggest anything (the player may have changed since). */
export const SUGGESTION_MAX_TEST_AGE_DAYS = 365;

export const DSI_SUGGESTION_SOURCE =
  "Dynamic Strength Index: jump (CMJ) peak force ÷ mid-thigh pull (IMTP) peak force (Suchomel et al. 2016), compared within the team (thirds — our rule, not from a study).";

export type GoalSuggestion = {
  goal: Extract<StrengthGoal, "power" | "stronger">;
  reasonEN: string;
  reasonIS: string;
  /** Dates of the two tests the suggestion rests on (YYYY-MM-DD). */
  cmjDate: string;
  imtpDate: string;
  /** Players on the team with both tests (the team read). */
  tested: number;
  /** "high" = at least 3 good tries in both tests; otherwise "moderate". */
  confidence: "high" | "moderate";
  source: string;
};

export type DsiSuggestionInput = DsiCoverageInput & { cmjTestDate?: string | null; imtpTestDate?: string | null };

const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);

function ageDays(dateIso: string, todayIso: string): number {
  return Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dateIso}T00:00:00Z`)) / 86_400_000);
}

export function suggestGoalFromDsi(
  inp: DsiSuggestionInput | null | undefined,
  squad: SquadDsiThresholds | null | undefined,
  todayIso: string,
): GoalSuggestion | null {
  if (!inp || !squad) return null;
  const cmjDate = day(inp.cmjTestDate);
  const imtpDate = day(inp.imtpTestDate);
  if (!cmjDate || !imtpDate) return null;
  for (const d of [cmjDate, imtpDate]) {
    const age = ageDays(d, todayIso);
    if (!Number.isFinite(age) || age > SUGGESTION_MAX_TEST_AGE_DAYS) return null;
  }
  const read = deriveDsiForPlayer(inp, squad);
  if (read.basis !== "squad" || !read.dsi) return null;

  const base = {
    cmjDate,
    imtpDate,
    tested: squad.n,
    confidence: read.confidence === "high" ? "high" as const : "moderate" as const,
    source: DSI_SUGGESTION_SOURCE,
  };
  if (read.dsi.tier === "ballistic") {
    return {
      ...base,
      goal: "power",
      reasonEN: "Your force-plate tests show a lot of strength for how explosive you are (lower third of your team). Getting more explosive is the next step.",
      reasonIS: "Kraftplötuprófin þín sýna mikinn styrk miðað við sprengikraft (neðsti þriðjungur liðsins). Meiri sprengikraftur er næsta skref.",
    };
  }
  if (read.dsi.tier === "max_strength") {
    return {
      ...base,
      goal: "stronger",
      reasonEN: "Your force-plate tests show you already use your strength fast (upper third of your team). More strength is the next step.",
      reasonIS: "Kraftplötuprófin þín sýna að þú nýtir styrkinn hratt nú þegar (efsti þriðjungur liðsins). Meiri styrkur er næsta skref.",
    };
  }
  return null;
}
