/**
 * Session-fit check — does a built session fit TODAY'S MD day, under the active periodization model?
 *
 * Advisory only. Given (a) a summary of the session the coach just built, (b) the day's target load
 * (from the existing plannedSessionLoad / loadTargets engines) and (c) the active model's spec for
 * the day, it returns a layered, explainable verdict:
 *   - load_overshoot  — the session carries more load than the day should (band / AU / % of match),
 *                        with the KPIs driving it and a counterfactual.
 *   - type_mismatch   — the session's dominant load type is wrong for the day (e.g. locomotive on a
 *                        mechanical MD-4), naming the drills pushing it the wrong way.
 *   - tactical_mismatch (confidence-gated) — no drill carries the day's emphasised moment / principle.
 *                        Omitted entirely when the model sets no tactical target for the day.
 *
 * Pure, deterministic, null-safe. No I/O, no colour, never blocks a save. The model and target are
 * passed in — this file re-derives no load engine. Cites the same evidence as plannedSessionLoad /
 * drillMdFit / the Tactical Periodization model.
 */

import type { SessionLoadBand } from "@/lib/micropulse/plannedSessionLoad";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { DrillLoadType } from "@/lib/micropulse/load/drillMdFit";
import type { IntendedType, MdDaySpec } from "./periodizationModel";

/**
 * Map a drill's classified load character (classifyDrillLoadType → DrillLoadType) to the model's
 * intended-type vocabulary. metabolic (running volume) reads as locomotive; balanced → mixed;
 * low-load drills (warm-up / technical) return null so they never swing the session's dominant type.
 */
export function drillTypeToIntended(t: DrillLoadType): IntendedType | null {
  switch (t) {
    case "mechanical": return "mechanical";
    case "locomotive": return "locomotive";
    case "speed": return "speed";
    case "metabolic": return "locomotive";
    case "balanced": return "mixed";
    case "low": return null;
    default: return null;
  }
}

export type FitLevel = "ok" | "watch" | "mismatch";

export interface SessionFitWarning {
  kind: "load_overshoot" | "type_mismatch" | "tactical_mismatch";
  level: FitLevel;
  /** Layer-0 verdict line. */
  headline: Bi;
  /** 2–3 plain facts — the "why", visible without a click. */
  why: Bi[];
  /** "Drop X / shrink the area → back in band." */
  counterfactual: Bi;
  /** Lower when drill metrics are estimated / off-ball, or inputs are sparse. */
  confidence: "high" | "moderate" | "low";
}

export interface SessionFitResult {
  /** Layer-0: does the session fit today? */
  verdict: "fits" | "review";
  warnings: SessionFitWarning[];
  daySpec: MdDaySpec | null;
  modelName: Bi;
  /** One-line layer-0 headline for the banner. */
  headline: Bi;
}

/** Summary of the session the coach built (aggregated by the caller from the chosen drills). */
export interface BuiltSessionSummary {
  /** Dominant load type of the built session (aggregate of the drills). Null when unknown. */
  dominantType: IntendedType | null;
  /** Built session sRPE load (rpe × min), in AU. Null when unknown. */
  loadAu: number | null;
  /** Built session as a share of a typical match, in percent. Null when unknown. */
  matchPct: number | null;
  /** Built per-KPI totals (e.g. { hsr, player_load, accel_decel }). Optional. */
  perKpi?: Partial<Record<string, number>> | null;
  /** True when any drill in the session was classified from area/category rather than GPS. */
  anyMetricsEstimated?: boolean;
}

/** The day's target load (normal for this MD day) — bridged from plannedSessionLoad / loadTargets. */
export interface DayLoadTarget {
  band: SessionLoadBand;
  /** Target share of a match, in percent. */
  matchPct: number;
  /** Target sRPE load for the day, in AU. */
  loadAu: number;
  /** Per-KPI targets, same keys as BuiltSessionSummary.perKpi. Optional. */
  byKpi?: Partial<Record<string, number>> | null;
}

export interface DrillForFit {
  id: string;
  name?: string | null;
  loadType: IntendedType | null;
  category?: string | null;
  tacticalMoment?: string | null;
  principleTag?: string | null;
  metricsEstimated?: boolean;
}

const BAND_ORDINAL: Record<SessionLoadBand, number> = { light: 0, moderate: 1, high: 2, very_high: 3 };

/** Overshoot thresholds as a ratio of session/target (a coaching convention, tunable). */
const OVERSHOOT_WATCH = 1.12;
const OVERSHOOT_MISMATCH = 1.35;
/** Per-KPI driver is "driving the overshoot" when it exceeds its target by this fraction. */
const KPI_DRIVER_RATIO = 1.15;

const KPI_LABEL: Record<string, Bi> = {
  hsr: { en: "high-speed running", is: "háhraðahlaup" },
  player_load: { en: "PlayerLoad", is: "PlayerLoad" },
  playerload: { en: "PlayerLoad", is: "PlayerLoad" },
  accel_decel: { en: "accel/decel", is: "hröðun/hemlun" },
  accel: { en: "accelerations", is: "hröðun" },
  decel: { en: "decelerations", is: "hemlun" },
  distance: { en: "total distance", is: "heildarvegalengd" },
  sprint: { en: "sprint distance", is: "sprettvegalengd" },
};

const TYPE_WORD: Record<IntendedType, Bi> = {
  mechanical: { en: "mechanical", is: "vélrænt" },
  locomotive: { en: "locomotive", is: "hlaupaálag" },
  speed: { en: "speed", is: "hraði" },
  mixed: { en: "mixed", is: "blandað" },
};

const MOMENT_WORD: Record<string, Bi> = {
  def_org: { en: "defensive organisation", is: "varnarskipulag" },
  def_to_att: { en: "defence → attack transition", is: "vörn → sókn umskipti" },
  att_org: { en: "attacking organisation", is: "sóknarskipulag" },
  att_to_def: { en: "attack → defence transition", is: "sókn → vörn umskipti" },
};

function kpiLabel(key: string): Bi {
  return KPI_LABEL[key.toLowerCase()] ?? { en: key, is: key };
}

/**
 * Type compatibility: are the built-session type and the day's intended type a fit, a soft watch,
 * or a hard mismatch? mechanical ↔ locomotive are opposites; speed sits apart from both; mixed
 * accommodates most; "null" (unknown) is never a mismatch.
 */
function typeFit(built: IntendedType, intended: IntendedType): FitLevel {
  if (built === intended) return "ok";
  if (intended === "mixed" || built === "mixed") return "watch"; // a mixed day accommodates most
  // The hard opposites — running volume vs force on a day that wants the other.
  const opposite =
    (intended === "mechanical" && built === "locomotive") ||
    (intended === "locomotive" && built === "mechanical") ||
    (intended === "speed" && (built === "mechanical" || built === "locomotive")) ||
    (intended === "mechanical" && built === "speed") ||
    (intended === "locomotive" && built === "speed");
  return opposite ? "mismatch" : "watch";
}

/** Aggregate the dominant load type of the built session from its drills (count-weighted). */
export function aggregateSessionType(drills: Array<{ loadType: IntendedType | null }>): IntendedType | null {
  const counts = new Map<IntendedType, number>();
  for (const d of drills) {
    if (!d.loadType) continue;
    // "low" never reaches here (drills carry mapped IntendedType); count what we have.
    counts.set(d.loadType, (counts.get(d.loadType) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: IntendedType | null = null;
  let bestN = -1;
  for (const [t, n] of counts) {
    if (n > bestN) { best = t; bestN = n; }
  }
  return best;
}

/** Overshoot ratio from the strongest available signal (AU preferred, then % of match). */
function overshootRatio(session: BuiltSessionSummary, target: DayLoadTarget): { ratio: number; basis: "au" | "match_pct" } | null {
  if (session.loadAu != null && target.loadAu > 0) return { ratio: session.loadAu / target.loadAu, basis: "au" };
  if (session.matchPct != null && target.matchPct > 0) return { ratio: session.matchPct / target.matchPct, basis: "match_pct" };
  return null;
}

/**
 * Check a built session against the day. All inputs are optional/null-safe: no target → skip
 * overshoot; no daySpec → skip type/tactical; no tactical target → skip tactical.
 */
export function checkSessionFit(opts: {
  session: BuiltSessionSummary;
  dayTarget?: DayLoadTarget | null;
  daySpec: MdDaySpec | null;
  modelName: Bi;
  drills?: DrillForFit[] | null;
}): SessionFitResult {
  const { session, dayTarget, daySpec, modelName } = opts;
  const drills = opts.drills ?? [];
  const warnings: SessionFitWarning[] = [];
  const dayLabel = daySpec?.mdDay ?? null;

  // ── 1. Load overshoot vs the day's band / AU / % of match ──────────────────────────────────
  if (dayTarget) {
    const or = overshootRatio(session, dayTarget);
    // Model intensity cap (as % of match) is a second, model-driven ceiling.
    const capPct = daySpec?.intensityCapPct ?? null;
    const overCap = capPct != null && session.matchPct != null && session.matchPct > capPct;

    if (or && or.ratio >= OVERSHOOT_WATCH) {
      const level: FitLevel = or.ratio >= OVERSHOOT_MISMATCH ? "mismatch" : "watch";
      const pct = Math.round((or.ratio - 1) * 100);
      const dayTxt = dayLabel ? `${dayLabel} ` : "";
      const why: Bi[] = [];
      // Band / magnitude fact.
      why.push({
        en: `This session is about ${pct}% above the ${dayLabel ?? "day"}'s normal load${session.matchPct != null && dayTarget.matchPct ? ` (~${Math.round(session.matchPct)}% of a match vs a ~${Math.round(dayTarget.matchPct)}% target)` : ""}.`,
        is: `Þessi æfing er um ${pct}% yfir venjulegu álagi ${dayLabel ?? "dagsins"}${session.matchPct != null && dayTarget.matchPct ? ` (~${Math.round(session.matchPct)}% af leik á móti ~${Math.round(dayTarget.matchPct)}% viðmiði)` : ""}.`,
      });
      // KPI drivers.
      const drivers = kpiDrivers(session.perKpi, dayTarget.byKpi);
      if (drivers.length) {
        why.push({
          en: `Driven by ${listBi(drivers, "en")}.`,
          is: `Keyrt af ${listBi(drivers, "is")}.`,
        });
      }
      if (overCap) {
        why.push({
          en: `Above the model's ${capPct}%-of-match cap for ${dayLabel}.`,
          is: `Yfir ${capPct}%-af-leik þaki módelsins fyrir ${dayLabel}.`,
        });
      }
      warnings.push({
        kind: "load_overshoot",
        level,
        headline: {
          en: `Load looks high for ${dayLabel ?? "today"} — ~${pct}% over the day's band.`,
          is: `Álag virðist hátt fyrir ${dayLabel ?? "daginn"} — ~${pct}% yfir bandi dagsins.`,
        },
        why,
        counterfactual: {
          en: `Drop a block or shrink the pitch/area → back into the ${dayTxt}band.`,
          is: `Slepptu kafla eða minnkaðu völl/svæði → aftur í ${dayTxt}bandið.`,
        },
        confidence: drivers.length ? "high" : or.basis === "au" ? "moderate" : "low",
      });
    } else if (overCap) {
      // AU/band in range but the model's explicit cap is exceeded — a model-driven watch.
      warnings.push({
        kind: "load_overshoot",
        level: "watch",
        headline: {
          en: `Above the model's intensity cap for ${dayLabel} (${capPct}% of a match).`,
          is: `Yfir ákafa-þaki módelsins fyrir ${dayLabel} (${capPct}% af leik).`,
        },
        why: [{
          en: `This session is ~${Math.round(session.matchPct!)}% of a match; the active model caps ${dayLabel} at ${capPct}%.`,
          is: `Þessi æfing er ~${Math.round(session.matchPct!)}% af leik; virka módelið þakar ${dayLabel} við ${capPct}%.`,
        }],
        counterfactual: {
          en: "Trim the heaviest block to bring the session under the cap.",
          is: "Styttu þyngsta kaflann til að fara undir þakið.",
        },
        confidence: "moderate",
      });
    }
  }

  // ── 2. Load-type mismatch vs the day's intended stimulus ────────────────────────────────────
  if (daySpec && session.dominantType) {
    const level = typeFit(session.dominantType, daySpec.intendedType);
    if (level !== "ok") {
      const builtW = TYPE_WORD[session.dominantType];
      const wantW = TYPE_WORD[daySpec.intendedType];
      // Name the drills pushing the wrong way (those whose type == the built dominant, wrong type).
      const wrongDrills = drills
        .filter((d) => d.loadType && d.loadType === session.dominantType && d.loadType !== daySpec.intendedType)
        .map((d) => d.name ?? d.id)
        .slice(0, 4);
      const anyEstimated = session.anyMetricsEstimated || drills.some((d) => d.loadType === session.dominantType && d.metricsEstimated);
      const why: Bi[] = [{
        en: `Today (${dayLabel}) wants a ${wantW.en} stimulus, but the session is ${builtW.en}-dominant.`,
        is: `Dagurinn (${dayLabel}) kallar á ${wantW.is} áreiti, en æfingin er ${builtW.is}-drifin.`,
      }];
      if (wrongDrills.length) {
        why.push({
          en: `Pushed by: ${wrongDrills.join(", ")}.`,
          is: `Drifið af: ${wrongDrills.join(", ")}.`,
        });
      }
      warnings.push({
        kind: "type_mismatch",
        level,
        headline: {
          en: `Load type doesn't match ${dayLabel} — ${builtW.en} session on a ${wantW.en} day.`,
          is: `Álagsgerð passar ekki við ${dayLabel} — ${builtW.is} æfing á ${wantW.is} degi.`,
        },
        why,
        counterfactual: counterfactualForType(daySpec.intendedType),
        confidence: anyEstimated ? "low" : "moderate",
      });
    }
  }

  // ── 3. Tactical emphasis (confidence-gated; only when the model sets one) ────────────────────
  if (daySpec && (daySpec.tacticalMoment || daySpec.principleTag)) {
    const momentKey = daySpec.tacticalMoment ?? null;
    const tag = (daySpec.principleTag ?? "").toLowerCase();
    const matched = drills.some((d) => {
      const dm = (d.tacticalMoment ?? "").toLowerCase();
      const dt = (d.principleTag ?? "").toLowerCase();
      const cat = (d.category ?? "").toLowerCase();
      if (momentKey && dm === momentKey) return true;
      if (tag && (dt.includes(tag) || tag.split(/[^a-z]+/).some((w) => w.length > 3 && (dt.includes(w) || cat.includes(w))))) return true;
      return false;
    });
    if (!matched && drills.length) {
      const emphasis: Bi = momentKey && MOMENT_WORD[momentKey]
        ? MOMENT_WORD[momentKey]
        : { en: daySpec.principleTag ?? "the day's principle", is: daySpec.principleTag ?? "prinsipp dagsins" };
      warnings.push({
        kind: "tactical_mismatch",
        level: "watch",
        headline: {
          en: `No drill clearly carries the day's emphasis (${emphasis.en}).`,
          is: `Engin drilla ber greinilega áherslu dagsins (${emphasis.is}).`,
        },
        why: [{
          en: `${dayLabel} emphasises ${emphasis.en}, but none of the chosen drills are tagged for it. Tactical fit is read coarsely from drill category / tags — low confidence without event tracking.`,
          is: `${dayLabel} leggur áherslu á ${emphasis.is}, en engin valin drilla er merkt fyrir það. Taktísk samsvörun er lesin gróft úr flokki / merkjum drillna — lítið traust án viðburðagreiningar.`,
        }],
        counterfactual: {
          en: `Add or tag a drill that trains ${emphasis.en}.`,
          is: `Bættu við eða merktu drillu sem þjálfar ${emphasis.is}.`,
        },
        confidence: "low",
      });
    }
  }

  // ── Roll up ─────────────────────────────────────────────────────────────────────────────────
  const hasMismatch = warnings.some((w) => w.level === "mismatch");
  const verdict: SessionFitResult["verdict"] = hasMismatch ? "review" : "fits";
  const dayBit = daySpec ? ` (${daySpec.mdDay} · ${TYPE_WORD[daySpec.intendedType].en})` : "";
  const dayBitIs = daySpec ? ` (${daySpec.mdDay} · ${TYPE_WORD[daySpec.intendedType].is})` : "";
  const headline: Bi = hasMismatch
    ? { en: `Review — this session doesn't match today${dayBit}.`, is: `Yfirferð — æfingin passar ekki við daginn${dayBitIs}.` }
    : warnings.length
      ? { en: `Fits today${dayBit} — one thing to watch.`, is: `Passar í dag${dayBitIs} — eitt til að fylgjast með.` }
      : { en: `Fits today${dayBit}.`, is: `Passar í dag${dayBitIs}.` };

  return { verdict, warnings, daySpec, modelName, headline };
}

/** KPIs where the session exceeds its target by the driver ratio, as bilingual phrases. */
function kpiDrivers(
  sessionKpi: Partial<Record<string, number>> | null | undefined,
  targetKpi: Partial<Record<string, number>> | null | undefined,
): Bi[] {
  if (!sessionKpi || !targetKpi) return [];
  const out: Bi[] = [];
  for (const [key, tgtRaw] of Object.entries(targetKpi)) {
    const tgt = typeof tgtRaw === "number" ? tgtRaw : null;
    const val = sessionKpi[key];
    if (tgt == null || tgt <= 0 || typeof val !== "number") continue;
    if (val / tgt >= KPI_DRIVER_RATIO) {
      const lbl = kpiLabel(key);
      const pct = Math.round((val / tgt - 1) * 100);
      out.push({ en: `${lbl.en} (+${pct}%)`, is: `${lbl.is} (+${pct}%)` });
    }
  }
  return out.slice(0, 3);
}

function listBi(items: Bi[], lang: "en" | "is"): string {
  return items.map((i) => i[lang]).join(", ");
}

function counterfactualForType(intended: IntendedType): Bi {
  switch (intended) {
    case "mechanical":
      return { en: "Swap a large-pitch possession for a small-area 1v1 / finishing block to raise mechanical load.", is: "Skiptu stórvallar-bolta út fyrir smásvæða 1v1 / klárunarkafla til að auka vélrænt álag." };
    case "locomotive":
      return { en: "Open the pitch up / add a continuous running block to raise high-speed running.", is: "Opnaðu völlinn / bættu við samfelldum hlaupakafla til að auka háhraðahlaup." };
    case "speed":
      return { en: "Replace volume work with short max-velocity actions and long recoveries.", is: "Skiptu magnvinnu út fyrir stuttar hámarkshraða-aðgerðir með löngum hvíldum." };
    default:
      return { en: "Balance the session so no single load type dominates.", is: "Jafnaðu æfinguna svo engin ein álagsgerð ráði." };
  }
}

/**
 * Bridge a plannedSessionLoad result → a DayLoadTarget for the checker. Keeps "reuse the existing
 * engine" literally true: the caller computes planSessionLoad(ctx) and passes it here.
 */
export function dayTargetFromPlanned(planned: {
  applicable: boolean;
  band: SessionLoadBand;
  matchPct: number;
  sessionLoad: number;
} | null | undefined, byKpi?: Partial<Record<string, number>> | null): DayLoadTarget | null {
  if (!planned || !planned.applicable) return null;
  return { band: planned.band, matchPct: planned.matchPct, loadAu: planned.sessionLoad, byKpi: byKpi ?? null };
}

export { BAND_ORDINAL };
