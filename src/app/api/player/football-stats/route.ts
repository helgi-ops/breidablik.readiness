/**
 * /api/player/football-stats?season=2026
 *
 * GET — the PLAYER's OWN season football stats (Wyscout), curated to the ~10-15
 * that describe HIS position, plus the full metric set behind a details toggle.
 * Self-scoped: player_id comes from his auth, never a param — he only ever sees
 * himself. DESCRIPTIVE only — never touches the readiness colour or any decision.
 *
 * Returns { available:false } when this player has no imported season row (so the
 * card simply doesn't render for teams/players without Wyscout data).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import {
  sportPositionFamily,
  sportProfileMetricKeys,
  type SportStatInput,
} from "@/lib/micropulse/playerSportStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never statically cache — always read live DB

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const { data: p } = await sb
    .from("players").select("team_id, full_name, position").eq("id", playerId).maybeSingle();
  const teamId = (p?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ error: "Player not linked to a team" }, { status: 400 });
  const position = (p?.position as string | null) ?? null;

  const url = new URL(req.url);
  const seasonParam = (url.searchParams.get("season") || "").trim();

  // Resolve the season: explicit param if it has a row, else the player's latest
  // season with data (no hardcoded year that rots).
  const { data: seasonRows } = await sb
    .from("player_season_stats")
    .select("season")
    .eq("team_id", teamId).eq("player_id", playerId)
    .order("season", { ascending: false });
  const seasons = ((seasonRows ?? []) as Array<{ season: string }>).map((r) => String(r.season));
  if (seasons.length === 0) {
    return NextResponse.json({ available: false });
  }
  const season = (seasonParam && seasons.includes(seasonParam)) ? seasonParam : seasons[0];

  // A player can have MORE THAN ONE season row (the natural key includes source), so a
  // single-source club and a both-source club must both work. Fetch every source row for
  // the season and pick one — prefer Wyscout (the incumbent that feeds this card), fall
  // back to StatsBomb so a StatsBomb-only club's players still get their card. (Never use
  // .maybeSingle() here — it errors on a player with two source rows.)
  const { data: rows } = await sb
    .from("player_season_stats")
    .select("minutes, goals, assists, xg, shots, shots_on_target, pass_accuracy_pct, metrics, source, source_ref, synced_at, competition")
    .eq("team_id", teamId).eq("player_id", playerId).eq("season", season);
  const candidates = (rows ?? []) as Array<Record<string, unknown>>;
  if (candidates.length === 0) return NextResponse.json({ available: false });
  const SOURCE_PREF = ["wyscout_excel", "wyscout_api", "statsbomb_csv"];
  const rank = (s: unknown) => { const i = SOURCE_PREF.indexOf(String(s ?? "")); return i === -1 ? SOURCE_PREF.length : i; };
  const row = [...candidates].sort((a, b) => rank(a.source) - rank(b.source))[0];

  const r = row as Record<string, unknown>;
  const sport = await resolveTeamSport(sb, teamId);
  const metrics = (r.metrics as Record<string, number | string | null>) ?? {};
  const input: SportStatInput = {
    core: {
      minutes: num(r.minutes), goals: num(r.goals), assists: num(r.assists), xg: num(r.xg),
      shots: num(r.shots), shotsOnTarget: num(r.shots_on_target), passAccuracyPct: num(r.pass_accuracy_pct),
    },
    metrics,
  };

  // The client localizes the curated set + headline itself via the shared engine
  // (one source of truth), so the API stays language-agnostic — it ships the raw
  // inputs + position + sport, not pre-rendered strings.
  const family = sportPositionFamily(sport, position);

  // The full on-court/on-pitch metric set (profile/bio keys stripped) for the
  // details toggle — every number the source reported, so nothing feels hidden.
  const profileKeys = sportProfileMetricKeys(sport);
  const allMetrics = Object.entries(metrics)
    .filter(([k, v]) => !profileKeys.has(k) && v != null && v !== "")
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const minutes = num(r.minutes) ?? 0;
  const matches = num(metrics["Matches played"]) ?? num(metrics["Games"]) ?? 0;

  return NextResponse.json({
    available: true,
    season,
    sport,
    position,
    family,
    playerName: (p?.full_name as string | null) ?? null,
    core: input.core,   // client feeds these + metrics + position into the shared engine
    metrics,            // raw bag — client localizes the curated ids + renders allMetrics
    allMetrics,
    confidence: { matches: Math.round(matches), minutes: Math.round(minutes) },
    provenance: {
      source: r.source ?? "wyscout_excel",
      sourceRef: r.source_ref ?? null,
      syncedAt: r.synced_at ?? null,
      competition: r.competition ?? null,
    },
  });
}
