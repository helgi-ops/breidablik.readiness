/**
 * /api/coach/position-comparison?season=2026
 *
 * GET — compares match movement (GPS + IMA, per-90) across position groups for
 * the coach's team, with a rule-based playing-style archetype per group and per
 * player (drill-down). Goalkeepers have no GPS so they fall out naturally.
 *
 * Same join + 1000-row safety as the player game report: only match dates are
 * fetched. max_velocity is ALREADY km/h (no ×3.6).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  STYLE_METRICS, type StyleMetricKey, type StyleProfile,
  positionGroup, POSITION_GROUPS, buildPopulationStats, classifyStyle,
} from "@/lib/micropulse/positionStyle";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";

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

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const MIN_QUALIFY_MINUTES = 20;
const MIN_APPEARANCES = 2;
const LOAD_COLUMNS =
  "player_id, date, total_distance, high_speed_distance, sprint_distance, velocity_band6_total_distance, " +
  "accelerations, decelerations, accel_decel_efforts, max_velocity, " +
  "total_player_load, player_load_per_minute, session_duration_minutes, " +
  "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, " +
  "ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, jumps";

function appearanceProfile(r: Record<string, unknown>, minutes: number): { p90: Omit<StyleProfile, "top_speed">; top_speed: number } {
  const f = minutes > 0 ? 90 / minutes : 0;
  const cod = num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low) +
    num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
  return {
    p90: {
      distance: num(r.total_distance) * f,
      hsr: num(r.high_speed_distance) * f,
      // Sprint distance = the V6 (top-speed) band; Lite units often leave the
      // separate sprint_distance field at 0 (no sprint threshold configured), so
      // prefer velocity_band6 and fall back to sprint_distance (identical on Pro).
      sprint: (num(r.velocity_band6_total_distance) || num(r.sprint_distance)) * f,
      accel: num(r.accelerations) * f,
      decel: num(r.decelerations) * f,
      cod: cod * f,
      // Core/Lite substitute for the IMA agility signals: the Gen2 combined
      // accel+decel effort count. Pro clubs leave this 0 (they use accel/decel/cod).
      efforts: num(r.accel_decel_efforts) * f,
      jumps: num(r.jumps) * f,
      // Player Load: per-90 (a volume signal, like distance). PL/min is ALREADY a
      // rate — store it raw (not per-90); the per-player mean across appearances
      // then gives the average work-rate. Display/compare only; not an archetype axis.
      player_load: num(r.total_player_load) * f,
      pl_per_min: num(r.player_load_per_minute),
    },
    top_speed: (() => { const v = num(r.max_velocity); return v > 45 ? 0 : v; })(), // km/h; drop >45 GPS glitches
  };
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  // Position Comparison is an ELITE feature (position-level analytics). The
  // position EDITOR and TLYP stay free; only this analytics surface is gated.
  if (!(await isEliteTeam(supabase, teamId))) {
    return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  }

  const season = Number(new URL(req.url).searchParams.get("season")) || new Date().getUTCFullYear();
  const from = `${season}-01-01`, to = `${season}-12-31`;

  const [playersRes, minutesRes, scheduleRes] = await Promise.all([
    supabase.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true),
    supabase.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
    supabase.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
  ]);
  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 });

  const players = (playersRes.data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
  const playerIds = players.map((p) => p.id);
  const manualMin = ((minutesRes.data ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>)
    .filter((m) => !m.is_dnp && (m.minutes_played ?? 0) >= MIN_QUALIFY_MINUTES);
  const scheduleDates = Array.from(new Set(((scheduleRes.data ?? []) as Array<{ match_date: string }>).map((s) => s.match_date)));
  const matchDates = Array.from(new Set([...manualMin.map((m) => m.match_date), ...scheduleDates]));

  const { data: loadData, error: loadErr } = matchDates.length && playerIds.length
    ? await supabase.from("player_external_load_daily").select(LOAD_COLUMNS)
        .eq("source", "catapult").in("player_id", playerIds).in("date", matchDates).limit(5000)
    : { data: [], error: null };
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const loadByKey = new Map<string, Record<string, unknown>>();
  for (const r of (loadData ?? []) as unknown as Array<Record<string, unknown>>) loadByKey.set(`${r.player_id}|${r.date}`, r);

  // Appearances = manual minutes, plus a session-duration fallback on SCHEDULED
  // match dates with no manual entry — lets Lite teams that don't enter minutes
  // by hand still get per-90 position profiles (mirrors the Train-like-you-play
  // and Player Game Report fallback). Manual entries always win.
  const manualKeys = new Set(manualMin.map((m) => `${m.player_id}|${m.match_date}`));
  const minutes: Array<{ player_id: string; match_date: string; minutes_played: number }> =
    manualMin.map((m) => ({ player_id: m.player_id, match_date: m.match_date, minutes_played: m.minutes_played ?? 0 }));
  const scheduleSet = new Set(scheduleDates);
  for (const r of (loadData ?? []) as unknown as Array<Record<string, unknown>>) {
    const date = String(r.date), pid = String(r.player_id);
    if (!scheduleSet.has(date) || manualKeys.has(`${pid}|${date}`)) continue;
    const mins = num(r.session_duration_minutes);
    if (mins >= MIN_QUALIFY_MINUTES) minutes.push({ player_id: pid, match_date: date, minutes_played: mins });
  }

  // ── Per-player season profile (mean per-90, max top speed) ──
  type PlayerAgg = { id: string; name: string; position: string | null; group: string; appearances: number; profile: StyleProfile };
  const perPlayer: PlayerAgg[] = [];
  for (const p of players) {
    const apps = minutes.filter((m) => m.player_id === p.id)
      .map((m) => { const load = loadByKey.get(`${p.id}|${m.match_date}`); return load ? appearanceProfile(load, m.minutes_played ?? 0) : null; })
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (apps.length < MIN_APPEARANCES) continue;
    const mean = {} as StyleProfile;
    for (const k of STYLE_METRICS) {
      if (k === "top_speed") mean.top_speed = Math.max(...apps.map((a) => a.top_speed));
      else mean[k] = apps.reduce((s, a) => s + a.p90[k as keyof typeof a.p90], 0) / apps.length;
    }
    perPlayer.push({ id: p.id, name: (p.full_name ?? "—").trim(), position: p.position, group: positionGroup(p.position), appearances: apps.length, profile: mean });
  }

  // Squad distribution per metric (for group percentiles) + squad population (for player styles).
  const squadValues: Record<StyleMetricKey, number[]> = Object.fromEntries(STYLE_METRICS.map((m) => [m, perPlayer.map((p) => p.profile[m])])) as Record<StyleMetricKey, number[]>;
  const squadPop = buildPopulationStats(perPlayer.map((p) => p.profile));
  const squadAvg = Object.fromEntries(STYLE_METRICS.map((m) => [m, r1(squadValues[m].reduce((a, b) => a + b, 0) / (squadValues[m].length || 1))])) as Record<StyleMetricKey, number>;
  const pctOf = (metric: StyleMetricKey, value: number) => {
    const arr = squadValues[metric];
    if (!arr.length) return 0;
    return Math.round((arr.filter((v) => v <= value).length / arr.length) * 100);
  };

  // ── Group aggregates ──
  const groupsRaw = new Map<string, PlayerAgg[]>();
  for (const p of perPlayer) { if (!groupsRaw.has(p.group)) groupsRaw.set(p.group, []); groupsRaw.get(p.group)!.push(p); }

  const groupMeans: Array<{ key: string; profile: StyleProfile }> = [];
  for (const [key, members] of groupsRaw.entries()) {
    const profile = {} as StyleProfile;
    for (const m of STYLE_METRICS) profile[m] = members.reduce((s, mem) => s + mem.profile[m], 0) / members.length;
    groupMeans.push({ key, profile });
  }
  const groupPop = buildPopulationStats(groupMeans.map((g) => g.profile));

  const labelOf = (key: string) => POSITION_GROUPS.find((g) => g.key === key) ?? { key, en: key, is: key };

  const groups = groupMeans
    .map((g) => {
      const members = groupsRaw.get(g.key)!;
      const style = classifyStyle(g.profile, groupPop);
      const profile = Object.fromEntries(STYLE_METRICS.map((m) => [m, r1(g.profile[m])])) as Record<StyleMetricKey, number>;
      const percentile = Object.fromEntries(STYLE_METRICS.map((m) => [m, pctOf(m, g.profile[m])])) as Record<StyleMetricKey, number>;
      const memberOut = members
        .map((mem) => {
          const ps = classifyStyle(mem.profile, squadPop);
          const standout = ps.drivers.some((d) => d.z >= 1.0) || ps.primary.key !== style.primary.key;
          return {
            id: mem.id, name: mem.name, position: mem.position, appearances: mem.appearances,
            profile: Object.fromEntries(STYLE_METRICS.map((m) => [m, r1(mem.profile[m])])) as Record<StyleMetricKey, number>,
            style: { primary: ps.primary, secondary: ps.secondary, drivers: ps.drivers },
            standout,
          };
        })
        .sort((a, b) => b.profile.hsr - a.profile.hsr);
      const appearances = members.reduce((s, m) => s + m.appearances, 0);
      return { key: g.key, label_en: labelOf(g.key).en, label_is: labelOf(g.key).is, players: members.length, appearances, profile, percentile, style, members: memberOut };
    })
    .sort((a, b) => POSITION_GROUPS.findIndex((x) => x.key === a.key) - POSITION_GROUPS.findIndex((x) => x.key === b.key));

  // Only surface the axes this club actually has data for (capability-driven):
  // a metric with no non-zero value across the squad is omitted, so Core clubs
  // see hsr/sprint/top_speed/efforts instead of dead IMA accel/decel/CoD/jumps bars.
  const liveMetrics = STYLE_METRICS.filter((m) => squadValues[m].some((v) => v > 0));

  return NextResponse.json({ season, squadAvg, groups, metrics: liveMetrics });
}
