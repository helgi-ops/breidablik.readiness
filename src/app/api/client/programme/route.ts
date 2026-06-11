/**
 * /api/client/programme
 *
 * GET — the client's full programme OVERVIEW (weeks/phases -> sessions ->
 * exercises with sets×reps, NO loads), but only when the coach has turned plan
 * visibility on for them (pt_plan_visibility). Read-only. Normalises both plan
 * shapes (explosive starter/library programmes and individual training plans)
 * into one weeks→sessions→exercises tree.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: player } = await sb.from("players").select("id").eq("user_id", userId).maybeSingle();
  if (!player) return { error: "Not a player account", status: 403 } as const;
  return { sb, playerId: (player as { id: string }).id } as const;
}

type Exercise = { name: string; sets: number | null; reps: string | null };
type Session = { name: string; exercises: Exercise[] };
type Group = { label: string; sessions: Session[] };

const str = (v: unknown) => (v == null ? null : String(v));
const intOrNull = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, playerId } = a;

  // Visibility gate — default hidden.
  const { data: vis } = await sb.from("pt_plan_visibility").select("visible").eq("player_id", playerId).maybeSingle();
  if (!((vis as { visible?: boolean } | null)?.visible)) {
    return NextResponse.json({ ok: true, visible: false });
  }

  // ── 1. Explosive / library programme ─────────────────────────────────
  const { data: ep } = await sb
    .from("pt_explosive_programme_assignments")
    .select("level, programme_key, status")
    .eq("client_id", playerId).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (ep) {
    const e = ep as { level: string; programme_key: string };
    const { data: phases } = await sb
      .from("pt_explosive_programmes")
      .select("phase, phase_name, weeks_label, blocks, programme_name")
      .eq("programme_key", e.programme_key).eq("level", e.level)
      .order("phase", { ascending: true });
    const rows = (phases ?? []) as Array<{ phase: number; phase_name: string; weeks_label: string; blocks: unknown; programme_name: string | null }>;
    const programmeName = rows[0]?.programme_name ?? "Programme";
    const groups: Group[] = rows.map((p) => {
      const blocks = Array.isArray(p.blocks) ? p.blocks as Array<{ name?: string; rows?: Array<{ exercise?: string; sets?: unknown; reps?: unknown }> }> : [];
      return {
        label: [p.phase_name, p.weeks_label].filter(Boolean).join(" · "),
        sessions: blocks.map((b) => ({
          name: b.name ?? "Session",
          exercises: (b.rows ?? []).filter((r) => r.exercise).map((r) => ({ name: String(r.exercise), sets: intOrNull(r.sets), reps: str(r.reps) })),
        })),
      };
    }).filter((g) => g.sessions.length > 0);
    return NextResponse.json({ ok: true, visible: true, programme_name: programmeName, groups });
  }

  // ── 2. Individual training plan ──────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const { data: plan } = await sb
    .from("individual_training_plans")
    .select("id, plan_name, start_date, end_date, status")
    .eq("player_id", playerId).eq("status", "active")
    .lte("start_date", today)
    .order("start_date", { ascending: false }).limit(1).maybeSingle();

  if (plan) {
    const pl = plan as { id: string; plan_name: string };
    const { data: sessions } = await sb
      .from("individual_training_sessions")
      .select("id, week_number, day_of_week, session_name, sort_order")
      .eq("plan_id", pl.id)
      .order("week_number", { ascending: true }).order("day_of_week", { ascending: true }).order("sort_order", { ascending: true });
    const sessRows = (sessions ?? []) as Array<{ id: string; week_number: number; day_of_week: number; session_name: string | null; sort_order: number }>;
    const sessionIds = sessRows.map((s) => s.id);

    const { data: presc } = sessionIds.length
      ? await sb.from("individual_training_prescriptions").select("session_id, exercise_id, sets, reps, sort_order").in("session_id", sessionIds).order("sort_order", { ascending: true })
      : { data: [] };
    const prescRows = (presc ?? []) as Array<{ session_id: string; exercise_id: string; sets: number | null; reps: string | null }>;

    const exIds = Array.from(new Set(prescRows.map((p) => p.exercise_id).filter(Boolean)));
    const { data: exLib } = exIds.length
      ? await sb.from("exercise_library").select("id, name").in("id", exIds)
      : { data: [] };
    const nameById = new Map<string, string>();
    for (const x of (exLib ?? []) as Array<{ id: string; name: string }>) nameById.set(x.id, x.name);

    const prescBySession = new Map<string, Exercise[]>();
    for (const p of prescRows) {
      const arr = prescBySession.get(p.session_id) ?? [];
      arr.push({ name: nameById.get(p.exercise_id) ?? "Exercise", sets: intOrNull(p.sets), reps: str(p.reps) });
      prescBySession.set(p.session_id, arr);
    }

    const byWeek = new Map<number, Session[]>();
    for (const s of sessRows) {
      const arr = byWeek.get(s.week_number) ?? [];
      arr.push({ name: s.session_name ?? `Session`, exercises: prescBySession.get(s.id) ?? [] });
      byWeek.set(s.week_number, arr);
    }
    const groups: Group[] = Array.from(byWeek.entries()).sort((x, y) => x[0] - y[0]).map(([wk, sess]) => ({ label: `Week ${wk}`, sessions: sess }));
    return NextResponse.json({ ok: true, visible: true, programme_name: pl.plan_name, groups });
  }

  return NextResponse.json({ ok: true, visible: true, programme_name: null, groups: [] });
}
