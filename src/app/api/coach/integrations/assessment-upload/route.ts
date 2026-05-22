/**
 * POST /api/coach/integrations/assessment-upload
 *
 * Two-phase CSV ingest for the Physical Assessment Battery — the periodic
 * (≈6-monthly) strength + physical test the afrekshópur goes through at
 * Háskólinn í Reykjavík. Covers the non-VALD measurements (sprint/jump +
 * anthropometrics); VALD force tests keep flowing through the vald_* tables.
 *
 *   phase: "preview"  → parse, resolve athletes, return columns. No writes.
 *   phase: "commit"   → upsert physical_assessments + physical_assessment_metrics.
 *
 * Athletes are resolved by fuzzy-matching the CSV name against the roster
 * (players.full_name); the coach confirms / overrides in the wizard.
 *
 * One physical_assessments row is the "test event" — one per player per
 * date. age_years_at_assessment is snapshotted from players.date_of_birth so
 * youth age-band interpretation stays correct across multiple assessments.
 */
import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  parsePhysicalAssessmentCsv,
  type AssessmentFieldKey,
} from "@/lib/integrations/physical-assessment/parser";
import { ASSESSMENT_METRIC_CATALOG } from "@/lib/integrations/physical-assessment/metricCatalog";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type CoachContext = { teamId: string; userId: string };

async function requireCoach(req: Request): Promise<CoachContext> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  const teamId = String((prof as { team_id?: string } | null)?.team_id ?? "");
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!teamId) throw new Error("No team context");
  return { teamId, userId: userRes.user.id };
}

/** Token-overlap name similarity (same heuristic as the VALD / Catapult wizards). */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 1;
  const sTokens = new Set(s.split(/\s+/).filter(Boolean));
  const tTokens = new Set(t.split(/\s+/).filter(Boolean));
  let shared = 0;
  for (const tok of sTokens) if (tTokens.has(tok)) shared++;
  return shared / Math.max(sTokens.size, tTokens.size, 1);
}

/** Deterministic UUID (v5-style) so re-uploading the same assessment upserts
 *  rather than duplicating. */
function deterministicUuid(key: string): string {
  const h = createHash("sha1").update(`micropulse:phys-assessment:${key}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Player age in years on a given date, from date_of_birth. */
function ageYears(dob: string | null | undefined, onDate: string): number | null {
  if (!dob) return null;
  const d0 = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  const d1 = new Date(`${onDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return null;
  const years = (d1.getTime() - d0.getTime()) / (365.2425 * 24 * 3600 * 1000);
  return years > 0 && years < 120 ? Math.round(years * 10) / 10 : null;
}

type PlayerRow = { id: string; full_name: string | null; date_of_birth: string | null };

type PreviewBody = {
  phase: "preview";
  csv: string;
  columnOverrides?: Record<string, AssessmentFieldKey>;
};

type CommitBody = {
  phase: "commit";
  csv: string;
  columnOverrides?: Record<string, AssessmentFieldKey>;
  /** profileName (lower-cased) → player_id, set by the coach in the wizard */
  athleteMap: Record<string, string>;
  /** Fallback date when the CSV carries no per-row date. ISO YYYY-MM-DD. */
  assessmentDate?: string;
  testerSource?: string;
  notes?: string;
};

export async function POST(req: Request) {
  try {
    const auth = await requireCoach(req);
    const body = (await req.json()) as PreviewBody | CommitBody;

    if (!body.csv || typeof body.csv !== "string") {
      return NextResponse.json({ ok: false, error: "CSV missing." }, { status: 400 });
    }

    const overrides = body.columnOverrides
      ? new Map<string, AssessmentFieldKey>(Object.entries(body.columnOverrides))
      : undefined;
    const parsed = parsePhysicalAssessmentCsv(body.csv, { overrides });

    const sb = getAdminClient();

    // Roster for athlete resolution + age computation.
    const { data: roster } = await sb
      .from("players")
      .select("id, full_name, date_of_birth")
      .eq("team_id", auth.teamId);
    const players = ((roster ?? []) as PlayerRow[]).filter((p) => p.id);
    const playerById = new Map(players.map((p) => [p.id, p]));

    // Distinct profile names in the CSV.
    const profileNames = Array.from(
      new Set(parsed.rows.map((r) => r.profileName).filter((n): n is string => !!n)),
    );

    const manualMap = body.phase === "commit" ? body.athleteMap ?? {} : {};
    const resolution = profileNames.map((name) => {
      const manual = manualMap[name.toLowerCase()];
      if (manual) return { profileName: name, playerId: manual, resolvedFrom: "manual" as const };
      let best: { id: string; score: number } | null = null;
      for (const p of players) {
        const s = similarity(name, p.full_name ?? "");
        if (s >= 0.5 && (!best || s > best.score)) best = { id: p.id, score: s };
      }
      return {
        profileName: name,
        playerId: best?.id ?? null,
        resolvedFrom: best ? ("auto" as const) : (null as null),
      };
    });

    const dates = Array.from(new Set(parsed.rows.map((r) => r.assessmentDate).filter(Boolean))).sort();
    const dateRange = dates.length
      ? { start: dates[0]!, end: dates[dates.length - 1]!, days: dates.length }
      : null;

    if (body.phase === "preview") {
      return NextResponse.json({
        ok: true,
        phase: "preview",
        delimiter: parsed.delimiter,
        headerCells: parsed.headerCells,
        matchedColumns: parsed.matched,
        unmatchedColumns: parsed.unmatched,
        rowCount: parsed.rows.length,
        dateRange,
        hasAnyDate: dates.length > 0,
        athletes: resolution.map((r) => ({
          profileName: r.profileName,
          playerId: r.playerId,
          resolvedFrom: r.resolvedFrom,
        })),
        roster: players.map((p) => ({ id: p.id, name: p.full_name ?? "—" })),
        // Catalog for the wizard's manual column-mapping dropdown.
        metricCatalog: ASSESSMENT_METRIC_CATALOG.map((d) => ({
          code: d.code, nameEN: d.nameEN, category: d.category, unit: d.unit,
        })),
      });
    }

    // ── COMMIT ──────────────────────────────────────────────────────────────
    const playerByName = new Map<string, string>();
    for (const r of resolution) {
      if (r.playerId) playerByName.set(r.profileName.toLowerCase(), r.playerId);
    }

    const fallbackDate = typeof body.assessmentDate === "string" && body.assessmentDate
      ? body.assessmentDate.slice(0, 10)
      : null;
    const testerSource = typeof body.testerSource === "string" && body.testerSource.trim()
      ? body.testerSource.trim()
      : null;
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    type AssessmentRow = Record<string, unknown>;
    type MetricRow = Record<string, unknown>;
    const assessmentRows: AssessmentRow[] = [];
    const metricRows: MetricRow[] = [];
    const assessmentIds = new Set<string>();
    let skippedNoPlayer = 0;
    let skippedNoDate = 0;
    let skippedNoMetrics = 0;

    for (const row of parsed.rows) {
      const playerId = row.profileName ? playerByName.get(row.profileName.toLowerCase()) : undefined;
      if (!playerId) { skippedNoPlayer += 1; continue; }
      const date = row.assessmentDate ?? fallbackDate;
      if (!date) { skippedNoDate += 1; continue; }
      if (row.metrics.length === 0) { skippedNoMetrics += 1; continue; }

      const assessmentId = deterministicUuid(`${auth.teamId}|${playerId}|${date}`);
      assessmentIds.add(assessmentId);

      const dob = playerById.get(playerId)?.date_of_birth ?? null;
      assessmentRows.push({
        id: assessmentId,
        team_id: auth.teamId,
        player_id: playerId,
        assessment_date: date,
        tester_source: testerSource,
        age_years_at_assessment: ageYears(dob, date),
        notes,
        source: "csv",
        created_by: auth.userId,
      });

      for (const m of row.metrics) {
        metricRows.push({
          assessment_id: assessmentId,
          metric_code: m.code,
          metric_category: m.category,
          value: m.value,
          unit: m.unit,
          side: "bilateral",
          raw_label: m.rawLabel,
        });
      }
    }

    // Upsert the assessment events first (metrics FK onto them).
    if (assessmentRows.length > 0) {
      const { error } = await sb
        .from("physical_assessments")
        .upsert(assessmentRows as never, { onConflict: "id" });
      if (error) {
        return NextResponse.json({ ok: false, error: `Assessment upsert: ${error.message}` }, { status: 500 });
      }
    }

    // Replace metrics for the committed assessments so a re-upload is clean
    // (a removed column should not leave a stale metric row behind).
    if (assessmentIds.size > 0) {
      const { error: delErr } = await sb
        .from("physical_assessment_metrics")
        .delete()
        .in("assessment_id", Array.from(assessmentIds));
      if (delErr) {
        return NextResponse.json({ ok: false, error: `Metric cleanup: ${delErr.message}` }, { status: 500 });
      }
    }

    let metricsCommitted = 0;
    if (metricRows.length > 0) {
      const { error } = await sb
        .from("physical_assessment_metrics")
        .insert(metricRows as never);
      if (error) {
        return NextResponse.json({ ok: false, error: `Metric insert: ${error.message}` }, { status: 500 });
      }
      metricsCommitted = metricRows.length;
    }

    return NextResponse.json({
      ok: true,
      phase: "commit",
      assessmentsCommitted: assessmentRows.length,
      metricsCommitted,
      skippedNoPlayer,
      skippedNoDate,
      skippedNoMetrics,
      athletesResolved: resolution.filter((r) => r.playerId).length,
      athletesUnresolved: resolution.filter((r) => !r.playerId).length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Assessment upload failed.";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
