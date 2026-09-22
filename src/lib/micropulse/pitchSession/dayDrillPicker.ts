/**
 * Area-aware day drill picker — pure, side-effect free.
 *
 * Given a training day's stimulus type (mechanical / locomotive / mixed / technical) and the
 * team's drills, this ranks and picks the drills that best express that day — and for the
 * space-driven categories (possession, SSG, transition) it reads the PITCH SIZE: a locomotive
 * day wants a LARGE area per player (open space → high-speed running), a mechanical day wants a
 * TIGHT area (accel/decel, change of direction), mixed sits match-like in between, and a
 * technical/taper day stays small and sharp.
 *
 * Area bands are grounded in the SSG systematic review (Hill-Haas et al. 2011): larger area per
 * player raises locomotor output and high-speed running; smaller area raises mechanical load and
 * technical actions. Descriptive planning aid — the coach still picks; never a verdict.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type DaySessionType = "mechanical" | "locomotive" | "mixed" | "technical";
export type AreaFit = "ideal" | "ok" | "off" | "unknown";

export interface DrillPickInput {
  id: string;
  name: string;
  category: string | null;
  stimulus: DaySessionType | null;
  areaPerPlayerM2: number | null;
  totalPlayers: number | null;
}

export interface DayDrillPick {
  id: string;
  name: string;
  category: string | null;
  stimulus: DaySessionType | null;
  /** The area used for grading — measured when present, else the per-format estimate. */
  areaPerPlayerM2: number | null;
  /** True when areaPerPlayerM2 is a per-format ESTIMATE (no recorded pitch), so the UI can flag it. */
  areaEstimated: boolean;
  areaFit: AreaFit;
  score: number;
  why: Bi;
}

/**
 * Screening-grade estimate of area-per-player from the total players on the pitch, when no pitch
 * size is recorded. Representative m²/player per format from the SSG review (Hill-Haas 2011): more
 * players → more space per player on a fuller pitch → a running (locomotive) lean; small games sit
 * tighter (mechanical). A DEFAULT ordering only — a real pitch size the coach records overrides it,
 * and it can't tell a deliberately tight game from an open one at the same format.
 */
export function estimateAreaPerPlayer(totalPlayers: number | null | undefined): number | null {
  if (totalPlayers == null || !Number.isFinite(totalPlayers) || totalPlayers < 2) return null;
  const perTeam = Math.max(1, Math.round(totalPlayers / 2));
  const TABLE: Record<number, number> = { 1: 75, 2: 90, 3: 100, 4: 110, 5: 120, 6: 135, 7: 150, 8: 165, 9: 185, 10: 200, 11: 220 };
  if (TABLE[perTeam]) return TABLE[perTeam];
  return perTeam > 11 ? 240 : null;
}

/** Categories where pitch AREA per player is the primary lever (open vs tight space). */
const AREA_DRIVEN = new Set(["possession", "ssg", "transition"]);

/** Ideal area-per-player band (m²) per session type (Hill-Haas 2011). */
const AREA_BAND: Record<DaySessionType, [number, number]> = {
  locomotive: [150, 400], // open space → high-speed running
  mixed: [100, 170], // match-like
  mechanical: [30, 90], // tight space → accel/decel, CoD
  technical: [30, 110], // small & sharp
};

const AREA_WORD: Record<DaySessionType, Bi> = {
  locomotive: { en: "large / open pitch", is: "stórt / opið svæði" },
  mixed: { en: "match-like pitch", is: "leiklíkt svæði" },
  mechanical: { en: "tight pitch", is: "þröngt svæði" },
  technical: { en: "small, sharp pitch", is: "lítið, beitt svæði" },
};

/** Grade a drill's pitch size against the day. Only meaningful for space-driven categories. */
export function areaFitForDay(sessionType: DaySessionType, category: string | null, area: number | null): { fit: AreaFit; why: Bi } {
  const cat = (category ?? "").toLowerCase();
  if (!AREA_DRIVEN.has(cat)) return { fit: "unknown", why: { en: "", is: "" } };
  if (area == null || !Number.isFinite(area)) {
    return { fit: "unknown", why: { en: "No pitch size on the drill — add area/players to grade the space.", is: "Engin vallarstærð á drillu — bættu við svæði/leikmönnum til að meta rýmið." } };
  }
  const [lo, hi] = AREA_BAND[sessionType];
  const word = AREA_WORD[sessionType];
  const m2 = `${Math.round(area)} m²/${cat === "ssg" ? "player" : "player"}`;
  if (area >= lo && area <= hi) {
    return { fit: "ideal", why: { en: `${m2} — a ${word.en} for a ${sessionType} day.`, is: `${Math.round(area)} m²/leikm. — ${word.is} fyrir ${sessionType} dag.` } };
  }
  const nearLo = area >= lo * 0.75 && area < lo;
  const nearHi = area > hi && area <= hi * 1.3;
  if (nearLo || nearHi) {
    return { fit: "ok", why: { en: `${m2} — close to the ${word.en} this day wants.`, is: `${Math.round(area)} m²/leikm. — nálægt ${word.is} sem dagurinn kallar á.` } };
  }
  const tooBig = area > hi;
  return {
    fit: "off",
    why: tooBig
      ? { en: `${m2} — too open for a ${sessionType} day (that's a running day's space).`, is: `${Math.round(area)} m²/leikm. — of opið fyrir ${sessionType} dag (það er hlaupadags-svæði).` }
      : { en: `${m2} — too tight for a ${sessionType} day (that's a mechanical day's space).`, is: `${Math.round(area)} m²/leikm. — of þröngt fyrir ${sessionType} dag (það er vélrænt-dags svæði).` },
  };
}

/** Stimulus type match → score. */
const STIM_COMPAT: Record<DaySessionType, DaySessionType[]> = {
  locomotive: ["mixed"],
  mechanical: ["mixed"],
  mixed: ["locomotive", "mechanical", "technical"],
  technical: ["mixed"],
};
function stimulusScore(sessionType: DaySessionType, stimulus: DaySessionType | null): number {
  if (stimulus == null) return 0;
  if (stimulus === sessionType) return 3;
  return STIM_COMPAT[sessionType].includes(stimulus) ? 1 : -1;
}

/** Category affinity — which drill families a day leans on (small nudge on top of stimulus + area). */
const CATEGORY_AFFINITY: Record<DaySessionType, Record<string, number>> = {
  locomotive: { running: 2, ssg: 1, possession: 1, transition: 1 },
  mechanical: { ssg: 1, possession: 1, finishing: 1, transition: 1 },
  mixed: { ssg: 1, possession: 1, transition: 1, finishing: 1 },
  technical: { possession: 2, finishing: 1, warmup: 1 },
};

const AREA_SCORE: Record<AreaFit, number> = { ideal: 3, ok: 1, unknown: 0, off: -3 };
const FIT_RANK: Record<AreaFit, number> = { ideal: 3, ok: 2, unknown: 1, off: 0 };

/**
 * Rank + pick the drills that express a training day. Space-driven categories are graded by pitch
 * size for the day (locomotive → large, mechanical → tight, …); the rest lean on stimulus type +
 * category affinity. Returns up to `limit` picks (default 6), kept varied across categories.
 * Pure; deterministic (stable tie-break by fit then name).
 */
export function pickDrillsForDay(drills: DrillPickInput[], sessionType: DaySessionType | null, opts?: { limit?: number }): DayDrillPick[] {
  const limit = opts?.limit ?? 6;
  if (!sessionType || !Array.isArray(drills) || drills.length === 0) return [];

  const scored: DayDrillPick[] = drills.map((d) => {
    // Measured pitch wins; otherwise fall back to a per-format estimate (flagged) so a drill that
    // only has a player count is still gradable for the day instead of showing "unknown".
    const measured = d.areaPerPlayerM2 != null && Number.isFinite(d.areaPerPlayerM2) ? d.areaPerPlayerM2 : null;
    const est = measured == null ? estimateAreaPerPlayer(d.totalPlayers) : null;
    const area = measured ?? est;
    const estimated = measured == null && est != null;
    const { fit, why } = areaFitForDay(sessionType, d.category, area);
    const cat = (d.category ?? "").toLowerCase();
    const score = stimulusScore(sessionType, d.stimulus) + AREA_SCORE[fit] + (CATEGORY_AFFINITY[sessionType][cat] ?? 0);
    // Estimated areas grade a touch softer than measured (off → ok) so a per-format guess never
    // hard-excludes a drill the coach may have set up differently on the day.
    const softFit: AreaFit = estimated && fit === "off" ? "ok" : fit;
    const finalWhy = estimated && why.en ? { en: `~${why.en} (estimated from ${d.totalPlayers ?? "?"} players — set a pitch size to confirm)`, is: `~${why.is} (áætlað út frá ${d.totalPlayers ?? "?"} leikm. — skráðu vallarstærð til að staðfesta)` } : why;
    return { id: d.id, name: d.name, category: d.category, stimulus: d.stimulus, areaPerPlayerM2: area, areaEstimated: estimated, areaFit: softFit, score, why: finalWhy };
  });

  scored.sort((a, b) => (b.score - a.score) || (FIT_RANK[b.areaFit] - FIT_RANK[a.areaFit]) || a.name.localeCompare(b.name));

  // First pass: keep it varied — cap drills per category so one family can't fill the whole list.
  const perCatCap = Math.max(2, Math.ceil(limit / 3));
  const catCount = new Map<string, number>();
  const picked: DayDrillPick[] = [];
  const used = new Set<string>();
  for (const d of scored) {
    if (picked.length >= limit) break;
    if (d.score <= 0) continue;
    const cat = (d.category ?? "other").toLowerCase();
    if ((catCount.get(cat) ?? 0) >= perCatCap) continue;
    picked.push(d); used.add(d.id); catCount.set(cat, (catCount.get(cat) ?? 0) + 1);
  }
  // Fill the rest (still positive-scoring) if the variety cap left us short.
  if (picked.length < limit) {
    for (const d of scored) {
      if (picked.length >= limit) break;
      if (used.has(d.id) || d.score <= 0) continue;
      picked.push(d); used.add(d.id);
    }
  }
  return picked;
}
