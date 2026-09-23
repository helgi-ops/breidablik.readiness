/**
 * Worst-Case Scenario (WCS) drill matching — pure.
 *
 * WCS = the intensity of a player's HARDEST match minutes (his most intense peak window). To PREPARE
 * for it, an on-pitch drill must REACH or EXCEED that per-minute intensity. This lib turns the peak
 * window into a per-minute target and scores each drill's peak per-minute intensity against it, with
 * intensity-raising levers (SSG pitch-size research) when a drill is below.
 *
 * Descriptive / advisory — the coach picks the drills; this never touches the readiness colour or the
 * daily decision. Null-safe: a missing metric is `null`, never fabricated. No I/O.
 *
 * Cite: Ju et al. 2022 & Martín-García/Casamichana, Owen 2017 (worst-case / peak-period demands);
 *       Gaudino, Casamichana, Owen (SSG pitch size → load: smaller area = more accel/decel + CoD,
 *       larger = more HSR/sprint; fewer players = higher individual involvement).
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

/** The player's (or position's) worst-case demand — per-minute at his most intense window. */
export interface WcsTarget {
  hsrPerMin: number | null;        // hsr_m / window_min
  accelDecelPerMin: number | null; // (ima_accel + ima_decel) / window_min
  codPerMin: number | null;        // ima_cod / window_min
  playerLoadPerMin: number | null; // player_load / window_min
  windowMin: number | null;
  source: "player" | "position";
}

/** One player_peak_window row (real columns). */
export interface PeakWindowRow {
  window_min: number | null;
  hsr_m: number | null;
  vb5_m: number | null;
  vb6_m: number | null;
  player_load: number | null;
  ima_accel: number | null;
  ima_decel: number | null;
  ima_cod: number | null;
}

/** A drill's measured demand (drill_library columns). */
export interface WcsDrillRow {
  id: string;
  label: string;
  player_load_per_min: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  ima_cod_total: number | null;
  duration_min: number | null;
  area_per_player_m2: number | null;
}

export interface DrillWcsFit {
  drillId: string;
  label: string;
  reaches: { hsr: boolean | null; accelDecel: boolean | null; cod: boolean | null; playerLoad: boolean | null };
  perMin: { hsr: number | null; accelDecel: number | null; cod: number | null; playerLoad: number | null };
  overallPct: number | null;       // mean of drill/target across the qualities BOTH sides have (>100 = exceeds)
  verdict: "exceeds" | "meets" | "below" | "unknown";
  levers: Bi[];                     // intensity-raising suggestions when below
  reason: Bi;
}

const sum2 = (a: number | null, b: number | null): number | null =>
  a == null && b == null ? null : (a ?? 0) + (b ?? 0);

const perMin = (total: number | null, min: number | null): number | null =>
  total == null || min == null || min <= 0 ? null : total / min;

/**
 * Build the WCS target from a set of peak windows. Picks the SHORTEST window with HSR data (the most
 * intense per-minute), and derives every quality from that one coherent window. Returns null when no
 * usable window exists. `source` labels player vs a position fallback (the caller decides which rows).
 */
export function wcsTargetFromWindows(rows: PeakWindowRow[], source: "player" | "position"): WcsTarget | null {
  const usable = rows.filter((r) => r.window_min != null && r.window_min > 0 && (r.hsr_m != null || r.player_load != null));
  if (usable.length === 0) return null;
  // Most intense = shortest window; tie-break on higher HSR.
  const w = usable.slice().sort((a, b) =>
    (a.window_min! - b.window_min!) || ((b.hsr_m ?? 0) - (a.hsr_m ?? 0)))[0];
  const min = w.window_min!;
  return {
    hsrPerMin: perMin(w.hsr_m, min),
    accelDecelPerMin: perMin(sum2(w.ima_accel, w.ima_decel), min),
    codPerMin: perMin(w.ima_cod, min),
    playerLoadPerMin: perMin(w.player_load, min),
    windowMin: min,
    source,
  };
}

/** A drill's peak per-minute intensity on the WCS qualities. HSR = (vel_b5+vel_b6)/duration. */
function drillPerMin(d: WcsDrillRow): DrillWcsFit["perMin"] {
  return {
    hsr: perMin(sum2(d.vel_b5, d.vel_b6), d.duration_min),
    accelDecel: perMin(sum2(d.accel_b23, d.decel_b23), d.duration_min),
    cod: perMin(d.ima_cod_total, d.duration_min),
    playerLoad: d.player_load_per_min ?? null, // already per-minute
  };
}

/** Intensity-raising levers for a below-WCS drill, aimed at the specific short quality (SSG research). */
function leversFor(d: WcsDrillRow, short: { hsr: boolean; accelDecel: boolean; cod: boolean; pl: boolean }): Bi[] {
  const out: Bi[] = [];
  const area = d.area_per_player_m2;
  if (short.accelDecel || short.cod) {
    const tgt = area != null ? Math.max(60, Math.round(area * 0.7)) : null;
    out.push({
      en: `Shrink the area${tgt ? ` to ~${tgt} m²/player` : ""} — a smaller pitch forces more accelerations, decelerations and changes of direction.`,
      is: `Minnkaðu svæðið${tgt ? ` í ~${tgt} m²/leikmann` : ""} — minni völlur kallar á fleiri hröðun, hraðaminnkun og stefnubreytingar.`,
    });
  }
  if (short.hsr) {
    const tgt = area != null ? Math.round(area * 1.4) : null;
    out.push({
      en: `Enlarge the area${tgt ? ` to ~${tgt} m²/player` : ""} or drop a player — more open space lifts high-speed running toward his WCS.`,
      is: `Stækkaðu svæðið${tgt ? ` í ~${tgt} m²/leikmann` : ""} eða fækkaðu leikmanni — meira opið rými lyftir háhraða-hlaupi að WCS hans.`,
    });
  }
  if (short.pl) {
    out.push({
      en: "Raise the tempo or add transitions (attack↔defend switches) to push player-load per minute.",
      is: "Hækkaðu tempóið eða bættu við umskiptum (sókn↔vörn) til að ýta player-load á mínútu upp.",
    });
  }
  return out;
}

const EXCEEDS = 105; // ≥105% of target across the shared qualities → worst-case ready
const MEETS = 90;    // 90–105% → meets

/**
 * Score each drill's peak intensity against the WCS target. Only qualities BOTH sides carry count
 * toward overallPct (a null on either side → that quality's `reaches` is null and it's skipped).
 */
export function matchDrillsToWcs(target: WcsTarget, drills: WcsDrillRow[]): DrillWcsFit[] {
  const out: DrillWcsFit[] = drills.map((d) => {
    const pm = drillPerMin(d);
    const pairs: Array<{ key: "hsr" | "accelDecel" | "cod" | "playerLoad"; drill: number | null; tgt: number | null }> = [
      { key: "hsr", drill: pm.hsr, tgt: target.hsrPerMin },
      { key: "accelDecel", drill: pm.accelDecel, tgt: target.accelDecelPerMin },
      { key: "cod", drill: pm.cod, tgt: target.codPerMin },
      { key: "playerLoad", drill: pm.playerLoad, tgt: target.playerLoadPerMin },
    ];
    const reaches = { hsr: null, accelDecel: null, cod: null, playerLoad: null } as DrillWcsFit["reaches"];
    const ratios: number[] = [];
    for (const p of pairs) {
      if (p.drill == null || p.tgt == null || p.tgt <= 0) continue;
      reaches[p.key] = p.drill >= p.tgt;
      ratios.push((p.drill / p.tgt) * 100);
    }
    const overallPct = ratios.length ? Math.round(ratios.reduce((s, v) => s + v, 0) / ratios.length) : null;
    const verdict: DrillWcsFit["verdict"] =
      overallPct == null ? "unknown" : overallPct >= EXCEEDS ? "exceeds" : overallPct >= MEETS ? "meets" : "below";

    const short = {
      hsr: reaches.hsr === false,
      accelDecel: reaches.accelDecel === false,
      cod: reaches.cod === false,
      pl: reaches.playerLoad === false,
    };
    const levers = verdict === "below" ? leversFor(d, short) : [];

    const reason: Bi =
      verdict === "exceeds" ? { en: `Reaches or exceeds his worst-case intensity (~${overallPct}% of it) — worst-case ready.`, is: `Nær eða fer yfir versta-falls ákefð hans (~${overallPct}% af henni) — tilbúið fyrir versta fall.` }
      : verdict === "meets" ? { en: `Meets his worst-case intensity (~${overallPct}%).`, is: `Nær versta-falls ákefð hans (~${overallPct}%).` }
      : verdict === "below" ? { en: `Below his worst-case (~${overallPct}%) — raise intensity with the levers below.`, is: `Undir versta falli (~${overallPct}%) — hækkaðu ákefð með leiðunum að neðan.` }
      : { en: "Not enough shared metrics to compare to his worst-case.", is: "Ekki nægir sameiginlegir mælikvarðar til að bera saman við versta fall." };

    return { drillId: d.id, label: d.label, reaches, perMin: pm, overallPct, verdict, levers, reason };
  });

  // Rank by overallPct desc; unknowns last.
  return out.sort((a, b) => (b.overallPct ?? -1) - (a.overallPct ?? -1));
}
