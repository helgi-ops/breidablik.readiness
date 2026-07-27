/**
 * Previous-injury recency — the strongest, most consistent non-modifiable risk factor
 * across the football ML studies (Majumdar 2022; Rico-González 2023).
 *
 * A decaying CONTEXT flag: recently returned from a time-loss injury → elevated context,
 * shown as a labelled note. It has no counterfactual (you can't un-injure a player), so
 * counterfactual is null by design — it's context, never a colour, never a scold.
 */

import type { Bi, SignalContributor } from "./types";

/** Window (days) within which a prior injury still counts as elevated context. */
export const INJURY_RECENCY_WINDOW = 90;
/** Full decay horizon — severity ramps to 0 by here. */
const DECAY_DAYS = 180;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface InjuryRecencyInput {
  /** Most recent time-loss injury date (player_injuries.injury_date), or null if none on record. */
  lastInjuryDate: string | null;
  /** Date he was cleared back to full (actual_return_date), if known. */
  lastReturnDate: string | null;
  today: string;
  /** Optional plain body-part for the note. */
  bodyPart?: string | null;
}

/**
 * Build the injury-recency contributor. Null when there's no injury on record (no-data,
 * not a fabricated "0 days"). Flags while within the recency window; severity decays.
 */
export function injuryRecencyContributor(input: InjuryRecencyInput): SignalContributor | null {
  const { lastInjuryDate, lastReturnDate, today, bodyPart } = input;
  if (!lastInjuryDate) return null;

  // Count from the RETURN date when known (that's when re-exposure risk starts), else
  // from the injury date.
  const anchor = lastReturnDate ?? lastInjuryDate;
  const days = daysBetween(anchor, today);
  if (days < 0) return null; // future-dated / bad data → no signal

  const returned = !!lastReturnDate;
  const flagged = days <= INJURY_RECENCY_WINDOW;
  const severity = Math.max(0, Math.min(1, 1 - days / DECAY_DAYS));
  const bp = bodyPart ? ` (${bodyPart})` : "";

  const why: Bi = returned
    ? { en: `Returned from injury${bp} ${days} day${days === 1 ? "" : "s"} ago — prior injury is the strongest risk factor.`, is: `Kom til baka úr meiðslum${bp} fyrir ${days} degi${days === 1 ? "" : " dögum"} — fyrri meiðsli eru sterkasti áhættuþátturinn.` }
    : { en: `Injured${bp} ${days} day${days === 1 ? "" : "s"} ago — prior injury is the strongest risk factor.`, is: `Meiddist${bp} fyrir ${days} degi${days === 1 ? "" : " dögum"} — fyrri meiðsli eru sterkasti áhættuþátturinn.` };

  const detail: Bi = {
    en: `Days since last time-loss injury = ${days} (from ${returned ? "return" : "injury"} date). Elevated context ≤${INJURY_RECENCY_WINDOW}d, decaying to ${DECAY_DAYS}d. Context only — no counterfactual, never a colour.`,
    is: `Dagar frá síðustu meiðsla-fjarveru = ${days} (frá ${returned ? "endurkomu" : "meiðsla"}-degi). Hækkað samhengi ≤${INJURY_RECENCY_WINDOW}d, dvínar til ${DECAY_DAYS}d. Aðeins samhengi — ekkert mótdæmi, aldrei litur.`,
  };

  return {
    key: "injury_recency",
    label: { en: "Recent injury", is: "Nýleg meiðsli" },
    why,
    counterfactual: null, // you can't counterfactual an injury — manage the ramp instead
    citation: "Majumdar 2022 · Rico-González 2023",
    confidence: "high", // a recorded injury date is a hard fact
    severity,
    flagged,
    detail,
  };
}
