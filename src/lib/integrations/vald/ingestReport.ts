import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPayload } from "./idempotency";

/**
 * Feed coach-CONFIRMED, PDF-extracted VALD numbers into the canonical VALD
 * result tables so they power the same surfaces as API/CSV-synced data
 * (`ValdStatusCard`, the daily snapshot, injury-risk alerts).
 *
 * Provenance & non-collision (handoff thread #2):
 * - Each confirmed test gets a SYNTHETIC `vald_raw_tests` row with
 *   `source = 'pdf_report'` and a stable `ingestion_key`
 *   (`pdf_report:<reportId>:<index>`). The API/CSV sync uses its own
 *   ingestion keys (source 'api' / 'csv'), so the `(team_id, ingestion_key)`
 *   unique guarantees the two paths NEVER overwrite each other.
 * - Result rows hang off that synthetic `raw_test_id`; the per-table unique is
 *   `(raw_test_id, trial_number)`, so re-confirming the same report UPSERTS in
 *   place (idempotent) and can't duplicate or clash with synced rows.
 * - The daily snapshot reads results by `(team_id, microplayer_id, is_valid)`
 *   only — it does NOT filter on source — so PDF rows surface automatically.
 *
 * Coach confirmation is the trust gate: rows are written `is_valid = true`
 * only because a coach reviewed and confirmed the AI extraction.
 */

const PDF_SOURCE = "pdf_report";

type Metric = { label?: string; value?: number | string | null; unit?: string | null };
type ExtractedTest = {
  product?: string | null;
  test_type?: string | null;
  date?: string | null;
  metrics?: Metric[] | null;
  left_n?: number | null;
  right_n?: number | null;
  asymmetry_percent?: number | null;
  asymmetry_side?: string | null;
};
export type ExtractedReport = {
  athlete?: string | null;
  report_date?: string | null;
  body_weight_kg?: number | null;
  tests?: ExtractedTest[] | null;
} | null;

type CanonicalProduct = "forcedecks" | "nordbord" | "forceframe";

export type IngestReportResult = {
  written: number;
  skipped: number;
  byProduct: Record<CanonicalProduct, number>;
  notes: string[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,(?=\d{3}\b)/g, "").replace(/\s+/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeProduct(raw: string | null | undefined, testType: string | null | undefined): CanonicalProduct | null {
  const s = `${raw ?? ""} ${testType ?? ""}`.toLowerCase();
  if (s.includes("forcedeck") || s.includes("force deck") || /\bcmj\b|\bsj\b|abalakov|imtp|countermovement|squat jump|drop jump/.test(s)) return "forcedecks";
  if (s.includes("nord")) return "nordbord";
  if (s.includes("frame") || s.includes("adduction") || s.includes("abduction") || s.includes("groin") || s.includes("hip")) return "forceframe";
  return null;
}

/** Find the first metric whose label matches `pattern`, returning a number. */
function findMetric(metrics: Metric[] | null | undefined, pattern: RegExp): { value: number; unit: string | null } | null {
  for (const m of metrics ?? []) {
    if (!m?.label) continue;
    if (!pattern.test(m.label.toLowerCase())) continue;
    const v = toNumber(m.value);
    if (v == null) continue;
    return { value: v, unit: (m.unit ?? null) as string | null };
  }
  return null;
}

/** Jump height to cm. Reports give cm (e.g. 38) or m (e.g. 0.38) — coerce both. */
function jumpHeightCm(metrics: Metric[] | null | undefined): number | null {
  const hit = findMetric(metrics, /jump\s*height|\bheight\b/);
  if (!hit) return null;
  const unit = (hit.unit ?? "").toLowerCase();
  if (unit.includes("m") && !unit.includes("cm")) return hit.value * 100; // metres
  if (hit.value > 0 && hit.value < 3) return hit.value * 100; // unit-less but clearly metres
  return hit.value;
}

function testTimestamp(test: ExtractedTest, report: ExtractedReport, fallbackIso: string): string {
  const raw = test.date ?? report?.report_date ?? null;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00.000Z`;
  if (raw && !Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
  return fallbackIso;
}

function asymSide(side: string | null | undefined): string | null {
  const s = (side ?? "").trim().toUpperCase();
  return s === "L" || s === "R" ? s : null;
}

/**
 * Write one confirmed report's tests into the canonical VALD tables.
 * `sb` must be a service-role client. Returns a per-product summary for the UI.
 */
export async function ingestConfirmedReportToVald(
  sb: SupabaseClient,
  report: { id: string; player_id: string; team_id: string | null },
  extracted: ExtractedReport,
  nowIso: string,
): Promise<IngestReportResult> {
  const result: IngestReportResult = {
    written: 0,
    skipped: 0,
    byProduct: { forcedecks: 0, nordbord: 0, forceframe: 0 },
    notes: [],
  };

  const tests = extracted?.tests ?? [];
  if (!tests.length) {
    result.notes.push("No tests in the confirmed extraction.");
    return result;
  }

  // Resolve team_id (results tables require it NOT NULL). Fall back to the player's team.
  let teamId = report.team_id;
  if (!teamId) {
    const { data } = await sb.from("players").select("team_id").eq("id", report.player_id).maybeSingle();
    teamId = (data as { team_id?: string | null } | null)?.team_id ?? null;
  }
  if (!teamId) {
    result.notes.push("No team_id for this player — cannot write to VALD profile.");
    return result;
  }

  const valdAthleteId = `pdf:${report.player_id}`;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const product = normalizeProduct(test.product, test.test_type);
    if (!product) {
      result.skipped++;
      continue;
    }

    const ts = testTimestamp(test, extracted, nowIso);
    const asymmetryPercent = toNumber(test.asymmetry_percent);
    const leftN = toNumber(test.left_n);
    const rightN = toNumber(test.right_n);

    // Build the result row first so we can skip tests with no usable signal.
    let resultRow: Record<string, unknown> | null = null;
    if (product === "forcedecks") {
      const jh = jumpHeightCm(test.metrics);
      const peakPower = findMetric(test.metrics, /peak\s*power/)?.value ?? null;
      const relPower = findMetric(test.metrics, /relative.*power|power.*\/?\s*kg|w\/kg/)?.value ?? null;
      const rsi = findMetric(test.metrics, /\brsi/)?.value ?? null;
      const peakForce = findMetric(test.metrics, /peak\s*force/)?.value ?? null;
      const concImpulse = findMetric(test.metrics, /concentric\s*impulse/)?.value ?? null;
      if (jh == null && peakPower == null && peakForce == null && asymmetryPercent == null) {
        result.skipped++;
        continue;
      }
      resultRow = {
        test_type: test.test_type ?? "CMJ",
        jump_height_cm: jh,
        rsi_mod: rsi,
        peak_power_w: peakPower,
        relative_peak_power_w_kg: relPower,
        peak_force_n: peakForce,
        concentric_impulse_n_s: concImpulse,
        asymmetry_percent: asymmetryPercent,
        asymmetry_side: asymSide(test.asymmetry_side),
      };
    } else {
      // nordbord + forceframe share left/right peak force + asymmetry
      const left = leftN ?? findMetric(test.metrics, /left.*(peak\s*)?force/)?.value ?? null;
      const right = rightN ?? findMetric(test.metrics, /right.*(peak\s*)?force/)?.value ?? null;
      if (left == null && right == null && asymmetryPercent == null) {
        result.skipped++;
        continue;
      }
      resultRow = {
        test_type: test.test_type ?? null,
        left_peak_force_n: left,
        right_peak_force_n: right,
        asymmetry_percent: asymmetryPercent,
        asymmetry_side: asymSide(test.asymmetry_side),
        source: PDF_SOURCE,
      };
      if (product === "forceframe") {
        resultRow.movement_pattern = test.test_type ?? null;
        resultRow.body_region = null;
      }
    }

    // Synthetic raw test (provenance + FK anchor). Stable ingestion_key → upsert.
    const payload = { ...test, _source: PDF_SOURCE, _report_id: report.id, _test_index: i };
    const ingestionKey = `${PDF_SOURCE}:${report.id}:${i}`;
    const rawRow = {
      team_id: teamId,
      account_id: null,
      sync_run_id: null,
      vald_test_id: `pdf:${report.id}:${i}`,
      vald_athlete_id: valdAthleteId,
      product,
      test_type: test.test_type ?? null,
      test_timestamp: ts,
      source_updated_at: null,
      payload,
      payload_hash: hashPayload(payload),
      ingestion_key: ingestionKey,
      source: PDF_SOURCE,
    };

    const { data: rawUpserted, error: rawErr } = await sb
      .from("vald_raw_tests")
      .upsert(rawRow, { onConflict: "team_id,ingestion_key" })
      .select("id")
      .single();
    if (rawErr || !rawUpserted) {
      result.skipped++;
      result.notes.push(`Test ${i + 1}: raw write failed (${rawErr?.message ?? "no id"}).`);
      continue;
    }
    const rawTestId = (rawUpserted as { id: string }).id;

    const tableByProduct: Record<CanonicalProduct, string> = {
      forcedecks: "vald_forcedecks_results",
      nordbord: "vald_nordbord_results",
      forceframe: "vald_forceframe_results",
    };
    const { error: resErr } = await sb.from(tableByProduct[product]).upsert(
      {
        ...resultRow,
        team_id: teamId,
        microplayer_id: report.player_id,
        vald_athlete_id: valdAthleteId,
        raw_test_id: rawTestId,
        test_timestamp: ts,
        is_valid: true,
        trial_number: 1,
      },
      { onConflict: "raw_test_id,trial_number" },
    );
    if (resErr) {
      result.skipped++;
      result.notes.push(`Test ${i + 1}: ${product} write failed (${resErr.message}).`);
      continue;
    }

    result.written++;
    result.byProduct[product]++;
  }

  return result;
}
