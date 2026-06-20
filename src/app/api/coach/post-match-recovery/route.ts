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
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// IMA mechanical-load weights. High-intensity decelerations are the primary
// muscle-damage / fatigue driver post-match, so decel leads the composite
// (McBurnie 2022; Harper 2019); accel/CoD/jumps add the rest of the eccentric
// + landing demand. The composite is z-scored across the players who played,
// so it reads as a RELATIVE high/mid/low mechanical dose for that match.
const LOAD_W = { decel: 1.0, accel: 0.6, cod: 0.4, jumps: 0.3 };
const LOAD_W_SUM = LOAD_W.decel + LOAD_W.accel + LOAD_W.cod + LOAD_W.jumps;

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

  // ── IMA mechanical match-load (the "dose" that predicts the MD+1 echo) ──
  type RawLoad = { decel: number; accel: number; cod: number; jumps: number };
  const rawLoad = new Map<string, RawLoad>();
  if (playerIds.length) {
    const { data: ld } = await supabase
      .from("player_external_load_daily")
      .select("player_id, ima_accel, ima_decel, jumps, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low")
      .eq("source", "catapult").in("player_id", playerIds).eq("date", match.match_date);
    for (const r of (ld ?? []) as Array<Record<string, unknown>>) {
      const cod = num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low) +
        num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
      rawLoad.set(String(r.player_id), { decel: num(r.ima_decel), accel: num(r.ima_accel), cod, jumps: num(r.jumps) });
    }
  }
  // Cohort mean/sd per metric (players with load only) → z-composite tiers.
  const loadVals = Array.from(rawLoad.values());
  const stat = (k: keyof RawLoad) => {
    const xs = loadVals.map((v) => v[k]);
    const n = xs.length || 1;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    return { mean, sd };
  };
  const stats = { decel: stat("decel"), accel: stat("accel"), cod: stat("cod"), jumps: stat("jumps") };
  const loadScore = (r: RawLoad): number => {
    const z = (k: keyof RawLoad) => (stats[k].sd > 0 ? (r[k] - stats[k].mean) / stats[k].sd : 0);
    return (LOAD_W.decel * z("decel") + LOAD_W.accel * z("accel") + LOAD_W.cod * z("cod") + LOAD_W.jumps * z("jumps")) / LOAD_W_SUM;
  };

  // ── Objective neuromuscular layer: CMJ (ForceDecks) vs pre-match baseline ──
  // Nédélec's actual recovery marker — quantifies neuromuscular fatigue the
  // player may not feel. Baseline = median jump height in the 42 d before the
  // match (≥3 valid tests); per offset day we compare that day's CMJ to it.
  // RSI-mod is the more fatigue-sensitive metric (Gathercole 2015) and is
  // surfaced too. Sparse until MD+1 jump-testing is routine → "—" otherwise.
  type Cmj = { jhPct: number | null; rsiPct: number | null };
  const cmjByKey = new Map<string, Cmj>();
  let cmjTestedTotal = 0;
  if (playerIds.length && offsets.length) {
    const baseStart = addDays(match.match_date, -42);
    const { data: fd } = await supabase
      .from("vald_forcedecks_results")
      .select("microplayer_id, test_timestamp, jump_height_cm, rsi_mod, is_valid")
      .eq("team_id", teamId).in("microplayer_id", playerIds)
      .gte("test_timestamp", `${baseStart}T00:00:00Z`)
      .lte("test_timestamp", `${offsets[offsets.length - 1].date}T23:59:59Z`).limit(4000);
    const byPlayer = new Map<string, Array<{ date: string; jh: number | null; rsi: number | null }>>();
    for (const r of (fd ?? []) as Array<{ microplayer_id: string; test_timestamp: string; jump_height_cm: number | null; rsi_mod: number | null; is_valid: boolean | null }>) {
      if (r.is_valid === false) continue;
      const id = String(r.microplayer_id);
      if (!byPlayer.has(id)) byPlayer.set(id, []);
      byPlayer.get(id)!.push({ date: String(r.test_timestamp).slice(0, 10), jh: r.jump_height_cm == null ? null : Number(r.jump_height_cm), rsi: r.rsi_mod == null ? null : Number(r.rsi_mod) });
    }
    const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
    const pct = (test: number | null, base: number | null) => (test != null && base != null && base > 0 ? Math.round(((test - base) / base) * 1000) / 10 : null);
    for (const [id, tests] of byPlayer.entries()) {
      const baseRows = tests.filter((t) => t.date >= baseStart && t.date < match.match_date);
      const baseJhVals = baseRows.map((t) => t.jh).filter((v): v is number => v != null);
      const baseRsiVals = baseRows.map((t) => t.rsi).filter((v): v is number => v != null);
      const baseJh = baseJhVals.length >= 3 ? median(baseJhVals) : null;
      const baseRsi = baseRsiVals.length >= 3 ? median(baseRsiVals) : null;
      for (const o of offsets) {
        const day = tests.filter((t) => t.date === o.date);
        if (!day.length) continue;
        cmjTestedTotal++;
        cmjByKey.set(`${id}|${o.key}`, {
          jhPct: pct(median(day.map((t) => t.jh).filter((v): v is number => v != null)), baseJh),
          rsiPct: pct(median(day.map((t) => t.rsi).filter((v): v is number => v != null)), baseRsi),
        });
      }
    }
  }

  const md2Date = offsets.find((o) => o.key === "MD+2")?.date ?? null;
  const players = played
    .map((m) => {
      const info = nameById.get(m.player_id) ?? { name: "—", position: null };
      const colors: Record<string, "green" | "yellow" | "red" | null> = {};
      for (const o of offsets) colors[o.key] = colorByKey.get(`${m.player_id}|${o.date}`) ?? null;
      const cmj: Record<string, Cmj | null> = {};
      for (const o of offsets) cmj[o.key] = cmjByKey.get(`${m.player_id}|${o.key}`) ?? null;
      const md2 = md2Date ? colorByKey.get(`${m.player_id}|${md2Date}`) ?? null : null;
      const reboundedByMd2 = md2 === "green";
      const lagging = md2 != null && md2 !== "green";
      // Mechanical dose: decel-weighted z-composite → high/mid/low tier.
      const rl = rawLoad.get(m.player_id) ?? null;
      const score = rl ? Math.round(loadScore(rl) * 100) / 100 : null;
      const tier: "high" | "mid" | "low" | null = score == null ? null : score >= 0.4 ? "high" : score <= -0.4 ? "low" : "mid";
      const load = rl ? { decel: Math.round(rl.decel), score, tier } : null;
      // Cross-tab: heavy echo (high dose, still flagged) vs not-post-match
      // (low dose, flagged → look elsewhere).
      const heavyEcho = lagging && tier === "high";
      const notPostMatch = lagging && tier === "low";
      return { id: m.player_id, name: info.name, position: info.position, minutes: m.minutes_played ?? 0, colors, cmj, reboundedByMd2, lagging, md2, load, heavyEcho, notPostMatch };
    })
    // Lagging first, then by mechanical dose (the McBurnie driver), then minutes.
    .sort((a, b) => Number(b.lagging) - Number(a.lagging) || (b.load?.score ?? -Infinity) - (a.load?.score ?? -Infinity) || b.minutes - a.minutes);

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
    summary: { played: players.length, by_offset: byOffset, rebounded_by_md2: reboundedByMd2, with_md2: withMd2, lagging: players.filter((p) => p.lagging).length, cmj_tested: cmjTestedTotal },
  });
}
