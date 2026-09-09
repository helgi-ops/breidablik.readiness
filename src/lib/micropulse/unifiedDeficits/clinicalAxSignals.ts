/**
 * Clinical-assessment writer — the King "Initial Ax" (ROM / strength 0-5 / global
 * movement, R/L + pain), recorded by a CLINICIAN, writes CONFIRMED deficits into
 * the ledger (the highest-authority source alongside VALD). Only fields that map
 * to a unified quality produce a deficit; a pain flag routes that row to the
 * clinician (medical). Pure mapper + a server loader. Descriptive — never the
 * readiness colour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { KING_ASSESSMENT_BY_ID } from "@/lib/micropulse/movementScreen/king/assessment";
import type { QualityKey } from "./quality";
import type { DeficitRow, Severity, Side } from "./reconcile";

/** One recorded Initial-Ax field: scoreR/scoreL (0-5 for strength; degrees or a
 *  0-3 grade otherwise), a pain score, and a clinician "abnormal / reduced" flag. */
export type ClinicalAxField = { fieldId: string; scoreR?: number | null; scoreL?: number | null; pain?: number | null; flag?: boolean };

/** Initial-Ax field → unified quality (only the clean maps; the rest are recorded
 *  in the clinical record but don't auto-route). */
const KING_FIELD_QUALITY: Record<string, QualityKey> = {
  hip_ir: "hip_rotation_mobility",
  hip_er: "hip_rotation_mobility",
  ankle_df: "ankle_dorsiflexion_mobility",
  hip_abduction: "glute_med_er_control",
  hip_abduction_er: "glute_med_er_control",
  hip_abd_active: "glute_med_er_control",
  hip_abd_passive: "glute_med_er_control",
  deep_rotators: "glute_med_er_control",
  sl_squat: "landing_valgus",
  obliques: "trunk_antirotation", // trunk / anti-rotation endurance (lumbopelvic control)
};

const PAIN_MEDICAL = 4; // ≥ 4/10 pain → route to the clinician

/** Pure: map recorded Initial-Ax fields → confirmed clinical deficit rows. */
export function clinicalAxDeficits(fields: ClinicalAxField[], date?: string | null): DeficitRow[] {
  const rows: DeficitRow[] = [];
  for (const f of fields) {
    const quality = KING_FIELD_QUALITY[f.fieldId];
    if (!quality) continue; // recorded but not a routable quality
    const def = KING_ASSESSMENT_BY_ID[f.fieldId];
    const label = def?.label.en ?? f.fieldId;
    const r = typeof f.scoreR === "number" ? f.scoreR : null;
    const l = typeof f.scoreL === "number" ? f.scoreL : null;
    const painful = typeof f.pain === "number" && f.pain >= PAIN_MEDICAL;

    // Flagged? strength: min score ≤ 3; otherwise the clinician's abnormal flag.
    let severity: Severity | undefined;
    let flagged = !!f.flag;
    if (def?.scoreType === "strength_0_5") {
      const min = [r, l].filter((x): x is number => x != null);
      const lo = min.length ? Math.min(...min) : null;
      if (lo != null && lo <= 3) { flagged = true; severity = lo <= 2 ? "severe" : "moderate"; }
      else if (flagged) severity = "moderate";
    } else if (flagged) {
      severity = "moderate";
    }
    if (!flagged && !painful) continue;

    // Weaker/limited side (strength: lower = weaker; ROM: lower = more restricted).
    let side: Side = "both";
    if (r != null && l != null && Math.abs(r - l) >= 1) side = r < l ? "R" : "L";

    const scorePart = r != null || l != null ? ` ${r ?? "–"}/${l ?? "–"}` : "";
    rows.push({
      quality,
      source: "clinical_ax",
      status: "confirmed",
      confidence: 0.9,
      severity: severity ?? "moderate",
      side,
      provenance: {
        en: `Clinical Ax: ${label}${scorePart}${painful ? " · pain" : ""}${date ? ` · ${date}` : ""}`,
        is: `Klínískt mat: ${label}${scorePart}${painful ? " · verkur" : ""}${date ? ` · ${date}` : ""}`,
      },
      evidenceGrade: "strong",
      medical: painful,
    });
  }
  return rows;
}

/** Server: read the latest clinical assessment and map it to deficit rows. */
export async function loadClinicalAxDeficitRows(sb: SupabaseClient, playerId: string): Promise<DeficitRow[]> {
  const { data } = await sb
    .from("player_clinical_assessments")
    .select("fields, assessment_date")
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { fields?: ClinicalAxField[]; assessment_date?: string } | null;
  if (!row?.fields?.length) return [];
  return clinicalAxDeficits(row.fields, row.assessment_date ?? null);
}
