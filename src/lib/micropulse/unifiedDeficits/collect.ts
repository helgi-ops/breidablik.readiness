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
import { compensationsForReadings } from "../movementScreen/correctives/mapping";
import { buildDeficitLedger, type FiredObservation } from "../movementScreen/deficitLedger";
import { loadValdCorrectiveSignals } from "../movementScreen/correctives/valdSignals";
import { loadImaDeficitRows } from "./imaSignals";
import { COMPENSATION_QUALITY, DEFICIT_QUALITY, type QualityKey } from "./quality";
import type { DeficitRow, DeficitOverride, DeficitSource, DeficitStatus, Severity, Side } from "./reconcile";

const SCREEN_LOOKBACK_DAYS = 56;
const sideOf = (sides: Array<"L" | "R" | "both">): Side => (sides.includes("L") && sides.includes("R") ? "both" : (sides.find((s) => s !== "both") ?? "both"));

export async function collectDeficits(sb: SupabaseClient, playerId: string): Promise<{ rows: DeficitRow[]; overrides: DeficitOverride[] }> {
  const rows: DeficitRow[] = [];

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

  // 3. VALD force data → confirmed (instrumented).
  for (const sig of await loadValdCorrectiveSignals(sb, playerId)) {
    const quality = COMPENSATION_QUALITY[sig.compensation];
    if (!quality) continue;
    rows.push({
      quality, source: "vald", status: "confirmed", confidence: 0.9,
      severity: sig.severity === "marked" ? "severe" : "moderate",
      provenance: { en: `${sig.source} · ${sig.detail.en} · ${sig.ageDays}d`, is: `${sig.source} · ${sig.detail.is} · ${sig.ageDays}d` },
      evidenceGrade: "strong",
    });
  }

  // 4. IMA / GPS → mechanical & directional deficits (decel mechanics, CoD
  //    asymmetry) — measured but contextual. The piece neither VALD nor the
  //    movement screen sees.
  for (const r of await loadImaDeficitRows(sb, playerId)) rows.push(r);

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

  return { rows, overrides };
}
