/**
 * /api/trainer/client/[id]/sessions?days=120&limit=30
 *
 * GET — the trainer's read-only view of how a client logged their sessions:
 * the exact per-set entries (weight × reps × RPE) the client recorded, plus
 * the Foster session load (sRPE × duration), grouped by session_date and
 * ordered most-recent-first so the trainer can see the LAST session and page
 * back through history. Read-only: rules/data the client entered, surfaced to
 * the trainer; nothing here writes.
 *
 * Mirrors the per-set storage of /api/player/exercise-sets (pt_exercise_set_logs
 * + session_rpe_entries), but scoped via the trainer-for-client auth guard.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { buildBodyweightResolver } from "@/lib/client/volumeLoad";

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
    const { data: clientRow } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
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

type SetRow = { exercise_name: string; set_number: number; weight_kg: number | null; reps: number | null; rpe: number | null; notes: string | null; is_bodyweight: boolean | null };
type LoadRow = { session_date: string; duration_minutes: number | null; rpe: number | null; session_load: number | null };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const sb = a.sb;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? "120")));
  const limit = Math.max(1, Math.min(60, Number(url.searchParams.get("limit") ?? "30")));
  const sinceIso = isoDaysAgo(days);

  const { data: setRows, error } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, set_number, weight_kg, reps, rpe, notes, is_bodyweight")
    .eq("player_id", clientId)
    .gte("session_date", sinceIso)
    .order("session_date", { ascending: false })
    .order("exercise_name", { ascending: true })
    .order("set_number", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Foster session load (sRPE × duration) the client logged for the same days.
  const { data: loadRows } = await sb
    .from("session_rpe_entries")
    .select("session_date, duration_minutes, rpe, session_load")
    .eq("player_id", clientId)
    .eq("source", "client")
    .gte("session_date", sinceIso)
    .order("session_date", { ascending: false });
  const loadByDate = new Map<string, LoadRow>();
  for (const r of (loadRows ?? []) as LoadRow[]) {
    if (!loadByDate.has(r.session_date)) loadByDate.set(r.session_date, r);
  }

  // Group rows into sessions (one per date), each with its exercises + sets in
  // logged order. Volume = sum of weight×reps across the session.
  const byDate = new Map<string, Map<string, SetRow[]>>();
  const dateOrder: string[] = [];
  for (const r of (setRows ?? []) as SetRow[]) {
    const date = String((r as unknown as { session_date: string }).session_date);
    if (!byDate.has(date)) { byDate.set(date, new Map()); dateOrder.push(date); }
    const exMap = byDate.get(date)!;
    const arr = exMap.get(r.exercise_name) ?? [];
    arr.push(r);
    exMap.set(r.exercise_name, arr);
  }

  // Value bodyweight sets with the client's logged body weight (carried forward),
  // identical to volume-load, so push-ups/pull-ups aren't 0 tonnage here either.
  const bodyweightAsOf = await buildBodyweightResolver(sb, clientId);

  const sessions = dateOrder.slice(0, limit).map((date) => {
    const exMap = byDate.get(date)!;
    let totalSets = 0;
    let volume = 0;
    const exercises = Array.from(exMap.entries()).map(([name, sets]) => {
      const cleanSets = sets.map((s) => ({
        set_number: s.set_number,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
        notes: s.notes,
        is_bodyweight: s.is_bodyweight === true,
      }));
      totalSets += cleanSets.length;
      for (const s of cleanSets) {
        const w = s.is_bodyweight ? bodyweightAsOf(date) : s.weight_kg;
        if (w != null && s.reps != null) volume += w * s.reps;
      }
      return { name, sets: cleanSets };
    });
    const load = loadByDate.get(date) ?? null;
    return {
      date,
      exercises,
      totalSets,
      totalExercises: exercises.length,
      volume_kg: Math.round(volume),
      session_rpe: load?.rpe ?? null,
      duration_minutes: load?.duration_minutes ?? null,
      session_load: load?.session_load ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    totalSessions: dateOrder.length,
    sessions,
    note: "Read-only view of the client's own logged sessions (per-set weight/reps/RPE + Foster sRPE×duration).",
  });
}
