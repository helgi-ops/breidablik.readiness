/**
 * /api/coach/post-match-recovery?match_date=YYYY-MM-DD
 *
 * GET — post-match recovery board for one match: every player who played, their
 * minutes, and their CANONICAL readiness colour (readiness_entries.color — same
 * source as v_coach_readiness_today_v8.final_color) across MD+1, MD+2, MD+3…,
 * so a coach can see who rebounded by MD+2 (Nédélec 2012 expectation) and who is
 * lagging. Defaults to the most recent past match. Coach/staff only.
 *
 * NB: colour comes ONLY from readiness_entries.color — never
 * athlete_decision_history.athlete_state or stage4_decisions.system_decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const MAX_OFFSET = 5; // MD+1 … MD+5
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const normColor = (c: unknown): "green" | "yellow" | "red" | null => {
  const s = String(c ?? "").toLowerCase();
  return s === "green" || s === "yellow" || s === "red" ? s : null;
};

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const today = new Date().toISOString().slice(0, 10);

  // Recent past matches (for the selector) + resolve the requested/default one.
  const { data: matchRows } = await supabase
    .from("match_schedule").select("match_date, opponent, competition, is_home")
    .eq("team_id", teamId).lte("match_date", today).order("match_date", { ascending: false }).limit(12);
  const matches = (matchRows ?? []) as Array<{ match_date: string; opponent: string | null; competition: string | null; is_home: boolean | null }>;
  if (!matches.length) return NextResponse.json({ match: null, matches: [], offsets: [], players: [], summary: null });

  const reqDate = req.nextUrl.searchParams.get("match_date");
  const match = (reqDate && isIso(reqDate) && matches.find((m) => m.match_date === reqDate)) || matches[0];

  // Offsets MD+1 … up to today (cap MAX_OFFSET).
  const offsets: Array<{ key: string; date: string }> = [];
  for (let n = 1; n <= MAX_OFFSET; n++) {
    const d = addDays(match.match_date, n);
    if (d > today) break;
    offsets.push({ key: `MD+${n}`, date: d });
  }

  // Players who played (not DNP) + their positions.
  const [minutesRes, playersRes] = await Promise.all([
    supabase.from("match_player_minutes").select("player_id, minutes_played, is_dnp").eq("team_id", teamId).eq("match_date", match.match_date),
    supabase.from("players").select("id, full_name, position").eq("team_id", teamId),
  ]);
  const nameById = new Map<string, { name: string; position: string | null }>();
  for (const p of (playersRes.data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>) {
    nameById.set(p.id, { name: (p.full_name ?? "—").trim(), position: p.position });
  }
  const played = ((minutesRes.data ?? []) as Array<{ player_id: string; minutes_played: number | null; is_dnp: boolean | null }>)
    .filter((m) => !m.is_dnp && (m.minutes_played ?? 0) > 0);
  const playerIds = played.map((m) => m.player_id);

  // Canonical readiness colour per (player, day) over the recovery window.
  const colorByKey = new Map<string, "green" | "yellow" | "red" | null>();
  if (playerIds.length && offsets.length) {
    const { data: re } = await supabase
      .from("readiness_entries").select("player_id, entry_date, color")
      .eq("team_id", teamId).in("player_id", playerIds)
      .gte("entry_date", offsets[0].date).lte("entry_date", offsets[offsets.length - 1].date);
    for (const r of (re ?? []) as Array<{ player_id: string; entry_date: string; color: string | null }>) {
      colorByKey.set(`${r.player_id}|${r.entry_date}`, normColor(r.color));
    }
  }

  const md2Date = offsets.find((o) => o.key === "MD+2")?.date ?? null;
  const players = played
    .map((m) => {
      const info = nameById.get(m.player_id) ?? { name: "—", position: null };
      const colors: Record<string, "green" | "yellow" | "red" | null> = {};
      for (const o of offsets) colors[o.key] = colorByKey.get(`${m.player_id}|${o.date}`) ?? null;
      const md2 = md2Date ? colorByKey.get(`${m.player_id}|${md2Date}`) ?? null : null;
      // Rebounded: green by MD+2. Lagging: MD+2 exists and is NOT green.
      const reboundedByMd2 = md2 === "green";
      const lagging = md2 != null && md2 !== "green";
      return { id: m.player_id, name: info.name, position: info.position, minutes: m.minutes_played ?? 0, colors, reboundedByMd2, lagging, md2 };
    })
    .sort((a, b) => Number(b.lagging) - Number(a.lagging) || b.minutes - a.minutes);

  // Cohort recovery curve: colour counts per offset day.
  const byOffset: Record<string, { green: number; yellow: number; red: number; none: number }> = {};
  for (const o of offsets) {
    const c = { green: 0, yellow: 0, red: 0, none: 0 };
    for (const p of players) {
      const v = p.colors[o.key];
      if (v === "green") c.green++; else if (v === "yellow") c.yellow++; else if (v === "red") c.red++; else c.none++;
    }
    byOffset[o.key] = c;
  }
  const withMd2 = players.filter((p) => p.md2 != null).length;
  const reboundedByMd2 = players.filter((p) => p.reboundedByMd2).length;

  return NextResponse.json({
    match: { date: match.match_date, opponent: match.opponent, competition: match.competition, is_home: match.is_home, days_ago: Math.round((Date.parse(today) - Date.parse(match.match_date)) / 86_400_000) },
    matches: matches.map((m) => ({ date: m.match_date, opponent: m.opponent, is_home: m.is_home })),
    offsets,
    players,
    summary: { played: players.length, by_offset: byOffset, rebounded_by_md2: reboundedByMd2, with_md2: withMd2, lagging: players.filter((p) => p.lagging).length },
  });
}
