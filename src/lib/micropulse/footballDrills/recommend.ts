/**
 * Individualised football-drill recommender. Each drill in drill_library carries
 * a MEASURED per-player demand profile (high-speed metres, accel/decel efforts,
 * player-load per minute). We match those demands to a player's own movement
 * profile so a coach can pick on-pitch drills that deliver the right stimulus:
 *
 *   - GAP        — a quality he gets too LITTLE of vs the squad → drills high in it
 *   - STRENGTH   — a quality he does a LOT of → drills that rehearse his game
 *
 * Complements the gym robustness recommender (which covers cuts/jumps/asymmetry
 * the drill data can't measure) and is the on-pitch sibling of it. Rules decide.
 */

import { QUALITY_META } from "@/lib/micropulse/robustness/catalog";

// Only these three load qualities are measurable from drill_library columns.
export type DrillQuality = "sprint" | "decel" | "accel";

export type DrillRow = {
  id: string;
  drill_name: string | null;
  category: string | null;
  drill_format: string | null;
  total_players: number | null;
  duration_min: number | null;
  field_length_m: number | null;
  field_width_m: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  decel_b23: number | null;
  accel_b23: number | null;
  player_load_per_min: number | null;
  diagram_url: string | null;
};

export type PlayerDemand = { quality: string; value: number; z: number | null };

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Per-player demand a drill delivers for a given quality. The drill_library
 * `*_avg` (per-player) columns are largely unpopulated, so we derive per-player
 * demand from the drill TOTAL ÷ total_players. Drills without a player count are
 * excluded (return 0) to keep the ranking apples-to-apples.
 */
export function drillQualityValue(d: DrillRow, q: DrillQuality): number {
  const players = num(d.total_players);
  // Require a real multi-player drill — guards against logging artifacts (e.g.
  // total_players = 1) that would inflate the per-player figure.
  if (players < 4) return 0;
  const total = q === "sprint" ? num(d.vel_b5) + num(d.vel_b6) : q === "decel" ? num(d.decel_b23) : num(d.accel_b23);
  return total / players;
}

export type DrillPick = {
  id: string;
  name: string;
  category: string | null;
  format: string | null;
  players: number | null;
  duration_min: number | null;
  pitch: string | null;          // "40×30 m" when known
  qualityValue: number;          // the matched per-player demand
  unit: string;                  // "m" for sprint, "efforts" otherwise
  playerLoadPerMin: number | null;
  diagram_url: string | null;
};

export type DrillRec = {
  kind: "gap" | "strength";
  quality: DrillQuality;
  label: { en: string; is: string };
  why: { en: string; is: string };
  drills: DrillPick[];
};

const GAP_Z = -0.5;
const STRENGTH_Z = 0.5;
const DRILL_QUALITIES: DrillQuality[] = ["sprint", "decel", "accel"];

function pitch(d: DrillRow): string | null {
  const l = num(d.field_length_m), w = num(d.field_width_m);
  return l > 0 && w > 0 ? `${Math.round(l)}×${Math.round(w)} m` : null;
}

function pick(d: DrillRow, q: DrillQuality): DrillPick {
  return {
    id: d.id,
    name: d.drill_name ?? "Drill",
    category: d.category,
    format: d.drill_format,
    players: d.total_players,
    duration_min: d.duration_min != null ? Math.round(num(d.duration_min)) : null,
    pitch: pitch(d),
    qualityValue: Math.round(drillQualityValue(d, q)),
    unit: q === "sprint" ? "m" : "efforts",
    playerLoadPerMin: d.player_load_per_min != null ? Math.round(num(d.player_load_per_min) * 10) / 10 : null,
    diagram_url: d.diagram_url,
  };
}

export function recommendFootballDrills(
  demands: PlayerDemand[],
  drills: DrillRow[],
  opts: { perQuality?: number } = {},
): DrillRec[] {
  const perQuality = opts.perQuality ?? 3;
  const byQuality = new Map<string, PlayerDemand>();
  for (const d of demands) byQuality.set(d.quality, d);

  const gaps: DrillQuality[] = [];
  const strengths: DrillQuality[] = [];
  for (const q of DRILL_QUALITIES) {
    const z = byQuality.get(q)?.z ?? null;
    if (z == null) continue;
    if (z <= GAP_Z) gaps.push(q);
    else if (z >= STRENGTH_Z) strengths.push(q);
  }
  // Fallback: if nothing salient, target his single most-pronounced quality.
  if (gaps.length === 0 && strengths.length === 0) {
    const ranked = DRILL_QUALITIES
      .map((q) => ({ q, z: byQuality.get(q)?.z ?? 0 }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    if (ranked[0]) (ranked[0].z >= 0 ? strengths : gaps).push(ranked[0].q);
  }

  const used = new Set<string>();
  const recs: DrillRec[] = [];
  const addRec = (kind: "gap" | "strength", q: DrillQuality) => {
    const ranked = drills
      .map((d) => ({ d, v: drillQualityValue(d, q) }))
      .filter((x) => x.v > 0 && !used.has(x.d.id))
      .sort((a, b) => b.v - a.v)
      .slice(0, perQuality);
    if (ranked.length === 0) return;
    for (const r of ranked) used.add(r.d.id);
    const meta = QUALITY_META[q];
    recs.push({
      kind, quality: q, label: meta.label,
      why: kind === "gap"
        ? {
            en: `He gets less ${meta.signal.en} than the squad — these drills load it up on the pitch.`,
            is: `Hann fær minna af ${meta.signal.is} en liðið — þessar drillur hlaða það upp á vellinum.`,
          }
        : {
            en: `His game is heavy on ${meta.signal.en} — these drills rehearse exactly that.`,
            is: `Leikur hans er þungur í ${meta.signal.is} — þessar drillur æfa nákvæmlega það.`,
          },
      drills: ranked.map((r) => pick(r.d, q)),
    });
  };

  for (const q of gaps) addRec("gap", q);
  for (const q of strengths) addRec("strength", q);
  return recs;
}
