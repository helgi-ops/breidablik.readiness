/**
 * POST /api/coach/integrations/vald-upload
 *
 * Two-phase CSV ingest for VALD Hub "Test Metrics" exports — NordBord and
 * ForceFrame. The VALD external API only covers ForceDecks for this tenant,
 * so these two products are uploaded by CSV instead.
 *
 *   phase: "preview"  → parse, return columns + athlete resolution, no writes
 *   phase: "commit"   → upsert rows into vald_nordbord_results /
 *                       vald_forceframe_results with source = 'csv'
 *
 * Athletes are resolved by fuzzy-matching the CSV "Profile" name against the
 * team roster (players.full_name). The coach confirms / overrides in the
 * upload wizard; no opaque athlete IDs to cache because VALD CSV exports
 * carry readable names.
 */
import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseValdCsv, type ValdCsvFieldKey, type ValdCsvProduct } from "@/lib/integrations/vald-csv/parser";
import { computeAsymmetry } from "@/lib/integrations/vald/normalizers";

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

/** Token-overlap name similarity (same heuristic as the Catapult wizard). */
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

/** Deterministic UUID (v5-style) so re-uploading the same CSV upserts rather
 *  than duplicating. Namespaced away from real VALD raw_test_id values. */
function deterministicUuid(key: string): string {
  const h = createHash("sha1").update(`micropulse:vald-csv:${key}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

type PlayerRow = { id: string; full_name: string | null };

type PreviewBody = {
  phase: "preview";
  csv: string;
  product?: ValdCsvProduct;
  columnOverrides?: Record<string, ValdCsvFieldKey>;
};

type CommitBody = {
  phase: "commit";
  csv: string;
  product?: ValdCsvProduct;
  columnOverrides?: Record<string, ValdCsvFieldKey>;
  /** profileName (lower-cased) → player_id, set by the coach in the wizard */
  athleteMap: Record<string, string>;
};

export async function POST(req: Request) {
  try {
    const auth = await requireCoach(req);
    const body = (await req.json()) as PreviewBody | CommitBody;

    if (!body.csv || typeof body.csv !== "string") {
      return NextResponse.json({ ok: false, error: "CSV missing." }, { status: 400 });
    }

    const overrides = body.columnOverrides
      ? new Map<string, ValdCsvFieldKey>(Object.entries(body.columnOverrides))
      : undefined;
    const parsed = parseValdCsv(body.csv, { product: body.product, overrides });

    const sb = getAdminClient();

    // Roster for athlete resolution.
    const { data: roster } = await sb
      .from("players")
      .select("id, full_name")
      .eq("team_id", auth.teamId);
    const players = ((roster ?? []) as PlayerRow[]).filter((p) => p.id);

    // Distinct profile names in the CSV.
    const profileNames = Array.from(
      new Set(parsed.rows.map((r) => r.profileName).filter((n): n is string => !!n)),
    );

    // Auto-resolve each profile name against the roster.
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

    const dates = Array.from(new Set(parsed.rows.map((r) => r.testDate).filter(Boolean))).sort();
    const dateRange = dates.length
      ? { start: dates[0]!, end: dates[dates.length - 1]!, days: dates.length }
      : null;

    if (body.phase === "preview") {
      return NextResponse.json({
        ok: true,
        phase: "preview",
        product: parsed.product,
        delimiter: parsed.delimiter,
        headerCells: parsed.headerCells,
        matchedColumns: Array.from(parsed.matched.entries()).map(([idx, key]) => ({
          index: idx, header: parsed.headerCells[idx] ?? null, key,
        })),
        unmatchedColumns: Array.from(parsed.unmatched.entries()).map(([idx, h]) => ({ index: idx, header: h })),
        rowCount: parsed.rows.length,
        dateRange,
        athletes: resolution.map((r) => ({
          profileName: r.profileName,
          playerId: r.playerId,
          resolvedFrom: r.resolvedFrom,
        })),
        roster: players.map((p) => ({ id: p.id, name: p.full_name ?? "—" })),
      });
    }

    // ── COMMIT ──────────────────────────────────────────────────────────────
    const playerByName = new Map<string, string>();
    for (const r of resolution) {
      if (r.playerId) playerByName.set(r.profileName.toLowerCase(), r.playerId);
    }

    const product = parsed.product;
    const nordbordRows: Record<string, unknown>[] = [];
    const forceframeRows: Record<string, unknown>[] = [];
    let skippedNoPlayer = 0;
    let skippedNoDate = 0;

    for (const row of parsed.rows) {
      const playerId = row.profileName ? playerByName.get(row.profileName.toLowerCase()) : undefined;
      if (!playerId) { skippedNoPlayer += 1; continue; }
      if (!row.testDate) { skippedNoDate += 1; continue; }

      // Date-only CSV → anchor the timestamp at noon UTC.
      const testTimestamp = `${row.testDate}T12:00:00.000Z`;
      const vald_athlete_id = `csv:${row.profileName!.toLowerCase().replace(/\s+/g, "-")}`;
      const keyStr = [
        auth.teamId, product, vald_athlete_id, row.testDate,
        row.testType ?? "", row.movementPattern ?? "",
      ].join("|");
      const raw_test_id = deterministicUuid(keyStr);

      if (product === "nordbord") {
        const asym = computeAsymmetry({
          left: row.leftPeakForce,
          right: row.rightPeakForce,
          trustedPercent: row.asymmetryPercent,
          trustedSide: row.asymmetrySide,
        });
        nordbordRows.push({
          team_id: auth.teamId,
          microplayer_id: playerId,
          vald_athlete_id,
          raw_test_id,
          test_timestamp: testTimestamp,
          test_type: row.testType,
          left_peak_force_n: row.leftPeakForce,
          right_peak_force_n: row.rightPeakForce,
          left_avg_force_n: row.leftAvgForce,
          right_avg_force_n: row.rightAvgForce,
          asymmetry_percent: asym.percent,
          asymmetry_side: asym.side,
          is_valid: row.leftPeakForce != null || row.rightPeakForce != null,
          trial_number: 1,
          source: "csv",
        });
      } else {
        const asym = computeAsymmetry({
          left: row.leftPeakForce,
          right: row.rightPeakForce,
          trustedPercent: row.asymmetryPercent,
          trustedSide: row.asymmetrySide,
        });
        forceframeRows.push({
          team_id: auth.teamId,
          microplayer_id: playerId,
          vald_athlete_id,
          raw_test_id,
          test_timestamp: testTimestamp,
          test_type: row.testType,
          body_region: row.bodyRegion,
          movement_pattern: row.movementPattern,
          left_peak_force_n: row.leftPeakForce,
          right_peak_force_n: row.rightPeakForce,
          left_relative_force: row.leftRelativeForce,
          right_relative_force: row.rightRelativeForce,
          asymmetry_percent: asym.percent,
          asymmetry_side: asym.side,
          is_valid: row.leftPeakForce != null || row.rightPeakForce != null,
          trial_number: 1,
          source: "csv",
        });
      }
    }

    let committed = 0;
    if (nordbordRows.length > 0) {
      const { error } = await sb
        .from("vald_nordbord_results")
        .upsert(nordbordRows as never, { onConflict: "raw_test_id" });
      if (error) return NextResponse.json({ ok: false, error: `NordBord upsert: ${error.message}` }, { status: 500 });
      committed += nordbordRows.length;
    }
    if (forceframeRows.length > 0) {
      const { error } = await sb
        .from("vald_forceframe_results")
        .upsert(forceframeRows as never, { onConflict: "raw_test_id" });
      if (error) return NextResponse.json({ ok: false, error: `ForceFrame upsert: ${error.message}` }, { status: 500 });
      committed += forceframeRows.length;
    }

    return NextResponse.json({
      ok: true,
      phase: "commit",
      product,
      rowsCommitted: committed,
      skippedNoPlayer,
      skippedNoDate,
      athletesResolved: resolution.filter((r) => r.playerId).length,
      athletesUnresolved: resolution.filter((r) => !r.playerId).length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "VALD upload failed.";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
