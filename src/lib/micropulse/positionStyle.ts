/**
 * Playing-style classification from match movement data (GPS + IMA).
 *
 * Pure + deterministic. "Rules decide, AI explains" (manifesto): this assigns a
 * transparent archetype from z-scored per-90 metrics relative to a population
 * (the other position groups, or the rest of the squad for an individual
 * player). The AI layer, if used, only narrates what these rules already found.
 *
 * Axes:
 *   speed   — sprint dist, top speed, high-speed running   → vertical threat
 *   agility — accel, decel, change-of-direction            → repeat-effort / busy
 *   volume  — total distance                               → engine / box-to-box
 *   aerial  — jumps                                         → aerial presence
 */

export type StyleMetricKey = "distance" | "hsr" | "sprint" | "top_speed" | "accel" | "decel" | "cod" | "jumps";
export type StyleProfile = Record<StyleMetricKey, number>;

export const STYLE_METRICS: StyleMetricKey[] = ["distance", "hsr", "sprint", "top_speed", "accel", "decel", "cod", "jumps"];

export const METRIC_LABEL: Record<StyleMetricKey, { en: string; is: string }> = {
  distance: { en: "distance/90", is: "vegalengd/90" },
  hsr: { en: "high-speed running/90", is: "háhraðahlaup/90" },
  sprint: { en: "sprint dist/90", is: "sprettir/90" },
  top_speed: { en: "top speed", is: "hámarkshraði" },
  accel: { en: "accelerations/90", is: "hröðun/90" },
  decel: { en: "decelerations/90", is: "hraðaminnkun/90" },
  cod: { en: "change-of-direction/90", is: "stefnubreytingar/90" },
  jumps: { en: "jumps/90", is: "stökk/90" },
};

/** Raw position code → broad outfield group. Unknown codes fall back to "OTHER". */
const GROUP_OF: Record<string, string> = {
  GK: "GK",
  CB: "CB", RCB: "CB", LCB: "CB", SW: "CB",
  RB: "FB", LB: "FB", RWB: "FB", LWB: "FB", WB: "FB",
  CM: "CM", DM: "CM", CDM: "CM", RCM: "CM", LCM: "CM",
  AM: "AM", CAM: "AM", RAM: "AM", LAM: "AM", RM: "AM", LM: "AM", RW: "AM", LW: "AM", RWG: "AM", LWG: "AM",
  CF: "CF", ST: "CF", SS: "CF", RF: "CF", LF: "CF",
};

export const POSITION_GROUPS: Array<{ key: string; en: string; is: string }> = [
  { key: "GK", en: "Goalkeepers", is: "Markverðir" },
  { key: "CB", en: "Centre backs", is: "Miðverðir" },
  { key: "FB", en: "Full backs", is: "Bakverðir" },
  { key: "CM", en: "Central mids", is: "Miðjumenn" },
  { key: "AM", en: "Attack & wide", is: "Sóknarmiðja & kantar" },
  { key: "CF", en: "Forwards", is: "Framherjar" },
  { key: "OTHER", en: "Other", is: "Annað" },
];

export function positionGroup(raw: string | null | undefined): string {
  const code = String(raw ?? "").trim().toUpperCase();
  return GROUP_OF[code] ?? (code ? "OTHER" : "OTHER");
}

const AXES: Record<string, StyleMetricKey[]> = {
  speed: ["sprint", "top_speed", "hsr"],
  agility: ["accel", "decel", "cod"],
  volume: ["distance"],
  aerial: ["jumps"],
};

const ARCHETYPE: Record<string, { en: string; is: string }> = {
  speed: { en: "Speed / vertical threat", is: "Hraði / lóðrétt ógn" },
  agility: { en: "High agility / repeat-effort", is: "Snerpa / endurteknir sprettir" },
  volume: { en: "Engine / box-to-box", is: "Vél / box-to-box" },
  aerial: { en: "Aerial presence", is: "Loftógn" },
  structural: { en: "Low-intensity / structural", is: "Lágákefð / strúktúr" },
  balanced: { en: "Balanced profile", is: "Jafn prófíll" },
};

export type PopulationStats = Record<StyleMetricKey, { mean: number; sd: number }>;

/** Build mean/sd per metric across a set of profiles (the classification population). */
export function buildPopulationStats(profiles: StyleProfile[]): PopulationStats {
  const stats = {} as PopulationStats;
  for (const m of STYLE_METRICS) {
    const xs = profiles.map((p) => p[m]).filter((v) => Number.isFinite(v));
    const n = xs.length || 1;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    stats[m] = { mean, sd: Math.sqrt(variance) };
  }
  return stats;
}

export type StyleResult = {
  primary: { key: string; en: string; is: string };
  secondary: { key: string; en: string; is: string } | null;
  axisScores: Record<string, number>;
  /** Top driving metrics (z ≥ 0.5), strongest first — for the "why". */
  drivers: Array<{ metric: StyleMetricKey; z: number; en: string; is: string }>;
  z: Record<StyleMetricKey, number>;
};

/**
 * Classify one profile against a population. Primary axis = highest composite
 * z; a secondary tag is added when a second axis is also clearly elevated.
 * Falls back to "structural" (mostly below average) or "balanced".
 */
export function classifyStyle(profile: StyleProfile, pop: PopulationStats): StyleResult {
  const z = {} as Record<StyleMetricKey, number>;
  for (const m of STYLE_METRICS) {
    const { mean, sd } = pop[m];
    z[m] = sd > 0 ? (profile[m] - mean) / sd : 0;
  }
  const axisScores: Record<string, number> = {};
  for (const [axis, members] of Object.entries(AXES)) {
    axisScores[axis] = members.reduce((s, m) => s + z[m], 0) / members.length;
  }
  const ranked = Object.entries(axisScores).sort((a, b) => b[1] - a[1]);
  const [topAxis, topScore] = ranked[0];
  const [secondAxis, secondScore] = ranked[1];

  const drivers = STYLE_METRICS
    .map((m) => ({ metric: m, z: z[m], en: METRIC_LABEL[m].en, is: METRIC_LABEL[m].is }))
    .filter((d) => d.z >= 0.5)
    .sort((a, b) => b.z - a.z)
    .slice(0, 3);

  let primaryKey = topAxis;
  if (topScore < 0.25) {
    const allLow = Object.values(axisScores).every((v) => v <= 0.1);
    primaryKey = allLow ? "structural" : "balanced";
  }
  const secondary = primaryKey !== "structural" && primaryKey !== "balanced" && secondScore >= 0.5
    ? { key: secondAxis, ...ARCHETYPE[secondAxis] }
    : null;

  return {
    primary: { key: primaryKey, ...ARCHETYPE[primaryKey] },
    secondary,
    axisScores,
    drivers,
    z,
  };
}
