/**
 * Signal → dimension registry (single source of truth) — capability-driven
 * interpretation (docs/interpretation-architecture.md, step 1).
 *
 * Principle: branch on the SIGNALS a club actually has, not its tier name. Each
 * coach-readable DIMENSION has an ordered preference list of underlying Catapult
 * columns; the resolver (resolveCapabilities) picks the first one a club has data
 * for. Same dimension, different column per tier → graceful degradation. A Core
 * club that adds HR belts gains the "internal" dimension automatically; a Pro club
 * whose IMA export breaks degrades to the Gen2 efforts column — no config, no
 * separate "Core product".
 *
 * Grounded in the verified Core (Þór) + Pro (Breiðablik) column inventory,
 * 22 Jun 2026. Note `meterage_per_minute` is intentionally absent — no such column
 * exists yet, so intensity resolves on player_load_per_minute only (omitted, never
 * faked, when missing).
 */

export type Dimension = "volume" | "intensity" | "braking" | "sprint" | "metabolic" | "internal";

export const DIMENSIONS: Dimension[] = ["volume", "intensity", "braking", "sprint", "metabolic", "internal"];

/**
 * Coach-facing label per dimension — deliberately INDEPENDENT of the underlying
 * column. A braking spike reads "braking load well above usual" whether it came
 * from IMA (Pro) or Gen2 efforts (Core); the column lives in the drill-down only.
 * This is what makes the verdict sentence identical across tiers.
 */
export const DIMENSION_LABELS: Record<Dimension, { EN: string; IS: string }> = {
  volume: { EN: "Workload volume", IS: "Álagsmagn" },
  intensity: { EN: "Work rate", IS: "Ákefð" },
  braking: { EN: "Braking load", IS: "Hemlunarálag" },
  sprint: { EN: "Sprint exposure", IS: "Sprett-útsetning" },
  metabolic: { EN: "Metabolic load", IS: "Efnaskiptaálag" },
  internal: { EN: "Internal load", IS: "Innra álag" },
};

export type MetricDef = {
  /** DB column on player_external_load_daily, e.g. "decel_b2_3_tot_effs_gen2". */
  key: string;
  dimension: Dimension;
  /** Lower = preferred when several are present for the same dimension. */
  preferenceRank: number;
  plain: { EN: string; IS: string };
  tooltip: { EN: string; IS: string };
  /** Contested in football (di Prampero metabolic power, HID) → low weight,
   *  must never flip a band downstream (integrity guardrail). */
  contested?: boolean;
  unit?: string;
};

export const REGISTRY: MetricDef[] = [
  // ── Volume ──────────────────────────────────────────────────────────────
  {
    key: "total_player_load", dimension: "volume", preferenceRank: 1, unit: "AU",
    plain: { EN: "Workload volume", IS: "Álagsmagn" },
    tooltip: { EN: "Total Player Load — overall mechanical work for the day.", IS: "Heildar Player Load — heildar vélræn vinna dagsins." },
  },
  {
    key: "total_distance", dimension: "volume", preferenceRank: 2, unit: "m",
    plain: { EN: "Distance covered", IS: "Vegalengd" },
    tooltip: { EN: "Total distance covered — volume proxy when Player Load is absent.", IS: "Heildar vegalengd — magn-vísir þegar Player Load vantar." },
  },

  // ── Intensity ───────────────────────────────────────────────────────────
  {
    key: "player_load_per_minute", dimension: "intensity", preferenceRank: 1, unit: "AU/min",
    plain: { EN: "Work rate", IS: "Ákefð" },
    tooltip: { EN: "Player Load per minute — how hard the work was, not just how much.", IS: "Player Load á mínútu — hversu ákaft, ekki bara hversu mikið." },
  },

  // ── Braking / hard efforts ────────────────────────────────────────────────
  {
    key: "ima_decel", dimension: "braking", preferenceRank: 1, unit: "count",
    plain: { EN: "Braking / hard decelerations", IS: "Hemlun / harðar hraðaminnkanir" },
    tooltip: { EN: "IMA deceleration events — the richest braking signal (Pro S7); McBurnie 2022.", IS: "IMA hemlunar-atburðir — ríkasta hemlunar-merkið (Pro S7); McBurnie 2022." },
  },
  {
    key: "decel_b2_3_tot_effs_gen2", dimension: "braking", preferenceRank: 2, unit: "count",
    plain: { EN: "Braking efforts", IS: "Hemlunar-átök" },
    tooltip: { EN: "High-intensity deceleration efforts (Gen2) — the Core braking signal without IMA; McBurnie 2022.", IS: "Háákefðar hemlunar-átök (Gen2) — Core hemlunar-merki án IMA; McBurnie 2022." },
  },
  {
    key: "accel_decel_efforts", dimension: "braking", preferenceRank: 3, unit: "count",
    plain: { EN: "Hard accel/decel efforts", IS: "Hröðunar/hemlunar-átök" },
    tooltip: { EN: "Combined acceleration + deceleration efforts (OpenField Gen2) — braking proxy when the decel split isn't exported.", IS: "Samanlögð hröðunar- og hemlunar-átök (OpenField Gen2) — hemlunar-vísir þegar decel-skipting er ekki flutt út." },
  },

  // ── Sprint exposure ─────────────────────────────────────────────────────
  {
    key: "velocity_band6_total_efforts_gen2", dimension: "sprint", preferenceRank: 1, unit: "count",
    plain: { EN: "Sprint efforts", IS: "Spretta-átök" },
    tooltip: { EN: "Number of sprint-band efforts — hamstring-relevant exposure (Malone 2017).", IS: "Fjöldi spretta-átaka — aftanlæris-tengd útsetning (Malone 2017)." },
  },
  {
    key: "velocity_band5_total_efforts_gen2", dimension: "sprint", preferenceRank: 2, unit: "count",
    plain: { EN: "High-speed efforts", IS: "Háhraða-átök" },
    tooltip: { EN: "Number of high-speed-running efforts (Malone 2017).", IS: "Fjöldi háhraðahlaups-átaka (Malone 2017)." },
  },
  {
    key: "high_speed_distance", dimension: "sprint", preferenceRank: 3, unit: "m",
    plain: { EN: "High-speed running", IS: "Háhraðahlaup" },
    tooltip: { EN: "Distance above the high-speed threshold (Malone 2018).", IS: "Vegalengd yfir háhraðaþröskuldi (Malone 2018)." },
  },
  {
    key: "sprint_distance", dimension: "sprint", preferenceRank: 4, unit: "m",
    plain: { EN: "Sprint distance", IS: "Spretthlaup" },
    tooltip: { EN: "Distance covered sprinting — coarsest sprint signal (Lengjudeild fallback).", IS: "Vegalengd á spretti — grófasta sprett-merkið (Lengjudeild varaleið)." },
  },

  // ── Metabolic load ──────────────────────────────────────────────────────
  // High Metabolic Load Distance — di Prampero-derived distance run at high
  // metabolic power (combines speed + accel/decel energy cost). A first-class
  // signal on Core/Lite plans (no IMA), so it earns its own coach-readable
  // dimension rather than hiding inside volume or intensity. di Prampero 2015,
  // Osgnach 2010.
  {
    key: "high_metabolic_load_distance_m", dimension: "metabolic", preferenceRank: 1, unit: "m",
    plain: { EN: "High metabolic load", IS: "Háorkuálag" },
    tooltip: { EN: "High Metabolic Load Distance — metres run at high metabolic power (speed + accel/decel cost); di Prampero 2015.", IS: "Háorku-vegalengd — metrar hlaupnir á háu efnaskiptaafli (hraði + hröðunar/hemlunar-kostnaður); di Prampero 2015." },
  },
  // Contested: di Prampero metabolic power — directional only, never flips a band.
  {
    key: "metabolic_power", dimension: "metabolic", preferenceRank: 9, contested: true, unit: "W/kg",
    plain: { EN: "Metabolic power", IS: "Efnaskiptaafl" },
    tooltip: { EN: "di Prampero metabolic power — contested in football; directional only (di Prampero 2015).", IS: "di Prampero efnaskiptaafl — umdeilt í fótbolta; aðeins til viðmiðunar (di Prampero 2015)." },
  },

  // ── Internal load ─────────────────────────────────────────────────────────
  {
    key: "avg_heart_rate", dimension: "internal", preferenceRank: 1, unit: "bpm",
    plain: { EN: "Internal load (heart rate)", IS: "Innra álag (hjartsláttur)" },
    tooltip: { EN: "Average heart rate — lights up only when players wear HR belts.", IS: "Meðal-hjartsláttur — virkjast aðeins þegar leikmenn nota púls-belti." },
  },
];

const BY_KEY = new Map(REGISTRY.map((m) => [m.key, m]));

/** All DB columns the registry knows about (for the coverage SELECT). */
export const REGISTRY_KEYS: string[] = REGISTRY.map((m) => m.key);

export function getMetric(key: string): MetricDef | undefined {
  return BY_KEY.get(key);
}

/** Metrics for a dimension, ordered by preference (best first). */
export function metricsForDimension(dim: Dimension): MetricDef[] {
  return REGISTRY.filter((m) => m.dimension === dim).sort((a, b) => a.preferenceRank - b.preferenceRank);
}
