/**
 * /api/exec/club-overview   (EXEC management/GM role — READ-ONLY)
 *
 * GET — a privacy-first, tier-fair club status read for a framkvæmdastjóri / board:
 * per-team tiles + a club roll-up across every team the EXEC is granted (via
 * exec_teams). Aggregates only — NO individual health/wellness rows ever leave
 * this endpoint (it selects the canonical readiness COLOUR + counts, never sleep,
 * soreness, injury or per-player wellness values).
 *
 * Canonical source: v_coach_readiness_today_v8.final_color (CLAUDE.md) — counts only.
 * Read-only is a hard boundary: only GET is exported, and auth requires role EXEC.
 *
 * Tiles (work on Lite + Pro — all aggregate, degrade gracefully):
 *   - availability today: cleared / managed / unavailable
 *   - adherence: % of squad with a reading today (the product is being used)
 *   - trend: availability % over recent weeks
 *   - one-sentence verdict + confidence (coverage)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  availabilityVerdict as verdict, buildBriefing, confidenceFor, injuryNarrative, loadTrajectory,
  type Avail, type InjurySummary,
} from "@/lib/micropulse/execBriefing";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

/** EXEC-only auth → the strict list of team_ids this management user may see. */
async function authenticateExec(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  if (String(prof?.role ?? "").toUpperCase() !== "EXEC") return { error: "Management (EXEC) role required", status: 403 } as const;
  const { data: et } = await supabase.from("exec_teams").select("team_id").eq("exec_id", userRes.user.id);
  const teamIds = (et ?? []).map((r) => String((r as { team_id: string }).team_id));
  if (!teamIds.length) return { error: "No teams granted to this management account", status: 403 } as const;
  return { supabase, teamIds } as const;
}

function addDaysISO(iso: string, n: number) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(iso: string) { const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }

type Bucket = "cleared" | "managed" | "unavailable" | "gray";
function classify(finalFlag: unknown, finalColor: unknown): Bucket {
  const raw = String(finalFlag ?? finalColor ?? "").toUpperCase();
  if (raw === "RED") return "unavailable";
  if (raw === "YELLOW") return "managed";
  if (raw === "GREEN" || raw === "GREEN_PLUS") return "cleared";
  return "gray";
}

const emptyAvail = (): Avail => ({ cleared: 0, managed: 0, unavailable: 0, total: 0 });

type ViewRow = { team_id: string; entry_date: string; final_color: unknown; final_flag: unknown };

export async function GET(req: NextRequest) {
  const ctx = await authenticateExec(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamIds } = ctx;

  const today = new Date().toISOString().slice(0, 10);
  const trendFrom = addDaysISO(today, -42); // ~6 weeks
  const loadFrom = addDaysISO(today, -28); // acute/chronic window for load trajectory
  const acuteFrom = addDaysISO(today, -7);

  const [teamsRes, playersRes, viewRes, loadRes, injRes] = await Promise.all([
    supabase.from("teams").select("id, name, gender, team_type, club_short_name").in("id", teamIds),
    supabase.from("players").select("team_id").in("team_id", teamIds).eq("is_active", true),
    supabase.from("v_coach_readiness_today_v8").select("team_id, entry_date, final_color, final_flag").in("team_id", teamIds).gte("entry_date", trendFrom).lte("entry_date", today),
    supabase.from("player_external_load_daily").select("team_id, date, player_load").in("team_id", teamIds).gte("date", loadFrom).lte("date", today).limit(20000),
    // Injuries — counts only. We never select body_part / injury_type / notes;
    // status + dates are aggregated server-side and only totals are returned.
    supabase.from("player_injuries").select("team_id, status, injury_date, actual_return_date").in("team_id", teamIds),
  ]);

  const teamsMeta = (teamsRes.data ?? []) as Array<{ id: string; name: string | null; gender: string | null; team_type: string | null; club_short_name: string | null }>;
  const squadByTeam = new Map<string, number>();
  for (const p of (playersRes.data ?? []) as Array<{ team_id: string }>) {
    squadByTeam.set(p.team_id, (squadByTeam.get(p.team_id) ?? 0) + 1);
  }
  const rows = (viewRes.data ?? []) as unknown as ViewRow[];

  // Per-team: today's availability + adherence, and weekly trend.
  const todayByTeam = new Map<string, Avail & { withRead: number }>();
  const trendByTeam = new Map<string, Map<string, Avail>>(); // team → weekStart → avail

  for (const r of rows) {
    const tid = String(r.team_id);
    const bucket = classify(r.final_flag, r.final_color);
    if (r.entry_date === today) {
      const cur = todayByTeam.get(tid) ?? { ...emptyAvail(), withRead: 0 };
      cur.withRead += 1;
      if (bucket !== "gray") { cur[bucket] += 1; cur.total += 1; }
      todayByTeam.set(tid, cur);
    }
    if (bucket !== "gray") {
      const wk = mondayOf(r.entry_date);
      if (!trendByTeam.has(tid)) trendByTeam.set(tid, new Map());
      const wkMap = trendByTeam.get(tid)!;
      const a = wkMap.get(wk) ?? emptyAvail();
      a[bucket] += 1; a.total += 1; wkMap.set(wk, a);
    }
  }

  function buildTrend(wkMap: Map<string, Avail> | undefined) {
    if (!wkMap) return [];
    return [...wkMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([weekStart, a]) => ({
      weekStart, total: a.total, clearedPct: a.total ? Math.round((a.cleared / a.total) * 100) : null,
    }));
  }

  // Load trajectory accumulator: mean session load (per player-day) acute (7d) vs
  // chronic (28d). Participation-independent, tier-fair (player_load on Lite + Pro).
  type LoadAcc = { aSum: number; aN: number; cSum: number; cN: number; days: Set<string> };
  const loadByTeam = new Map<string, LoadAcc>();
  for (const r of (loadRes.data ?? []) as Array<{ team_id: string; date: string; player_load: number | null }>) {
    const pl = Number(r.player_load);
    if (!Number.isFinite(pl) || pl <= 0) continue;
    const tid = String(r.team_id), date = String(r.date);
    const acc = loadByTeam.get(tid) ?? { aSum: 0, aN: 0, cSum: 0, cN: 0, days: new Set<string>() };
    acc.cSum += pl; acc.cN += 1; acc.days.add(date);
    if (date >= acuteFrom) { acc.aSum += pl; acc.aN += 1; }
    loadByTeam.set(tid, acc);
  }
  const teamLoad = (tid: string) => {
    const acc = loadByTeam.get(tid);
    if (!acc) return loadTrajectory(null, null, 0);
    return loadTrajectory(acc.aN ? acc.aSum / acc.aN : null, acc.cN ? acc.cSum / acc.cN : null, acc.days.size);
  };

  // Injury burden — aggregate counts per team (currently out, new + returned in 14d).
  const injFrom = addDaysISO(today, -14);
  const injByTeam = new Map<string, InjurySummary>();
  for (const r of (injRes.data ?? []) as Array<{ team_id: string; status: string | null; injury_date: string | null; actual_return_date: string | null }>) {
    const tid = String(r.team_id);
    const acc = injByTeam.get(tid) ?? { out: 0, newRecent: 0, returnedRecent: 0 };
    if (String(r.status ?? "").toLowerCase() === "injured") acc.out += 1;
    if (r.injury_date && String(r.injury_date) >= injFrom) acc.newRecent += 1;
    if (r.actual_return_date && String(r.actual_return_date) >= injFrom) acc.returnedRecent += 1;
    injByTeam.set(tid, acc);
  }
  const teamInjury = (tid: string): InjurySummary => injByTeam.get(tid) ?? { out: 0, newRecent: 0, returnedRecent: 0 };

  const teams = teamsMeta.map((t) => {
    const today_ = todayByTeam.get(t.id) ?? { ...emptyAvail(), withRead: 0 };
    const squad = squadByTeam.get(t.id) ?? today_.withRead;
    const adherencePct = squad > 0 ? Math.round((today_.withRead / squad) * 100) : null;
    const avail: Avail = { cleared: today_.cleared, managed: today_.managed, unavailable: today_.unavailable, total: today_.total };
    const adherence = { withRead: today_.withRead, squad, pct: adherencePct };
    const trend = buildTrend(trendByTeam.get(t.id));
    const { briefing, watch } = buildBriefing(avail, adherence, trend);
    return {
      teamId: t.id,
      name: t.name ?? "—",
      gender: t.gender,
      teamType: t.team_type,
      availability: avail,
      adherence,
      confidence: confidenceFor(today_.withRead, squad),
      verdict: verdict(avail, adherence),
      briefing,
      watch,
      load: teamLoad(t.id),
      injury: { ...injuryNarrative(teamInjury(t.id)), ...teamInjury(t.id) },
      trend,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Club roll-up — sum today's availability + adherence across every granted team.
  const rollAvail: Avail = emptyAvail();
  let rollWithRead = 0, rollSquad = 0;
  for (const t of teams) {
    rollAvail.cleared += t.availability.cleared; rollAvail.managed += t.availability.managed;
    rollAvail.unavailable += t.availability.unavailable; rollAvail.total += t.availability.total;
    rollWithRead += t.adherence.withRead; rollSquad += t.adherence.squad;
  }
  // Roll-up trend aggregated straight from the rows (accurate, not from per-team %).
  const rollTrendAcc = new Map<string, Avail>();
  for (const r of rows) {
    const bucket = classify(r.final_flag, r.final_color);
    if (bucket === "gray") continue;
    const wk = mondayOf(r.entry_date);
    const a = rollTrendAcc.get(wk) ?? emptyAvail();
    a[bucket] += 1; a.total += 1; rollTrendAcc.set(wk, a);
  }
  const rollAdherencePct = rollSquad > 0 ? Math.round((rollWithRead / rollSquad) * 100) : null;
  const rollAdherence = { withRead: rollWithRead, squad: rollSquad, pct: rollAdherencePct };
  const rollTrend = buildTrend(rollTrendAcc);
  const rollBrief = buildBriefing(rollAvail, rollAdherence, rollTrend);

  // Roll-up load — pool every team's player-day rows so the mean isn't skewed by team size.
  let raSum = 0, raN = 0, rcSum = 0, rcN = 0; const rDays = new Set<string>();
  for (const acc of loadByTeam.values()) { raSum += acc.aSum; raN += acc.aN; rcSum += acc.cSum; rcN += acc.cN; for (const d of acc.days) rDays.add(d); }
  const rollLoad = loadTrajectory(raN ? raSum / raN : null, rcN ? rcSum / rcN : null, rDays.size);

  // Roll-up injury — sum the per-team aggregate counts across the club.
  const rollInjSumm: InjurySummary = { out: 0, newRecent: 0, returnedRecent: 0 };
  for (const s of injByTeam.values()) { rollInjSumm.out += s.out; rollInjSumm.newRecent += s.newRecent; rollInjSumm.returnedRecent += s.returnedRecent; }
  const rollInjury = { ...injuryNarrative(rollInjSumm), ...rollInjSumm };

  return NextResponse.json({
    date: today,
    club: {
      name: teamsMeta.find((t) => t.club_short_name)?.club_short_name ?? null,
      teamCount: teams.length,
    },
    rollup: {
      availability: rollAvail,
      adherence: rollAdherence,
      confidence: confidenceFor(rollWithRead, rollSquad),
      verdict: verdict(rollAvail, rollAdherence),
      briefing: rollBrief.briefing,
      watch: rollBrief.watch,
      load: rollLoad,
      injury: rollInjury,
      trend: rollTrend,
    },
    teams,
    note: "Read-only management view. Aggregates only — no individual health or wellness data. Canonical readiness colour (v_coach_readiness_today_v8), counts only.",
  });
}
