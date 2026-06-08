/**
 * /api/trainer/client/[id]/progress-report
 *
 * One consolidated 4-week progress snapshot for a PT client — adherence,
 * readiness trend, internal-load (ACWR), strength PRs and volume — for the
 * sendable client progress report PDF. Reuses the same compute engines as the
 * client/trainer cards (one source, one truth).
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { computePersonalRecords } from "@/lib/client/personalRecords";
import { computeVolumeLoad } from "@/lib/client/volumeLoad";
import { computeTrainingLoad } from "@/lib/client/trainingLoad";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function isoDaysAgo(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

async function requireTrainerForClient(req: Request, clientId: string) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;
  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    const { data: clientRow } = await sb.from("players").select("team_id, full_name").eq("id", clientId).maybeSingle();
    if (!clientRow) return { error: "Client not found", status: 404 } as const;
    const clientTeamId = (clientRow as { team_id?: string | null }).team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;
    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", clientTeamId).maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const sb = a.sb;

  const WEEKS = 4;
  const start = isoDaysAgo(WEEKS * 7 - 1);
  const end = isoDaysAgo(0);

  const { data: player } = await sb.from("players").select("full_name, position").eq("id", clientId).maybeSingle();
  const clientName = ((player as { full_name?: string | null } | null)?.full_name ?? "—").trim();

  // ── Adherence (individual_training_log over the period) ──
  const { data: logs } = await sb
    .from("individual_training_log")
    .select("completed, skipped, log_date")
    .eq("player_id", clientId)
    .gte("log_date", start)
    .lte("log_date", end);
  const logRows = (logs ?? []) as Array<{ completed: boolean | null; skipped: boolean | null }>;
  const completed = logRows.filter((r) => r.completed).length;
  const skipped = logRows.filter((r) => r.skipped).length;
  const totalLogged = completed + skipped;
  const adherence = { completed, skipped, total: totalLogged, pct: totalLogged > 0 ? Math.round((completed / totalLogged) * 100) : null };

  // ── Readiness trend (readiness_entries over the period) ──
  const { data: rd } = await sb
    .from("readiness_entries")
    .select("entry_date, total_score, color")
    .eq("player_id", clientId)
    .gte("entry_date", start)
    .lte("entry_date", end)
    .order("entry_date", { ascending: true });
  const rdRows = (rd ?? []) as Array<{ entry_date: string; total_score: number | null; color: string | null }>;
  const scores = rdRows.map((r) => r.total_score).filter((s): s is number => typeof s === "number");
  const col = (c: string | null) => String(c ?? "").toUpperCase();
  const readiness = {
    checkIns: rdRows.length,
    avgScore: scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null,
    green: rdRows.filter((r) => col(r.color) === "GREEN").length,
    yellow: rdRows.filter((r) => col(r.color) === "YELLOW").length,
    red: rdRows.filter((r) => col(r.color) === "RED").length,
    series: rdRows.map((r) => ({ date: r.entry_date, score: r.total_score, color: col(r.color) })),
  };

  // ── Strength PRs, volume and internal load (existing engines) ──
  const [prs, volume, training] = await Promise.all([
    computePersonalRecords(sb, clientId),
    computeVolumeLoad(sb, clientId),
    computeTrainingLoad(sb, clientId),
  ]);

  return NextResponse.json({
    ok: true,
    client: { id: clientId, name: clientName },
    period: { start, end, weeks: WEEKS },
    adherence,
    readiness,
    strength: prs,
    volume,
    training,
    generatedAt: new Date().toISOString(),
  });
}
