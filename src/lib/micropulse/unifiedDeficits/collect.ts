/**
 * Deficit collector (server) — reads the LIVE automated sources and the PERSISTED
 * rows for a player, and returns raw DeficitRow[] + coach overrides for the
 * reconciler. Automated sources (screening form → hypothesis, pose screen →
 * hypothesis, VALD → confirmed) are read fresh so the ledger is always current;
 * player_deficits holds manual / clinical rows and coach overrides. Server-only.
 *
 * IMA / VBT / load / rehab-track writers are the next stage (they add DeficitRow
 * producers here). Descriptive — never the readiness colour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayerMovementScreens } from "../movementScreen/loader";
import { compensationsForReadings, compensationsForRegionFields } from "../movementScreen/correctives/mapping";
import { buildDeficitLedger, type FiredObservation } from "../movementScreen/deficitLedger";
import { loadValdSignalsAndClearances } from "../movementScreen/correctives/valdSignals";
import { sumImaTotals, imaDeficitsFromTotals, imaClearancesFromTotals } from "./imaSignals";
import { loadVbtDeficitRows } from "./vbtSignals";
import { loadImtpDeficitRows } from "./imtpSignals";
import { loadPrehabFlags } from "./loadFlags";
import { loadClinicalAxDeficitRows } from "./clinicalAxSignals";
import { loadRehabTrackDeficitRows } from "./rehabTrackSignals";
import { COMPENSATION_QUALITY, DEFICIT_QUALITY, type QualityKey } from "./quality";
import type { DeficitRow, DeficitOverride, DeficitSource, DeficitStatus, Severity, Side, PrehabFlag, Clearance } from "./reconcile";

const SCREEN_LOOKBACK_DAYS = 56;
const sideOf = (sides: Array<"L" | "R" | "both">): Side => (sides.includes("L") && sides.includes("R") ? "both" : (sides.find((s) => s !== "both") ?? "both"));

export async function collectDeficits(sb: SupabaseClient, playerId: string): Promise<{ rows: DeficitRow[]; overrides: DeficitOverride[]; prehabFlags: PrehabFlag[]; clearances: Clearance[] }> {
  const rows: DeficitRow[] = [];
  const clearances: Clearance[] = [];

  // 1. Screening assessment form → deficit ledger (hypothesis).
  const { data: af } = await sb
    .from("movement_assessment_forms")
    .select("battery, fired, assessment_date")
    .eq("player_id", playerId).order("assessment_date", { ascending: false }).limit(1).maybeSingle();
  const afRow = af as { battery?: string[]; fired?: FiredObservation[]; assessment_date?: string } | null;
  if (afRow?.fired?.length) {
    for (const d of buildDeficitLedger(afRow.fired, afRow.battery ?? [])) {
      const quality = DEFICIT_QUALITY[d.deficitKey];
      if (!quality) continue;
      rows.push({
        quality, source: "movement_form", status: "hypothesis",
        confidence: d.confidence === "corroborated" ? 0.6 : 0.4,
        side: sideOf(d.sides),
        provenance: { en: `Screening form · ${afRow.assessment_date ?? ""}`, is: `Skimunar-form · ${afRow.assessment_date ?? ""}` },
        confirmationTestsOutstanding: d.outstandingConfirmations,
      });
    }
  }

  // 2. Pose movement screens (latest per test) → compensations (hypothesis).
  const screens = await loadPlayerMovementScreens(sb, playerId, 20);
  const cutoff = Date.now() - SCREEN_LOOKBACK_DAYS * 86_400_000;
  const latestPerTest = new Map<string, (typeof screens)[number]>();
  for (const s of screens) {
    if (!s.result?.readings?.length || new Date(s.screenDate).getTime() < cutoff) continue;
    if (!latestPerTest.has(s.testSlug)) latestPerTest.set(s.testSlug, s);
  }
  for (const s of latestPerTest.values()) {
    for (const comp of compensationsForReadings(s.result!.readings)) {
      const quality = COMPENSATION_QUALITY[comp];
      if (!quality) continue;
      rows.push({
        quality, source: "movement_screen", status: "hypothesis", confidence: 0.5,
        provenance: { en: `${s.testSlug.replace(/_/g, " ")} · ${s.screenDate}`, is: `${s.testSlug.replace(/_/g, " ")} · ${s.screenDate}` },
      });
    }
  }

  // 2b. Region assessment (coach field-by-field) → compensations (hypothesis).
  const { data: ra } = await sb
    .from("movement_region_assessments")
    .select("region, fields, assessment_date")
    .eq("player_id", playerId).order("assessment_date", { ascending: false }).limit(1).maybeSingle();
  const raRow = ra as { region?: string; fields?: Array<{ fieldId: string; severity: string }>; assessment_date?: string } | null;
  if (raRow?.fields?.length) {
    for (const comp of compensationsForRegionFields(raRow.fields)) {
      const quality = COMPENSATION_QUALITY[comp];
      if (!quality) continue;
      rows.push({
        quality, source: "region", status: "hypothesis", confidence: 0.55,
        provenance: { en: `${(raRow.region ?? "").replace(/_/g, " ")} assessment · ${raRow.assessment_date ?? ""}`, is: `${(raRow.region ?? "").replace(/_/g, " ")} mat · ${raRow.assessment_date ?? ""}` },
      });
    }
  }

  // 3. VALD force data → confirmed (instrumented). Also emits CLEARANCES: a
  //    quality VALD measured but found within norm — contradicts a firing source.
  const vald = await loadValdSignalsAndClearances(sb, playerId);
  for (const sig of vald.signals) {
    const quality = COMPENSATION_QUALITY[sig.compensation];
    if (!quality) continue;
    rows.push({
      quality, source: "vald", status: "confirmed", confidence: 0.9,
      severity: sig.severity === "marked" ? "severe" : "moderate",
      provenance: { en: `${sig.source} · ${sig.detail.en} · ${sig.ageDays}d`, is: `${sig.source} · ${sig.detail.is} · ${sig.ageDays}d` },
      evidenceGrade: "strong",
    });
  }
  for (const c of vald.clearances) {
    const quality = COMPENSATION_QUALITY[c.compensation];
    if (!quality) continue;
    clearances.push({ quality, source: "vald", provenance: { en: `${c.source} · ${c.detail.en}`, is: `${c.source} · ${c.detail.is}` } });
  }

  // 4. IMA / GPS → mechanical & directional deficits (decel mechanics, CoD
  //    asymmetry) — measured but contextual. The piece neither VALD nor the
  //    movement screen sees. Also emits clearances (measured & within norm).
  const imaTotals = await sumImaTotals(sb, playerId);
  if (imaTotals) {
    for (const r of imaDeficitsFromTotals(imaTotals)) rows.push(r);
    for (const c of imaClearancesFromTotals(imaTotals)) clearances.push(c);
  }

  // 4b. VBT → force-velocity gap (force- vs speed-deficit) — confirmed. Where on
  //     the F-V curve to train; the piece the screen and IMA can't see.
  for (const r of await loadVbtDeficitRows(sb, playerId)) rows.push(r);

  // 4b-ii. IMTP (VALD ForceDecks) → the PRIMARY max-strength driver: low relative
  //     peak force / DSI → force_deficit or velocity_deficit. Reconciles with VBT
  //     (agree → higher confidence; conflict → both surfaced). CMJ + IMTP are the
  //     strength drivers; VBT complements (and covers clubs without IMTP).
  for (const r of await loadImtpDeficitRows(sb, playerId)) rows.push(r);

  // 4c. Clinical assessment (King Initial Ax) → CONFIRMED deficits (clinician).
  for (const r of await loadClinicalAxDeficitRows(sb, playerId)) rows.push(r);

  // 4d. Active rehab track → CONFIRMED, MEDICAL deficits (clinician-owned; surface
  //     with the track as lever, excluded from the coach's auto-plan).
  for (const r of await loadRehabTrackDeficitRows(sb, playerId)) rows.push(r);

  // 5. Persisted rows: manual / clinical deficits + coach overrides.
  const overrides: DeficitOverride[] = [];
  const { data: persisted } = await sb
    .from("player_deficits")
    .select("quality, source, status, confidence, severity, side, evidence_grade, coach_override, source_detail, assessment_date, note")
    .eq("player_id", playerId);
  for (const p of (persisted ?? []) as Array<Record<string, unknown>>) {
    const quality = String(p.quality) as QualityKey;
    if (String(p.source) === "coach_override") {
      const action = String(p.coach_override ?? "");
      if (action === "dismiss" || action === "confirm") overrides.push({ quality, action, note: p.note ? String(p.note) : undefined });
      continue;
    }
    rows.push({
      quality,
      source: String(p.source) as DeficitSource,
      status: (String(p.status || "confirmed")) as DeficitStatus,
      confidence: typeof p.confidence === "number" ? p.confidence : 0.85,
      severity: (p.severity ? String(p.severity) : undefined) as Severity | undefined,
      side: (p.side ? String(p.side) : undefined) as Side | undefined,
      medical: String(p.source) === "clinical_ax" && String(p.severity) === "severe" ? false : undefined,
      provenance: { en: `${String(p.source).replace(/_/g, " ")} · ${String(p.source_detail ?? p.assessment_date ?? "")}`, is: `${String(p.source).replace(/_/g, " ")} · ${String(p.source_detail ?? p.assessment_date ?? "")}` },
      evidenceGrade: (p.evidence_grade ? String(p.evidence_grade) : undefined) as DeficitRow["evidenceGrade"],
    });
  }

  // 6. Load-monitor prehab flags (risk flags, not quality deficits).
  const prehabFlags = await loadPrehabFlags(sb, playerId);

  return { rows, overrides, prehabFlags, clearances };
}
