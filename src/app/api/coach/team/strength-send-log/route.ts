/**
 * GET /api/coach/team/strength-send-log
 *
 * What the 09:00 automatic strength send did for the coach's team (2026-11-18, review item C): today's summary
 * plus the last 7 days, with the names of players who were skipped or failed. Read-only; reads only the coach's
 * own team (profiles.team_id). Descriptive only: never the readiness colour.
 * Auth: coach token only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { summarizeSendLog, type SendLogRow } from "@/lib/micropulse/strengthProgramming/sendLog";

export const runtime = "nodejs";

async function getCoachAuth(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId } as const;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Iceland is on UTC all year: the ISO date is the local date.
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -6);
  const [{ data: team }, { data: logRows, error }] = await Promise.all([
    supabase.from("teams").select("strength_auto_send").eq("id", auth.teamId).maybeSingle(),
    supabase
      .from("strength_send_log")
      .select("team_id, send_date, subject_key, player_id, status, reason, readiness_level, rebuilt_at, created_at")
      .eq("team_id", auth.teamId)
      .gte("send_date", from)
      .lte("send_date", today)
      .order("send_date", { ascending: false })
      .limit(1000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (logRows ?? []) as SendLogRow[];

  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const days = dates.map((d) => summarizeSendLog(rows, d));

  const ids = Array.from(new Set(days.flatMap((d) => d.people.map((p) => p.playerId))));
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: players } = await supabase.from("players").select("id, full_name").eq("team_id", auth.teamId).in("id", ids);
    for (const p of (players ?? []) as Array<{ id: string; full_name: string | null }>) names[p.id] = p.full_name ?? "";
  }

  return NextResponse.json({
    ok: true,
    autoSend: !!(team as { strength_auto_send?: boolean } | null)?.strength_auto_send,
    today,
    days,
    names,
  });
}
