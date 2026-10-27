/**
 * Pre-season WEEK-1 starting load target + ramp.
 *
 * A launch pad for the coach: week 1 is a controlled RE-ENTRY (a fraction of a match, not full match
 * load — detrained players come off the break), then a safe progressive ramp across the pre-season
 * weeks toward the existing pre-season build (`weeklyTargetFromMatch` preseason ~2.2–4.2× a match/week).
 *
 * Anchor = the player's/team's own typical MATCH demand (the existing load unit). Each KPI is scaled
 * from `matchKpiAvg` by the week's multiple × its OWN taper share (high-intensity KPIs — HSR, sprint —
 * accumulate a smaller weekly ×match than volume; `kpiTaperShare`), and an sRPE/AU (RPE×min) target
 * rides alongside so non-GPS teams get an arbitrary-units number too.
 *
 * Pure, deterministic, null-safe. Advisory — the coach edits the week-1 multiple / ramp. Descriptive:
 * nothing here sets the readiness colour or the daily decision. Reuses `weeklyTargetFromMatch` for the
 * peak multiple; takes per-KPI + sRPE match anchors as inputs (does NOT import the load-target engine).
 *
 * Citations: Teixeira 2021 (~80/20 training:match); Figueiredo (match as the load unit);
 * Gabbett / Malone (ACWR, progressive loading, controlled re-entry); Foster (sRPE); Vanrenterghem
 * 2017 (physiological vs biomechanical load-adaptation pathways — progress them differently);
 * Harper & McBurnie 2021 (deceleration = highest tissue load); Duhig 2016 (HSR/sprint & hamstring).
 */

import { weeklyTargetFromMatch, type Bi } from "./index";
import { kpiTaperShare, pathwayRampGamma, kpiReentryFloor } from "./plannedVolume";

export type LoadAnchor = "match_this_season" | "match_last_season" | "normative" | "srpe_only";
export type Confidence = "high" | "moderate" | "low";

export interface PreseasonWeekTarget {
  weekIndex: number;                       // 1 = first pre-season week
  multipleOfMatch: number | null;          // this week's weekly load as ×match (week 1 low, ramps up)
  weeklyLoadTarget: number | null;
  perSessionLoad: number | null;
  sessionCount: number;
  byKpi: Partial<Record<string, number>>;  // per-KPI weekly target (all main variables), scaled by the multiple
  sRpeAuTarget: number | null;             // RPE×min arbitrary-units weekly target
  note: Bi;
  anchor: LoadAnchor;
  confidence: Confidence;
}

export interface PreseasonStartOpts {
  matchTypicalLoad: number | null;                          // the team/player match unit (GPS composite or AU)
  matchKpiAvg?: Partial<Record<string, number>> | null;     // per-KPI match averages (TD/HSR/sprint/accel/decel/PlayerLoad…)
  matchSrpeAu?: number | null;                              // typical match sRPE in AU (RPE×min) — the parallel currency
  sessionsPerWeek?: number;                                 // default 4
  preseasonWeeks: number;                                   // number of ramp weeks
  week1MatchMultiple?: number;                              // default ~1.3× (re-entry) — configurable
  peakMatchMultiple?: number;                               // default from weeklyTargetFromMatch preseason
  /** Coach's WEEK-1 value per KPI (the actual weekly target for week 1). When set for a KPI, the ramp runs
   *  from that value to the KPI's peak (rest computed from week 1); unset KPIs use the auto re-entry floor. */
  week1KpiOverride?: Partial<Record<string, number>> | null;
  anchor: LoadAnchor;
}

/**
 * Normative match-unit reference (adult football, team average) for clubs WITHOUT their own GPS/match data —
 * so the pre-season ramp still produces numbers the coach can then ADJUST (per-KPI week-1 editing). A
 * starting point, never a norm. Keys match the WeeklyLoadMetric KPI names.
 */
export const NORMATIVE_MATCH_KPI: Record<string, number> = {
  totalDistance: 10000, velocityBand5: 620, velocityBand6: 180, accelB23: 40, decelB23: 46, totalPlayerLoad: 1100,
};
export const NORMATIVE_MATCH_LOAD = 1100; // PlayerLoad unit when the team has none

const CONFIDENCE_BY_ANCHOR: Record<LoadAnchor, Confidence> = {
  match_this_season: "high",
  match_last_season: "moderate",
  normative: "low",
  srpe_only: "low",
};

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pre-season FRIENDLY match exposure — the fraction of a full match a friendly represents, because players
 * build match fitness through partial minutes. It RAMPS across the pre-season: early cameos (~0.5 ≈ 45 min)
 * up to near-full (~0.9 ≈ 80 min) by the opener (Buchheit/Gabbett — progressive re-exposure to match load).
 * The partial friendly COUNTS toward the week's load budget; training fills the remainder. Clamped 0.5–0.9.
 */
export function preseasonMatchExposure(weekIndex: number, totalWeeks: number): number {
  const n = Math.max(1, Math.round(totalWeeks));
  if (n <= 1) return 0.9;
  const i = Math.max(1, Math.min(n, Math.round(weekIndex)));
  const frac = (i - 1) / (n - 1); // 0 (first week) → 1 (last week before the opener)
  return Math.round((0.5 + 0.4 * frac) * 100) / 100;
}

/** The pre-season BUILD destination multiple (load-independent — depends only on session count). */
export function defaultPeakMultiple(sessionsPerWeek: number): number {
  const wk = weeklyTargetFromMatch(1, { phase: "preseason", sessionCount: sessionsPerWeek });
  // matchMultiple is null only when the match unit is null; we pass 1 so it always resolves.
  return wk.matchMultiple ?? Math.min(4.2, Math.max(2.0, 2.2 + 0.35 * (Math.max(1, Math.round(sessionsPerWeek)) - 3)));
}

/**
 * One row per pre-season week: week 1 is the controlled re-entry starting point, later weeks ramp
 * (monotonically) toward the pre-season build multiple. Every KPI + the sRPE/AU target scales by the
 * week's ×match multiple.
 */
export function preseasonStartRamp(opts: PreseasonStartOpts): PreseasonWeekTarget[] {
  const sc = Math.max(1, Math.round(opts.sessionsPerWeek ?? 4));
  const weeks = Math.max(1, Math.round(opts.preseasonWeeks));
  const week1 = Math.max(0.1, opts.week1MatchMultiple ?? 1.3);
  // Peak is the build destination; never let it fall below week 1 (guards odd inputs → monotonic).
  const peak = Math.max(week1, opts.peakMatchMultiple ?? defaultPeakMultiple(sc));
  const anchor = opts.anchor;
  const confidence = CONFIDENCE_BY_ANCHOR[anchor];
  const kpiKeys = Object.keys(opts.matchKpiAvg ?? {});

  const rows: PreseasonWeekTarget[] = [];
  for (let i = 1; i <= weeks; i++) {
    // Linear ramp week1 → peak (the VOLUME pathway) — the headline ×match bar, sRPE/AU and the note.
    // Single-week pre-season stays at the re-entry multiple.
    const frac = weeks > 1 ? (i - 1) / (weeks - 1) : 0;
    const mult = r2(week1 + (peak - week1) * frac);

    const weekly = opts.matchTypicalLoad != null ? r0(opts.matchTypicalLoad * mult) : null;
    const perSession = weekly != null ? r0(weekly / sc) : null;

    // Per-KPI target = the week's multiple × the KPI's own WITHIN-WEEK taper share (how much it
    // accumulates over the MD-day shape — sprint < HSR < acc/dec < distance; Martín-García 2018,
    // Oliva-Lozano 2020) × a pathway-specific PROGRESSION: biomechanical/tissue metrics (decel, sprint,
    // HSR, COD, high stride) ramp on a CONSERVATIVE convex curve (γ>1 — stays low early, rises late),
    // physiological/metabolic metrics (accel, distance) ramp linearly, to the same end-of-pre-season
    // destination. Separates the two load-adaptation pathways (Vanrenterghem 2017; Harper & McBurnie
    // 2021 — decel = highest tissue load; Duhig 2016 — HSR/sprint & hamstring).
    // Each KPI ramps from its OWN week-1 re-entry FLOOR (fraction of peak) to the shared peak. Aerobic
    // volume (distance) and HSR start HIGH (safe base, built early); high-speed/mechanical keep the generic,
    // conservative re-entry. The floor never pulls a KPI below the coach's week-1 multiple. The biomechanical
    // pathway still ramps convex in between (Vanrenterghem). Jeong 2011; Teixeira 2021.
    const w1frac = peak > 0 ? week1 / peak : 0;
    const byKpi: Partial<Record<string, number>> = {};
    for (const k of kpiKeys) {
      const v = opts.matchKpiAvg?.[k];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const share = kpiTaperShare(k);
      const peakVal = v * peak * share;                                  // end-of-pre-season destination
      const autoWeek1 = Math.max(kpiReentryFloor(k), w1frac) * peak * v * share; // auto re-entry floor value
      // Coach's week-1 override for this KPI wins; the rest of the ramp is computed FROM it (week 1 → peak).
      const ov = opts.week1KpiOverride?.[k];
      const week1Val = typeof ov === "number" && Number.isFinite(ov) && ov > 0 ? ov : autoWeek1;
      const top = Math.max(peakVal, week1Val);                           // never ramp downward (override ≥ peak → flat)
      const fracK = weeks > 1 ? Math.pow(frac, pathwayRampGamma(k)) : 0;
      byKpi[k] = r0(week1Val + (top - week1Val) * fracK);
    }

    const sRpeAuTarget = opts.matchSrpeAu != null && Number.isFinite(opts.matchSrpeAu)
      ? r0(opts.matchSrpeAu * mult)
      : null;

    const note: Bi = i === 1
      ? {
          en: `Week 1 — controlled re-entry (~${mult}× a match across ${sc} sessions). A starting point; build from here.`,
          is: `Vika 1 — stýrð endurkoma (~${mult}× leik yfir ${sc} æfingar). Upphafspunktur; byggðu upp héðan.`,
        }
      : i === weeks
        ? {
            en: `Week ${i} — pre-season build (~${mult}× a match). Ramp destination.`,
            is: `Vika ${i} — undirbúnings-uppbygging (~${mult}× leik). Endapunktur stigmögnunar.`,
          }
        : {
            en: `Week ${i} — ramping up (~${mult}× a match). Progressive, ACWR-safe.`,
            is: `Vika ${i} — stigmögnun (~${mult}× leik). Framsækið, ACWR-öruggt.`,
          };

    rows.push({
      weekIndex: i,
      multipleOfMatch: mult,
      weeklyLoadTarget: weekly,
      perSessionLoad: perSession,
      sessionCount: sc,
      byKpi,
      sRpeAuTarget,
      note,
      anchor,
      confidence,
    });
  }
  return rows;
}
