/**
 * GET / POST /api/coach/team/no-match-week (2026-11-18, review item E)
 *
 * GET ?from=YYYY-MM-DD&days=N — what the weekday-plan check needs for the coach's team: the team's send mode, the
 * stored weekday plan (with one-week moves), each day's Week setup type (week_plans) and the match dates around the
 * range (match_schedule + GAME days, 4 days back / 5 ahead, the engine's "no match" window). The check itself is
 * pure (noMatchCheck.ts) so it can run on the coach's unsaved plan.
 *
 * POST { weekStart, days } — set that week's moves (weekday → kind), for that week only; { weekStart, clear: true }
 * removes them. The weekday plan and its `since` stay as they are. Coach token only; the coach's own team.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { normalizeSendMode } from "@/lib/micropulse/strengthProgramming/sendMode";
import { pruneWeekMoves, sanitizeNoMatchWeek, sanitizeWeekMoves, weekdayOf } from "@/lib/micropulse/strengthProgramming/structures";

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
  return { teamId, userId: userRes.user.id } as const;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !!weekdayOf(v);

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = isIso(url.searchParams.get("from")) ? (url.searchParams.get("from") as string) : today;
  const n = Math.min(42, Math.max(1, Number(url.searchParams.get("days")) || 28));
  const to = addDays(from, n - 1);

  const [team, pal, plans, games] = await Promise.all([
    supabase.from("teams").select("strength_send_mode").eq("id", auth.teamId).maybeSingle(),
    supabase.from("team_strength_palette").select("no_match_week").eq("team_id", auth.teamId).maybeSingle(),
    supabase.from("week_plans").select("day_date, day_type").eq("team_id", auth.teamId).gte("day_date", addDays(from, -4)).lte("day_date", addDays(to, 5)),
    supabase.from("match_schedule").select("match_date").eq("team_id", auth.teamId).gte("match_date", addDays(from, -4)).lte("match_date", addDays(to, 5)),
  ]);
  if (plans.error) return NextResponse.json({ error: plans.error.message }, { status: 500 });

  const planRows = (plans.data ?? []) as Array<{ day_date: string; day_type: string | null }>;
  const gameDates = new Set(((games.data ?? []) as Array<{ match_date: string }>).map((r) => String(r.match_date).slice(0, 10)));
  for (const r of planRows) if (String(r.day_type ?? "").toUpperCase() === "GAME") gameDates.add(r.day_date);

  return NextResponse.json({
    ok: true,
    mode: normalizeSendMode((team.data as { strength_send_mode?: string | null } | null)?.strength_send_mode),
    plan: sanitizeNoMatchWeek((pal.data as { no_match_week?: unknown } | null)?.no_match_week),
    days: planRows.filter((r) => r.day_date >= from && r.day_date <= to).map((r) => ({ date: r.day_date, dayType: r.day_type })),
    gameDates: [...gameDates].sort(),
  });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { weekStart?: unknown; days?: unknown; clear?: unknown };
  if (!isIso(body.weekStart) || weekdayOf(body.weekStart) !== "mon") {
    return NextResponse.json({ error: "weekStart must be a Monday (YYYY-MM-DD)" }, { status: 400 });
  }
  const weekStart = body.weekStart;
  const days = body.clear === true ? null : sanitizeWeekMoves({ [weekStart]: body.days })[weekStart] ?? null;
  if (body.clear !== true && !days) return NextResponse.json({ error: "days: weekday → strength | power | light | rest" }, { status: 400 });

  const { data: cur, error: readErr } = await supabase.from("team_strength_palette").select("no_match_week").eq("team_id", auth.teamId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  // Keep the stored jsonb as it is (weekday plan + `since`); only the `weeks` entry for this week changes.
  const raw = ((cur as { no_match_week?: unknown } | null)?.no_match_week ?? {}) as Record<string, unknown>;
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const weeks = pruneWeekMoves(sanitizeWeekMoves(base.weeks), new Date().toISOString().slice(0, 10));
  if (days) weeks[weekStart] = days;
  else delete weeks[weekStart];
  const next: Record<string, unknown> = { ...base };
  if (Object.keys(weeks).length) next.weeks = weeks;
  else delete next.weeks;

  const { error } = await supabase
    .from("team_strength_palette")
    .upsert({ team_id: auth.teamId, no_match_week: next, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, plan: sanitizeNoMatchWeek(next) });
}
