/**
 * /api/client/week — this week (Mon–Sun) at a glance for a PT client.
 *
 * Returns one entry per weekday with the session name (or rest / match), so the
 * client can see the whole week, not just today. Session-name level only (no
 * exercise detail) — the Today card and the programme overview carry the depth.
 * Resolves the same way /api/client/today does, for all 7 days:
 *   - explosive assignment → resolveProgrammeSlot per date
 *   - individual plan      → individual_training_sessions by (week_number, day)
 *   - pt_session_reschedules move a day's session; pt_client_games mark matches.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as admin } from "@/lib/supabaseServer";
import { resolveProgrammeSlot } from "@/lib/trainer/programmeSchedule";

export const runtime = "nodejs";

type DayKind = "session" | "rest" | "match" | "moved_away";
type WeekDay = {
  date: string;        // YYYY-MM-DD
  iso: number;         // 1=Mon..7=Sun
  label: string;       // session name / "Rest" / "Match" (client localises rest/match)
  kind: DayKind;
  isToday: boolean;
};

async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: p } = await sb.from("players").select("id, team_id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return { error: "Not a player account", status: 403 } as const;
  return { sb, player: p as { id: string; team_id: string } } as const;
}

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function isoWeekday(dateStr: string): number {
  return ((new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // Mon=1..Sun=7
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, player } = a;

  const today = iso(new Date());
  // Monday of the current week → the 7 dates Mon..Sun.
  const monday = addDays(today, -(isoWeekday(today) - 1));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const days: WeekDay[] = dates.map((date) => ({
    date, iso: isoWeekday(date), label: "", kind: "rest", isToday: date === today,
  }));
  let programmeName: string | null = null;

  // ── Active explosive assignment ──────────────────────────────────────────
  const { data: ep } = await sb
    .from("pt_explosive_programme_assignments")
    .select("programme_key, level, start_date, current_phase, sessions_per_week, status")
    .eq("client_id", player.id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (ep) {
    const assign = ep as { programme_key: string; level: string; start_date: string; current_phase: number; sessions_per_week: number | null };
    const { data: phaseRows } = await sb
      .from("pt_explosive_programmes")
      .select("phase, phase_name, blocks, weeks_per_phase, programme_name")
      .eq("programme_key", assign.programme_key).eq("level", assign.level)
      .order("phase", { ascending: true });
    const phases = (phaseRows ?? []) as Array<{ phase: number; phase_name: string; blocks: unknown[]; weeks_per_phase: number | null; programme_name: string | null }>;
    programmeName = phases[0]?.programme_name ?? null;
    const totalPhases = phases.length || 4;
    const weeksPerPhase = phases[0]?.weeks_per_phase ?? 3;
    for (const d of days) {
      const slot = resolveProgrammeSlot({
        programmeKey: assign.programme_key,
        startDate: assign.start_date,
        today: d.date,
        nBlocks: (() => {
          // Blocks in the phase this date falls in (fallback: current phase).
          const weeksSince = Math.max(0, Math.floor((new Date(`${d.date}T00:00:00Z`).getTime() - new Date(`${assign.start_date}T00:00:00Z`).getTime()) / 86_400_000 / 7));
          const ph = Math.min(totalPhases, Math.floor(weeksSince / weeksPerPhase) + 1);
          const n = (phases.find((p) => p.phase === ph)?.blocks?.length ?? phases[0]?.blocks?.length ?? 0);
          return assign.sessions_per_week ? Math.min(n, assign.sessions_per_week) : n;
        })(),
        weeksPerPhase, totalPhases,
      });
      if (slot.kind === "session") { d.kind = "session"; d.label = slot.blockName ?? ""; }
    }
  } else {
    // ── Active individual plan ───────────────────────────────────────────────
    const { data: pl } = await sb
      .from("individual_training_plans")
      .select("id, plan_name, start_date, status")
      .eq("player_id", player.id).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (pl) {
      const plan = pl as { id: string; plan_name: string; start_date: string };
      programmeName = plan.plan_name;
      const startMs = new Date(`${plan.start_date}T00:00:00Z`).getTime();
      const { data: sessions } = await sb
        .from("individual_training_sessions")
        .select("week_number, day_of_week, session_name")
        .eq("plan_id", plan.id);
      const byKey = new Map<string, string>();
      for (const s of (sessions ?? []) as Array<{ week_number: number; day_of_week: number; session_name: string }>) {
        byKey.set(`${s.week_number}:${s.day_of_week}`, s.session_name);
      }
      for (const d of days) {
        const dayOffset = Math.max(0, Math.floor((new Date(`${d.date}T00:00:00Z`).getTime() - startMs) / 86_400_000));
        const wk = Math.floor(dayOffset / 7) + 1;
        const name = byKey.get(`${wk}:${d.iso}`);
        if (name) { d.kind = "session"; d.label = name; }
      }
    }
  }

  // ── Reschedules (client/coach moves) in this week's range ─────────────────
  const { data: resched } = await sb
    .from("pt_session_reschedules")
    .select("from_date, to_date")
    .eq("player_id", player.id)
    .or(`and(from_date.gte.${monday},from_date.lte.${dates[6]}),and(to_date.gte.${monday},to_date.lte.${dates[6]})`);
  for (const r of (resched ?? []) as Array<{ from_date: string; to_date: string }>) {
    const fromDay = days.find((d) => d.date === r.from_date);
    const toDay = days.find((d) => d.date === r.to_date);
    if (fromDay && fromDay.kind === "session") { fromDay.kind = "moved_away"; fromDay.label = ""; }
    if (toDay) { toDay.kind = "session"; if (!toDay.label) toDay.label = fromDay?.label || ""; }
  }

  // ── Match days (pre-game) ─────────────────────────────────────────────────
  const { data: games } = await sb
    .from("pt_client_games")
    .select("game_date")
    .eq("player_id", player.id)
    .gte("game_date", monday).lte("game_date", dates[6]);
  for (const g of (games ?? []) as Array<{ game_date: string }>) {
    const gd = days.find((d) => d.date === g.game_date);
    if (gd) { gd.kind = "match"; gd.label = ""; }
  }

  return NextResponse.json({ ok: true, programme_name: programmeName, week: days });
}
