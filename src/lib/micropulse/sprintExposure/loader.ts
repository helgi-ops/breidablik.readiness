import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SPRINT_EXPOSURE_METRIC,
  computeSprintExposure,
  type DailySprintExposure,
  type SprintExposurePayload,
} from "./index";

/**
 * Pull last 28 days of GPS sprint distance (metres) and join against the
 * team's match schedule (week_plans + match_player_minutes) to flag match
 * days. Returns the sprint-exposure payload.
 *
 * Sprint source: `sprint_distance`, else `velocity_band6_total_distance`
 * (Catapult Core exposes sprint only as velocity band 6). Both need GPS, so
 * indoor sessions come back null — those days are tagged `noGpsReading`
 * ("no sprint reading") and are NEVER back-filled from IMA Free Running
 * bands 5–8. Those bands are bout-duration bands (strides in continuous runs
 * of ≥18 s), not sprinting — see docs/ima-free-running-bands.md.
 *
 * Match-day detection (UNION of three sources, in priority order):
 *   1. week_plans.day_type = "GAME" for the player's team on that date —
 *      authoritative team-level signal. This catches every scheduled
 *      match regardless of whether per-player minutes were logged.
 *   2. match_player_minutes >= 30 min — player-specific signal for clubs
 *      that log minutes (lowered from the original 60-min threshold
 *      because partial appearances still represent real sprint exposure
 *      and we'd rather over-count match days than under-count them; the
 *      original 60-min rule from Carling 2018 / Nédélec 2012 referred to
 *      RECOVERY DECISIONS, not exposure baselining).
 *   3. Fallback: high-sprint days adjacent to a known GAME date are
 *      ignored — we trust week_plans + minutes over heuristics.
 *
 * Without this UNION the old code missed many real matches and reported
 * a single-match baseline with low confidence, which made the exposure
 * ratio drift toward "Spike" for every player.
 */
export async function loadSprintExposure(
  sb: SupabaseClient,
  args: { playerId: string; todayIso: string; teamId?: string },
): Promise<SprintExposurePayload> {
  const startIso = (() => {
    const d = new Date(`${args.todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return d.toISOString().slice(0, 10);
  })();

  // GPS sprint metres (+ sprint-effort count for display). Several sources
  // can write the same day (catapult / kinexon / statsport / manual) — we
  // merge per date below, taking the largest non-null reading, so a manual
  // placeholder row can't hide a real GPS row.
  const { data: extRows, error: extErr } = await sb
    .from("player_external_load_daily")
    .select(
      "date, source, sprint_distance, velocity_band6_total_distance, velocity_band6_total_efforts_gen2"
    )
    .eq("player_id", args.playerId)
    .gte("date", startIso)
    .lte("date", args.todayIso)
    .order("date", { ascending: true });
  if (extErr) {
    return {
      acuteSum7d: null,
      matchDayDemand: null,
      exposureRatio: null,
      band: "INSUFFICIENT_DATA",
      matchDaysObserved: 0,
      matchDaysMeasured: 0,
      matchDaysEstimated: 0,
      matchDaysScheduled: 0,
      daysObserved7d: 0,
      metric: SPRINT_EXPOSURE_METRIC,
      noGpsDays7d: 0,
      todayNoGps: false,
    };
  }

  // Resolve team_id if not provided — week_plans is keyed on team, not player.
  let teamId = args.teamId ?? null;
  if (!teamId) {
    try {
      const { data: pl } = await sb
        .from("players")
        .select("team_id")
        .eq("id", args.playerId)
        .maybeSingle();
      teamId = (pl as { team_id: string | null } | null)?.team_id ?? null;
    } catch { /* fall through with null */ }
  }

  // Source 1: team week_plans (authoritative match schedule)
  // NOTE: column is `day_date`, NOT `plan_date` — earlier draft used the
  // wrong name and the whole UNION silently failed (week_plans rows looked
  // like they didn't exist, so we fell back to per-player minutes only and
  // every player ended up with a 1-match baseline).
  const scheduledGameDays = new Set<string>();
  const matchDays = new Set<string>();
  if (teamId) {
    try {
      const { data: wp } = await sb
        .from("week_plans")
        .select("day_date, day_type")
        .eq("team_id", teamId)
        .gte("day_date", startIso)
        .lte("day_date", args.todayIso);
      for (const r of (wp ?? []) as Array<{ day_date: string; day_type: string | null }>) {
        const dt = String(r.day_type ?? "").toUpperCase();
        if (dt === "GAME" || dt === "MATCH") {
          scheduledGameDays.add(r.day_date);
          matchDays.add(r.day_date);
        }
      }
    } catch { /* week_plans optional on some setups */ }
  }

  // Source 2: per-player minutes (lowered to 30 min — see header note)
  try {
    const { data: mm } = await sb
      .from("match_player_minutes")
      .select("match_date, minutes_played")
      .eq("player_id", args.playerId)
      .gte("match_date", startIso)
      .lte("match_date", args.todayIso)
      .gte("minutes_played", 30);
    for (const r of (mm ?? []) as Array<{ match_date: string }>) {
      if (r.match_date) matchDays.add(r.match_date);
    }
  } catch { /* table optional on some tiers — proceed without match-day data */ }

  // Build per-date rows. null sprint metres = no GPS reading that day.
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const maxNullable = (a: number | null, b: number | null): number | null =>
    a == null ? b : b == null ? a : Math.max(a, b);
  type RawDay = { sprintM: number | null; efforts: number | null };
  const rawByDate = new Map<string, RawDay>();
  for (const r of (extRows ?? []) as Array<{
    date: string;
    sprint_distance: number | string | null;
    velocity_band6_total_distance: number | string | null;
    velocity_band6_total_efforts_gen2: number | string | null;
  }>) {
    const sprintM = num(r.sprint_distance) ?? num(r.velocity_band6_total_distance);
    const efforts = num(r.velocity_band6_total_efforts_gen2);
    const prev = rawByDate.get(r.date);
    rawByDate.set(r.date, {
      sprintM: maxNullable(prev?.sprintM ?? null, sprintM),
      efforts: maxNullable(prev?.efforts ?? null, efforts),
    });
  }

  const rows: DailySprintExposure[] = Array.from(rawByDate.entries()).map(
    ([date, r]) => ({
      date,
      hiBandStrides: r.sprintM, // GPS sprint METRES (legacy field name)
      isMatchDay: matchDays.has(date),
      isScheduledGame: scheduledGameDays.has(date),
      hiBandStridesEstimated: false,
      v5v6Efforts: r.efforts, // GPS sprint efforts (legacy field name)
      noGpsReading: r.sprintM == null,
    }),
  );
  // Scheduled game days with no load row at all — counted as scheduled so the
  // UI can say "3 of 5 matches captured". Not a "no GPS" day (no session row).
  for (const d of scheduledGameDays) {
    if (!rawByDate.has(d)) {
      rows.push({
        date: d,
        hiBandStrides: null,
        isMatchDay: true,
        isScheduledGame: true,
        hiBandStridesEstimated: false,
        v5v6Efforts: null,
      });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return computeSprintExposure(rows, args.todayIso);
}
