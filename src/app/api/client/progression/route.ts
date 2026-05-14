/**
 * /api/client/progression
 *
 * Returns per-exercise top-set series (Epley e1RM) for the calling player,
 * over the last 90 days by default. Used to draw progression line charts
 * on /client/progression.
 *
 *   {
 *     ok: true,
 *     exercises: [
 *       { name, points: [{ date, weight_kg, reps, e1rm }], pr_e1rm }
 *     ]
 *   }
 *
 * PRs (personal records) are detected as the max e1rm in the window with
 * a `is_pr` flag on the point that set it.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: p } = await sb.from("players").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return { error: "Not a player account", status: 403 } as const;
  return { sb, playerId: (p as { id: string }).id } as const;
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const url = new URL(req.url);
  const days = Math.max(7, Math.min(365, Number(url.searchParams.get("days") ?? "90")));
  const since = new Date(); since.setDate(since.getDate() - days);

  const { data, error } = await a.sb
    .from("pt_exercise_set_logs")
    .select("exercise_name, session_date, weight_kg, reps")
    .eq("player_id", a.playerId)
    .gte("session_date", since.toISOString().slice(0, 10))
    .order("session_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sets = ((data ?? []) as Array<{
    exercise_name: string; session_date: string;
    weight_kg: number | null; reps: number | null;
  }>);

  const epley = (w: number, r: number) => w * (1 + Math.max(0, r) / 30);

  // For each exercise, pick the top set (by e1rm) per session.
  const byExercise = new Map<string, Map<string, { weight: number; reps: number; e1rm: number }>>();
  for (const s of sets) {
    if (s.weight_kg == null || s.reps == null) continue;
    if (!byExercise.has(s.exercise_name)) byExercise.set(s.exercise_name, new Map());
    const dayMap = byExercise.get(s.exercise_name)!;
    const e = epley(Number(s.weight_kg), Number(s.reps));
    const existing = dayMap.get(s.session_date);
    if (!existing || e > existing.e1rm) {
      dayMap.set(s.session_date, { weight: Number(s.weight_kg), reps: Number(s.reps), e1rm: Number(e.toFixed(2)) });
    }
  }

  const exercises = Array.from(byExercise.entries()).map(([name, dayMap]) => {
    const points = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, weight_kg: v.weight, reps: v.reps, e1rm: v.e1rm, is_pr: false as boolean }));
    // Mark PRs (max-so-far runs).
    let runMax = -Infinity;
    let prE1rm = 0;
    for (const p of points) {
      if (p.e1rm > runMax) {
        p.is_pr = true;
        runMax = p.e1rm;
        prE1rm = p.e1rm;
      }
    }
    return { name, points, pr_e1rm: prE1rm || null, sessions: points.length };
  }).sort((a, b) => b.sessions - a.sessions);

  return NextResponse.json({ ok: true, exercises });
}
