/**
 * /api/coach/load-verdict?date=YYYY-MM-DD
 *
 * The explainability synthesis over Load Intelligence (spec step 2). Returns one
 * plain-language load verdict for the team + per-player exceptions, by feeding
 * the existing signal libs' outputs into the pure `loadVerdict` synthesis.
 *
 * REUSES (does not duplicate / does not modify): `computePlayerLoadAcwr`
 * (primary band driver), `computeFosterMetrics` (monotony), and the pure
 * `computeLoadVerdict`. Braking / HSR / HID / metabolic are expressed as a
 * recent-peak-vs-28-day-baseline z (no existing lib returns those in z form).
 * Coach/staff only (same auth pattern as ksi-report).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computePlayerLoadAcwr, type DailyLoad } from "@/lib/micropulse/playerLoadAcwr";
import { computeFosterMetrics } from "@/lib/micropulse/foster";
import { computeLoadVerdict, type LoadVerdictInput, type LoadVerdict } from "@/lib/micropulse/loadVerdict";
import { resolveCapabilities } from "@/lib/micropulse/interpretation/resolveCapabilities";

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

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

type Row = { date: string; pl: number | null; decel: number | null; hsr: number | null; dist: number | null; metabolic: number | null };

/** Recent-peak (last 7d) vs 28-day baseline z. null when baseline too thin. */
function spikeZ(rows: Row[], pick: (r: Row) => number | null, date: string): { value: number | null; z: number | null } {
  const recentFrom = addDays(date, -6), baseFrom = addDays(date, -34), baseTo = addDays(date, -7);
  const recent = rows.filter((r) => r.date >= recentFrom && r.date <= date).map(pick).filter((v): v is number => v != null && v > 0);
  const base = rows.filter((r) => r.date >= baseFrom && r.date <= baseTo).map(pick).filter((v): v is number => v != null && v > 0);
  if (!recent.length) return { value: null, z: null };
  const value = Math.max(...recent);
  if (base.length < 8) return { value: Math.round(value * 10) / 10, z: null };
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length);
  const z = sd > 0 ? Math.round(((value - mean) / sd) * 10) / 10 : null;
  return { value: Math.round(value * 10) / 10, z };
}

/** Foster monotony for a 7-day window ending `end`. */
function monotonyFor(rows: Row[], end: string): number | null {
  const from = addDays(end, -6);
  const loads = rows.filter((r) => r.date >= from && r.date <= end).map((r) => ({ date: r.date, load: r.pl ?? 0 }));
  return computeFosterMetrics(loads).monotony;
}

const SEVERITY: Record<LoadVerdict["band"], number> = { SPIKING: 3, BUILDING: 2, UNDER: 1, SUSTAINABLE: 0 };

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam && isIso(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const from = addDays(date, -34);

  const [playersRes, loadRes, caps] = await Promise.all([
    supabase.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true),
    supabase.from("player_external_load_daily")
      .select("player_id, date, total_player_load, decelerations, high_speed_distance, total_distance, metabolic_power")
      .eq("source", "catapult").eq("team_id", teamId).gte("date", from).lte("date", date).limit(5000),
    // Capability-driven confidence: which of the 5 interpretation dimensions this
    // club's signals actually support over the window (data, not tier). Same engine
    // for every tier; lower tiers simply cover fewer dimensions (shown honestly).
    resolveCapabilities(supabase, teamId, { from, to: date }),
  ]);
  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 });

  const players = (playersRes.data ?? []) as Array<{ id: string; full_name: string | null }>;
  const byPlayer = new Map<string, Row[]>();
  for (const r of (loadRes.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(r.player_id);
    if (!byPlayer.has(id)) byPlayer.set(id, []);
    byPlayer.get(id)!.push({ date: String(r.date), pl: num(r.total_player_load), decel: num(r.decelerations), hsr: num(r.high_speed_distance), dist: num(r.total_distance), metabolic: num(r.metabolic_power) });
  }

  const perPlayer: Array<{ player_id: string; name: string; verdict: LoadVerdict }> = [];
  for (const p of players) {
    const rows = (byPlayer.get(p.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) continue;
    const acwrPayload = computePlayerLoadAcwr(rows.map((r): DailyLoad => ({ date: r.date, load: r.pl })), date);
    if (acwrPayload.daysObserved === 0) continue; // no real sessions in window — skip

    const thisMono = monotonyFor(rows, date);
    const lastMono = monotonyFor(rows, addDays(date, -7));
    const braking = spikeZ(rows, (r) => r.decel, date);
    const hsr = spikeZ(rows, (r) => r.hsr, date);
    const hid = spikeZ(rows, (r) => (r.hsr != null && r.dist != null && r.dist > 0 ? (r.hsr / r.dist) * 100 : null), date);
    const metabolic = spikeZ(rows, (r) => r.metabolic, date);

    const input: LoadVerdictInput = {
      subject: { name: (p.full_name ?? "—").trim().split(" ")[0] },
      acwr: { ratio: acwrPayload.ratio, band: acwrPayload.band, daysObserved: acwrPayload.daysObserved },
      braking, hsr, hid, metabolic,
      monotony: { monotony: thisMono, strain: null, rising: thisMono != null && lastMono != null && thisMono > lastMono },
    };
    perPlayer.push({ player_id: p.id, name: (p.full_name ?? "—").trim(), verdict: computeLoadVerdict(input) });
  }

  // ── Team verdict: squad-level band + named per-player exceptions ──
  const n = perPlayer.length || 1;
  const counts = { SPIKING: 0, BUILDING: 0, UNDER: 0, SUSTAINABLE: 0 } as Record<LoadVerdict["band"], number>;
  for (const p of perPlayer) counts[p.verdict.band]++;
  const exceptions = perPlayer
    .filter((p) => p.verdict.band !== "SUSTAINABLE")
    .sort((a, b) => SEVERITY[b.verdict.band] - SEVERITY[a.verdict.band]);

  // Squad band: a band the squad collectively sits in (≥25% of players), else sustainable.
  let teamBand: LoadVerdict["band"] = "SUSTAINABLE";
  for (const b of ["SPIKING", "BUILDING", "UNDER"] as const) { if (counts[b] / n >= 0.25) { teamBand = b; break; } }

  const spiking = perPlayer.filter((p) => p.verdict.band === "SPIKING");
  const topDriver = spiking[0]?.verdict.drivers[0]?.plain ?? null;
  const names = spiking.map((p) => p.name.split(" ")[0]);
  const teamSentence = {
    EN: `Squad load is ${teamBand.toLowerCase()} this week${spiking.length ? `; ${spiking.length} player${spiking.length > 1 ? "s" : ""} carrying ${topDriver?.EN ?? "elevated load"} — ${names.join(", ")}` : ""}.`,
    IS: `Álag liðsins er ${teamBand === "SPIKING" ? "að rjúka upp" : teamBand === "BUILDING" ? "að byggjast upp" : teamBand === "UNDER" ? "undir grunnlínu" : "sjálfbært"} þessa viku${spiking.length ? `; ${spiking.length} leikm. með ${topDriver?.IS ?? "hækkað álag"} — ${names.join(", ")}` : ""}.`,
  };
  const avgCoverage = perPlayer.length ? Math.round((perPlayer.reduce((s, p) => s + p.verdict.confidence.coverage, 0) / perPlayer.length) * 100) / 100 : 0;
  const minBaseline = perPlayer.length ? Math.min(...perPlayer.map((p) => p.verdict.confidence.baselineDays)) : 0;

  // Confidence is now capability-driven: dimensionsCovered/5 + baseline maturity
  // (docs/interpretation-architecture.md, step 4). A Core club covering 4/5
  // dimensions reads lower than a Pro club at 5/5 — honestly, not faked.
  const dimsCovered = caps.dimensionsCovered;
  const dimCoverage = dimsCovered / 5;
  const confLevel = dimCoverage >= 0.66 && minBaseline >= 19 ? "high"
    : dimCoverage >= 0.5 && minBaseline >= 8 ? "moderate" : "low";

  return NextResponse.json({
    date,
    team: {
      band: teamBand,
      sentence: teamSentence,
      counts,
      confidence: {
        level: confLevel,
        coverage: avgCoverage,            // legacy signal coverage (kept for compatibility)
        baselineDays: minBaseline,
        dimensionsCovered: dimsCovered,   // n of 5 interpretation dimensions
        dimensionsTotal: 5,
        dimensions: caps.dimensions,      // best metric chosen per dimension (drill-down)
      },
    },
    exceptions,
    players: perPlayer.sort((a, b) => SEVERITY[b.verdict.band] - SEVERITY[a.verdict.band] || a.name.localeCompare(b.name, "is")),
  });
}
