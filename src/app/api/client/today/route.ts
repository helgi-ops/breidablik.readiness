/**
 * /api/client/today
 *
 * One-shot composer for the PT-client home screen. Returns:
 *   - prescribed: today's workout (from Explosive Power assignment OR
 *                 player-override custom_template OR null)
 *   - readinessToday: whether the client has logged readiness today
 *   - bodyweightToday: latest weight + delta vs 7-day prior
 *   - trainer: name + team for the header
 *
 * Single round trip so /client/today renders fast on mobile.
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
  const { data: p } = await sb
    .from("players")
    .select("id, team_id, full_name")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (!p) return { error: "Not a player account", status: 403 } as const;
  return { sb, player: p as { id: string; team_id: string; full_name: string } } as const;
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, player } = a;
  const today = new Date().toISOString().slice(0, 10);

  // ── Trainer / team header ─────────────────────────────────────────
  const { data: team } = await sb
    .from("teams")
    .select("id, name, team_type, club_short_name")
    .eq("id", player.team_id)
    .maybeSingle();

  // ── Active Explosive Power assignment (admin-managed library) ─────
  const { data: epAssign } = await sb
    .from("pt_explosive_programme_assignments")
    .select("id, level, current_phase, programme_key, start_date, status")
    .eq("client_id", player.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Programme metadata (phase name + blocks for today's prescribed work).
  let explosive: {
    level: string; phase: number; phase_name: string; weeks_label: string;
    blocks: unknown[];
  } | null = null;
  if (epAssign) {
    const ep = epAssign as { level: string; current_phase: number; programme_key: string };
    const { data: prog } = await sb
      .from("pt_explosive_programmes")
      .select("phase_name, weeks_label, blocks")
      .eq("programme_key", ep.programme_key)
      .eq("level", ep.level)
      .eq("phase", ep.current_phase)
      .maybeSingle();
    if (prog) {
      const p = prog as { phase_name: string; weeks_label: string; blocks: unknown[] };
      explosive = {
        level: ep.level, phase: ep.current_phase,
        phase_name: p.phase_name, weeks_label: p.weeks_label, blocks: p.blocks ?? [],
      };
    }
  }

  // ── Custom template player-override active for today ──────────────
  const { data: overrideRow } = await sb
    .from("custom_template_sets")
    .select("table_name, md_days, set_name")
    .eq("player_id", player.id)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── Today's readiness (was the daily check-in done?) ──────────────
  const { data: readinessToday } = await sb
    .from("readiness_entries")
    .select("id, total_score, color, fatigue_energy, sleep_quality, muscle_soreness")
    .eq("player_id", player.id)
    .eq("entry_date", today)
    .maybeSingle();

  // ── Latest bodyweight + 7-day prior for delta ─────────────────────
  const { data: bwData } = await sb
    .from("client_body_weight_logs")
    .select("log_date, weight_kg")
    .eq("player_id", player.id)
    .order("log_date", { ascending: false })
    .limit(10);
  const bw = ((bwData ?? []) as Array<{ log_date: string; weight_kg: number }>);
  const latestBw = bw[0] ?? null;
  // Find the closest entry to 7 days ago for a stable "weekly delta"
  let priorBw: { log_date: string; weight_kg: number } | null = null;
  if (latestBw) {
    const target = new Date(latestBw.log_date); target.setDate(target.getDate() - 7);
    const targetIso = target.toISOString().slice(0, 10);
    priorBw = bw.slice(1).reduce<{ log_date: string; weight_kg: number } | null>((best, r) => {
      const d1 = Math.abs(new Date(r.log_date).getTime() - new Date(targetIso).getTime());
      const d2 = best ? Math.abs(new Date(best.log_date).getTime() - new Date(targetIso).getTime()) : Infinity;
      return d1 < d2 ? r : best;
    }, null);
  }

  return NextResponse.json({
    ok: true,
    player: { id: player.id, full_name: player.full_name },
    team: team
      ? { id: (team as { id: string }).id, name: (team as { name: string }).name,
          type: (team as { team_type: string }).team_type,
          short: (team as { club_short_name: string | null }).club_short_name }
      : null,
    explosive,
    customOverride: overrideRow ?? null,
    readinessToday: readinessToday ?? null,
    bodyweight: latestBw
      ? {
          latest: latestBw,
          prior: priorBw,
          delta_kg: priorBw ? Number((latestBw.weight_kg - priorBw.weight_kg).toFixed(2)) : null,
        }
      : null,
  });
}
