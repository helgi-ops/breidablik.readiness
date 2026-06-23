/**
 * /api/coach/recovery-watch  (spec: docs/post-match-recovery-recheck.md, step 2)
 *
 * GET — open post-match recovery watches for the coach's team. For the most
 * recent match, every player who played meaningful minutes gets evaluated on
 * his LATEST post-match check-in via the recoveryWatch lib (day-aware: a low
 * MD+1 reading is the expected echo; MD+2 should be returning; MD+3+ should be
 * back). Returns the watches that are still open (below the expectation for
 * their MD-day), gated on minutes + a mature readiness baseline.
 *
 * Signal = the SUBJECTIVE readiness check-in (readiness_entries.total_score) vs
 * the player's OWN pre-match baseline. Directional, not a medical test; a
 * distinct "recovery watch" signal beside the canonical colour, never the
 * colour itself (CLAUDE.md). Coach/staff only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recoveryWatch, type RecoveryWatchStatus } from "@/lib/micropulse/recoveryWatch";
import type { AthleteMetricBaseline, BaselineStatus } from "@/lib/micropulse/baselines";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

const MIN_MINUTES = 30;
const BASELINE_WINDOW_DAYS = 35; // pre-match window to define the personal norm

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}
function buildBaseline(playerId: string, scores: number[], today: string): AthleteMetricBaseline {
  const n = scores.length;
  const mean = n ? scores.reduce((s, x) => s + x, 0) / n : 0;
  const sd = n < 2 ? 0 : Math.sqrt(scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const sorted = [...scores].sort((a, b) => a - b);
  const median = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null;
  // Match the lib's maturity bands: <7 insufficient, 7-13 calibrating, ≥14 active.
  const status: BaselineStatus = n < 7 ? "insufficient_data" : n < 14 ? "calibrating" : "active";
  return {
    player_id: playerId, metric_key: "wellness.total", n_observations: n,
    mean, sd, cv: mean ? sd / mean : null, median, window_days: BASELINE_WINDOW_DAYS,
    status, computed_at: today,
  };
}

// Severity for sorting the open watches (worst first).
const SEVERITY: Record<RecoveryWatchStatus, number> = {
  escalate: 4, incomplete: 3, monitor: 2, on_track: 1, recovered: 0, building: 0, na: 0,
};

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const today = new Date().toISOString().slice(0, 10);

  // Most recent past match.
  const { data: matchRows } = await supabase
    .from("match_schedule").select("match_date, opponent, is_home")
    .eq("team_id", teamId).lte("match_date", today).order("match_date", { ascending: false }).limit(1);
  const match = (matchRows ?? [])[0] as { match_date: string; opponent: string | null; is_home: boolean | null } | undefined;
  if (!match) return NextResponse.json({ match: null, watches: [], summary: null });

  // Players who played meaningful minutes + names.
  const [minutesRes, playersRes] = await Promise.all([
    supabase.from("match_player_minutes").select("player_id, minutes_played, is_dnp").eq("team_id", teamId).eq("match_date", match.match_date),
    supabase.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true),
  ]);
  const nameById = new Map<string, { name: string; position: string | null }>();
  for (const p of (playersRes.data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>) {
    nameById.set(p.id, { name: (p.full_name ?? "—").trim(), position: p.position });
  }
  const played = ((minutesRes.data ?? []) as Array<{ player_id: string; minutes_played: number | null; is_dnp: boolean | null }>)
    .filter((m) => !m.is_dnp && (m.minutes_played ?? 0) >= MIN_MINUTES);
  const minutesById = new Map(played.map((m) => [m.player_id, m.minutes_played ?? 0]));
  const playerIds = played.map((m) => m.player_id);
  if (!playerIds.length) {
    return NextResponse.json({
      match: { date: match.match_date, opponent: match.opponent, days_ago: dayDiff(today, match.match_date) },
      watches: [], summary: { played: 0, evaluated: 0, open: 0, awaiting_checkin: 0 },
    });
  }

  // Readiness check-ins: pre-match window (baseline) + post-match (the reading).
  const windowStart = addDays(match.match_date, -BASELINE_WINDOW_DAYS);
  const { data: re } = await supabase
    .from("readiness_entries").select("player_id, entry_date, total_score, is_imputed")
    .eq("team_id", teamId).in("player_id", playerIds)
    .gte("entry_date", windowStart).lte("entry_date", today);
  type Row = { player_id: string; entry_date: string; total_score: number | null; is_imputed: boolean | null };
  const byPlayer = new Map<string, Row[]>();
  for (const r of (re ?? []) as Row[]) {
    if (r.total_score == null || r.is_imputed) continue; // real check-ins only
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id)!.push(r);
  }

  let awaiting = 0;
  const evaluated: Array<Record<string, unknown> & { status: RecoveryWatchStatus }> = [];
  for (const pid of playerIds) {
    const rows = byPlayer.get(pid) ?? [];
    const preMatch = rows.filter((r) => r.entry_date < match.match_date).map((r) => r.total_score as number);
    const postMatch = rows.filter((r) => r.entry_date > match.match_date).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    if (!postMatch.length) { awaiting++; continue; } // no check-in since the match → nothing to read yet
    const latest = postMatch[0];

    const result = recoveryWatch({
      minutesPlayed: minutesById.get(pid) ?? null,
      mdDay: `MD+${dayDiff(latest.entry_date, match.match_date)}`,
      todayReadiness: latest.total_score,
      baseline: buildBaseline(pid, preMatch, today),
      minMinutes: MIN_MINUTES,
    });
    const info = nameById.get(pid) ?? { name: "—", position: null };
    evaluated.push({
      player_id: pid, name: info.name, position: info.position,
      minutes: minutesById.get(pid) ?? 0, check_in_date: latest.entry_date,
      ...result,
    });
  }

  // Open watches = anything still needing a re-check (worst first). on_track is
  // open-but-not-alerting; the alert count is the genuine concerns.
  const open = evaluated.filter((e) => e.recheck).sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status]);
  const counts = evaluated.reduce((acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const alerting = (counts.monitor ?? 0) + (counts.incomplete ?? 0) + (counts.escalate ?? 0);

  return NextResponse.json({
    match: { date: match.match_date, opponent: match.opponent, is_home: match.is_home, days_ago: dayDiff(today, match.match_date) },
    watches: open,
    summary: {
      played: playerIds.length,
      evaluated: evaluated.length,
      open: open.length,
      alerting,
      awaiting_checkin: awaiting,
      by_status: counts,
    },
    note: "Subjective-readiness recovery watch vs each player's own pre-match baseline (recoveryWatch lib). Directional, not a medical recovery test.",
  });
}
