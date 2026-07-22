/**
 * Bounds the per-athlete Catapult param object stored in raw_payload_json — a
 * DIAGNOSTIC so we can see which OpenField names/values arrive (e.g. HR mapping),
 * never a place for unbounded blobs.
 *
 * Small payloads are kept whole. Large ones (Breiðablik's full stats object is
 * ~70 KB) are replaced by a compact, HR-FOCUSED slice that keeps the actual VALUES
 * of the HR fields plus session context (activity_name / period_name) and the full
 * key list — so avg HR / zone durations / the activity name are readable straight
 * from the row without a re-sync, while the row stays tiny.
 */

export const RAW_PAYLOAD_MAX_BYTES = 32_000;

// HR-ish scalar keys worth keeping the value of: heart_rate_*, a standalone "hr"
// token (not "threshold"), %HR, per-athlete HRmax, red_zone.
const HR_SLICE_RE = /heart|(?:^|[^a-z])hr(?:[^a-z]|$)|percentage_.*(?:heart|hr)|athlete_max_hr|red_zone/i;

// Session context worth keeping so the belt data can be tied to an activity.
const CONTEXT_KEYS = new Set([
  "activity_name",
  "activity_id",
  "period_name",
  "period_id",
  "activity_count",
  "athlete_id",
  "athlete_name",
  "athlete_first_name",
  "athlete_last_name",
  "start_time",
  "end_time",
  "date",
]);

export function boundRawPayload(raw: unknown): unknown {
  if (raw == null) return null;
  try {
    const json = JSON.stringify(raw);
    if (json.length <= RAW_PAYLOAD_MAX_BYTES) return raw;

    const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const hr: Record<string, unknown> = {};
    const context: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      // Only scalars into the slice — nested objects/arrays are what made it big.
      if (v !== null && typeof v === "object") continue;
      if (CONTEXT_KEYS.has(k)) context[k] = v;
      else if (HR_SLICE_RE.test(k)) hr[k] = v;
    }
    return { _truncated: true, _bytes: json.length, context, hr, keys: Object.keys(rec) };
  } catch {
    return { _truncated: true, _unserializable: true };
  }
}
