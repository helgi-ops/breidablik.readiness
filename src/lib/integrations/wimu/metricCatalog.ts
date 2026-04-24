/**
 * WIMU PRO metric catalog — alias-based lookup.
 *
 * SPRO exports column names that vary by:
 *   - language preset (English vs Spanish are most common in EU clubs)
 *   - SPRO version (column names shifted slightly across major versions)
 *   - export preset (custom presets reorder/rename freely)
 *
 * To handle this we don't pin to a single column name. Instead each canonical
 * metric has an aliases[] list. getWimuValue(row, key) walks the aliases
 * (case- and punctuation-insensitive) until it finds a match.
 *
 * Alias seeds come from:
 *   - WIMU PRO User Manual (English + Spanish)
 *   - SPRO export samples observed in published case studies (FC Barcelona,
 *     RFEF data papers, training-ground.guru references)
 *   - common GPS export conventions shared across providers
 *
 * If a real WIMU CSV from a club arrives and a column doesn't auto-map,
 * the coach UI lets them confirm / correct the mapping, and we append the
 * new alias here in a follow-up commit.
 */

export type WimuMetricKey =
  // Volume
  | "totalDistance"
  | "highSpeedDistance"
  | "sprintDistance"
  | "hirDistance"
  // Counts
  | "accelerations"
  | "decelerations"
  | "sprintCount"
  | "codEvents"
  // Velocity
  | "maxVelocity"
  | "avgVelocity"
  // Player Load
  | "playerLoad"
  | "playerLoadPerMinute"
  // Metabolic (WIMU's strength)
  | "metabolicPower"
  | "metabolicPowerPeak"
  | "metabolicLoadScore"
  | "highMetabolicLoadDistanceM"
  | "metabolicEnergyKj"
  // Heart rate
  | "avgHeartRate"
  | "maxHeartRate"
  | "hrZone1TimeS"
  | "hrZone2TimeS"
  | "hrZone3TimeS"
  | "hrZone4TimeS"
  | "hrZone5TimeS"
  // Routing fields (used by parser to identify athlete + date)
  | "athleteName"
  | "date"
  | "sessionName"
  | "durationMinutes";

export type WimuMetricDefinition = {
  key: WimuMetricKey;
  label: string;        // human-readable label for the mapper UI
  unit?: string;
  aliases: string[];    // raw column-name candidates (matched normalized)
};

/**
 * Normalize a raw column name for alias comparison.
 * - lowercase
 * - strip parenthesized units like "(m)", "(km/h)", "(bpm)"
 * - strip diacritics (á → a, ñ → n)
 * - strip everything non-alphanumeric (spaces, dashes, dots, etc.)
 *
 * So "Total Distance (m)", "Distancia Total (m)", "total_distance" and
 * "TOTALDISTANCE" all reduce to the same canonical form "totaldistance".
 */
export function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")          // strip "(m)", "(km/h)", "(bpm)" units
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")    // strip diacritics
    .replace(/[^a-z0-9]/g, "");         // strip everything that isn't alnum
}

const METRIC_DEFINITIONS: readonly WimuMetricDefinition[] = [
  // ─── Routing fields ─────────────────────────────────────────────────
  {
    key: "athleteName",
    label: "Athlete name",
    aliases: [
      "athlete", "athletename", "player", "playername", "name",
      "jugador", "deportista", "nombre", "atleta",
    ],
  },
  {
    key: "date",
    label: "Session date",
    aliases: [
      "date", "sessiondate", "fecha", "day", "dia", "fechasesion",
    ],
  },
  {
    key: "sessionName",
    label: "Session name",
    aliases: [
      "session", "sessionname", "activity", "activityname",
      "sesion", "nombresesion", "entrenamiento", "training",
    ],
  },
  {
    key: "durationMinutes",
    label: "Duration",
    unit: "min",
    aliases: [
      "duration", "durationmin", "durationminutes", "tiempo",
      "duracion", "minutes", "totaltime", "tiempototal",
    ],
  },

  // ─── Volume ─────────────────────────────────────────────────────────
  {
    key: "totalDistance",
    label: "Total distance",
    unit: "m",
    aliases: [
      "totaldistance", "distancetotal", "distance", "distancem",
      "distanciatotal", "distancia", "distm", "totaldist",
    ],
  },
  {
    key: "highSpeedDistance",
    label: "High-speed distance (>19.8 km/h)",
    unit: "m",
    aliases: [
      "highspeeddistance", "hsr", "hsrdistance", "distancehighspeed",
      "distanciaaltavelocidad", "distancia198", "hsd", "distzone5",
      "distvelband5", "velband5dist", "vel5dist", "z5dist",
    ],
  },
  {
    key: "sprintDistance",
    label: "Sprint distance (>25.2 km/h)",
    unit: "m",
    aliases: [
      "sprintdistance", "distancesprint", "distancia252",
      "distanciasprint", "distzone6", "distvelband6", "vel6dist",
      "z6dist", "sprintdist",
    ],
  },
  {
    key: "hirDistance",
    label: "HIR distance (14.4–19.8 km/h)",
    unit: "m",
    aliases: [
      "hirdistance", "hirdist", "distanciahir", "distzone4",
      "vel4dist", "z4dist", "highintensityrunning",
    ],
  },

  // ─── Counts ─────────────────────────────────────────────────────────
  {
    key: "accelerations",
    label: "Accelerations",
    aliases: [
      "accelerations", "accels", "acc", "acceleraciones", "acelaciones",
      "totalaccelerations", "totalaccels", "naccels", "accelcount",
      "highaccelerations", "highacc", "accmax",
    ],
  },
  {
    key: "decelerations",
    label: "Decelerations",
    aliases: [
      "decelerations", "decels", "dec", "deceleraciones",
      "totaldecelerations", "totaldecels", "ndecels", "deccount",
      "highdecelerations", "highdec", "decmax",
    ],
  },
  {
    key: "sprintCount",
    label: "Sprint count",
    aliases: [
      "sprints", "sprintcount", "nsprints", "totalsprints",
      "esprintes", "numerosprints", "sprintnumber",
    ],
  },
  {
    key: "codEvents",
    label: "Change-of-direction events",
    aliases: [
      "cod", "codevents", "changeofdirection", "cambiodedireccion",
      "ncod", "totalcod", "codcount", "cuts", "cortes",
    ],
  },

  // ─── Velocity ───────────────────────────────────────────────────────
  {
    key: "maxVelocity",
    label: "Max velocity",
    unit: "km/h",
    aliases: [
      "maxvelocity", "maxvel", "maxspeed", "topspeed", "vmax",
      "velocidadmaxima", "velmax", "peakspeed", "peakvelocity",
    ],
  },
  {
    key: "avgVelocity",
    label: "Avg velocity",
    unit: "km/h",
    aliases: [
      "avgvelocity", "averagevelocity", "avgspeed", "averagespeed",
      "velocidadmedia", "velmedia", "vavg",
    ],
  },

  // ─── Player Load ────────────────────────────────────────────────────
  {
    key: "playerLoad",
    label: "Player Load",
    aliases: [
      "playerload", "totalplayerload", "pl", "cargajugador",
      "cargatotal", "loadtotal", "wlpl", "playerloadtotal",
    ],
  },
  {
    key: "playerLoadPerMinute",
    label: "Player Load · min⁻¹",
    aliases: [
      "playerloadpermin", "playerloadperminute", "plpermin", "plmin",
      "cargaporminuto", "cargamin", "playerloadrate",
    ],
  },

  // ─── Metabolic (WIMU's specialty area) ──────────────────────────────
  {
    key: "metabolicPower",
    label: "Metabolic power (avg)",
    unit: "W/kg",
    aliases: [
      "metabolicpower", "avgmetabolicpower", "averagemetabolicpower",
      "potenciametabolica", "potenciametabolicamedia", "mpavg",
      "metabolicpoweravg", "mp",
    ],
  },
  {
    key: "metabolicPowerPeak",
    label: "Metabolic power (peak)",
    unit: "W/kg",
    aliases: [
      "metabolicpowerpeak", "peakmetabolicpower", "maxmetabolicpower",
      "potenciametabolicapico", "potenciametabolicamaxima", "mpmax",
      "mppeak",
    ],
  },
  {
    key: "metabolicLoadScore",
    label: "Metabolic load score (MLI)",
    aliases: [
      "metabolicloadscore", "metabolicload", "mli", "metabolicindex",
      "indicemetabolico", "cargametabolica", "mls",
    ],
  },
  {
    key: "highMetabolicLoadDistanceM",
    label: "High Metabolic Load distance",
    unit: "m",
    aliases: [
      "highmetabolicloaddistance", "hmld", "hmldistance",
      "distanciaaltacargametabolica", "distanciamlialta", "hmldm",
    ],
  },
  {
    key: "metabolicEnergyKj",
    label: "Metabolic energy",
    unit: "kJ",
    aliases: [
      "metabolicenergy", "energyexpenditure", "energia",
      "gastoenergetico", "energykj", "kj", "energyspent",
    ],
  },

  // ─── Heart rate ─────────────────────────────────────────────────────
  {
    key: "avgHeartRate",
    label: "Avg HR",
    unit: "bpm",
    aliases: [
      "avgheartrate", "averageheartrate", "hravg", "heartrateavg",
      "avghr", "hrmean", "averagehr",
      "fcmedia", "frecuenciacardiacamedia",
    ],
  },
  {
    key: "maxHeartRate",
    label: "Max HR",
    unit: "bpm",
    aliases: [
      "maxheartrate", "peakheartrate", "hrmax", "heartratemax",
      "maxhr", "peakhr",
      "fcmax", "fcmaxima", "frecuenciacardiacamaxima",
    ],
  },
  {
    key: "hrZone1TimeS",
    label: "Time in HR Zone 1",
    unit: "s",
    aliases: ["hrzone1", "hrz1", "tiempozona1", "tzona1", "z1time"],
  },
  {
    key: "hrZone2TimeS",
    label: "Time in HR Zone 2",
    unit: "s",
    aliases: ["hrzone2", "hrz2", "tiempozona2", "tzona2", "z2time"],
  },
  {
    key: "hrZone3TimeS",
    label: "Time in HR Zone 3",
    unit: "s",
    aliases: ["hrzone3", "hrz3", "tiempozona3", "tzona3", "z3time"],
  },
  {
    key: "hrZone4TimeS",
    label: "Time in HR Zone 4",
    unit: "s",
    aliases: ["hrzone4", "hrz4", "tiempozona4", "tzona4", "z4time"],
  },
  {
    key: "hrZone5TimeS",
    label: "Time in HR Zone 5",
    unit: "s",
    aliases: ["hrzone5", "hrz5", "tiempozona5", "tzona5", "z5time"],
  },
] as const;

export function getWimuMetricDefinitions(): readonly WimuMetricDefinition[] {
  return METRIC_DEFINITIONS;
}

export function getWimuMetricDefinition(key: WimuMetricKey): WimuMetricDefinition {
  const found = METRIC_DEFINITIONS.find((m) => m.key === key);
  if (!found) throw new Error(`Unknown WIMU metric key: ${key}`);
  return found;
}

/**
 * Build a lookup table from normalized header strings to the canonical
 * metric key they belong to. Used by the parser to translate one CSV
 * header row into a column-index → metric map.
 */
export function buildHeaderAliasIndex(): Map<string, WimuMetricKey> {
  const index = new Map<string, WimuMetricKey>();
  for (const def of METRIC_DEFINITIONS) {
    for (const alias of def.aliases) {
      const normalized = normalizeColumnName(alias);
      // First definition wins on alias collisions — important so that a
      // generic alias like "distance" maps to totalDistance, not to a
      // more specific metric that happens to share an alias.
      if (!index.has(normalized)) index.set(normalized, def.key);
    }
  }
  return index;
}

/**
 * Match a single raw column header to a metric key using the alias index.
 * Returns null if no alias matches — caller should surface this in the
 * mapper UI for manual confirmation.
 */
export function matchHeader(rawColumnName: string, index?: Map<string, WimuMetricKey>): WimuMetricKey | null {
  const idx = index ?? buildHeaderAliasIndex();
  const normalized = normalizeColumnName(rawColumnName);
  return idx.get(normalized) ?? null;
}
