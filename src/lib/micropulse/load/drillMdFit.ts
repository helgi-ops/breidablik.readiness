/**
 * Drill ↔ MD-day fit — pure, side-effect free.
 *
 * Classifies a drill by its dominant LOAD CHARACTER (mechanical / locomotive / speed /
 * metabolic / balanced / low) from its GPS profile (area-per-player as a fallback), then
 * scores how well that fits TODAY'S MD-day emphasis — MD-4 mechanical, MD-3 locomotive,
 * MD-2 speed/primer, MD-1 activation (tactical-periodization horizontal alternation).
 *
 * The MD-day → session type comes from the EXISTING plannedSessionLoad model (SessionLoadType)
 * — passed in, never re-derived here. Thresholds are a tunable coaching convention, not a law.
 *
 * Descriptive planning aid the coach owns (recommend + flag, never block). NEVER the readiness
 * colour, the load target, or the daily decision.
 *
 * Cite: Owen 2017/2024; Martin-Garcia 2018; Buchheit & Lacome; Stevens 2017; Oliva-Lozano;
 *       Gaudino/Casamichana (SSG pitch size → accel/decel vs high-speed load).
 */

import type { Bi } from "./peakPeriod";
import type { SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";

export type DrillLoadType = "mechanical" | "locomotive" | "speed" | "metabolic" | "balanced" | "low";

export interface DrillLoadSignal {
  category: string;
  player_load_per_min: number | null;
  distance_m: number | null;
  duration_min: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  hir_total: number | null;
  max_velocity: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  area_per_player_m2?: number | null;
}

/** Tunable classification thresholds (grounded in metric ratios; a coaching convention). */
export interface DrillFitThresholds {
  mechAccelDecelPerMin: number; // accel+decel (hi-intensity) per min that reads as mechanical
  locoHsrPerMin: number;        // high-speed metres (vel_b5+vel_b6) per min that reads as locomotive
  metabolicDistPerMin: number;  // total m/min that reads as running-volume (metabolic)
  speedMaxVel: number;          // km/h max velocity that reads as a speed/max-velocity exposure
  speedMaxDurationMin: number;  // a speed drill is short
  smallAreaM2: number;          // small SSG (raises accel/decel + COD) → mechanical lean
  largeAreaM2: number;          // large pitch → locomotive lean
}

export const DEFAULT_FIT_THRESHOLDS: DrillFitThresholds = {
  mechAccelDecelPerMin: 0.9,
  locoHsrPerMin: 5,
  metabolicDistPerMin: 95,
  speedMaxVel: 28,
  speedMaxDurationMin: 16,
  smallAreaM2: 100,
  largeAreaM2: 220,
};

const SAFE_CATEGORIES = new Set(["warmup", "warm-up", "technical", "mobility", "recovery", "activation", "prehab"]);

const num = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);

/** Dominant load character of a drill. GPS profile is best; area-per-player is the low-conf fallback. */
export function classifyDrillLoadType(d: DrillLoadSignal, thr: DrillFitThresholds = DEFAULT_FIT_THRESHOLDS): {
  type: DrillLoadType; confidence: "high" | "moderate" | "low"; why: Bi;
} {
  const cat = (d.category ?? "").toLowerCase();

  const dur = num(d.duration_min);
  const accel = num(d.accel_b23) ?? 0;
  const decel = num(d.decel_b23) ?? 0;
  const hsr = (num(d.vel_b5) ?? 0) + (num(d.vel_b6) ?? 0);
  const dist = num(d.distance_m);
  const area = num(d.area_per_player_m2);
  const maxVel = num(d.max_velocity);
  const hasGps = [d.player_load_per_min, d.distance_m, d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23].some((x) => num(x) !== null);

  // Safe technical/warm-up categories are "low" load regardless of a sparse GPS trace.
  if (SAFE_CATEGORIES.has(cat) && !hasGps) {
    return { type: "low", confidence: "high", why: { en: "Technical / warm-up category — low locomotor & mechanical load.", is: "Tæknilegt / upphitun — lágt hlaupa- og vélrænt álag." } };
  }

  // No GPS at all → lean on area-per-player only (low confidence).
  if (!hasGps || dur === null || dur <= 0) {
    if (area !== null) {
      if (area <= thr.smallAreaM2) return { type: "mechanical", confidence: "low", why: { en: `Small area (${Math.round(area)} m²/player) — small-sided, accel/decel & COD heavy.`, is: `Lítið svæði (${Math.round(area)} m²/leikm.) — smávallar, mikið accel/decel og stefnubreytingar.` } };
      if (area >= thr.largeAreaM2) return { type: "locomotive", confidence: "low", why: { en: `Large area (${Math.round(area)} m²/player) — high-speed running likely.`, is: `Stórt svæði (${Math.round(area)} m²/leikm.) — líklega mikið háhraðahlaup.` } };
      return { type: "balanced", confidence: "low", why: { en: "Moderate area, no GPS — balanced (low confidence).", is: "Meðalsvæði, engin GPS — blandað (lítið traust)." } };
    }
    return { type: "balanced", confidence: "low", why: { en: "No GPS or area data — cannot classify the load character.", is: "Engin GPS eða svæðisgögn — ekki hægt að flokka álag." } };
  }

  // GPS present → axis scores per minute, with an area lean.
  const accelDecelPerMin = (accel + decel) / dur;
  const hsrPerMin = hsr / dur;
  const distPerMin = dist !== null ? dist / dur : 0;
  const areaLeanMech = area !== null && area <= thr.smallAreaM2 ? 0.3 : 0;
  const areaLeanLoco = area !== null && area >= thr.largeAreaM2 ? 0.3 : 0;

  const mechScore = accelDecelPerMin / thr.mechAccelDecelPerMin + areaLeanMech;
  const locoScore = hsrPerMin / thr.locoHsrPerMin + areaLeanLoco;
  const speedScore = maxVel !== null && maxVel >= thr.speedMaxVel && dur <= thr.speedMaxDurationMin ? 1.2 : 0;
  const metabScore = distPerMin >= thr.metabolicDistPerMin && mechScore < 1 && locoScore < 1 ? distPerMin / thr.metabolicDistPerMin : 0;

  const axes: Array<[DrillLoadType, number]> = [
    ["mechanical", mechScore], ["locomotive", locoScore], ["speed", speedScore], ["metabolic", metabScore],
  ];
  axes.sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = axes[0];
  const [, secondScore] = axes[1];

  // Nothing dominates → balanced.
  if (topScore < 0.6) return { type: "balanced", confidence: "moderate", why: { en: "No axis dominates — a balanced/mixed drill.", is: "Ekkert kerfi ræður — blönduð drilla." } };
  const confidence: "high" | "moderate" = topScore - secondScore >= 0.5 ? "high" : "moderate";

  const why: Record<DrillLoadType, Bi> = {
    mechanical: { en: `Accel/decel dense (${accelDecelPerMin.toFixed(1)}/min)${areaLeanMech ? ", small area" : ""} — mechanical.`, is: `Þétt accel/decel (${accelDecelPerMin.toFixed(1)}/mín)${areaLeanMech ? ", lítið svæði" : ""} — vélrænt.` },
    locomotive: { en: `High-speed running (${Math.round(hsrPerMin)} m/min)${areaLeanLoco ? ", large area" : ""} — locomotive.`, is: `Háhraðahlaup (${Math.round(hsrPerMin)} m/mín)${areaLeanLoco ? ", stórt svæði" : ""} — hlaupaálag.` },
    speed: { en: `Max-velocity exposure (${maxVel} km/h), short — speed/primer.`, is: `Hámarkshraði (${maxVel} km/klst), stutt — hraði/primer.` },
    metabolic: { en: `High running volume (${Math.round(distPerMin)} m/min), low sprint/accel — metabolic.`, is: `Mikið hlaupamagn (${Math.round(distPerMin)} m/mín), lítið accel/spretti — efnaskipta.` },
    balanced: { en: "Balanced.", is: "Blandað." },
    low: { en: "Low load.", is: "Lágt álag." },
  };
  return { type: topType, confidence, why: why[topType] };
}

export interface DrillMdFit {
  drillType: DrillLoadType;
  dayType: SessionLoadType | "primer" | "activation" | "recovery";
  fit: "ideal" | "ok" | "off";
  reason: Bi;
  score: number; // 0–100, for sorting
}

const MD_CONTEXT_DAY = (mdContext?: string | null): "primer" | "activation" | "recovery" | null => {
  const m = (mdContext ?? "").toUpperCase();
  if (/MD-?2/.test(m)) return "primer";
  if (/MD-?1(?!\d)/.test(m)) return "activation";
  if (/MD\+/.test(m)) return "recovery";
  return null;
};

const SCORE: Record<"ideal" | "ok" | "off", number> = { ideal: 92, ok: 62, off: 28 };

/**
 * Score a drill's fit to today's MD day. dayTargetType is the SessionLoadType from
 * plannedSessionLoad; mdContext (e.g. "MD-2") refines speed/activation/recovery days.
 */
export function drillFitForMdDay(drillType: DrillLoadType, dayTargetType: SessionLoadType, mdContext?: string | null): DrillMdFit {
  const refined = MD_CONTEXT_DAY(mdContext);
  const dayType: DrillMdFit["dayType"] = refined ?? dayTargetType;

  let fit: "ideal" | "ok" | "off";
  let reason: Bi;

  if (refined === "primer") {
    fit = drillType === "speed" ? "ideal" : drillType === "low" || drillType === "balanced" ? "ok" : "off";
    reason = fit === "off"
      ? { en: `${drillType} drill on an MD-2 speed/primer day — too much volume; keep it short and sharp.`, is: `${drillType}-drilla á MD-2 hraða/primer degi — of mikið magn; hafðu stutt og beitt.` }
      : { en: "Short max-velocity / priming work suits MD-2.", is: "Stutt hámarkshraða- / primer-vinna hentar MD-2." };
  } else if (refined === "activation") {
    fit = drillType === "low" ? "ideal" : drillType === "speed" || drillType === "balanced" ? "ok" : "off";
    reason = fit === "off"
      ? { en: `${drillType} drill on MD-1 — too heavy for activation; taper the volume.`, is: `${drillType}-drilla á MD-1 — of þung fyrir activation; minnkaðu magn.` }
      : { en: "Low-volume priming suits MD-1 activation.", is: "Létt priming hentar MD-1 activation." };
  } else if (refined === "recovery") {
    fit = drillType === "low" ? "ideal" : "off";
    reason = fit === "off"
      ? { en: `${drillType} drill on a recovery day — keep it to low-load flow.`, is: `${drillType}-drilla á endurheimtardegi — haltu léttu flæði.` }
      : { en: "Low-load flow suits a recovery day.", is: "Létt flæði hentar endurheimtardegi." };
  } else if (dayTargetType === "mechanical") {
    fit = drillType === "mechanical" ? "ideal" : drillType === "locomotive" ? "off" : "ok";
    reason = fit === "ideal"
      ? { en: "Mechanical drill on an MD-4 mechanical day — ideal (force / accel-decel).", is: "Vélræn drilla á MD-4 vélrænum degi — kjörið (kraftur / accel-decel)." }
      : fit === "off"
        ? { en: "Locomotive/high-speed drill on an MD-4 mechanical day — heavy/wrong emphasis (HSR/hamstring load).", is: "Hlaupa-/háhraðadrilla á MD-4 vélrænum degi — röng áhersla (HSR/aftanlæri)." }
        : { en: "Fits an MD-4 day as a secondary block.", is: "Passar sem aukakafli á MD-4 degi." };
  } else if (dayTargetType === "locomotive") {
    fit = drillType === "locomotive" ? "ideal" : drillType === "mechanical" ? "off" : "ok";
    reason = fit === "ideal"
      ? { en: "Locomotive drill on an MD-3 locomotive day — ideal (high-speed running peak).", is: "Hlaupadrilla á MD-3 hlaupadegi — kjörið (háhraðahlaup í hámarki)." }
      : fit === "off"
        ? { en: "Mechanical drill on an MD-3 locomotive day — off-emphasis; MD-3 wants HSR volume.", is: "Vélræn drilla á MD-3 hlaupadegi — röng áhersla; MD-3 vill HSR-magn." }
        : { en: "Fits an MD-3 day as a secondary block.", is: "Passar sem aukakafli á MD-3 degi." };
  } else {
    // mixed day — most types are ok; a balanced drill is the clean fit.
    fit = drillType === "balanced" ? "ideal" : "ok";
    reason = fit === "ideal"
      ? { en: "Balanced drill on a mixed day — ideal.", is: "Blönduð drilla á blönduðum degi — kjörið." }
      : { en: "A mixed day accommodates most load types.", is: "Blandaður dagur rúmar flestar álagsgerðir." };
  }

  return { drillType, dayType, fit, reason, score: SCORE[fit] };
}
