/**
 * Off-season block recommender — from a player's needs profile (the same PlayerNeeds the off-week
 * engine derives: deficits, aerobic fit, strength lean, RTP track, fatigue), recommend WHICH 4-week
 * block method fits his off-season: straight-sets strength (build the base), Contrast (power on a base),
 * or French Contrast (full force–velocity, advanced). Pure, deterministic, null-safe. Advisory — the
 * coach picks; never the readiness colour.
 *
 * Reasoning (Issurin 2010 block order; Cormie 2011 strength-before-power; Suchomel 2016): a player who
 * lacks a strength base, is in rehab, or is fatigued builds strength first; a player with a base moves
 * to contrast/complex power. French Contrast is the most complete AND most fatiguing — reserved for a
 * clean, base-built profile.
 */

import type { PlayerNeeds } from "@/lib/micropulse/offWeek/plan";
import type { BlockMethod } from "@/lib/micropulse/strengthBlock/upperLowerBlock";

export interface OffSeasonRecommendation {
  method: BlockMethod;
  whyEN: string;
  whyIS: string;
  confidence: "high" | "moderate" | "low";
}

export function recommendOffSeasonMethod(needs: PlayerNeeds): OffSeasonRecommendation {
  const deficits = (needs.deficitEmphases ?? []).map((d) => d.toLowerCase());
  const hasDeficits = deficits.length > 0;
  const defText = deficits.join(", ");

  // 1) Rehab / return-to-play → controlled straight-sets strength; no high-intent contrast yet.
  if (needs.rtpTrack) {
    return {
      method: "upper_lower",
      whyEN: `On a return-to-play track (${needs.rtpTrack}) — build with controlled straight-sets strength; hold high-intent contrast/plyo until he's cleared.`,
      whyIS: `Á endurkomu-ferli (${needs.rtpTrack}) — byggðu með stýrðum straight-set styrk; bíddu með contrast/plyo þar til hann er klár.`,
      confidence: "high",
    };
  }

  // 2) Recent high load / fatigue → straight-sets strength is lower CNS cost than a power complex.
  if (needs.fatigueFlag) {
    return {
      method: "upper_lower",
      whyEN: "Recent match load is high — a straight-sets strength block is a lower nervous-system cost than contrast/complex power.",
      whyIS: "Nýlegt leikálag hátt — straight-set styrktar-blokk er minna álag á taugakerfi en contrast/complex kraftur.",
      confidence: "moderate",
    };
  }

  // 3) Strength lean says build the base first → straight-sets.
  if (needs.strengthLean === "max_strength" || needs.strengthLean === "hypertrophy") {
    return {
      method: "upper_lower",
      whyEN: `Profile leans to ${needs.strengthLean === "hypertrophy" ? "hypertrophy" : "max strength"} — build the base with straight sets before layering power on top.${hasDeficits ? ` Also address: ${defText}.` : ""}`,
      whyIS: `Snið hallar að ${needs.strengthLean === "hypertrophy" ? "vöðvamassa" : "hámarksstyrk"} — byggðu grunninn með straight sets áður en kraftur er lagður ofan á.${hasDeficits ? ` Einnig taka á: ${defText}.` : ""}`,
      confidence: "moderate",
    };
  }

  // 4) Power lean + a clean profile → French Contrast (the full force–velocity spectrum).
  if (needs.strengthLean === "power" && !hasDeficits) {
    return {
      method: "french_contrast",
      whyEN: "Power-focused with a clean profile — French Contrast trains the full force–velocity spectrum (heavy → plyo → loaded jump → reactive) in one complex.",
      whyIS: "Kraft-miðað með hreinu sniði — French Contrast þjálfar allt kraft–hraða rófið (þungt → plyo → hlaðið stökk → viðbragð) í einni fléttu.",
      confidence: "moderate",
    };
  }

  // 5) Default off-season with a base (balanced / power-with-deficits) → Contrast: power on a base,
  //    less fatiguing than French Contrast.
  return {
    method: "contrast",
    whyEN: `Off-season with a strength base — Contrast pairs (heavy lift + explosive) build power on top.${hasDeficits ? ` Keep an eye on: ${defText}.` : ""}`,
    whyIS: `Off-season með styrktar-grunn — Contrast pör (þung lyfta + sprengikraftur) byggja kraft ofan á.${hasDeficits ? ` Fylgstu með: ${defText}.` : ""}`,
    confidence: needs.strengthLean || hasDeficits || needs.masTrend ? "moderate" : "low",
  };
}
