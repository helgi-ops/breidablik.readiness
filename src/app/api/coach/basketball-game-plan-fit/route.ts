export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/coach/basketball-game-plan-fit?styleTag=...
 *
 * Basketball Game-Plan Fit board. Per active player: does his role's skill profile FIT what
 * THIS opponent's style demands, and is he ready TODAY? Composes four transparent layers:
 *   1. role demand (position family → skill weights)
 *   2. opponent modifier (coach-selected style; defaults to balanced)
 *   3. player capacity (box-score skill percentiles WITHIN his position family)
 *   4. readiness (v_coach_readiness_today_v8.final_color)
 * Rules compute; ADVISORY ONLY — READ-ONLY, never writes and NEVER touches the readiness
 * verdict, the load target, or the daily decision.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { basketballPositionFamily, type BasketballFamily } from "@/lib/micropulse/playerBasketballStats";
import {
  computeBasketballFit, styleLabel, QUALITY_METRIC,
  type BStyleTag, type BQualityId, type FitRead,
} from "@/lib/micropulse/gamePlanFitBasketball";

type AuthProfile = { role: string | null; team_id: string | null };
const STYLE_TAGS: BStyleTag[] = ["three_heavy", "paint_heavy", "pressure", "fast_pace", "glass", "balanced"];
const QUALITIES = Object.keys(QUALITY_METRIC) as BQualityId[];

function env(name: string): string { const v = process.env[name]; if (!v) throw new Error(`Missing env: ${name}`); return v; }
function getAdminClient() { return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } }); }
function todayInReykjavik(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date()); }
function daysBefore(date: string, n: number): string { const d = new Date(`${date}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace("%", ""))) ? Number(v.replace("%", "")) : null);

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof, error: profErr } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  if (profErr) throw new Error(profErr.message);
  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

/** Rank-percentile (0-100) of x among vals: share strictly below + half the ties. */
function percentileOf(x: number, vals: number[]): number {
  if (vals.length <= 1) return 50; // single sample → neutral, never a fabricated extreme
  let below = 0, ties = 0;
  for (const v of vals) { if (v < x) below++; else if (v === x) ties++; }
  return ((below + 0.5 * ties) / vals.length) * 100;
}

const VERDICT_RANK: Record<FitRead["verdict"], number> = { poor: 0, caution: 1, unknown: 2, strong: 3 };

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();
    const url = new URL(req.url);
    const styleOverride = url.searchParams.get("styleTag");
    const usedTag: BStyleTag = styleOverride && STYLE_TAGS.includes(styleOverride as BStyleTag) ? (styleOverride as BStyleTag) : "balanced";
    const today = todayInReykjavik();

    // Squad (active) + season box-score metrics + readiness colour today, in parallel.
    const [{ data: playerRows }, { data: seasonRows }, { data: readinessRows }] = await Promise.all([
      sb.from("players").select("id, full_name, position, is_active").eq("team_id", teamId),
      sb.from("player_season_stats").select("player_id, metrics, source").eq("team_id", teamId).in("source", ["instat", "baskethotel"]),
      sb.from("v_coach_readiness_today_v8").select("player_id, final_color, is_imputed, entry_date")
        .eq("team_id", teamId).gte("entry_date", daysBefore(today, 5)).lte("entry_date", today).order("entry_date", { ascending: false }),
    ]);

    const roster = ((playerRows ?? []) as Array<Record<string, unknown>>)
      .filter((p) => (p as { is_active?: boolean | null }).is_active !== false)
      .map((p) => ({ id: String(p.id), name: (p.full_name as string) ?? "—", position: (p.position as string) ?? null }));

    // One season metrics row per player — prefer the richer InStat over baskethotel.
    const metricsBy = new Map<string, Record<string, unknown>>();
    for (const r of (seasonRows ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.player_id ?? ""); if (!pid) continue;
      const existing = metricsBy.get(pid);
      if (!existing || String(r.source) === "instat") metricsBy.set(pid, (r.metrics as Record<string, unknown>) ?? {});
    }

    // Readiness: most recent within 5 days; anything not today reads as an estimate.
    const readinessBy = new Map<string, { color: string | null; imputed: boolean }>();
    for (const r of (readinessRows ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.player_id ?? ""); if (!pid || readinessBy.has(pid)) continue;
      const stale = String(r.entry_date ?? "") !== today;
      readinessBy.set(pid, { color: (r.final_color as string) ?? null, imputed: r.is_imputed === true || stale });
    }

    // Per-player raw quality values, then percentiles WITHIN the position family.
    type PV = { id: string; family: BasketballFamily; values: Partial<Record<BQualityId, number>> };
    const pvs: PV[] = roster.map((p) => {
      const m = metricsBy.get(p.id) ?? {};
      const values: Partial<Record<BQualityId, number>> = {};
      for (const q of QUALITIES) { const v = num(m[QUALITY_METRIC[q]]); if (v != null) values[q] = v; }
      return { id: p.id, family: basketballPositionFamily(p.position), values };
    });
    // Family × quality value pools.
    const pool = new Map<string, number[]>();
    for (const pv of pvs) for (const q of QUALITIES) { const v = pv.values[q]; if (v != null) { const k = `${pv.family}|${q}`; (pool.get(k) ?? pool.set(k, []).get(k)!).push(v); } }
    const pctById = new Map<string, Partial<Record<BQualityId, number>>>();
    const coverageById = new Map<string, number>();
    for (const pv of pvs) {
      const pcts: Partial<Record<BQualityId, number>> = {};
      let covered = 0;
      for (const q of QUALITIES) {
        const v = pv.values[q];
        if (v == null) continue;
        covered++;
        pcts[q] = percentileOf(v, pool.get(`${pv.family}|${q}`) ?? [v]);
      }
      pctById.set(pv.id, pcts);
      coverageById.set(pv.id, covered / QUALITIES.length);
    }

    const rows: FitRead[] = roster.map((p) => {
      const rd = readinessBy.get(p.id) ?? { color: null, imputed: false };
      return computeBasketballFit({
        playerId: p.id, name: p.name, position: p.position,
        percentiles: pctById.get(p.id) ?? {}, coverageRatio: coverageById.get(p.id) ?? 0,
        readinessColor: rd.color, readinessImputed: rd.imputed, opponentTag: usedTag,
      });
    });
    rows.sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || a.name.localeCompare(b.name));

    return NextResponse.json({
      ok: true, generatedFor: today,
      opponentTag: { used: usedTag, label: styleLabel(usedTag) },
      styleTags: STYLE_TAGS.map((t) => ({ tag: t, label: styleLabel(t) })),
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg.includes("team") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
