import "server-only";

/**
 * Long runs for one team on one day — the "Long runs" card on IMA Intelligence.
 *
 *  - Today: each player's long runs (bouts ≥18 s, time in them, longest band, stride length when GPS).
 *  - Reference: the player's own near-full matches (selectNearFullMatches, the periodization rule), else the
 *    team's near-full matches. Bouts and time compare indoors too; stride length only on GPS days.
 *  - Stride length, training vs match: median metres per stride in long runs over the player's GPS training
 *    days of the last 8 weeks against the median in his near-full matches.
 *  - Band check: are this club's Free Running bands time bands at all (bandsAreTimeBands)?
 *  - Per band (5–8): runs · time · distance · strides for each player and summed for the team (longRunBandsOf),
 *    the four variables OpenField reports per band, side by side.
 *  - Pace: how many of the long runs were at match pace (11 km/h+, `matchPace`), today and in his matches. In training
 *    most long runs are jogs, so the count alone says little about running load (docs/ima-free-running-bands.md).
 *  - No volume-change ratio since 10 Nov 2026: on all long runs it flagged jog days, at match pace it follows match
 *    minutes (replay in ./signalLoad.ts). The card shows the numbers, not an alarm.
 *
 * READ-ONLY / descriptive — never the readiness colour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectNearFullMatches } from "@/lib/micropulse/periodization";
import { oneRowPerPlayerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { EXCLUDE_PREV_CLUB_OR } from "@/lib/micropulse/load/previousClub";
import { bandsAreTimeBands, hasGpsReading, longRunBandsOf, longRunsOf, sumLongRunBands, type LongRunBand, type LongRuns } from "./index";
import { frReadingOf } from "@/lib/integrations/catapult/freeRunningBands";

const DAY = 86_400_000;
const LOOKBACK_DAYS = 200;        // match reference window (selectNearFullMatches narrows to ~11 weeks)
const TRAIN_WEEKS = 8;            // training stride-length window
const OWN_REF_MIN = 3;            // fewer own near-full matches → team reference
const MIN_STRIDES = 50;           // a stride length needs this many strides in long runs (as strideLength.ts)
const NO_READING_DAYS = 28;       // window for the "long runs can't be read" list

// All 8 bands + the row's edges: which bands hold runs ≥18 s depends on the edges the row was classified with.
const BAND_COLS = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((b) => [`ima_fr_band${b}_event_count`, `ima_fr_band${b}_total_duration`, `ima_fr_band${b}_stride_count`, `ima_fr_band${b}_total_distance`]);
const TIER_COLS = ["event_count", "total_duration", "stride_count", "total_distance"].map((k) => `ima_fr_ge18_${k}`);
// The match-pace split the DB trigger stores (team floor applied); matchPaceOf falls back to the bands without them.
const MP_COLS = ["event_count", "total_duration", "stride_count", "total_distance"].map((k) => `ima_fr_ge18_mp_${k}`);
const COLS = ["player_id", "date", "source", "total_distance", "ima_fr_band58_total_distance", "ima_fr_band_bounds", "ima_fr_bounds_source", ...TIER_COLS, ...MP_COLS, ...BAND_COLS].join(", ");

export type LongRunRow = Record<string, unknown> & { player_id: string; date: string; source: string | null };
type Row = LongRunRow;

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const roundOrNull = (x: number | null): number | null => (x == null ? null : Math.round(x));
const pct = (a: number | null, ref: number | null): number | null => (a != null && ref != null && ref > 0 ? Math.round((a / ref) * 100) : null);

export type LongRunRef = {
  bouts: number | null; seconds: number | null; metresPerStride: number | null;
  /** Median long runs at match pace in those matches (GPS matches only). */
  mpBouts: number | null;
  nMatches: number; source: "own" | "team" | null;
};

export type PlayerLongRuns = {
  playerId: string; name: string;
  today: LongRuns;
  ref: LongRunRef;
  /** Today's bouts / time as % of the reference match. */
  pctBouts: number | null; pctSeconds: number | null;
  /** Training stride length in long runs (median, last 8 weeks, GPS days) as % of the match stride length. */
  strideVsMatchPct: number | null; strideTrainM: number | null; strideMatchM: number | null; strideTrainDays: number;
  /** Today's long runs at match pace as % of his match's (null = pace unknown or no reference). */
  pctMpBouts: number | null;
  /** Today's bands 5–8: runs · time · distance (GPS) · strides. */
  bands: LongRunBand[];
};

export type TeamLongRuns = {
  date: string;
  isMatchDay: boolean;
  /** null = no row carried bout counts (the team's sync has no FR durations/events yet). */
  bandsAreTimeBands: boolean | null;
  players: PlayerLongRuns[];
  team: {
    n: number; bouts: number | null; seconds: number | null; meanBoutS: number | null;
    pctBouts: number | null; pctSeconds: number | null; strideVsMatchPct: number | null;
    gpsToday: boolean;
    /** Bands 5–8 summed over the players; distance and m/stride over GPS players only. */
    bands: LongRunBand[];
    /** Per-player medians for the plain first line: today's long runs and those at match pace, and the same in his matches. */
    perPlayer: { bouts: number | null; mpBouts: number | null; refBouts: number | null; refMpBouts: number | null; nPace: number };
  };
  /**
   * Players whose long runs can't be read in the last 28 days: their sessions were classified with edges
   * that have no 18 s edge ("catapult_default" = Catapult's 3-band default in OpenField) or that fit no
   * known config. They read as "no reading", never as 0 long runs. Fixed in OpenField, then reprocessed.
   */
  noReading: Array<{ playerId: string; name: string; reason: "catapult_default" | "unknown_edges"; sessions: number; from: string; to: string }>;
};

/**
 * The squad's rows for the window, previous-club rows dropped (team roll-up). `EXCLUDE_PREV_CLUB_OR` filters on the
 * `is_previous_club` column (migration 20261107190000), so it costs nothing — never filter on the raw_payload_json key,
 * which detoasts every ~11 KB payload (4.5 s vs 46 ms for 200 days). Exported for the Today coach-signal loader
 * (`./signalLoad.ts`) so both read the same rows the same way.
 */
export async function fetchRows(sb: SupabaseClient, playerIds: string[], from: string, to: string): Promise<Row[]> {
  const out: Row[] = []; const PAGE = 1000;
  for (let page = 0; page < 20; page++) {
    const { data, error } = await sb.from("player_external_load_daily").select(COLS)
      .in("player_id", playerIds).in("source", ["catapult", "manual"]).or(EXCLUDE_PREV_CLUB_OR)
      .gte("date", from).lte("date", to)
      .order("date", { ascending: true }).order("player_id", { ascending: true }).order("source", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return oneRowPerPlayerDate(out);
}

export async function loadTeamLongRuns(sb: SupabaseClient, teamId: string, date: string): Promise<TeamLongRuns> {
  const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (roster ?? []) as Array<{ id: string; full_name: string | null }>;
  const playerIds = players.map((p) => p.id);
  const empty: TeamLongRuns = { date, isMatchDay: false, bandsAreTimeBands: null, players: [], noReading: [], team: { n: 0, bouts: null, seconds: null, meanBoutS: null, pctBouts: null, pctSeconds: null, strideVsMatchPct: null, gpsToday: false, bands: sumLongRunBands([]), perPlayer: { bouts: null, mpBouts: null, refBouts: null, refMpBouts: null, nPace: 0 } } };
  if (!playerIds.length) return empty;

  const from = addDays(date, -LOOKBACK_DAYS);
  const [{ data: sched }, { data: mins }, rows] = await Promise.all([
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", date),
    sb.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", from).lte("match_date", date),
    fetchRows(sb, playerIds, from, date),
  ]);
  const matchSet = new Set<string>(((sched ?? []) as Array<{ match_date: string }>).map((s) => s.match_date));
  const minutesByKey = new Map<string, number>();
  for (const m of (mins ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    matchSet.add(m.match_date);
    minutesByKey.set(`${m.player_id}|${m.match_date}`, m.is_dnp ? 0 : (m.minutes_played ?? 0));
  }
  const isMatchDay = matchSet.has(date);
  const asOfMs = Date.parse(`${date}T00:00:00Z`);
  const trainFrom = addDays(date, -TRAIN_WEEKS * 7);
  const readFrom = addDays(date, -(NO_READING_DAYS - 1));

  // Match reference per player (own near-full matches), and the team pool.
  type MRow = { date: string; minutes: number | null; lr: LongRuns };
  const matchRows = new Map<string, MRow[]>();
  const trainRows = new Map<string, LongRuns[]>();
  for (const r of rows) {
    if (r.date === date) continue;
    const lr = longRunsOf(r);
    if (matchSet.has(r.date)) {
      const minutes = minutesByKey.get(`${r.player_id}|${r.date}`) ?? null;
      if (!matchRows.has(r.player_id)) matchRows.set(r.player_id, []);
      matchRows.get(r.player_id)!.push({ date: r.date, minutes, lr });
    } else if (r.date >= trainFrom) {
      if (!trainRows.has(r.player_id)) trainRows.set(r.player_id, []);
      trainRows.get(r.player_id)!.push(lr);
    }
  }
  const teamPool: MRow[] = [];
  const ownSel = new Map<string, MRow[]>();
  for (const [pid, prs] of matchRows) { const sel = selectNearFullMatches(prs, { asOfMs }).use; ownSel.set(pid, sel); teamPool.push(...sel); }
  const refOf = (sel: MRow[], source: "own" | "team"): LongRunRef => ({
    bouts: median(sel.map((m) => m.lr.bouts).filter((x): x is number => x != null && x > 0)),
    seconds: median(sel.map((m) => m.lr.seconds).filter((x): x is number => x != null && x > 0)),
    metresPerStride: median(sel.filter((m) => (m.lr.strides ?? 0) >= MIN_STRIDES).map((m) => m.lr.metresPerStride).filter((x): x is number => x != null && x > 0)),
    mpBouts: median(sel.map((m) => m.lr.matchPace?.bouts).filter((x): x is number => x != null)),
    nMatches: sel.length, source,
  });
  const teamRef = refOf(teamPool, "team");

  // Players whose recent sessions can't give a long-run reading (edges without an 18 s edge).
  const nameOf = (id: string) => (players.find((p) => p.id === id)?.full_name ?? "—").trim();
  const unread = new Map<string, { reason: "catapult_default" | "unknown_edges"; sessions: number; from: string; to: string }>();
  for (const r of rows) {
    if (r.date < readFrom) continue;
    const reading = frReadingOf(r);
    if (reading !== "catapult_default" && reading !== "unknown_edges") continue;
    const u = unread.get(r.player_id);
    if (u) { u.sessions += 1; u.to = r.date; if (reading === "unknown_edges") u.reason = reading; }
    else unread.set(r.player_id, { reason: reading, sessions: 1, from: r.date, to: r.date });
  }
  const noReading = [...unread.entries()]
    .map(([playerId, u]) => ({ playerId, name: nameOf(playerId), ...u }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const out: PlayerLongRuns[] = [];
  for (const r of rows.filter((x) => x.date === date)) {
    const today = longRunsOf(r);
    if (today.bouts == null && today.strides == null) continue;
    const own = ownSel.get(r.player_id) ?? [];
    const ref: LongRunRef = own.length >= OWN_REF_MIN ? refOf(own, "own") : teamPool.length ? teamRef : { bouts: null, seconds: null, metresPerStride: null, mpBouts: null, nMatches: 0, source: null };
    const trainStride = (trainRows.get(r.player_id) ?? []).filter((t) => (t.strides ?? 0) >= MIN_STRIDES && t.metresPerStride != null).map((t) => t.metresPerStride as number);
    const strideTrainM = median(trainStride);
    out.push({
      playerId: r.player_id, name: (players.find((p) => p.id === r.player_id)?.full_name ?? "—").trim(), today, ref,
      pctBouts: pct(today.bouts, ref.bouts), pctSeconds: pct(today.seconds, ref.seconds),
      strideTrainM, strideMatchM: ref.metresPerStride, strideTrainDays: trainStride.length,
      strideVsMatchPct: pct(strideTrainM, ref.metresPerStride),
      pctMpBouts: pct(today.matchPace?.bouts ?? null, ref.mpBouts),
      bands: longRunBandsOf(r),
    });
  }
  out.sort((a, b) => (b.today.bouts ?? -1) - (a.today.bouts ?? -1) || a.name.localeCompare(b.name));

  const withBouts = out.filter((p) => p.today.bouts != null);
  const sum = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const bouts = sum(withBouts.map((p) => p.today.bouts)), seconds = sum(withBouts.map((p) => p.today.seconds));
  return {
    date, isMatchDay,
    bandsAreTimeBands: bandsAreTimeBands(rows.filter((x) => x.date >= trainFrom && frReadingOf(x) === "ok")),
    players: out,
    noReading,
    team: {
      n: out.length, bouts, seconds,
      meanBoutS: bouts != null && seconds != null && bouts > 0 ? seconds / bouts : null,
      pctBouts: roundOrNull(median(withBouts.map((p) => p.pctBouts).filter((x): x is number => x != null))),
      pctSeconds: roundOrNull(median(withBouts.map((p) => p.pctSeconds).filter((x): x is number => x != null))),
      strideVsMatchPct: roundOrNull(median(out.map((p) => p.strideVsMatchPct).filter((x): x is number => x != null))),
      gpsToday: out.some((p) => p.today.distanceM != null),
      bands: sumLongRunBands(out.map((p) => p.bands)),
      perPlayer: (() => {
        // Pace needs GPS: the match-pace medians use the players with a pace reading today.
        const paced = withBouts.filter((p) => p.today.matchPace != null);
        const med = (xs: Array<number | null | undefined>) => roundOrNull(median(xs.filter((x): x is number => x != null)));
        return {
          bouts: med(withBouts.map((p) => p.today.bouts)),
          mpBouts: med(paced.map((p) => p.today.matchPace?.bouts)),
          refBouts: med(withBouts.map((p) => p.ref.bouts)),
          refMpBouts: med(paced.map((p) => p.ref.mpBouts)),
          nPace: paced.length,
        };
      })(),
    },
  };
}
