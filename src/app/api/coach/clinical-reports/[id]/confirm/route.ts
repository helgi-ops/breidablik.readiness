/**
 * Human confirmation step. Takes the coach/medical-reviewed extraction and files
 * it into the player's data: injury history -> injury_events, clinical findings /
 * prevention targets / return-to-play -> player_risk_flags, each stamped with the
 * source report. Nothing here runs without an explicit human POST — this IS the
 * human-in-the-loop gate. Requires the report to be linked to a player.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateExtractedReport } from "@/lib/clinical/extractReport";

export const runtime = "nodejs";

async function requireReport(req: NextRequest, id: string) {
  const sb: SupabaseClient = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const { data: report } = await sb.from("clinical_reports").select("id, team_id, player_id, report_date").eq("id", id).maybeSingle();
  const r = report as { id: string; team_id: string; player_id: string | null; report_date: string | null } | null;
  if (!r) return { error: "Report not found", status: 404 } as const;
  if (role !== "ADMIN" && p.team_id !== r.team_id) {
    const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", uid).eq("team_id", r.team_id).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, uid, report: r } as const;
}

const ACTIVE_RE = /ongoing|chronic|viðvarandi|langvinn|einkenn|áfram/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireReport(req, id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, uid, report } = a;

  const body = (await req.json().catch(() => ({}))) as { extracted?: unknown; player_id?: string | null };
  if (body.extracted == null) return NextResponse.json({ error: "extracted (the reviewed data) required" }, { status: 400 });
  const extracted = validateExtractedReport(body.extracted); // coerce the human-edited payload

  const playerId = (body.player_id ?? report.player_id) || null;
  if (!playerId) return NextResponse.json({ error: "Link the report to a player before confirming" }, { status: 400 });
  // The player must be on the report's team.
  const { data: pl } = await sb.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  const prow = pl as { id?: string; team_id?: string | null } | null;
  if (!prow?.id || (prow.team_id && prow.team_id !== report.team_id)) {
    return NextResponse.json({ error: "Player not found on this team" }, { status: 400 });
  }

  // Reconfirm should not duplicate — clear any previously-committed rows from this report.
  await sb.from("injury_events").delete().eq("source_clinical_report_id", id);
  await sb.from("player_risk_flags").delete().eq("source_report_id", id);

  const injuryRows = extracted.injury_history.map((h) => ({
    player_id: playerId,
    team_id: report.team_id,
    injury_date: report.report_date ?? extracted.report_date ?? null,
    injury_type: h.type ?? h.body_part,
    body_side: h.side,
    is_active: ACTIVE_RE.test(`${h.status ?? ""} ${h.type ?? ""}`),
    notes: [h.body_part, h.approx_duration, h.status].filter(Boolean).join(" · "),
    source_clinical_report_id: id,
    recorded_by: uid,
  }));
  if (injuryRows.length) {
    const { error } = await sb.from("injury_events").insert(injuryRows);
    if (error) return NextResponse.json({ error: `injury_events: ${error.message}` }, { status: 500 });
  }

  const flagRows: Array<Record<string, unknown>> = [];
  for (const f of extracted.clinical_findings) {
    flagRows.push({ player_id: playerId, team_id: report.team_id, flag: [f.finding, f.location].filter(Boolean).join(" — "), side: f.side, category: "clinical_finding", source_report_id: id });
  }
  for (const t of extracted.prevention_targets) {
    flagRows.push({ player_id: playerId, team_id: report.team_id, flag: t, side: null, category: "prevention_target", source_report_id: id });
  }
  if (extracted.return_to_play?.status) {
    flagRows.push({ player_id: playerId, team_id: report.team_id, flag: extracted.return_to_play.status, side: null, category: "return_to_play", source_report_id: id });
  }
  if (flagRows.length) {
    const { error } = await sb.from("player_risk_flags").insert(flagRows);
    if (error) return NextResponse.json({ error: `player_risk_flags: ${error.message}` }, { status: 500 });
  }

  const { error: updErr } = await sb.from("clinical_reports").update({
    extracted_json: extracted,
    player_id: playerId,
    status: "confirmed",
    confirmed_by: uid,
    confirmed_at: new Date().toISOString(),
  }).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: "confirmed", injuries: injuryRows.length, flags: flagRows.length });
}
