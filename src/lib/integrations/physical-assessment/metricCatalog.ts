/**
 * src/lib/integrations/physical-assessment/metricCatalog.ts
 *
 * Metric catalog for the Physical Assessment Battery — the periodic
 * (≈6-monthly) strength + physical test the afrekshópur goes through at
 * Háskólinn í Reykjavík.
 *
 * Phase 1 covers the NON-VALD measurements that arrive as CSV/PDF:
 *   • speed         — sprint splits, flying sprints, max velocity
 *   • jump          — CMJ, squat jump, drop jump, broad jump, RSI
 *   • anthropometric — body mass, height, body composition
 *
 * VALD force tests (NordBord / ForceFrame / ForceDecks) keep flowing through
 * the existing vald_* tables and are associated with an assessment by date
 * in a later phase — they are intentionally NOT in this catalog.
 *
 * Each definition carries an alias list so the upload wizard can auto-map
 * most CSV columns; the coach maps the rest by hand. The matching logic
 * (token-set aliases + exclude tokens) mirrors the VALD CSV parser.
 */

export type AssessmentMetricCategory = "speed" | "jump" | "anthropometric";

export type AssessmentMetricDef = {
  /** Stable code stored in physical_assessment_metrics.metric_code. */
  code: string;
  category: AssessmentMetricCategory;
  nameEN: string;
  nameIS: string;
  /** Canonical unit. The stored value is coerced to this unit's scale. */
  unit: string;
  /** True when a bigger number is a better result (jump height); false when
   *  smaller is better (sprint time). Drives the Phase-2 interpretation. */
  higherIsBetter: boolean;
  /** OR-list of token sets. A header matches when every token of ANY set is
   *  present in the normalised header. */
  aliases: string[][];
  /** If any of these tokens appears in the header the field is disqualified,
   *  even when an alias matched — disambiguates overlapping headers. */
  exclude?: string[];
};

export const ASSESSMENT_METRIC_CATALOG: AssessmentMetricDef[] = [
  // ── Speed — sprint splits (seconds, lower is better) ──────────────────────
  {
    code: "sprint_5m_s", category: "speed", unit: "s", higherIsBetter: false,
    nameEN: "5 m sprint", nameIS: "5 m sprettur",
    aliases: [["5m", "sprint"], ["sprint", "5m"], ["5m", "split"], ["5m", "time"]],
    exclude: ["flying", "velocity"],
  },
  {
    code: "sprint_10m_s", category: "speed", unit: "s", higherIsBetter: false,
    nameEN: "10 m sprint", nameIS: "10 m sprettur",
    aliases: [["10m", "sprint"], ["sprint", "10m"], ["10m", "split"], ["10m", "time"]],
    exclude: ["flying", "velocity"],
  },
  {
    code: "sprint_20m_s", category: "speed", unit: "s", higherIsBetter: false,
    nameEN: "20 m sprint", nameIS: "20 m sprettur",
    aliases: [["20m", "sprint"], ["sprint", "20m"], ["20m", "split"], ["20m", "time"]],
    exclude: ["flying", "velocity"],
  },
  {
    code: "sprint_30m_s", category: "speed", unit: "s", higherIsBetter: false,
    nameEN: "30 m sprint", nameIS: "30 m sprettur",
    aliases: [["30m", "sprint"], ["sprint", "30m"], ["30m", "split"], ["30m", "time"]],
    exclude: ["flying", "velocity"],
  },
  {
    code: "sprint_40m_s", category: "speed", unit: "s", higherIsBetter: false,
    nameEN: "40 m sprint", nameIS: "40 m sprettur",
    aliases: [["40m", "sprint"], ["sprint", "40m"], ["40m", "split"], ["40m", "time"]],
    exclude: ["flying", "velocity"],
  },
  {
    code: "flying_10m_s", category: "speed", unit: "s", higherIsBetter: false,
    nameEN: "Flying 10 m", nameIS: "Fljúgandi 10 m",
    aliases: [["flying", "10m"], ["10m", "flying"]],
  },
  {
    code: "flying_20m_s", category: "speed", unit: "s", higherIsBetter: false,
    nameEN: "Flying 20 m", nameIS: "Fljúgandi 20 m",
    aliases: [["flying", "20m"], ["20m", "flying"]],
  },
  {
    code: "max_velocity_ms", category: "speed", unit: "m/s", higherIsBetter: true,
    nameEN: "Max velocity", nameIS: "Hámarkshraði",
    aliases: [["max", "velocity"], ["maximum", "velocity"], ["top", "speed"],
      ["max", "speed"], ["vmax"]],
  },

  // ── Jump (centimetres / index, higher is better) ──────────────────────────
  {
    code: "cmj_height_cm", category: "jump", unit: "cm", higherIsBetter: true,
    nameEN: "Countermovement jump", nameIS: "Sveiflustökk (CMJ)",
    aliases: [["cmj"], ["countermovement", "jump"], ["counter", "movement", "jump"]],
    exclude: ["squat", "drop"],
  },
  {
    code: "squat_jump_cm", category: "jump", unit: "cm", higherIsBetter: true,
    nameEN: "Squat jump", nameIS: "Kyrrstöðustökk (SJ)",
    aliases: [["squat", "jump"], ["sj", "height"]],
    exclude: ["counter", "cmj", "drop"],
  },
  {
    code: "drop_jump_cm", category: "jump", unit: "cm", higherIsBetter: true,
    nameEN: "Drop jump height", nameIS: "Fallstökk hæð",
    aliases: [["drop", "jump"], ["dj", "height"]],
    exclude: ["rsi", "contact"],
  },
  {
    code: "broad_jump_cm", category: "jump", unit: "cm", higherIsBetter: true,
    nameEN: "Standing broad jump", nameIS: "Langstökk án atrennu",
    aliases: [["broad", "jump"], ["standing", "long", "jump"],
      ["standing", "broad", "jump"], ["long", "jump"]],
  },
  {
    code: "rsi", category: "jump", unit: "index", higherIsBetter: true,
    nameEN: "Reactive Strength Index", nameIS: "Reactive Strength Index (RSI)",
    aliases: [["rsi"], ["reactive", "strength", "index"], ["reactive", "strength"]],
  },

  // ── Anthropometric ────────────────────────────────────────────────────────
  {
    code: "body_mass_kg", category: "anthropometric", unit: "kg", higherIsBetter: true,
    nameEN: "Body mass", nameIS: "Líkamsþyngd",
    aliases: [["body", "mass"], ["body", "weight"], ["bodyweight"], ["weight"], ["mass"]],
    exclude: ["lean", "fat", "free", "sitting", "muscle"],
  },
  {
    code: "height_cm", category: "anthropometric", unit: "cm", higherIsBetter: true,
    nameEN: "Standing height", nameIS: "Hæð",
    aliases: [["standing", "height"], ["height"], ["stature"]],
    exclude: ["sitting", "jump", "cmj", "reach", "drop"],
  },
  {
    code: "sitting_height_cm", category: "anthropometric", unit: "cm", higherIsBetter: true,
    nameEN: "Sitting height", nameIS: "Setuhæð",
    aliases: [["sitting", "height"]],
  },
  {
    code: "body_fat_pct", category: "anthropometric", unit: "%", higherIsBetter: false,
    nameEN: "Body fat", nameIS: "Fituhlutfall",
    aliases: [["body", "fat"], ["fat", "percentage"], ["fat", "percent"],
      ["fat", "mass", "percent"], ["bf"]],
    exclude: ["free", "lean"],
  },
  {
    code: "lean_mass_kg", category: "anthropometric", unit: "kg", higherIsBetter: true,
    nameEN: "Lean body mass", nameIS: "Vöðvamassi (lean)",
    aliases: [["lean", "mass"], ["lean", "body", "mass"], ["fat", "free", "mass"],
      ["ffm"], ["muscle", "mass"]],
  },
  {
    code: "sum_skinfolds_mm", category: "anthropometric", unit: "mm", higherIsBetter: false,
    nameEN: "Sum of skinfolds", nameIS: "Summa húðfellinga",
    aliases: [["sum", "skinfolds"], ["sum", "of", "skinfolds"], ["skinfolds"], ["skinfold"]],
  },
  {
    code: "wingspan_cm", category: "anthropometric", unit: "cm", higherIsBetter: true,
    nameEN: "Wingspan", nameIS: "Faðmur",
    aliases: [["wingspan"], ["arm", "span"], ["armspan"]],
  },
];

/** code → definition lookup. */
const BY_CODE = new Map(ASSESSMENT_METRIC_CATALOG.map((d) => [d.code, d]));

export function getMetricDef(code: string): AssessmentMetricDef | undefined {
  return BY_CODE.get(code);
}

/** All catalog codes, grouped by category — used by the upload wizard's
 *  manual column-mapping dropdown. */
export function catalogByCategory(): Record<AssessmentMetricCategory, AssessmentMetricDef[]> {
  const out: Record<AssessmentMetricCategory, AssessmentMetricDef[]> = {
    speed: [], jump: [], anthropometric: [],
  };
  for (const d of ASSESSMENT_METRIC_CATALOG) out[d.category].push(d);
  return out;
}
