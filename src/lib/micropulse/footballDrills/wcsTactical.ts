/**
 * Tactical layer for the drill recommender — pure.
 *
 * Physical intensity (WCS) says HOW HARD the hardest minutes were; this says WHAT game situation
 * produced them, so a drill can rehearse the worst case IN ITS GAME CONTEXT (the real playing style,
 * not just a load number). It maps the Ju 2022 tactical-action shares from peakPeriodContext to the
 * coarse drill_library.category tags.
 *
 * Honest scope: on-ball actions are reliable from event labels; off-ball actions (recovery run,
 * covering) are only partial without tracking — those are labelled "needs tracking", never invented.
 * Descriptive; never the readiness colour. No I/O.
 *
 * Cite: Ju et al. 2022 (contextualised peak periods — the tactical-action taxonomy of the WCS window).
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { TacticalAction, ActionShare, Confidence } from "@/lib/micropulse/peakPeriodContext";
import { ACTION_LABEL, IS_OFF_BALL } from "@/lib/micropulse/peakPeriodContext";

/** Map each Ju action to the drill_library.category tags that rehearse that situation. */
const ACTION_TO_CATEGORIES: Record<TacticalAction, string[]> = {
  run_in_behind: ["finishing", "running"],   // penetration / breakaway
  run_with_ball: ["finishing", "running"],   // carry / breakaway
  move_to_receive: ["possession", "ssg"],    // third-man combinations
  support_play: ["possession", "ssg"],       // support + circulation
  interception: ["transition"],              // regain + counter
  recovery_run: ["transition"],              // defensive transition
  covering: ["transition"],                  // defensive shape
  other: [],
};

export interface WcsTacticalRead {
  dominant: TacticalAction | null;
  dominantLabel: Bi | null;
  categories: string[];       // drill_library.category tags to prefer
  offBall: boolean;           // dominant situation is off-ball → tracking-limited
  confidence: Confidence;     // downgraded when off-ball / thin
  note: Bi;
}

/**
 * Turn the peak window's tactical action shares into a drill-category preference. Prefers the dominant
 * ON-BALL action (event labels are reliable there); if the busiest action is off-ball, it still
 * surfaces it but flags "needs tracking" and downgrades confidence.
 */
export function wcsTacticalDrillCategories(actions: ActionShare[], baseConfidence: Confidence = "medium"): WcsTacticalRead {
  const meaningful = actions.filter((a) => a.action !== "other" && a.count > 0);
  if (meaningful.length === 0) {
    return {
      dominant: null, dominantLabel: null, categories: [], offBall: false, confidence: "low",
      note: { en: "No clocked tactical events in the peak window — physical WCS only (no game-situation context).", is: "Engir tímasettir taktískir atburðir í hámarksglugganum — aðeins líkamlegt WCS (ekkert leikstöðu-samhengi)." },
    };
  }
  const sorted = meaningful.slice().sort((a, b) => b.share - a.share);
  const onBall = sorted.filter((a) => !IS_OFF_BALL[a.action]);
  const dominant = (onBall[0] ?? sorted[0]).action;
  const offBall = IS_OFF_BALL[dominant];
  const confidence: Confidence = offBall ? "low" : baseConfidence;
  const note: Bi = offBall
    ? { en: `His worst case is an off-ball situation (${ACTION_LABEL[dominant].en}) — reliable context needs tracking data; read as a hint.`, is: `Versta fall hans er án bolta (${ACTION_LABEL[dominant].is}) — áreiðanlegt samhengi þarf rakningargögn; lestu sem vísbendingu.` }
    : { en: `His worst case is ${ACTION_LABEL[dominant].en} — rehearse it with these drill types at his WCS intensity.`, is: `Versta fall hans er ${ACTION_LABEL[dominant].is} — æfðu það með þessum drillu-gerðum á WCS ákefð hans.` };
  return {
    dominant, dominantLabel: ACTION_LABEL[dominant], categories: ACTION_TO_CATEGORIES[dominant], offBall, confidence, note,
  };
}

/** Does a drill's category match the tactical preference? (case-insensitive substring, empty pref = no filter) */
export function drillMatchesTactical(category: string | null, pref: string[]): boolean {
  if (pref.length === 0) return true;
  const c = (category ?? "").toLowerCase();
  return pref.some((p) => c.includes(p));
}
