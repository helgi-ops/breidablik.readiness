/**
 * VALD ForceDecks RTP battery — test-type recognition + generic result extractor.
 *
 * The CMJ pipeline has a dedicated typed table (vald_forcedecks_results). The
 * rest of the battery (IMTP, Drop Jump, Single-Leg Drop Jump, Single-Leg Iso
 * Squat, …) is captured in long form (vald_test_metrics) directly from VALD's
 * own `trials[].results[]` — each result carries `{ value, limb, definition:
 * { result, unit } }`. We store every code VALD sends (verified live: an IMTP
 * returns 46 codes incl. PEAK_VERTICAL_FORCE, FORCE_AT_50/100/150/200MS,
 * RFD_AT_*, ISO_BM_REL_FORCE_*), so nothing is guessed and new codes need no
 * schema change.
 *
 * Pure / serialisable.
 */

/** Canonical battery test-type codes we recognise (CMJ handled separately). */
export type BatteryTestType =
  | "IMTP" | "DJ" | "SLDJ" | "SLISOSQT" | "ISOSQT" | "SJ" | "HJ" | "LAH" | "SLJ" | "OTHER";

/** Map VALD's free-text testType to a canonical code. CMJ returns null (its own table). */
export function classifyBatteryTestType(testType: string | null | undefined): BatteryTestType | null {
  const t = String(testType ?? "").trim().toUpperCase();
  if (!t) return null;
  if (/CMJ|COUNTERMOVEMENT|ABCMJ/.test(t)) return null; // CMJ family → dedicated table
  if (/IMTP|MIDTHIGH|MID_THIGH/.test(t)) return "IMTP";
  if (/SLDJ|SINGLE.?LEG.?DROP/.test(t)) return "SLDJ";
  if (/\bDJ\b|DROPJUMP|DROP_JUMP/.test(t)) return "DJ";
  if (/SLISOSQT|SL.?ISO.?SQ|SINGLE.?LEG.?ISO/.test(t)) return "SLISOSQT";
  if (/ISOSQT|ISO.?SQUAT|ISOSQUAT|\bISOT\b/.test(t)) return "ISOSQT";
  if (/SLJ|SINGLE.?LEG.?JUMP/.test(t)) return "SLJ";
  if (/\bSJ\b|SQUATJUMP|SQUAT_JUMP/.test(t)) return "SJ";
  if (/\bHJ\b|HOP/.test(t)) return "HJ";
  if (/LAH/.test(t)) return "LAH";
  return "OTHER";
}

export type ExtractedMetric = {
  trialNumber: number;
  code: string;
  limb: string; // Trial | Both | Left | Right | Asym
  value: number | null;
  unit: string | null;
};

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Extract every result (per trial, per limb) from a VALD test payload's
 * `trials[].results[]`. Trial order sets trial_number. Codes come from
 * `definition.result` (falls back to resultId); units from `definition.unit`.
 */
export function extractTestMetrics(payload: unknown): ExtractedMetric[] {
  const root = asRec(payload);
  const trials = Array.isArray(root?.trials) ? (root!.trials as unknown[]) : Array.isArray(payload) ? (payload as unknown[]) : [];
  const out: ExtractedMetric[] = [];
  trials.forEach((tr, idx) => {
    const trial = asRec(tr);
    const results = Array.isArray(trial?.results) ? (trial!.results as unknown[]) : [];
    for (const r of results) {
      const res = asRec(r);
      if (!res) continue;
      const def = asRec(res.definition);
      const code = (typeof def?.result === "string" && def.result.trim())
        ? def.result.trim()
        : res.resultId != null ? String(res.resultId) : null;
      if (!code) continue;
      const limb = typeof res.limb === "string" && res.limb.trim() ? res.limb.trim() : "Trial";
      const value = typeof res.value === "number" && Number.isFinite(res.value) ? res.value : null;
      const unit = typeof def?.unit === "string" ? def.unit : null;
      out.push({ trialNumber: idx, code, limb, value, unit });
    }
  });
  return out;
}

/**
 * Trial-mean of a metric for a limb, trying `codes` in order (first present
 * wins). Mirrors Claudino trial averaging. `rows` are ExtractedMetric or the
 * stored vald_test_metrics rows ({ metric_code, limb, value }).
 */
export function batteryMetricMean(
  rows: Array<{ code?: string; metric_code?: string; limb: string; value: number | null; trialNumber?: number }>,
  codes: readonly string[],
  limb = "Trial",
): number | null {
  for (const code of codes) {
    const vals = rows
      .filter((r) => (r.code ?? r.metric_code) === code && r.limb === limb && typeof r.value === "number" && Number.isFinite(r.value))
      .map((r) => r.value as number);
    if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return null;
}

/** RTP-relevant code lists per test (extend as new tests are probed). */
export const BATTERY_CODES: Record<string, string[]> = {
  // IMTP — verified live from a real payload (46 codes returned).
  imtpPeakForce: ["PEAK_VERTICAL_FORCE"],
  imtpNetPeakForce: ["NET_PEAK_VERTICAL_FORCE"],
  imtpRelForcePeak: ["ISO_BM_REL_FORCE_PEAK", "ISO_BW_REL_FORCE_PEAK"],
  imtpForce100: ["FORCE_AT_100MS"],
  imtpForce200: ["FORCE_AT_200MS"],
  // Reactive / single-leg (codes confirmed at backfill time; extractor stores all).
  rsi: ["RSI", "RSI_MODIFIED", "REACTIVE_STRENGTH_INDEX"],
  contactTime: ["CONTACT_TIME", "GROUND_CONTACT_TIME"],
  activeStiffness: ["ACTIVE_STIFFNESS", "ACTIVE_STIFFNESS_INDEX", "STIFFNESS"],
  jumpHeight: ["JUMP_HEIGHT", "JUMP_HEIGHT_IMP_MOM", "JUMP_HEIGHT_FLIGHT_TIME"],
  peakPowerRel: ["PEAK_POWER_BM", "RELATIVE_PEAK_POWER"],
};
