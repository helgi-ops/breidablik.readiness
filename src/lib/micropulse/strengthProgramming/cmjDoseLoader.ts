/**
 * Data for the jump-test dose rule (cmjDose.ts, brief §3): which test day feeds today's session, and that day's
 * test read against the player's baseline. Read-only: ForceDecks trials, the fixtures (match_schedule + week_plans
 * GAME days) and the last match's high-speed running (the cmjRecovery loader, Hader 2019). Never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMatchRecoveryInputs, hoursPostMatch } from "@/lib/micropulse/cmjRecovery/loader";
import { CMJ_BASELINE_RULE } from "@/lib/micropulse/vald/flagFreshness";
import { readCmjTestDay, testDayFor, type CmjDoseTest, type CmjTestDay, type CmjTrial } from "./cmjDose";
import type { MdContext } from "./types";

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The team's match days from `from` to `to` (fixtures and GAME days in the week plan), sorted. */
export async function loadMatchDays(sb: SupabaseClient, teamId: string, from: string, to: string): Promise<string[]> {
  const [fx, wp] = await Promise.all([
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
    sb.from("week_plans").select("day_date, day_type").eq("team_id", teamId).gte("day_date", from).lte("day_date", to),
  ]);
  const days = new Set<string>();
  for (const r of (fx.data ?? []) as Array<{ match_date: string | null }>) if (r.match_date) days.add(r.match_date);
  for (const r of (wp.data ?? []) as Array<{ day_date: string; day_type: string | null }>) {
    if (String(r.day_type ?? "").toUpperCase() === "GAME") days.add(r.day_date);
  }
  return [...days].sort();
}

/**
 * The calendar date of each test day around `todayIso`: MD+3 = the last match before today + 3 (not after today, and
 * before the next match); MD-2 / MD-1 = the next match after today − 2 / − 1 (not after today). Pure.
 */
export function testDatesFor(todayIso: string, matchDays: string[]): Partial<Record<CmjTestDay, string>> {
  const last = [...matchDays].reverse().find((d) => d < todayIso) ?? null;
  const next = matchDays.find((d) => d > todayIso) ?? null;
  const out: Partial<Record<CmjTestDay, string>> = {};
  const isMatch = new Set(matchDays);
  if (last) {
    const d = addDays(last, 3);
    if (d <= todayIso && (!next || d < next) && !isMatch.has(d)) out["MD+3"] = d;
  }
  if (next) {
    for (const [day, n] of [["MD-2", 2], ["MD-1", 1]] as const) {
      const d = addDays(next, -n);
      if (d <= todayIso && (!last || d > last) && !isMatch.has(d)) out[day] = d;
    }
  }
  return out;
}

/** The test that feeds today's session on `md`, or undefined (no rule that day, no test, no ready baseline). */
export async function fetchCmjDoseTest(
  sb: SupabaseClient,
  args: { teamId: string | null; playerId: string; todayIso: string; md: MdContext },
): Promise<CmjDoseTest | undefined> {
  const { teamId, playerId, todayIso, md } = args;
  const days = testDayFor(md);
  if (!teamId || !days) return undefined;
  try {
    const matchDays = await loadMatchDays(sb, teamId, addDays(todayIso, -10), addDays(todayIso, 6));
    const dates = testDatesFor(todayIso, matchDays);
    const wanted = days.filter((d) => dates[d]);
    if (!wanted.length) return undefined;
    const earliest = wanted.map((d) => dates[d] as string).sort()[0];
    const { data } = await sb
      .from("vald_forcedecks_results")
      .select("raw_test_id, test_timestamp, jump_height_cm")
      .eq("team_id", teamId)
      .eq("microplayer_id", playerId)
      .eq("is_valid", true)
      .or("test_type.is.null,test_type.ilike.%cmj%")
      .not("jump_height_cm", "is", null)
      .gte("test_timestamp", `${addDays(earliest, -CMJ_BASELINE_RULE.windowDays)}T00:00:00`)
      .lte("test_timestamp", `${todayIso}T23:59:59`)
      .order("test_timestamp", { ascending: false })
      .limit(400);
    const trials: CmjTrial[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      rawTestId: (r.raw_test_id as string | null) ?? null,
      testTimestamp: String(r.test_timestamp ?? ""),
      jumpCm: r.jump_height_cm == null ? null : Number(r.jump_height_cm),
    }));
    // In order: the MD-1 test counts only when the MD-2 day had no test.
    for (const testDay of wanted) {
      const testDate = dates[testDay] as string;
      if (!trials.some((t) => t.testTimestamp.slice(0, 10) === testDate)) continue;
      const match = await loadMatchRecoveryInputs(sb, teamId, addDays(testDate, -1));
      const read = readCmjTestDay({
        trials, testDate, testDay,
        matchHsr: match.hsrByPlayer.get(playerId) ?? null,
        hoursPostMatch: hoursPostMatch(match.matchDate, testDate),
      });
      return read ?? undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** A player whose pre-match test (MD-2, or MD-1 when MD-2 had none) was low: the coach's Today line. */
export type TeamCmjDoseRead = {
  playerId: string;
  name: string;
  rule: "CMJ_DROP_MD2" | "CMJ_DROP_MD1_FALLBACK";
  test: CmjDoseTest;
};

/**
 * The Today line before the match (brief §3): on MD-2 and MD-1, players whose test that week was below their normal
 * range. One paged read of the team's trials (the 1000-row cap), the same pure read as the session. Empty on other
 * days. Read-only.
 */
export async function loadTeamCmjDoseReads(sb: SupabaseClient, teamId: string, todayIso: string): Promise<TeamCmjDoseRead[]> {
  const matchDays = await loadMatchDays(sb, teamId, addDays(todayIso, -10), addDays(todayIso, 6));
  const next = matchDays.find((d) => d > todayIso) ?? null;
  if (!next) return [];
  const toMatch = Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / DAY);
  if (toMatch !== 1 && toMatch !== 2) return [];
  const dates = testDatesFor(todayIso, matchDays);
  if (!dates["MD-2"] && !dates["MD-1"]) return [];
  const earliest = (dates["MD-2"] ?? dates["MD-1"]) as string;

  const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const names = new Map(((roster ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? ""]));
  if (!names.size) return [];

  const byPlayer = new Map<string, CmjTrial[]>();
  const PAGE = 1000;
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await sb
      .from("vald_forcedecks_results")
      .select("microplayer_id, raw_test_id, test_timestamp, jump_height_cm")
      .eq("team_id", teamId)
      .eq("is_valid", true)
      .or("test_type.is.null,test_type.ilike.%cmj%")
      .not("jump_height_cm", "is", null)
      .gte("test_timestamp", `${addDays(earliest, -CMJ_BASELINE_RULE.windowDays)}T00:00:00`)
      .lte("test_timestamp", `${todayIso}T23:59:59`)
      .order("test_timestamp", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    for (const r of rows) {
      const pid = String(r.microplayer_id ?? "");
      if (!names.has(pid)) continue;
      const list = byPlayer.get(pid) ?? [];
      list.push({ rawTestId: (r.raw_test_id as string | null) ?? null, testTimestamp: String(r.test_timestamp ?? ""), jumpCm: r.jump_height_cm == null ? null : Number(r.jump_height_cm) });
      byPlayer.set(pid, list);
    }
    if (rows.length < PAGE) break;
  }

  const hsrCache = new Map<string, Awaited<ReturnType<typeof loadMatchRecoveryInputs>>>();
  const matchFor = async (testDate: string) => {
    if (!hsrCache.has(testDate)) hsrCache.set(testDate, await loadMatchRecoveryInputs(sb, teamId, addDays(testDate, -1)));
    return hsrCache.get(testDate)!;
  };

  const out: TeamCmjDoseRead[] = [];
  for (const [playerId, trials] of byPlayer) {
    for (const testDay of ["MD-2", "MD-1"] as const) {
      const testDate = dates[testDay];
      if (!testDate || !trials.some((t) => t.testTimestamp.slice(0, 10) === testDate)) continue;
      const match = await matchFor(testDate);
      const test = readCmjTestDay({ trials, testDate, testDay, matchHsr: match.hsrByPlayer.get(playerId) ?? null, hoursPostMatch: hoursPostMatch(match.matchDate, testDate) });
      if (test?.drop) out.push({ playerId, name: names.get(playerId) ?? "", rule: testDay === "MD-2" ? "CMJ_DROP_MD2" : "CMJ_DROP_MD1_FALLBACK", test });
      break; // the MD-1 test counts only when the MD-2 day had no test
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
