/**
 * Peak-period RESEARCH benchmark — pure, side-effect free.
 *
 * Puts a footballer's peak-period / running output in context against an elite
 * reference: Ju et al. (2022), "Contextualised peak periods of play in English
 * Premier League matches" (Biol Sport 39(4):973-983, Table 2). The paper reports
 * peak 1/3/5-minute HIGH-INTENSITY RUNNING (>19.8 km/h) by outfield position, so
 * the benchmark is always POSITION-SCOPED — a winger is read against wingers.
 *
 * TWO comparison tracks, deliberately separated:
 *
 *   1. Comparable NOW — top speed (km/h), a single directly-measured number, graded
 *      against elite match-play bands. Game-total high-speed running and sprint
 *      distance are shown as ELITE CONTEXT (not graded against Table 2, which is a
 *      per-window HIR figure, not a game total).
 *
 *   2. Peak-period HIR per window (Table 2 proper) — HARD-GATED. The Catapult MII
 *      export MicroPulse reads gives only TOTAL distance + PlayerLoad per window
 *      (see player_load_peak_period: metrics 'distance'/'player_load', both m/min),
 *      NOT the high-speed (>19.8 km/h) fraction per window. So the app has no number
 *      that is comparable to Ju's 76 / 36 / 27 m·min-1. The engine therefore REFUSES
 *      to grade peak-period output against Table 2 while `peakHirPerMin` is absent,
 *      and surfaces the gap as a labelled note rather than a false green/red verdict.
 *      When real peak-HIR-per-window data lands (Catapult custom period, or raw GPS),
 *      pass it in and the track grades itself.
 *
 * HONEST PROVENANCE:
 *   - Position-scoped peak-HIR reference = Ju 2022 Table 2 (exact values below).
 *   - Top-speed bands are general elite match-play context (low-to-mid 30s km/h),
 *     capped at the 38 km/h ingestion plausibility gate; labelled as context, not Ju.
 *   - Missing input → null, never 0. Descriptive load context only — it NEVER touches
 *     the readiness colour, the load target, or the daily decision.
 */

import { juPositionGroup, JU_GROUP_LABEL, type JuGroup } from "@/lib/micropulse/positionStyle";

export type Bi = { en: string; is: string };
export type Confidence = "low" | "medium" | "high";
/** Where a graded value sits vs the elite reference. "context" = shown, not graded. "na" = no data. */
export type Band = "elite" | "high" | "average" | "below" | "context" | "na";

/** One window's Ju Table 2 peak HIR reference, m·min-1 (mean, and SD where the paper reports it). */
type JuWindowRef = { mean: number; sd: number | null };
type JuRow = { w1: JuWindowRef; w3: JuWindowRef; w5: JuWindowRef };

/**
 * Ju et al. 2022, Table 2 — peak-period high-intensity running (>19.8 km/h), m·min-1.
 * Mean ± SD (SD reported for the 1-min window; 3/5-min are the paper's mean rates).
 */
export const JU_TABLE2: Record<JuGroup, JuRow> = {
  CDP: { w1: { mean: 55, sd: 17 }, w3: { mean: 24, sd: null }, w5: { mean: 17, sd: null } },
  WDP: { w1: { mean: 76, sd: 18 }, w3: { mean: 35, sd: null }, w5: { mean: 26, sd: null } },
  CMP: { w1: { mean: 68, sd: 17 }, w3: { mean: 32, sd: null }, w5: { mean: 23, sd: null } },
  WOP: { w1: { mean: 76, sd: 16 }, w3: { mean: 36, sd: null }, w5: { mean: 27, sd: null } },
  COP: { w1: { mean: 71, sd: 14 }, w3: { mean: 32, sd: null }, w5: { mean: 25, sd: null } },
};
/** All-teams average (paper's overall row) — the fallback context when a group is unknown. */
export const JU_ALL: JuRow = { w1: { mean: 67, sd: 19 }, w3: { mean: 31, sd: null }, w5: { mean: 23, sd: null } };

/** Elite match-play top-speed bands, km/h. General context (not Ju); capped at the 38 gate. */
export const TOP_SPEED_ELITE = 34;
export const TOP_SPEED_HIGH = 32;
export const TOP_SPEED_AVERAGE = 30;
export const MAX_PLAUSIBLE_TOP_SPEED = 38;

/** Matches behind the game totals below this → confidence capped low. */
export const MIN_MATURE_MATCHES = 4;

export const CITATION =
  "Ju W et al. 2022, Contextualised peak periods of play in the EPL, Biol Sport 39(4):973-983 (Table 2, peak HIR by position)";

const CAVEAT: Bi = {
  en:
    "Position-scoped elite reference from Ju et al. (2022), Table 2 — peak-period high-intensity running (>19.8 km/h) by outfield role in the English Premier League. Top speed is graded against general elite match-play bands (low-to-mid 30s km/h), capped at the 38 km/h ingestion gate. The peak-period HIR-per-window benchmark is NOT graded here: the Catapult export gives total distance per window, not the high-speed fraction, so there is no number comparable to Table 2 yet. Descriptive context — it never changes the readiness verdict or the daily plan.",
  is:
    "Stöðu-bundin elite-viðmiðun úr Ju o.fl. (2022), Töflu 2 — hámarkstímabils háákafahlaup (>19,8 km/klst) eftir stöðu í ensku úrvalsdeildinni. Hámarkshraði er metinn á móti almennum elite-leikjaviðmiðum (rúmlega 30 km/klst), takmarkaður við 38 km/klst innlestrar-þröskuldinn. Hámarkstímabils háákafahlaup per glugga er EKKI metið hér: Catapult-útflutningurinn gefur heildarvegalengd per glugga, ekki háhraða-hlutann, svo engin tala er samanburðarhæf við Töflu 2 enn. Lýsandi samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

/** Peak-period HIR per window, m·min-1 — the real Table 2-comparable numbers, if they exist. */
export interface PeakHirPerMin {
  w1: number | null;
  w3: number | null;
  w5: number | null;
}

export interface PeakBenchmarkInput {
  position: string | null;
  sport?: string | null;
  /** Best in-game top speed, km/h (already read as km/h; > MAX_PLAUSIBLE is dropped upstream). */
  bestTopSpeedKmh: number | null;
  /** Game-total high-speed running, m per 90 (elite CONTEXT, not graded vs Table 2). */
  hsrPer90: number | null;
  /** Game-total sprint distance, m per 90 (elite CONTEXT). */
  sprintPer90: number | null;
  /** How many matches back the game totals (drives confidence). */
  matchCount: number;
  /**
   * Peak-period HIR per window, m·min-1 — pass ONLY real high-speed-per-window data.
   * null (the norm today) hard-gates the Table 2 track. NEVER pass total-distance m/min here.
   */
  peakHirPerMin?: PeakHirPerMin | null;
}

export interface BenchRow {
  key: string;
  label: Bi;
  playerValue: number | null;
  unit: string;
  /** Elite reference as text, e.g. ">=34" or "76 +/- 16". */
  eliteRef: string;
  band: Band;
  comparable: boolean;
}

export interface PeakHirTrack {
  comparable: boolean;
  gapNote: Bi;
  /** The group's Ju Table 2 reference (always shown, even when the player value is gated). */
  ref: { w1: string; w3: string; w5: string };
  /** Player rows — present (graded) only when comparable. */
  rows: BenchRow[];
}

export interface PeakBenchmarkRead {
  juGroup: JuGroup | null;
  juGroupLabel: Bi;
  verdict: Bi;
  facts: Bi[];
  /** Directly-comparable-now track: top speed (graded) + HSR/sprint context. */
  rows: BenchRow[];
  peakHir: PeakHirTrack;
  confidence: Confidence;
  citation: string;
  caveat: Bi;
}

function num(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** Grade a top speed (km/h) against the elite context bands. */
function bandTopSpeed(v: number): Band {
  if (v >= TOP_SPEED_ELITE) return "elite";
  if (v >= TOP_SPEED_HIGH) return "high";
  if (v >= TOP_SPEED_AVERAGE) return "average";
  return "below";
}

const refTxt = (r: JuWindowRef): string => (r.sd != null ? `${r.mean} +/- ${r.sd}` : `~${r.mean}`);

export function computePeakBenchmark(input: PeakBenchmarkInput): PeakBenchmarkRead {
  const juGroup = juPositionGroup(input.position, input.sport);
  const juGroupLabel: Bi = juGroup
    ? JU_GROUP_LABEL[juGroup]
    : { en: "this role", is: "þessari stöðu" };
  const juRow: JuRow = juGroup ? JU_TABLE2[juGroup] : JU_ALL;

  // Clamp top speed to the plausibility gate (a bad GPS spike shouldn't read "elite").
  const rawTop = num(input.bestTopSpeedKmh);
  const topSpeed = rawTop != null && rawTop <= MAX_PLAUSIBLE_TOP_SPEED ? rawTop : null;
  const hsr = num(input.hsrPer90);
  const sprint = num(input.sprintPer90);

  // ---- Track 1: comparable now ----
  const rows: BenchRow[] = [];
  rows.push({
    key: "top_speed",
    label: { en: "Top speed", is: "Hámarkshraði" },
    playerValue: topSpeed,
    unit: "km/h",
    eliteRef: `>=${TOP_SPEED_ELITE}`,
    band: topSpeed != null ? bandTopSpeed(topSpeed) : "na",
    comparable: topSpeed != null,
  });
  rows.push({
    key: "hsr90",
    label: { en: "High-speed running / 90", is: "Háhraðahlaup / 90" },
    playerValue: hsr,
    unit: "m",
    eliteRef: "elite context",
    band: hsr != null ? "context" : "na",
    comparable: false,
  });
  rows.push({
    key: "sprint90",
    label: { en: "Sprint distance / 90", is: "Sprettir / 90" },
    playerValue: sprint,
    unit: "m",
    eliteRef: "elite context",
    band: sprint != null ? "context" : "na",
    comparable: false,
  });

  // ---- Track 2: peak-period HIR per window (Table 2 proper) — hard-gated ----
  const hir = input.peakHirPerMin ?? null;
  const hasHir = hir != null && (num(hir.w1) != null || num(hir.w3) != null || num(hir.w5) != null);
  const peakHir: PeakHirTrack = {
    comparable: hasHir,
    gapNote: hasHir
      ? { en: "", is: "" }
      : {
          en:
            "Not yet comparable to Table 2. The Catapult MII export gives TOTAL distance per peak window, not high-intensity running (>19.8 km/h) per window — so the app's peak-window figure is not the same quantity as Ju's benchmark and must not be graded against it. To grade it: capture peak-period HSR (a Catapult custom period/parameter with the >19.8 km/h threshold, or from raw GPS).",
          is:
            "Ekki enn samanburðarhæft við Töflu 2. Catapult MII-útflutningurinn gefur HEILDARvegalengd per hámarksglugga, ekki háákafahlaup (>19,8 km/klst) per glugga — svo hámarksglugga-tala kerfisins er ekki sama stærð og viðmið Ju og má ekki meta á móti henni. Til að meta hana: náðu hámarkstímabils-HSR (Catapult sérsniðið tímabil/parameter með >19,8 km/klst þröskuldi, eða úr hráum GPS).",
        },
    ref: { w1: refTxt(juRow.w1), w3: refTxt(juRow.w3), w5: refTxt(juRow.w5) },
    rows: [],
  };
  if (hasHir && hir) {
    const mk = (key: string, labelEn: string, labelIs: string, v: number | null, r: JuWindowRef): BenchRow => {
      const pv = num(v);
      let band: Band = "na";
      if (pv != null) {
        // Graded on the paper's SD when available (elite = within/above 1 SD of the mean),
        // else a +/-15% context band around the mean.
        const hi = r.sd != null ? r.mean : r.mean * 1.15;
        const lo = r.sd != null ? r.mean - r.sd : r.mean * 0.85;
        band = pv >= hi ? "elite" : pv >= lo ? "average" : "below";
      }
      return {
        key, label: { en: labelEn, is: labelIs }, playerValue: pv, unit: "m/min",
        eliteRef: refTxt(r), band, comparable: pv != null,
      };
    };
    peakHir.rows = [
      mk("hir1", "Peak 1-min HIR", "Hámark 1-mín háákafahlaup", hir.w1, juRow.w1),
      mk("hir3", "Peak 3-min HIR", "Hámark 3-mín háákafahlaup", hir.w3, juRow.w3),
      mk("hir5", "Peak 5-min HIR", "Hámark 5-mín háákafahlaup", hir.w5, juRow.w5),
    ];
  }

  // ---- Confidence ----
  const matureMatches = input.matchCount >= MIN_MATURE_MATCHES;
  const confidence: Confidence = topSpeed == null
    ? "low"
    : matureMatches
      ? "high"
      : "medium";

  // ---- Verdict + facts (layered read) ----
  const gl = juGroupLabel;
  const facts: Bi[] = [];
  let verdict: Bi;

  if (topSpeed != null) {
    const b = bandTopSpeed(topSpeed);
    const bandWordEn: Record<string, string> = { elite: "elite", high: "high", average: "around average", below: "below the elite range" };
    const bandWordIs: Record<string, string> = { elite: "elite", high: "hátt", average: "um meðallag", below: "undir elite-bilinu" };
    verdict = juGroup
      ? {
          en: `Top-end speed is ${bandWordEn[b]} for a ${gl.en} (${topSpeed.toFixed(1)} km/h).`,
          is: `Topphraði er ${bandWordIs[b]} fyrir ${gl.is} (${topSpeed.toFixed(1)} km/klst).`,
        }
      : {
          en: `Top-end speed is ${bandWordEn[b]} (${topSpeed.toFixed(1)} km/h). No position benchmark for this role.`,
          is: `Topphraði er ${bandWordIs[b]} (${topSpeed.toFixed(1)} km/klst). Ekkert stöðu-viðmið fyrir þessa stöðu.`,
        };
    facts.push({
      en: `Top speed ${topSpeed.toFixed(1)} km/h vs the elite match-play range (elite >=${TOP_SPEED_ELITE}, high ${TOP_SPEED_HIGH}-${TOP_SPEED_ELITE} km/h).`,
      is: `Hámarkshraði ${topSpeed.toFixed(1)} km/klst vs elite-leikjabil (elite >=${TOP_SPEED_ELITE}, hátt ${TOP_SPEED_HIGH}-${TOP_SPEED_ELITE} km/klst).`,
    });
  } else {
    verdict = {
      en: "No top-speed reading yet to place against the elite range.",
      is: "Enginn hámarkshraði enn til að staðsetja á móti elite-bilinu.",
    };
  }

  if (hsr != null || sprint != null) {
    const parts: string[] = [];
    const partsIs: string[] = [];
    if (hsr != null) { parts.push(`${Math.round(hsr)} m HSR/90`); partsIs.push(`${Math.round(hsr)} m háhraðahlaup/90`); }
    if (sprint != null) { parts.push(`${Math.round(sprint)} m sprint/90`); partsIs.push(`${Math.round(sprint)} m sprettir/90`); }
    facts.push({
      en: `Game-total high-speed output: ${parts.join(", ")} — elite context for ${juGroup ? `a ${gl.en}` : "the role"}, not graded against Table 2 (a per-window figure).`,
      is: `Leikja-heildar háhraða-output: ${partsIs.join(", ")} — elite-samhengi fyrir ${juGroup ? gl.is : "stöðuna"}, ekki metið á móti Töflu 2 (per-glugga tala).`,
    });
  }

  if (!peakHir.comparable && juGroup) {
    facts.push({
      en: `Peak-HIR benchmark for a ${gl.en}: 1-min ${refTxt(juRow.w1)}, 3-min ${refTxt(juRow.w3)}, 5-min ${refTxt(juRow.w5)} m/min — pending high-speed-per-window data to score directly.`,
      is: `Hámarks-HIR viðmið fyrir ${gl.is}: 1-mín ${refTxt(juRow.w1)}, 3-mín ${refTxt(juRow.w3)}, 5-mín ${refTxt(juRow.w5)} m/mín — bíður háhraða-per-glugga gagna til að meta beint.`,
    });
  }

  return { juGroup, juGroupLabel, verdict, facts, rows, peakHir, confidence, citation: CITATION, caveat: CAVEAT };
}
