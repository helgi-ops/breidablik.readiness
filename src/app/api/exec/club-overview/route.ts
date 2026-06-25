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

type Avail = { cleared: number; managed: number; unavailable: number; total: number };
const emptyAvail = (): Avail => ({ cleared: 0, managed: 0, unavailable: 0, total: 0 });

type ConfidenceLevel = "high" | "moderate" | "low";
function confidenceFor(withRead: number, squad: number): { level: ConfidenceLevel; coverage: number } {
  const coverage = squad > 0 ? Math.round((withRead / squad) * 100) / 100 : 0;
  const level: ConfidenceLevel = coverage >= 0.8 ? "high" : coverage >= 0.5 ? "moderate" : "low";
  return { level, coverage };
}

const COVERAGE_GATE = 0.5; // below this, too few readings to call squad availability

function verdict(a: Avail, adh: { withRead: number; squad: number; pct: number | null }): { EN: string; IS: string } {
  const { withRead, squad, pct } = adh;
  if (withRead === 0) {
    return { EN: "No readings in yet today — check-ins still coming.", IS: "Engir lestrar komnir í dag — innskráningar enn að berast." };
  }
  // Coverage gate: don't claim a squad-wide verdict off a handful of players —
  // lead with the data gap so "strong" never appears on 2-of-23 coverage.
  const coverage = squad > 0 ? withRead / squad : 1;
  if (coverage < COVERAGE_GATE) {
    return {
      EN: `Only ${withRead} of ${squad} players have a reading today (${pct}%) — too few to judge availability yet.`,
      IS: `Aðeins ${withRead} af ${squad} leikmönnum með lestur í dag (${pct}%) — of fáir til að meta mönnun.`,
    };
  }
  const clearedPct = a.total ? a.cleared / a.total : 0;
  const wordEN = clearedPct >= 0.8 ? "strong" : clearedPct >= 0.6 ? "solid" : clearedPct >= 0.4 ? "mixed" : "stretched";
  const wordIS = clearedPct >= 0.8 ? "sterk" : clearedPct >= 0.6 ? "góð" : clearedPct >= 0.4 ? "blönduð" : "tæp";
  const flagged = a.managed + a.unavailable;
  const tailEN = flagged === 0 ? "all assessed players cleared" : `${a.managed} managed${a.unavailable ? `, ${a.unavailable} unavailable` : ""}`;
  const tailIS = flagged === 0 ? "allir metnir klárir" : `${a.managed} í stýringu${a.unavailable ? `, ${a.unavailable} ófáanleg` : ""}`;
  return {
    EN: `Squad availability ${wordEN}; ${tailEN}. ${pct}% checked in.`,
    IS: `Mönnun liðs ${wordIS}; ${tailIS}. ${pct}% innskráð.`,
  };
}

type ViewRow = { team_id: string; entry_date: string; final_color: unknown; final_flag: unknown };

export async function GET(req: NextRequest) {
  const ctx = await authenticateExec(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamIds } = ctx;

  const today = new Date().toISOString().slice(0, 10);
  const trendFrom = addDaysISO(today, -42); // ~6 weeks

  const [teamsRes, playersRes, viewRes] = await Promise.all([
    supabase.from("teams").select("id, name, gender, team_type, club_short_name").in("id", teamIds),
    supabase.from("players").select("team_id").in("team_id", teamIds).eq("is_active", true),
    supabase.from("v_coach_readiness_today_v8").select("team_id, entry_date, final_color, final_flag").in("team_id", teamIds).gte("entry_date", trendFrom).lte("entry_date", today),
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

  const teams = teamsMeta.map((t) => {
    const today_ = todayByTeam.get(t.id) ?? { ...emptyAvail(), withRead: 0 };
    const squad = squadByTeam.get(t.id) ?? today_.withRead;
    const adherencePct = squad > 0 ? Math.round((today_.withRead / squad) * 100) : null;
    const avail: Avail = { cleared: today_.cleared, managed: today_.managed, unavailable: today_.unavailable, total: today_.total };
    return {
      teamId: t.id,
      name: t.name ?? "—",
      gender: t.gender,
      teamType: t.team_type,
      availability: avail,
      adherence: { withRead: today_.withRead, squad, pct: adherencePct },
      confidence: confidenceFor(today_.withRead, squad),
      verdict: verdict(avail, { withRead: today_.withRead, squad, pct: adherencePct }),
      trend: buildTrend(trendByTeam.get(t.id)),
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

  return NextResponse.json({
    date: today,
    club: {
      name: teamsMeta.find((t) => t.club_short_name)?.club_short_name ?? null,
      teamCount: teams.length,
    },
    rollup: {
      availability: rollAvail,
      adherence: { withRead: rollWithRead, squad: rollSquad, pct: rollAdherencePct },
      confidence: confidenceFor(rollWithRead, rollSquad),
      verdict: verdict(rollAvail, { withRead: rollWithRead, squad: rollSquad, pct: rollAdherencePct }),
      trend: buildTrend(rollTrendAcc),
    },
    teams,
    note: "Read-only management view. Aggregates only — no individual health or wellness data. Canonical readiness colour (v_coach_readiness_today_v8), counts only.",
  });
}
