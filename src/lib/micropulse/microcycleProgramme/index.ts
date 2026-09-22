/**
 * Microcycle programme — the multi-day container ("Æfingavika").
 *
 * Lays out a player's training week split by matchday (MD-4 … MD-1, MD, MD+1),
 * with load TAPERING down as the match approaches, each day colour-coded, and the
 * player's capacity/movement gaps blended in as ONE emphasis input alongside the
 * MD-taper and readiness. It is the connective tissue over engines that already
 * exist — it does not re-implement session content.
 *
 * PURE + IO-free: it takes an already-loaded base snapshot, the ordered MD-tagged
 * days (with each day's canonical readiness colour when known), and the player's
 * top capacity gaps. The DB assembly lives in loader.ts.
 *
 * DESCRIPTIVE / advisory. It READS the canonical readiness colour to adapt a day
 * (exactly as the daily engine does) but NEVER writes readiness_entries.color /
 * v_coach_readiness_today_v8.final_color. The day colour below is a PLANNED-load
 * band, clearly distinct from the readiness verdict.
 *
 * Evidence: Martin-García 2018 (microcycle load distribution / MD taper); the
 * per-day session + its swaps carry their own citations (see strengthProgramming).
 */

import {
  buildStrengthSession,
  type StrengthSession,
  type PlayerStrengthSnapshot,
  type MdContext,
} from "../strengthProgramming";
import { zoneFromColor, type ReadinessZone } from "@/lib/client/readinessAdjust";
import type { QualityId } from "../playerAnalysis/athleteProfile";
import { distributeStrengthVolume, type InSeasonStrengthMode } from "../strengthProgramming/inSeasonStrengthMode";

type Bi = { en: string; is: string };

/** The full set of MD tags a microcycle day can carry (incl. match + rest). */
export type MdTag = MdContext | "MD-5" | "MD";

/** Planned load band for a day — the taper shape, NOT the readiness verdict. */
export type PlannedBand = "high" | "moderate" | "light" | "match" | "off";

/** Traffic-light shown on a day. 'none' = no session (MD / OFF). */
export type DayColour = "green" | "yellow" | "red" | "none";

/** A capacity / role gap the week should try to address (from athleteProfile / roleDemandFit). */
export type GapNote = {
  quality: QualityId;
  source: "capacity" | "role";
  label: Bi;         // plain "power is a gap for his position"
  preferredMd: MdContext; // the microcycle day best suited to train it
};

/** An emphasis placed on a specific day because of a gap. */
export type EmphasisNote = {
  quality: QualityId;
  text: Bi;
};

export type MicrocycleDayInput = {
  date: string;                 // ISO YYYY-MM-DD
  mdTag: MdTag;
  isTodayOrPast: boolean;       // only these can be readiness-adjusted
  readinessColor?: string | null; // canonical readiness_entries.color, when known
};

export type MicrocycleDay = {
  date: string;
  mdTag: MdTag;
  plannedBand: PlannedBand;
  colour: DayColour;
  /** true = the player's readiness on the day made this EASIER than planned. */
  readinessAdjusted: boolean;
  session: StrengthSession | null;
  emphasis: EmphasisNote[];
  /** 2–3 plain supporting facts (the explainability layer-1 read). */
  facts: Bi[];
  confidence: number;
  provenance: string[];
  /** Share (%) of the week's strength volume this day carries under the in-season mode. */
  strengthSharePct?: number | null;
  /** True on the dedicated strength days in traditional mode (MD-4 / MD-2). */
  dedicatedStrengthDay?: boolean;
};

export type MicrocycleProgramme = {
  playerId: string;
  playerName?: string;
  weekStart: string;
  days: MicrocycleDay[];
  topGaps: GapNote[];
};

export type BuildMicrocycleInput = {
  /** Current-state signals for the player (mdContext is overwritten per day). */
  baseSnapshot: PlayerStrengthSnapshot;
  days: MicrocycleDayInput[];
  /** Ranked capacity/role gaps (top first); already resolved by the loader. */
  topGaps: GapNote[];
  weekStart: string;
  /** In-season strength mode — microdose (spread) vs traditional (concentrate on MD-4 + MD-2). */
  inSeasonStrengthMode?: InSeasonStrengthMode;
};

// ── Taper ladder → band. Mirrors match_demand_template (fmpRunningHigh fractions:
//    MD-4 1.05 / MD-3 0.90 / MD-2 0.55 / MD-1 0.35 / MD+1 0.20 / MD 1.00). ────────
const BAND_BY_MD: Record<MdTag, PlannedBand> = {
  "MD-5": "high",
  "MD-4": "high",
  "MD-3": "high",
  "MD-2": "moderate",
  "MD-1": "light",
  MD: "match",
  "MD+1": "light",
  "MD+2": "off",
  "MD+3": "off",
  OFF: "off",
};

const COLOUR_BY_BAND: Record<PlannedBand, DayColour> = {
  high: "green",
  moderate: "yellow",
  light: "red",
  match: "green", // match day itself is a full effort
  off: "none",
};

const ZONE_SEVERITY: Record<ReadinessZone, number> = { green: 0, yellow: 1, red: 2 };
const COLOUR_SEVERITY: Record<Exclude<DayColour, "none">, number> = { green: 0, yellow: 1, red: 2 };
const SEVERITY_COLOUR: Record<number, Exclude<DayColour, "none">> = { 0: "green", 1: "yellow", 2: "red" };

/**
 * Which microcycle day best trains each quality (Martin-García-style distribution:
 * heavy/strength furthest from the match, power mid-week, activation late). Used to
 * PLACE a capacity gap's emphasis on the right day — it never raises the day's ceiling.
 */
const GAP_PREFERRED_MD: Record<QualityId, MdContext> = {
  max_strength: "MD-4",
  robustness: "MD-4",
  deceleration: "MD-4",
  work_capacity: "MD-4",
  aerobic_endurance: "MD-4",
  anaerobic_reserve: "MD-4",
  peak_demands: "MD-4",
  reactive_power: "MD-3",
  vbt_power: "MD-3",
  mechanical_power: "MD-3",
  speed: "MD-3",
  acceleration: "MD-3",
  change_of_direction: "MD-2",
};

/** Severity-max of the planned colour and the readiness zone — readiness can only
 *  make a day EASIER (higher severity), never harder. */
function adjustColour(planned: DayColour, zone: ReadinessZone | null): { colour: DayColour; adjusted: boolean } {
  if (planned === "none" || zone == null) return { colour: planned, adjusted: false };
  const worst = Math.max(COLOUR_SEVERITY[planned], ZONE_SEVERITY[zone]);
  const colour = SEVERITY_COLOUR[worst];
  return { colour, adjusted: worst > COLOUR_SEVERITY[planned] };
}

/** Build the whole microcycle. Pure. */
export function buildMicrocycleProgramme(input: BuildMicrocycleInput): MicrocycleProgramme {
  const { baseSnapshot, days, topGaps, weekStart } = input;

  const out: MicrocycleDay[] = days.map((d) => {
    const plannedBand = BAND_BY_MD[d.mdTag] ?? "off";
    const plannedColour = COLOUR_BY_BAND[plannedBand];

    // Readiness only applies to today/past days (future days have no check-in yet).
    const zone = d.isTodayOrPast ? zoneFromColor(d.readinessColor) : null;
    const { colour, adjusted } = adjustColour(plannedColour, zone);

    // Per-day session via the EXISTING generator. Future days carry no readiness
    // verdict (planned session at planned band); today/past keep the real verdict
    // so the session is the same one the daily card resolves.
    const mdContext = d.mdTag as MdContext;
    const daySnap: PlayerStrengthSnapshot = {
      ...baseSnapshot,
      todayIso: d.date,
      mdContext,
      verdict: d.isTodayOrPast ? baseSnapshot.verdict : null,
    };
    const session = buildStrengthSession(daySnap);

    // Emphasis: surface each top gap on the day best suited to train it.
    const emphasis: EmphasisNote[] = [];
    for (const g of topGaps) {
      if (g.preferredMd === d.mdTag && session) {
        emphasis.push({
          quality: g.quality,
          text: {
            en: `Extra focus for ${baseSnapshot.playerName ?? "this player"}: ${g.label.en} — this ${d.mdTag} day is where the week trains it.`,
            is: `Aukin áhersla fyrir ${baseSnapshot.playerName ?? "leikmanninn"}: ${g.label.is} — þessi ${d.mdTag} dagur er þar sem vikan þjálfar það.`,
          },
        });
      }
    }

    const facts: Bi[] = [];
    facts.push({
      en: `${d.mdTag}: ${bandPlainEn(plannedBand)} planned load${d.mdTag === "MD-1" || d.mdTag === "MD+1" ? " — light, close to the match" : ""}.`,
      is: `${d.mdTag}: ${bandPlainIs(plannedBand)} áætlað álag${d.mdTag === "MD-1" || d.mdTag === "MD+1" ? " — létt, nálægt leik" : ""}.`,
    });
    if (adjusted) {
      facts.push({
        en: `Eased today — his check-in (${zone}) is below the planned day, so the session is reduced.`,
        is: `Minnkað í dag — skráningin hans (${zone}) er undir áætluðum degi, svo æfingin er minnkuð.`,
      });
    }
    if (emphasis.length) {
      facts.push({ en: emphasis[0].text.en, is: emphasis[0].text.is });
    }

    const provenance = [
      "planned band ← match_demand_template MD taper (Martin-García 2018)",
      "session ← strengthProgramming.buildStrengthSession (per-day, cited swaps)",
    ];
    if (d.isTodayOrPast) provenance.push("colour eased by readiness_entries.color (read-only; never written)");

    return {
      date: d.date,
      mdTag: d.mdTag,
      plannedBand,
      colour,
      readinessAdjusted: adjusted,
      session,
      emphasis,
      facts,
      confidence: session?.confidence ?? 0.5,
      provenance,
    };
  });

  // In-season mode → distribute the week's STRENGTH volume across the days that build a session.
  // microdose spreads it (per-MD taper weights); traditional concentrates it on MD-4 + MD-2. The
  // per-day sessions are unchanged — this adds the share + a directive fact (both equated on the
  // weekly total, Cuthbert 2021), so the coach's choice reshapes how the week reads and directs.
  const mode: InSeasonStrengthMode = input.inSeasonStrengthMode ?? "microdose";
  const MD_STRENGTH_WEIGHT: Record<string, number> = { "MD-4": 105, "MD-3": 90, "MD-2": 55, "MD-1": 35, "MD+1": 20, "MD+2": 60, "MD+3": 70 };
  const perMd: Record<string, number> = {};
  for (const day of out) if (day.session) perMd[day.mdTag] = MD_STRENGTH_WEIGHT[day.mdTag] ?? 50;
  const distributed = distributeStrengthVolume(perMd, mode);
  const totalVol = Object.values(distributed).reduce((a, b) => a + b, 0);
  for (const day of out) {
    if (!(day.mdTag in distributed)) { day.strengthSharePct = null; day.dedicatedStrengthDay = false; continue; }
    const v = distributed[day.mdTag];
    const share = totalVol > 0 ? Math.round((v / totalVol) * 100) : 0;
    day.strengthSharePct = share;
    day.dedicatedStrengthDay = mode === "traditional" && v > 0;
    day.facts.push(
      mode === "traditional"
        ? v > 0
          ? { en: `Traditional strength — dedicated day: carries ~${share}% of the week's strength volume.`, is: `Hefðbundinn styrkur — sérdagur: ber ~${share}% af vikumagni styrks.` }
          : { en: "Traditional strength — minimal here; the week's strength is concentrated on MD-4 + MD-2.", is: "Hefðbundinn styrkur — lágmark hér; vikustyrkur einbeittur á MD-4 + MD-2." }
        : { en: `Microdose strength — ~${share}% of the week's strength volume (spread across the week).`, is: `Microdose styrkur — ~${share}% af vikumagni styrks (dreift yfir vikuna).` },
    );
  }

  return {
    playerId: baseSnapshot.playerId,
    playerName: baseSnapshot.playerName,
    weekStart,
    days: out,
    topGaps,
  };
}

function bandPlainEn(b: PlannedBand): string {
  return b === "high" ? "high" : b === "moderate" ? "moderate" : b === "light" ? "light" : b === "match" ? "match" : "rest";
}
function bandPlainIs(b: PlannedBand): string {
  return b === "high" ? "hátt" : b === "moderate" ? "miðlungs" : b === "light" ? "létt" : b === "match" ? "leikur" : "hvíld";
}

/** Map a quality to the microcycle day that trains it — for the loader to place gaps. */
export function preferredMdForQuality(q: QualityId): MdContext {
  return GAP_PREFERRED_MD[q];
}
