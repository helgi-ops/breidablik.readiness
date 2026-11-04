/**
 * /api/coach/player/[id]/train-vs-play-shape
 *
 * GET — the "train like you play" MOVEMENT SHAPE read: the player's IMA directional
 * fingerprint in GAMES vs in TRAINING. Does his training reproduce the directions he
 * actually moves in during matches? Sums ima_clock_gen2 over match days and over
 * training days separately, normalizes each to a 12-direction share vector, and scores
 * the gap (compareShapes / TVD) + which directions training under/over-represents.
 *
 * Match vs training split mirrors the Train-like-you-Play route and seasonTrends loader:
 * a day is a MATCH if its date is in match_schedule ∪ match_player_minutes (≥20 min when
 * minutes are entered), else a TRAINING day when the session is ≥20 min. Load per minute
 * is computed only over clock-bearing rows so the denominator matches the grids.
 *
 * Descriptive movement-shape signal — rules compute, not AI; never touches readiness.
 * Returns structured fields (not a prebuilt sentence) so the card composes EN/IS itself.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import {
  compareShapes, gridShares, directionalMechLoad, DIRECTIONS, type ClockGrid,
} from "@/lib/micropulse/directionalSignature";
import { sumClocks } from "@/lib/micropulse/peakMovementSignature";

export const runtime = "nodejs";

const MIN_MATCH_MIN = 20;
const MIN_TRAIN_MIN = 20;
const MIN_MATCHES_CONFIDENT = 5; // same threshold seasonTrends uses to scope to matches
const TVD_FLAG = 0.2;            // ~20% of his movement in different directions = a notable gap

type Row = {
  date: string;
  ima_clock_gen2: ClockGrid | null;
  session_duration_minutes: number | string | null;
  fmp_total_duration_s: number | string | null;
};

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
/** Minutes for a daily row: session_duration_minutes, else fmp_total_duration_s / 60 (the reliable feed). */
const minutesOf = (r: Row): number | null => num(r.session_duration_minutes) ?? (num(r.fmp_total_duration_s) != null ? (r.fmp_total_duration_s as number) / 60 : null);
/** load.perDirection → Record<dir, share> for the load-shape radar. */
const loadShareMap = (ml: ReturnType<typeof directionalMechLoad>): Record<string, number> | null =>
  ml ? Object.fromEntries(ml.perDirection.map((d) => [d.dir, d.share])) : null;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { data: player } = await sb.from("players").select("id, full_name, position").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
  const p = player as { id: string; full_name: string | null; position: string | null };

  const today = new Date().toISOString().slice(0, 10);
  const sinceDays = Math.max(30, Math.min(400, Number(new URL(req.url).searchParams.get("days")) || 300));
  const since = new Date(Date.parse(today + "T00:00:00Z") - sinceDays * 86_400_000).toISOString().slice(0, 10);

  const [{ data: rowsData }, { data: minData }, { data: schedData }] = await Promise.all([
    sb.from("player_external_load_daily")
      .select("date, ima_clock_gen2, session_duration_minutes, fmp_total_duration_s")
      .eq("player_id", playerId).gte("date", since).lte("date", today)
      .order("date", { ascending: false }),
    sb.from("match_player_minutes").select("match_date, minutes_played, is_dnp").eq("player_id", playerId).gte("match_date", since),
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", since),
  ]);

  // Match calendar: scheduled dates ∪ dates with entered minutes. Qualifying appearance = ≥20 min
  // when minutes exist; where no minutes are entered a scheduled-date session ≥20 min is the appearance.
  const scheduledDates = new Set(((schedData ?? []) as Array<{ match_date: string | null }>).map((m) => m.match_date).filter(Boolean) as string[]);
  const minByDate = new Map<string, { minutes: number; dnp: boolean }>();
  for (const m of (minData ?? []) as Array<{ match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    minByDate.set(m.match_date, { minutes: m.minutes_played ?? 0, dnp: !!m.is_dnp });
  }
  const matchDates = new Set<string>([...scheduledDates, ...minByDate.keys()]);

  const rows = (rowsData ?? []) as Row[];
  const matchGrids: Array<ClockGrid | null> = [];
  const trainGrids: Array<ClockGrid | null> = [];
  let matchMin = 0, trainMin = 0;
  const matchDaysWithClock = new Set<string>();
  const trainDaysWithClock = new Set<string>();

  for (const r of rows) {
    const mins = minutesOf(r);
    const hasClock = r.ima_clock_gen2 != null;
    if (matchDates.has(r.date)) {
      // A match day. If minutes were entered, require a real appearance (≥20, not DNP); else fall
      // back to the session length on a scheduled date.
      const entered = minByDate.get(r.date);
      const appMin = entered ? (entered.dnp ? 0 : entered.minutes) : (mins ?? 0);
      if (appMin < MIN_MATCH_MIN) continue;
      matchGrids.push(r.ima_clock_gen2);
      if (hasClock) { matchMin += appMin; matchDaysWithClock.add(r.date); }
    } else {
      // A training day.
      if ((mins ?? 0) < MIN_TRAIN_MIN) continue;
      trainGrids.push(r.ima_clock_gen2);
      if (hasClock) { trainMin += mins as number; trainDaysWithClock.add(r.date); }
    }
  }

  const gameVector = gridShares(sumClocks(matchGrids));
  const trainVector = gridShares(sumClocks(trainGrids));
  const hasData = !!gameVector && !!trainVector;

  if (!hasData) {
    return NextResponse.json({
      ok: true, player_id: playerId, name: p.full_name, position: p.position, hasData: false,
      nMatchesWithClock: matchDaysWithClock.size, nTrainWithClock: trainDaysWithClock.size,
    });
  }

  const gameLoad = directionalMechLoad(matchGrids, matchMin || null);
  const trainLoad = directionalMechLoad(trainGrids, trainMin || null);
  const cmp = compareShapes(gameVector, trainVector);

  // Where he moves MOST in games — the shape he should be reproducing.
  const topGameDir = [...cmp.perDirection].sort((a, b) => b.game - a.game)[0] ?? null;
  const topTrainDir = [...cmp.perDirection].sort((a, b) => b.train - a.train)[0] ?? null;
  // Per-minute mechanical-load gap: does he cut as HARD (per minute) in training as in games?
  const loadPerMinRatio = gameLoad?.perMinTotal && trainLoad?.perMinTotal
    ? Math.round((trainLoad.perMinTotal / gameLoad.perMinTotal) * 100) / 100
    : null;

  const nMatches = matchDaysWithClock.size;
  const confident = nMatches >= MIN_MATCHES_CONFIDENT;
  const calibrating = nMatches >= 2 && nMatches < MIN_MATCHES_CONFIDENT;
  const flagged = confident && cmp.tvd != null && cmp.tvd >= TVD_FLAG;

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    name: p.full_name,
    position: p.position,
    hasData: true,
    nMatchesWithClock: nMatches,
    nTrainWithClock: trainDaysWithClock.size,
    confident, calibrating, flagged,
    tvdFlag: TVD_FLAG,
    tvd: cmp.tvd,
    gameVector, trainVector,
    gameLoadShare: loadShareMap(gameLoad),
    trainLoadShare: loadShareMap(trainLoad),
    gameLoadPerMin: gameLoad?.perMinTotal ?? null,
    trainLoadPerMin: trainLoad?.perMinTotal ?? null,
    loadPerMinRatio,
    perDirection: cmp.perDirection,
    underTrained: cmp.underTrained,
    overTrained: cmp.overTrained,
    topGameDir, topTrainDir,
    directionsOrder: DIRECTIONS,
    note: "IMA movement shape in games vs training (12 clock directions). Descriptive movement-behaviour signal, not an injury prediction; never the readiness colour.",
  });
}
