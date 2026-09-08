/**
 * IMA / GPS writer — mechanical & directional deficits that neither VALD nor the
 * movement screen sees. Two signals from the player's recent inertial data
 * (player_external_load_daily):
 *   • Deceleration mechanics — a low DECELERATION share vs acceleration means the
 *     player brakes little relative to how much he accelerates → an under-trained
 *     braking / eccentric capacity (decel is the injurious, under-exposed quality).
 *   • CoD directional asymmetry — a left/right change-of-direction imbalance
 *     (ima_cod_left_* vs ima_cod_right_*) → a directional / limb asymmetry.
 * Both feed the plan (decel → prehab decel mechanics + strength eccentric emphasis;
 * asymmetry → unilateral). Measured but CONTEXTUAL (volume depends on role/minutes)
 * — a confirmed-but-contextual source. Descriptive — never the readiness colour.
 *
 * Tier-aware: rows with no IMA (Core tier sends efforts, not IMA; indoor/no-lock
 * sessions) are skipped; too little IMA volume → no deficit (honest).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeficitRow, Clearance } from "./reconcile";

const LOOKBACK_DAYS = 42;
const MIN_ACCEL_DECEL = 30; // total accel+decel efforts before a decel read is meaningful
const MIN_COD = 20;         // total CoD events before an asymmetry read is meaningful
const DECEL_SHARE_MODERATE = 0.40;
const DECEL_SHARE_SEVERE = 0.33;
const COD_ASYM_MODERATE = 0.20;
const COD_ASYM_SEVERE = 0.35;

export type ImaTotals = { accel: number; decel: number; codLeft: number; codRight: number; days: number; latest: string | null };

const round = (n: number) => Math.round(n * 100) / 100;

/** Pure: derive IMA deficit rows from summed totals over the window. */
export function imaDeficitsFromTotals(t: ImaTotals): DeficitRow[] {
  const rows: DeficitRow[] = [];
  const prov = t.latest ? ` · to ${t.latest}` : "";

  // Deceleration mechanics — low decel share vs accel.
  const ad = t.accel + t.decel;
  if (ad >= MIN_ACCEL_DECEL && t.accel > 0) {
    const decelShare = t.decel / ad;
    if (decelShare < DECEL_SHARE_MODERATE) {
      const severe = decelShare < DECEL_SHARE_SEVERE;
      rows.push({
        quality: "decel_mechanics",
        source: "ima",
        status: "confirmed",
        confidence: 0.75, // measured, but contextual (role/minutes-dependent)
        severity: severe ? "severe" : "moderate",
        value: round(decelShare * 100),
        provenance: { en: `IMA · decel share ${round(decelShare * 100)}% of accel+decel (${t.days} sessions${prov})`, is: `IMA · hemlunar-hlutfall ${round(decelShare * 100)}% af accel+decel (${t.days} lotur${prov})` },
        evidenceGrade: "moderate",
      });
    }
  }

  // CoD directional asymmetry — left vs right change-of-direction.
  const cod = t.codLeft + t.codRight;
  if (cod >= MIN_COD && Math.max(t.codLeft, t.codRight) > 0) {
    const asym = Math.abs(t.codLeft - t.codRight) / Math.max(t.codLeft, t.codRight);
    if (asym >= COD_ASYM_MODERATE) {
      const lower = t.codLeft <= t.codRight ? "L" : "R";
      rows.push({
        quality: "limb_asymmetry",
        source: "ima",
        status: "confirmed",
        confidence: 0.75,
        severity: asym >= COD_ASYM_SEVERE ? "severe" : "moderate",
        value: round(asym * 100),
        side: lower,
        provenance: { en: `IMA · change-of-direction ${round(asym * 100)}% asymmetry (${lower} lower, ${t.days} sessions${prov})`, is: `IMA · stefnubreytinga ${round(asym * 100)}% ósamhverfa (${lower} lægri, ${t.days} lotur${prov})` },
        evidenceGrade: "moderate",
      });
    }
  }

  return rows;
}

/** Pure: qualities IMA MEASURED (enough volume) but found within norm → clearances.
 *  These only contradict a firing source in the reconciler; they never plan. */
export function imaClearancesFromTotals(t: ImaTotals): Clearance[] {
  const out: Clearance[] = [];
  const prov = t.latest ? ` · to ${t.latest}` : "";
  const ad = t.accel + t.decel;
  if (ad >= MIN_ACCEL_DECEL && t.accel > 0) {
    const decelShare = t.decel / ad;
    if (decelShare >= DECEL_SHARE_MODERATE) out.push({
      quality: "decel_mechanics", source: "ima",
      provenance: { en: `IMA · decel share ${round(decelShare * 100)}% — within norm (${t.days} sessions${prov})`, is: `IMA · hemlunar-hlutfall ${round(decelShare * 100)}% — innan viðmiða (${t.days} lotur${prov})` },
    });
  }
  const cod = t.codLeft + t.codRight;
  if (cod >= MIN_COD && Math.max(t.codLeft, t.codRight) > 0) {
    const asym = Math.abs(t.codLeft - t.codRight) / Math.max(t.codLeft, t.codRight);
    if (asym < COD_ASYM_MODERATE) out.push({
      quality: "limb_asymmetry", source: "ima",
      provenance: { en: `IMA · change-of-direction ${round(asym * 100)}% asymmetry — symmetric (${t.days} sessions${prov})`, is: `IMA · stefnubreytinga ${round(asym * 100)}% ósamhverfa — samhverft (${t.days} lotur${prov})` },
    });
  }
  return out;
}

type Row = {
  date: string | null;
  ima_accel: number | null; ima_decel: number | null;
  ima_cod_left_high: number | null; ima_cod_left_medium: number | null; ima_cod_left_low: number | null;
  ima_cod_right_high: number | null; ima_cod_right_medium: number | null; ima_cod_right_low: number | null;
};
const num = (v: number | null) => (typeof v === "number" && isFinite(v) ? v : 0);

/** Server: sum the player's recent IMA into totals (null when no IMA at all). */
export async function sumImaTotals(sb: SupabaseClient, playerId: string): Promise<ImaTotals | null> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("player_external_load_daily")
    .select("date, ima_accel, ima_decel, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low")
    .eq("player_id", playerId)
    .gte("date", since)
    .order("date", { ascending: false });
  const rows = (data ?? []) as Row[];

  const t: ImaTotals = { accel: 0, decel: 0, codLeft: 0, codRight: 0, days: 0, latest: null };
  for (const r of rows) {
    const accel = num(r.ima_accel), decel = num(r.ima_decel);
    const cl = num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low);
    const cr = num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
    if (accel + decel + cl + cr === 0) continue; // no IMA on this row (tier / no lock)
    t.accel += accel; t.decel += decel; t.codLeft += cl; t.codRight += cr; t.days += 1;
    if (!t.latest && r.date) t.latest = r.date;
  }
  return t.days === 0 ? null : t; // no IMA data (Core tier / indoor) — honest
}

/** Server: sum the player's recent IMA and derive the deficit rows. */
export async function loadImaDeficitRows(sb: SupabaseClient, playerId: string): Promise<DeficitRow[]> {
  const t = await sumImaTotals(sb, playerId);
  return t ? imaDeficitsFromTotals(t) : [];
}
