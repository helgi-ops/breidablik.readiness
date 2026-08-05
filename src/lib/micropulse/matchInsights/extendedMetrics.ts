/**
 * Extended per-match movement metrics for Match Insights (item: richer GPS + IMA).
 *
 * The Match Movement fingerprint is a deliberate 5-dimension summary. This adds the
 * fuller set of GPS + detailed-IMA signals Catapult already captures per match, so
 * wins-vs-losses and the correlations can run over them too. Pure, client-safe:
 * labels for the UI, and a per-row compute that reads plain column values (no
 * server imports). Every value is per-minute (rate), a peak, or a percent — so
 * matches of different length compare fairly. null when the source is absent
 * (honest empty — never a fabricated zero).
 */

export const EXTENDED_METRIC_KEYS = [
  // GPS
  "totalDistPerMin", "hsrPerMin", "sprintPerMin", "maxVel", "hmldPerMin",
  // detailed IMA
  "decelHighPerMin", "codHighPerMin", "sprintStridesPerMin", "fmpHighRunPct", "jumpsPerMin",
] as const;
export type ExtMetricKey = (typeof EXTENDED_METRIC_KEYS)[number];

export const EXTENDED_METRIC_LABELS: Record<string, { en: string; is: string }> = {
  totalDistPerMin:    { en: "Total distance / min",           is: "Heildarvegalengd / mín" },
  hsrPerMin:          { en: "High-speed running / min",       is: "Háhraðahlaup / mín" },
  sprintPerMin:       { en: "Sprint distance / min",          is: "Sprett-vegalengd / mín" },
  maxVel:             { en: "Top speed (km/h)",               is: "Hámarkshraði (km/klst)" },
  hmldPerMin:         { en: "High metabolic-load dist / min", is: "Efnaskipta-álag vegalengd / mín" },
  decelHighPerMin:    { en: "High-intensity decels / min",    is: "Háákefðar hemlanir / mín" },
  codHighPerMin:      { en: "High-intensity CoD / min",       is: "Háákefðar stefnubreytingar / mín" },
  sprintStridesPerMin:{ en: "Sprint strides / min",           is: "Sprett-skref / mín" },
  fmpHighRunPct:      { en: "High-intensity running time %",  is: "Háákefðar hlaupatími %" },
  jumpsPerMin:        { en: "Jumps / min",                    is: "Stökk / mín" },
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function rate(v: unknown, minutes: number): number | null {
  const n = num(v);
  return n == null || !(minutes > 0) ? null : n / minutes;
}

export type ExtLoadRow = Record<string, unknown>;

/** Compute the extended metrics for one player-match load row + its minutes. */
export function extendedMetricsForRow(row: ExtLoadRow, minutes: number): Record<ExtMetricKey, number | null> {
  const maxV = num(row.max_velocity);
  const codLeftHigh = num(row.ima_cod_left_high);
  const codRightHigh = num(row.ima_cod_right_high);
  const codHigh = codLeftHigh != null || codRightHigh != null ? (codLeftHigh ?? 0) + (codRightHigh ?? 0) : null;
  const fmpHigh = num(row.fmp_running_high_s);
  const fmpTot = num(row.fmp_total_duration_s);
  return {
    totalDistPerMin: rate(row.total_distance, minutes),
    hsrPerMin: rate(row.high_speed_distance, minutes),
    sprintPerMin: rate(row.velocity_band6_total_distance, minutes) ?? rate(row.sprint_distance, minutes),
    // Peak, not per-minute; drop GPS glitches (>45 km/h) everywhere else too.
    maxVel: maxV != null && maxV > 0 && maxV <= 45 ? maxV : null,
    hmldPerMin: rate(row.high_metabolic_load_distance_m, minutes),
    decelHighPerMin: rate(row.ima_band3_decel_count, minutes),
    codHighPerMin: codHigh != null ? rate(codHigh, minutes) : null,
    sprintStridesPerMin: rate(row.ima_fr_band8_stride_count, minutes),
    fmpHighRunPct: fmpHigh != null && fmpTot != null && fmpTot > 0 ? (fmpHigh / fmpTot) * 100 : null,
    jumpsPerMin: rate(row.jumps, minutes),
  };
}
