/**
 * IMTP writer — the MAX-STRENGTH driver from VALD ForceDecks isometric mid-thigh
 * pull (the strength consumer's primary force test, alongside CMJ). VBT
 * (GymAware LV-profile) already emits force_deficit / velocity_deficit; IMTP adds
 * the same qualities from an isometric peak-force test so clubs without VBT still
 * get a strength driver — and where both agree the reconciler raises confidence,
 * where they conflict it surfaces both.
 *
 * Two reads:
 *   • Relative peak force (ISO_BM_REL_FORCE_PEAK, N/kg) low → force_deficit
 *     (max-strength emphasis). Rough default threshold — configurable + flagged.
 *   • Dynamic Strength Index (DSI = CMJ concentric peak force ÷ IMTP peak force):
 *     low (<0.6) → velocity_deficit (ballistic / speed-strength); high (>0.8) →
 *     force_deficit (max-strength). Comfort & Sheppard interpretation; thresholds
 *     configurable + flagged (needs BOTH tests).
 *   • Early RFD (RFD_AT_100MS) very low → a reactive/explosive nudge.
 *
 * source "vald", status confirmed (instrumented). Descriptive — never the
 * readiness colour. Pure classifier + a server loader.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BATTERY_CODES, batteryMetricMean } from "@/lib/integrations/vald/battery";
import type { DeficitRow } from "./reconcile";

const LOOKBACK_DAYS = 56;

/** Interpretation thresholds — DSI bands are Comfort & Sheppard; the relative-force
 *  and RFD floors are rough defaults (population norms not club-calibrated), so they
 *  are flagged as such in the provenance. Exported so a club can tune them. */
export const IMTP_THRESHOLDS = {
  dsiLow: 0.6,          // < → velocity_deficit (ballistic / speed-strength)
  dsiHigh: 0.8,         // > → force_deficit (max-strength)
  relForcePeakLow: 28,  // N/kg — below → force_deficit (rough default, configurable)
  rfd100Low: 3500,      // N/s — below → explosive/reactive nudge (rough default)
};

const round = (n: number) => Math.round(n * 100) / 100;

export type ImtpMetrics = {
  relForcePeak: number | null; // ISO_BM_REL_FORCE_PEAK (N/kg)
  peakForce: number | null;    // PEAK_VERTICAL_FORCE (N) — DSI denominator
  rfd100: number | null;       // RFD_AT_100MS (N/s)
  cmjConcentricPeakForce: number | null; // CMJ concentric peak force (N) — DSI numerator
  date: string | null;
};

/** Pure: IMTP (+ CMJ for DSI) → force/velocity/reactive deficit rows. */
export function imtpDeficitsFromMetrics(m: ImtpMetrics, thr = IMTP_THRESHOLDS): DeficitRow[] {
  const rows: DeficitRow[] = [];
  const prov = m.date ? ` · ${m.date}` : "";
  const dsi = m.cmjConcentricPeakForce != null && m.peakForce ? m.cmjConcentricPeakForce / m.peakForce : null;

  let forceFired = false;
  let velocityFired = false;

  if (dsi != null) {
    if (dsi < thr.dsiLow) {
      velocityFired = true;
      rows.push({ quality: "velocity_deficit", source: "vald", status: "confirmed", confidence: 0.85, value: round(dsi),
        provenance: { en: `VALD DSI ${round(dsi)} (< ${thr.dsiLow}) → ballistic / speed-strength (Comfort & Sheppard; configurable)${prov}`, is: `VALD DSI ${round(dsi)} (< ${thr.dsiLow}) → ballistískur / hraða-styrkur (Comfort & Sheppard; stillanlegt)${prov}` },
        evidenceGrade: "moderate" });
    } else if (dsi > thr.dsiHigh) {
      forceFired = true;
      rows.push({ quality: "force_deficit", source: "vald", status: "confirmed", confidence: 0.85, value: round(dsi),
        provenance: { en: `VALD DSI ${round(dsi)} (> ${thr.dsiHigh}) → max-strength (Comfort & Sheppard; configurable)${prov}`, is: `VALD DSI ${round(dsi)} (> ${thr.dsiHigh}) → hámarks-styrkur (Comfort & Sheppard; stillanlegt)${prov}` },
        evidenceGrade: "moderate" });
    }
  }

  // Low relative peak force → max-strength (only if DSI didn't already fire force).
  if (!forceFired && m.relForcePeak != null && m.relForcePeak < thr.relForcePeakLow) {
    rows.push({ quality: "force_deficit", source: "vald", status: "confirmed", confidence: 0.8, value: round(m.relForcePeak),
      provenance: { en: `VALD IMTP relative peak force ${round(m.relForcePeak)} N/kg (< ${thr.relForcePeakLow}, rough threshold) → max-strength${prov}`, is: `VALD IMTP hlutfallslegt hámarks-kraftur ${round(m.relForcePeak)} N/kg (< ${thr.relForcePeakLow}, gróft viðmið) → hámarks-styrkur${prov}` },
      evidenceGrade: "moderate" });
  }

  // Very low early RFD → an explosive/reactive nudge (secondary; hint-ish).
  if (!velocityFired && m.rfd100 != null && m.rfd100 < thr.rfd100Low) {
    rows.push({ quality: "reactive_strength", source: "vald", status: "confirmed", confidence: 0.7, value: round(m.rfd100),
      provenance: { en: `VALD IMTP early RFD ${round(m.rfd100)} N/s (< ${thr.rfd100Low}, rough threshold) → explosive / reactive nudge${prov}`, is: `VALD IMTP snemm-RFD ${round(m.rfd100)} N/s (< ${thr.rfd100Low}, gróft viðmið) → sprengi- / viðbragðs-ábending${prov}` },
      evidenceGrade: "moderate" });
  }

  return rows;
}

type MetricRow = { raw_test_id: string; test_timestamp: string | null; metric_code: string; limb: string; value: number | null };

/** Pull the latest test of a type and trial-mean its rows for the given code sets. */
async function latestTestMetrics(sb: SupabaseClient, playerId: string, testTypePattern: string, since: string): Promise<{ rows: MetricRow[]; date: string | null }> {
  const { data } = await sb
    .from("vald_test_metrics")
    .select("raw_test_id, test_timestamp, metric_code, limb, value")
    .eq("microplayer_id", playerId)
    .ilike("test_type", testTypePattern)
    .gte("test_timestamp", since)
    .order("test_timestamp", { ascending: false })
    .limit(300);
  const all = (data ?? []) as MetricRow[];
  if (!all.length) return { rows: [], date: null };
  const latestId = all[0].raw_test_id;
  return { rows: all.filter((r) => r.raw_test_id === latestId), date: all[0].test_timestamp?.slice(0, 10) ?? null };
}

/** Server: read the player's latest IMTP (+ CMJ for DSI) and derive the rows. */
export async function loadImtpDeficitRows(sb: SupabaseClient, playerId: string): Promise<DeficitRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const imtp = await latestTestMetrics(sb, playerId, "%imtp%", since);
  if (!imtp.rows.length) return []; // no IMTP — honest (VBT still covers force/velocity)

  const relForcePeak = batteryMetricMean(imtp.rows, BATTERY_CODES.imtpRelForcePeak, "Trial");
  const peakForce = batteryMetricMean(imtp.rows, BATTERY_CODES.imtpPeakForce, "Trial");
  const rfd100 = batteryMetricMean(imtp.rows, BATTERY_CODES.imtpRfd100, "Trial");

  // CMJ concentric peak force for DSI — best-effort (skips DSI if the code/test absent).
  const cmj = await latestTestMetrics(sb, playerId, "%cmj%", since);
  const cmjConcentricPeakForce = cmj.rows.length
    ? batteryMetricMean(cmj.rows, ["CONCENTRIC_PEAK_FORCE", "PEAK_CONCENTRIC_FORCE", "TRIAL_CONCENTRIC_PEAK_FORCE"], "Trial")
    : null;

  return imtpDeficitsFromMetrics({ relForcePeak, peakForce, rfd100, cmjConcentricPeakForce, date: imtp.date });
}
