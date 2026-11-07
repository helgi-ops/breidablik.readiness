import "server-only";

/**
 * Tokenless loader for "Did we do enough?" (sb + teamId + sessionDate) — shared by the
 * Post-Training page route and the Today coach-signal compute.
 *
 *  - Gate: football + Vector Pro (Catapult tier "full").
 *  - Match reference: each player's own near-full matches (selectNearFullMatches — the same rule as
 *    the periodization match unit), else the team's near-full matches.
 *  - MD-day: coach's Week setup first (resolveMdContext), then the fixture list (sizes long-run distance + strides — IMA FR bands 5–8 = runs ≥18 s, not sprinting).
 *  - Day-type: Meso activation/top-up label → Week-setup pitch stimulus → Meso stimulus → MD+1 default
 *    (decides WHAT is judged, and sizes Acc/Dec/CoD from the calendar's standard).
 *  - Session: one effective row per player (manual overrides pod), previous-club rows excluded.
 *
 * READ-ONLY / descriptive — never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatapultDataTier } from "@/lib/micropulse/catapultTier";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import { resolveMdContext } from "@/lib/micropulse/loadPlan/forTeam";
import { mdOffsetForDate } from "@/lib/micropulse/readinessOutlook/assemble";
import { labelForOffset, mdOffset } from "@/lib/micropulse/periodization/periodizationModel";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { selectNearFullMatches } from "@/lib/micropulse/periodization";
import { oneRowPerPlayerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { EXCLUDE_PREV_CLUB_OR } from "@/lib/micropulse/load/previousClub";
import { imaCodTotal } from "@/lib/micropulse/catapultCapability";
import { hasGpsReading, longRunsOf } from "@/lib/micropulse/longRuns";
import {
  buildSessionEnough, emptyEnough, ENOUGH_VARS, dayTypeFromText, type EnoughDayType,
  type EnoughPlayerInput, type EnoughVar, type SessionEnough, type VarValues,
} from "@/lib/micropulse/sessionEnough";

const DAY = 86_400_000;
const LOOKBACK_DAYS = 200;      // match-reference window (selectNearFullMatches narrows to ~11 weeks)
const MIN_TRAIN_MIN = 20;       // shorter rows are not a training session
const PARTIAL_SHARE = 0.6;      // < 60% of the squad's median duration = shortened session
const OWN_REF_MIN = 3;          // fewer own near-full matches → use the team reference

const COLS = "player_id, date, source, ima_accel, ima_decel, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, total_distance, ima_fr_band58_total_distance, ima_fr_band5_event_count, ima_fr_band6_event_count, ima_fr_band7_event_count, ima_fr_band8_event_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, fmp_total_duration_s, total_player_load, player_load_per_minute, session_duration_minutes";

type Row = Record<string, unknown> & { player_id: string; date: string; source: string | null };

const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const sumOrNull = (vals: Array<number | null>): number | null => {
  const v = vals.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) : null;
};
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The six IMA variables from one load row. CoD = the six left/right columns (same as post-training/TLYP).
 *  Long-run distance needs GPS: indoors the pod stores 0, which is a missing reading, not a 0 m session. */
export function varsOf(r: Record<string, unknown>): VarValues {
  return {
    imaAccel: num(r.ima_accel),
    imaDecel: num(r.ima_decel),
    imaCod: imaCodTotal(r),
    frDistance: hasGpsReading(r) ? num(r.ima_fr_band58_total_distance) : null,
    strideHi: sumOrNull([r.ima_fr_band6_stride_count, r.ima_fr_band7_stride_count, r.ima_fr_band8_stride_count].map(num)),
    longRuns: longRunsOf(r).bouts,
  };
}

/** Session minutes: FMP duration (Pro), else Player Load ÷ PL/min, else the pod's session length. */
function durationMin(r: Record<string, unknown>): number {
  const fmp = num(r.fmp_total_duration_s) ?? 0;
  if (fmp > 0) return fmp / 60;
  const tpl = num(r.total_player_load) ?? 0, plpm = num(r.player_load_per_minute) ?? 0;
  if (tpl > 0 && plpm > 0) return tpl / plpm;
  return num(r.session_duration_minutes) ?? 0;
}

async function fetchRows(sb: SupabaseClient, playerIds: string[], filter: { dates?: string[]; from?: string; to?: string }): Promise<Row[]> {
  const out: Row[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 20; page++) {
    let q = sb.from("player_external_load_daily").select(COLS)
      .in("player_id", playerIds).in("source", ["catapult", "manual"]).or(EXCLUDE_PREV_CLUB_OR);
    if (filter.dates) q = q.in("date", filter.dates);
    if (filter.from) q = q.gte("date", filter.from);
    if (filter.to) q = q.lte("date", filter.to);
    const { data, error } = await q.order("date", { ascending: true }).order("player_id", { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return oneRowPerPlayerDate(out);
}

/** Signed MD offset from the fixture list, or null when no match is near enough to give the day a role. */
function fixtureOffset(date: string, matchDates: string[]): number | null {
  const t = Date.parse(`${date}T00:00:00Z`);
  const near = matchDates.some((m) => { const d = (Date.parse(`${m}T00:00:00Z`) - t) / DAY; return (d >= 0 && d <= 13) || (d < 0 && d >= -2); });
  return near ? mdOffsetForDate(date, matchDates) : null;
}
const pctForOffset = (off: number | null): number | null => {
  if (off == null || off === 0) return null;
  const p = planSessionLoad({ mdDay: labelForOffset(off), dayType: null, focus: null });
  return p.applicable ? p.matchPct : null;
};

/** Planned day-type per date: Meso activation/top-up label → Week-setup pitch stimulus → Meso stimulus → MD+1 default. */
async function resolveDayTypes(
  sb: SupabaseClient, teamId: string, days: Array<{ date: string; mdLabel: string | null }>,
): Promise<Map<string, { dayType: EnoughDayType | null; source: "week_setup" | "meso" | "md" | null }>> {
  const out = new Map<string, { dayType: EnoughDayType | null; source: "week_setup" | "meso" | "md" | null }>();
  if (!days.length) return out;
  const dowOf = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekOf = (d: string) => addDays(d, -dowOf(d));
  const [{ data: wps }, { data: cws }] = await Promise.all([
    sb.from("week_plans").select("day_date, focus, day_type").eq("team_id", teamId).in("day_date", days.map((d) => d.date)),
    sb.from("coach_week_setup").select("week_start_date, day_stimuli").eq("team_id", teamId).in("week_start_date", [...new Set(days.map((d) => weekOf(d.date)))]),
  ]);
  const planType = (p: { focus?: string | null; day_type?: string | null }): EnoughDayType | null =>
    dayTypeFromText(p.focus) ?? (String(p.day_type ?? "").toUpperCase() === "RECOVERY" ? "topup" : null);
  const planByDate = new Map<string, EnoughDayType>();
  for (const p of (wps ?? []) as Array<{ day_date: string; focus?: string | null; day_type?: string | null }>) {
    const t = planType(p);
    if (t && !planByDate.has(p.day_date)) planByDate.set(p.day_date, t);
  }
  const stimByWeek = new Map(((cws ?? []) as Array<{ week_start_date: string; day_stimuli?: unknown }>).map((c) => [c.week_start_date, c.day_stimuli]));
  for (const { date, mdLabel } of days) {
    const fromPlan = planByDate.get(date) ?? null;
    const stimRaw = stimByWeek.get(weekOf(date));
    const stim = Array.isArray(stimRaw) && stimRaw.length === 7 ? dayTypeFromText(String(stimRaw[dowOf(date)] ?? "")) : null;
    if (fromPlan === "activation" || fromPlan === "topup") out.set(date, { dayType: fromPlan, source: "meso" });
    else if (stim) out.set(date, { dayType: stim, source: "week_setup" });
    else if (fromPlan) out.set(date, { dayType: fromPlan, source: "meso" });
    else if (mdLabel === "MD+1") out.set(date, { dayType: "topup", source: "md" });
    else out.set(date, { dayType: null, source: null });
  }
  return out;
}

export async function loadSessionEnough(sb: SupabaseClient, teamId: string, sessionDate: string | null): Promise<SessionEnough> {
  if (!sessionDate) return emptyEnough("no_session");
  const [sport, tier] = await Promise.all([resolveTeamSport(sb, teamId), getCatapultDataTier(sb, teamId)]);
  if (sport !== "football" || tier !== "full") return emptyEnough("not_available", { sessionDate });

  const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (roster ?? []) as Array<{ id: string; full_name: string | null }>;
  const playerIds = players.map((p) => p.id);
  if (!playerIds.length) return emptyEnough("no_session", { sessionDate });
  const nameOf = new Map(players.map((p) => [p.id, p.full_name ?? "—"]));

  // ── Fixtures + minutes ─────────────────────────────────────────────────────
  const from = addDays(sessionDate, -LOOKBACK_DAYS);
  const [{ data: sched }, { data: mins }] = await Promise.all([
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", addDays(sessionDate, 21)),
    sb.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", from).lte("match_date", sessionDate),
  ]);
  const matchSet = new Set<string>();
  for (const s of (sched ?? []) as Array<{ match_date: string }>) matchSet.add(s.match_date);
  const minutesByKey = new Map<string, number>();
  for (const m of (mins ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    matchSet.add(m.match_date);
    minutesByKey.set(`${m.player_id}|${m.match_date}`, m.is_dnp ? 0 : (m.minutes_played ?? 0));
  }
  const allMatches = [...matchSet].sort();
  const pastMatches = allMatches.filter((d) => d < sessionDate);
  const md = await resolveMdContext(sb, teamId, sessionDate).catch(() => ({ mdDay: null, dayType: null, focus: null }));
  const isMatchDay = matchSet.has(sessionDate) || String(md.dayType ?? "").toUpperCase() === "GAME" || mdOffset(md.mdDay) === 0;
  if (isMatchDay) return emptyEnough("match_day", { sessionDate, mdLabel: "MD", squad: playerIds.length });

  // ── MD-day of the session: Week setup first, then fixtures ──────────────────
  let mdLabel: string | null = null, matchPct: number | null = null, mdSource: "week_setup" | "fixtures" | null = null;
  const wsOff = mdOffset(md.mdDay);
  if (wsOff != null && wsOff !== 0) {
    const p = planSessionLoad({ mdDay: md.mdDay, dayType: md.dayType, focus: md.focus });
    if (p.applicable) { mdLabel = p.mdLabel ?? md.mdDay; matchPct = p.matchPct; mdSource = "week_setup"; }
  }
  if (matchPct == null) {
    const off = fixtureOffset(sessionDate, allMatches);
    const p = pctForOffset(off);
    if (off != null && p != null) { mdLabel = labelForOffset(off); matchPct = p; mdSource = "fixtures"; }
  }

  // ── Planned day-type of the session ─────────────────────────────────────────
  const sessionType = (await resolveDayTypes(sb, teamId, [{ date: sessionDate, mdLabel }])).get(sessionDate);
  const dayType = sessionType?.dayType ?? null;
  const dayTypeSource = sessionType?.source ?? null;

  // ── Load rows: match days (reference) + the training block since the last match ─
  const lastMatch = pastMatches[pastMatches.length - 1] ?? null;
  const weekFrom = lastMatch && Date.parse(`${sessionDate}T00:00:00Z`) - Date.parse(`${lastMatch}T00:00:00Z`) <= 10 * DAY ? addDays(lastMatch, 1) : sessionDate;
  const [matchRows, blockRows] = await Promise.all([
    pastMatches.length ? fetchRows(sb, playerIds, { dates: pastMatches }) : Promise.resolve([] as Row[]),
    fetchRows(sb, playerIds, { from: weekFrom, to: sessionDate }),
  ]);

  // Match reference — own near-full matches, else the team's.
  type MRow = { date: string; minutes: number | null; v: VarValues };
  const matchByPlayer = new Map<string, MRow[]>();
  for (const r of matchRows) {
    const key = `${r.player_id}|${r.date}`;
    const minutes = minutesByKey.has(key) ? minutesByKey.get(key)! : (num(r.session_duration_minutes) ?? null);
    if (!matchByPlayer.has(r.player_id)) matchByPlayer.set(r.player_id, []);
    matchByPlayer.get(r.player_id)!.push({ date: r.date, minutes, v: varsOf(r) });
  }
  const asOfMs = Date.parse(`${sessionDate}T00:00:00Z`);
  const ownSel = new Map<string, MRow[]>();
  const teamPool: MRow[] = [];
  for (const [pid, rows] of matchByPlayer) {
    const sel = selectNearFullMatches(rows, { asOfMs });
    ownSel.set(pid, sel.use);
    teamPool.push(...sel.use);
  }
  const medOf = (rows: MRow[]): VarValues => {
    const o = {} as VarValues;
    for (const k of ENOUGH_VARS) o[k] = median(rows.map((r) => r.v[k]).filter((x): x is number => x != null && x > 0));
    return o;
  };
  const teamRef = medOf(teamPool);

  // ── Session rows → per-player input ─────────────────────────────────────────
  const sessionRows = blockRows.filter((r) => r.date === sessionDate);
  const withData = sessionRows.filter((r) => { const v = varsOf(r); return ENOUGH_VARS.some((k) => (v[k] ?? 0) > 0); });
  if (!withData.length) return emptyEnough("no_session", { sessionDate, mdLabel, squad: playerIds.length });
  const durs = withData.map(durationMin).filter((d) => d > 0);
  const medDur = median(durs);
  const trained = withData.filter((r) => { const d = durationMin(r); return d === 0 || d >= MIN_TRAIN_MIN; });

  // Training days in the block (excluding match days), for "week so far".
  const blockDates = [...new Set(blockRows.map((r) => r.date))].filter((d) => !matchSet.has(d) && d <= sessionDate).sort();
  const dayCount = new Map<string, number>();
  for (const r of blockRows) dayCount.set(r.date, (dayCount.get(r.date) ?? 0) + 1);
  const weekDates = blockDates.filter((d) => (dayCount.get(d) ?? 0) >= 3 || d === sessionDate);
  let weekDays: Array<{ matchPct: number; dayType: EnoughDayType | null }> | null = null;
  if (matchPct != null && weekFrom !== sessionDate) {
    const others = weekDates.filter((d) => d !== sessionDate);
    const offsets = new Map(others.map((d) => [d, fixtureOffset(d, allMatches)]));
    const types = await resolveDayTypes(sb, teamId, others.map((d) => { const off = offsets.get(d) ?? null; return { date: d, mdLabel: off == null ? null : labelForOffset(off) }; }));
    weekDays = weekDates.map((d) => (d === sessionDate
      ? { matchPct: matchPct!, dayType }
      : { matchPct: pctForOffset(offsets.get(d) ?? null) ?? 0, dayType: types.get(d)?.dayType ?? null }));
  }

  const inputs: EnoughPlayerInput[] = trained.map((r) => {
    const own = ownSel.get(r.player_id) ?? [];
    const useOwn = own.length >= OWN_REF_MIN;
    // Own match median per variable; a variable the player's matches never carried falls back to the team's.
    const ownMed = useOwn ? medOf(own) : null;
    const ref = {} as VarValues;
    for (const k of ENOUGH_VARS) ref[k] = ownMed?.[k] ?? teamRef[k];
    let weekActual: VarValues | null = null;
    if (weekDays) {
      const mine = blockRows.filter((b) => b.player_id === r.player_id && weekDates.includes(b.date)).map(varsOf);
      weekActual = {} as VarValues;
      for (const k of ENOUGH_VARS) (weekActual as Record<EnoughVar, number | null>)[k] = sumOrNull(mine.map((v) => v[k]));
    }
    const d = durationMin(r);
    // Minutes in the last match (top-up days: starters recover). Entered minutes first, else the
    // match-day session length (includes the warm-up, so only clearly long appearances read as starters).
    let lastMatchMinutes: number | null = null;
    if (lastMatch) {
      const key = `${r.player_id}|${lastMatch}`;
      if (minutesByKey.has(key)) lastMatchMinutes = minutesByKey.get(key)!;
      else {
        const mr = matchRows.find((m) => m.player_id === r.player_id && m.date === lastMatch);
        lastMatchMinutes = mr ? Math.round(durationMin(mr)) || null : null;
      }
    }
    return {
      playerId: r.player_id, name: nameOf.get(r.player_id) ?? "—", lastMatchMinutes,
      actual: varsOf(r), matchRef: ref, refSource: useOwn ? "own" : "team", refMatches: own.length,
      partial: medDur != null && d > 0 && d < PARTIAL_SHARE * medDur,
      weekActual,
    };
  });

  return buildSessionEnough({
    sessionDate, mdLabel, matchPct, mdSource, isMatchDay: false,
    squadSize: playerIds.length, players: inputs, weekDays, dayType, dayTypeSource,
  });
}
