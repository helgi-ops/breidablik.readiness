/**
 * Wearable recovery (HRV / resting HR / recovery score) as a first-read "why" contributor.
 *
 * Objective autonomic-recovery markers from a connected watch (Whoop/Garmin/… via Terra),
 * each read on the player's OWN rolling baseline — a morning HRV drop, a resting-HR rise, or
 * a low recovery score vs his usual. One combined row headlined by whichever marker drives it;
 * physiologically they tell one story (incomplete autonomic recovery). These are SIDE signals
 * BESIDE the verdict colour — they never change it (CLAUDE.md canonical-verdict rule).
 *
 * No wearable data (player hasn't connected, or no reading in the window) → no signal, never a
 * fabricated 0. Higher-is-better markers (HRV, recovery) flag on a drop; resting HR flags on a
 * rise. Plews 2013 (HRV rolling-baseline) · Buchheit 2014 · Bellenger 2016.
 */

import { coverageConfidence, type Bi, type SignalContributor, type Voice } from "./types";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Recent value + the player's own baseline mean/SD for one wearable marker. */
export interface WearableMarker {
  recent: number | null;
  baselineMean: number | null;
  baselineSd: number | null;
}

export interface WearableRecoveryInput {
  /** Morning HRV (RMSSD, ms) — higher is better. */
  hrv: WearableMarker;
  /** Resting heart rate (bpm) — lower is better. */
  restingHr: WearableMarker;
  /** Provider recovery/readiness score (0–100) — higher is better. */
  recoveryScore: WearableMarker;
  /** Days with any wearable reading in the window (confidence). */
  coverageDays: number;
  /** Audience voice for the why/counterfactual (default "coach"). */
  voice?: Voice;
}

type Driver = "hrv" | "rhr" | "recovery";

/**
 * Standardized "badness" (positive = worse than usual) for one marker, or null when it
 * can't be standardized (no recent reading or an immature/flat baseline). `higherBetter`
 * flips the sign so a drop in HRV/recovery and a rise in resting HR both read positive.
 */
function badness(m: WearableMarker, higherBetter: boolean, sdFloor: number): number | null {
  const { recent, baselineMean, baselineSd } = m;
  if (recent == null || baselineMean == null || baselineSd == null || baselineSd <= sdFloor) return null;
  const z = (recent - baselineMean) / baselineSd;
  return higherBetter ? -z : z;
}

/**
 * Wearable recovery contributor — flags when an objective marker sits a clear step
 * (≥1σ) the wrong side of the player's own norm. Null when the player has no wearable
 * reading in the window at all.
 */
export function wearableRecoveryContributor(input: WearableRecoveryInput): SignalContributor | null {
  const { hrv, restingHr, recoveryScore, coverageDays } = input;
  // No wearable reading at all → no signal (don't fabricate a neutral row).
  if (hrv.recent == null && restingHr.recent == null && recoveryScore.recent == null) return null;

  const player = (input.voice ?? "coach") === "player";
  const scores: Array<{ driver: Driver; bad: number }> = [];
  const hb = badness(hrv, true, 1); // HRV RMSSD ms
  const rb = badness(restingHr, false, 0.5); // resting HR bpm
  const cb = badness(recoveryScore, true, 2); // recovery score points
  if (hb != null) scores.push({ driver: "hrv", bad: hb });
  if (rb != null) scores.push({ driver: "rhr", bad: rb });
  if (cb != null) scores.push({ driver: "recovery", bad: cb });

  // Worst (most concerning) standardized marker drives the headline; 0 when nothing has
  // a mature baseline yet (recent data shown as context, never flagged on thin history).
  const top = scores.reduce<{ driver: Driver; bad: number } | null>((a, s) => (a == null || s.bad > a.bad ? s : a), null);
  const maxBad = top ? top.bad : 0;
  const flagged = maxBad >= 1;
  const severity = clamp01(maxBad / 2); // +1σ→0.5, +2σ→1

  const usualHrv = hrv.baselineMean != null ? `${Math.round(hrv.baselineMean)} ms` : null;
  const usualRhr = restingHr.baselineMean != null ? `${Math.round(restingHr.baselineMean)} bpm` : null;
  const usualRec = recoveryScore.baselineMean != null ? `${Math.round(recoveryScore.baselineMean)}` : null;

  const driver = flagged ? top!.driver : null;
  const why: Bi = driver === "hrv"
    ? player
      ? { en: `Your heart-rate variability is below your usual — recovery may be incomplete.`, is: `Hjartsláttarbreytileiki þinn er undir venju þinni — endurheimt gæti verið ólokið.` }
      : { en: `His heart-rate variability is below his usual — recovery may be incomplete.`, is: `Hjartsláttarbreytileiki hans er undir hans venju — endurheimt gæti verið ólokin.` }
    : driver === "rhr"
      ? player
        ? { en: `Your resting heart rate is above your usual — recovery may be incomplete.`, is: `Hvíldarpúls þinn er yfir venju þinni — endurheimt gæti verið ólokið.` }
        : { en: `His resting heart rate is above his usual — recovery may be incomplete.`, is: `Hvíldarpúls hans er yfir hans venju — endurheimt gæti verið ólokin.` }
      : driver === "recovery"
        ? player
          ? { en: `Your watch recovery score is below your usual.`, is: `Endurheimtarskor úrsins þíns er undir venju þinni.` }
          : { en: `His watch recovery score is below his usual.`, is: `Endurheimtarskor úrsins hans er undir hans venju.` }
        : player
          ? { en: `Your wearable recovery markers are around your usual.`, is: `Endurheimtarmerki úrsins þíns eru um venju þína.` }
          : { en: `His wearable recovery markers are around his usual.`, is: `Endurheimtarmerki úrsins hans eru um hans venju.` };

  const cfUsual = driver === "hrv" ? usualHrv : driver === "rhr" ? usualRhr : driver === "recovery" ? usualRec : null;
  const counterfactual: Bi | null = flagged && cfUsual
    ? player
      ? { en: `If it returned to your usual (~${cfUsual}) → this clears.`, is: `Ef það færi aftur á venju þína (~${cfUsual}) → þetta hreinsast.` }
      : { en: `If it returned to his usual (~${cfUsual}) → this clears.`, is: `Ef það færi aftur á hans venju (~${cfUsual}) → þetta hreinsast.` }
    : null;

  const fmt = (m: WearableMarker, unit: string) => (m.recent != null ? `${Math.round(m.recent)}${unit}` : "—");
  const parts: string[] = [];
  if (hrv.recent != null) parts.push(`HRV ${fmt(hrv, " ms")} vs ${usualHrv ?? "—"}`);
  if (restingHr.recent != null) parts.push(`RHR ${fmt(restingHr, " bpm")} vs ${usualRhr ?? "—"}`);
  if (recoveryScore.recent != null) parts.push(`recovery ${fmt(recoveryScore, "")} vs ${usualRec ?? "—"}`);
  const partsIs: string[] = [];
  if (hrv.recent != null) partsIs.push(`HRV ${fmt(hrv, " ms")} vs ${usualHrv ?? "—"}`);
  if (restingHr.recent != null) partsIs.push(`hvíldarpúls ${fmt(restingHr, " bpm")} vs ${usualRhr ?? "—"}`);
  if (recoveryScore.recent != null) partsIs.push(`endurheimt ${fmt(recoveryScore, "")} vs ${usualRec ?? "—"}`);

  return {
    key: "wearable_recovery",
    label: { en: "Wearable recovery", is: "Endurheimt (úr)" },
    why, counterfactual,
    citation: "Plews 2013 · Buchheit 2014 · Bellenger 2016",
    confidence: coverageConfidence(coverageDays),
    severity, flagged,
    detail: {
      en: `${parts.join(" · ")}. Flag ≥ 1σ the wrong side of his own norm (HRV/recovery drop, resting-HR rise). Own-norm; objective. Side signal — never the verdict colour.`,
      is: `${partsIs.join(" · ")}. Flagg ≥ 1σ röngu megin við eigin venju (HRV/endurheimt niður, hvíldarpúls upp). Eigin-norm; hlutlægt. Hliðarmerki — aldrei liturinn.`,
    },
  };
}
