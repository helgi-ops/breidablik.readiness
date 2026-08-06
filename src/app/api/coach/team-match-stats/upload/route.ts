export const runtime = "nodejs";

/**
 * /api/coach/team-match-stats/upload  (Wyscout Team → Stats in-app import)
 *
 * Lets a coach load Team Match Insight data WITHOUT terminal access — the same job
 * the scripts/ingest-team-match-stats.ts CLI does, behind an upload UI.
 *
 * multipart/form-data:
 *   phase = "preview" → parse the file(s), report what WOULD be written (fixtures,
 *                       dates, PPDA/def-duels coverage, dates missing from the
 *                       fixture list). NO writes.
 *   phase = "commit"  → idempotently upsert team_match_stats on
 *                       (team_id, match_date, is_opponent).
 * Files:  general (required, DISPLAY General + "Show opponents"), indexes (optional,
 *         DISPLAY Indexes → PPDA), defending (optional, DISPLAY Defending → def-duels).
 *
 * Descriptive football context only — never touches the readiness colour. Writes
 * are service-role but strictly scoped to the coach's own (or coach_teams) team.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildTeamMatchStatRows, selectWyscoutMatrices } from "@/lib/micropulse/statsIngestion/buildTeamMatchRows";

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach not linked to a team", status: 400 } as const;
  if (!targetTeamId || targetTeamId === primaryTeamId) return { userId, teamId: primaryTeamId } as const;
  const { data: coachRow } = await supabase
    .from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", targetTeamId).maybeSingle();
  if (!coachRow) return { error: "No access to that team", status: 403 } as const;
  return { userId, teamId: targetTeamId } as const;
}

async function matrixOf(v: FormDataEntryValue | null): Promise<unknown[][] | null> {
  if (!(v instanceof File) || v.size === 0) return null;
  const wb = XLSX.read(new Uint8Array(await v.arrayBuffer()), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }

  const phase = String(form.get("phase") ?? "preview");
  const teamName = (String(form.get("team_name") ?? "").trim()) || "Breiðablik";
  const requestedTeamId = (String(form.get("team_id") ?? "").trim()) || null;

  const authRes = await getCoachTeam(req, requestedTeamId);
  if ("error" in authRes) return NextResponse.json({ ok: false, error: authRes.error }, { status: authRes.status });
  const teamId = authRes.teamId;

  // Accept a single multi-file picker ("files") — the coach drops 1–3 Wyscout
  // exports in any order (or one all-columns file) and we auto-detect which supplies
  // General / PPDA / defensive-duels. Legacy named slots still work as a fallback.
  const uploaded = [
    ...form.getAll("files"),
    form.get("general"), form.get("indexes"), form.get("defending"),
  ];
  const matrices: unknown[][][] = [];
  for (const f of uploaded) { const m = await matrixOf(f); if (m) matrices.push(m); }
  if (matrices.length === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });

  const picked = selectWyscoutMatrices(matrices, teamName);
  if (!picked.general) {
    const recognised: string[] = [];
    if (picked.indexes) recognised.push("Indexes (PPDA)");
    if (picked.defending) recognised.push("Defending (defensive duels)");
    const tail = recognised.length
      ? ` You uploaded ${recognised.join(" + ")}, but still need the General export — add it and try again.`
      : "";
    return NextResponse.json({
      ok: false,
      error: `The General export is required — the one with goals + xG + possession (DISPLAY “General”, “Show opponents” ON).${tail}`,
    }, { status: 400 });
  }

  const built = buildTeamMatchStatRows({
    generalMatrix: picked.general,
    indexesMatrix: picked.indexes,
    defendingMatrix: picked.defending,
    teamId,
    teamName,
  });

  if (built.dbRows.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No matches parsed. Make sure this is the Team → Stats 'General' export with 'Show opponents' ON.",
      skipped: built.skipped,
    }, { status: 400 });
  }

  const supabase = getSupabase();

  // Which parsed dates aren't in match_schedule (they store fine but won't join to
  // GPS/IMA movement until a fixture exists for them).
  const { data: sched } = await supabase
    .from("match_schedule").select("match_date").eq("team_id", teamId).in("match_date", built.dates);
  const schedSet = new Set(((sched ?? []) as { match_date: string }[]).map((s) => s.match_date));
  const unjoined = built.dates.filter((d) => !schedSet.has(d));

  const summary = {
    fixtures: built.fixtures,
    rows: built.dbRows.length,
    dates: built.dates.length,
    seasons: Array.from(new Set(built.dates.map((d) => d.slice(0, 4)))).sort(),
    ppda: { provided: built.aux.ppdaProvided, matched: built.aux.ppdaMatched, hits: built.ppdaHits, orphans: built.ppdaOrphans },
    defDuels: { provided: built.aux.defProvided, matched: built.aux.defMatched, hits: built.defDuelsHits, orphans: built.defDuelsOrphans },
    unmappedHeaders: built.unmappedHeaders,
    unjoined,
  };

  if (phase === "preview") {
    return NextResponse.json({ ok: true, phase: "preview", teamId, ...summary });
  }

  const { error } = await supabase
    .from("team_match_stats").upsert(built.dbRows, { onConflict: "team_id,match_date,is_opponent" });
  if (error) return NextResponse.json({ ok: false, error: `Save failed: ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, phase: "commit", teamId, upserted: built.dbRows.length, ...summary });
}
