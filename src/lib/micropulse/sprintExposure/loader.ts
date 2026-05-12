import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSprintExposure,
  type DailySprintExposure,
  type SprintExposurePayload,
} from "./index";

/**
 * Pull last 28 days of IMA band 5-8 stride counts and join against the
 * team's match schedule (week_plans + match_player_minutes) to flag match
 * days. Returns the sprint-exposure payload.
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
 *   3. Fallback: high stride-count days adjacent to a known GAME date are
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

  // Bands 5-8 daily stride counts + GPS V5/V6 sprint-effort counts. The
  // GPS effort counts let us estimate IMA stride totals on older match
  // days where IMA Free Running wasn't captured (Catapult fixed this
  // going forward but older activities can't be re-processed).
  const { data: extRows, error: extErr } = await sb
    .from("player_external_load_daily")
    .select(
      "date, ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, velocity_band5_total_efforts_gen2, velocity_band6_total_efforts_gen2"
    )
    .eq("player_id", args.playerId)
    .eq("source", "catapult")
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

  // Build per-date rows. First pass: shape raw data with both IMA strides
  // and GPS V5+V6 sprint-effort counts. We'll use the latter as a fallback
  // proxy on match days where IMA was not captured.
  type RawDay = {
    date: string;
    imaSum: number;             // 0 when null/missing
    v5v6Efforts: number;        // 0 when null/missing
    isMatchDay: boolean;
    isScheduledGame: boolean;
  };
  const rawByDate = new Map<string, RawDay>();
  for (const r of (extRows ?? []) as Array<{
    date: string;
    ima_fr_band5_stride_count: number | null;
    ima_fr_band6_stride_count: number | null;
    ima_fr_band7_stride_count: number | null;
    ima_fr_band8_stride_count: number | null;
    velocity_band5_total_efforts_gen2: number | null;
    velocity_band6_total_efforts_gen2: number | null;
  }>) {
    const b5 = Number(r.ima_fr_band5_stride_count ?? 0) || 0;
    const b6 = Number(r.ima_fr_band6_stride_count ?? 0) || 0;
    const b7 = Number(r.ima_fr_band7_stride_count ?? 0) || 0;
    const b8 = Number(r.ima_fr_band8_stride_count ?? 0) || 0;
    const v5e = Number(r.velocity_band5_total_efforts_gen2 ?? 0) || 0;
    const v6e = Number(r.velocity_band6_total_efforts_gen2 ?? 0) || 0;
    rawByDate.set(r.date, {
      date: r.date,
      imaSum: b5 + b6 + b7 + b8,
      v5v6Efforts: v5e + v6e,
      isMatchDay: matchDays.has(r.date),
      isScheduledGame: scheduledGameDays.has(r.date),
    });
  }
  // Inject scheduled game days that had no Catapult row at all
  for (const d of scheduledGameDays) {
    if (!rawByDate.has(d)) {
      rawByDate.set(d, {
        date: d,
        imaSum: 0,
        v5v6Efforts: 0,
        isMatchDay: true,
        isScheduledGame: true,
      });
    }
  }

  // Calibration: compute the player's personal IMA-to-effort ratio from
  // match days where BOTH metrics are present. Why match-only:
  //   - Training days have very different movement patterns (lots of
  //     COD/agility = high IMA cadence, low GPS distance). Their
  //     stride-per-effort ratio is 4-7× higher than match days.
  //   - Matches show consistent ratios because the game itself is the
  //     constant — players sprint similar distances at similar paces.
  //   - Using a TRAINING-derived ratio to estimate match strides would
  //     wildly overestimate (and a match-derived ratio would underestimate
  //     training). So we only estimate IMA for MATCH DAYS, from MATCH-DAY
  //     calibration. Training days where IMA is missing simply stay null
  //     and don't contribute to the acute sum — the safer asymmetric path.
  //
  // Empirical anchor (Breiðablik 2026-05-08):
  //   Höskuldur: IMA b5-8 = 660, V5+V6 efforts = 61 → ratio 10.8
  //   Team avg: IMA b5-8 = 386, V5+V6 efforts = 49.1 → ratio 7.86
  //   Per-player ratios cluster between 7-12 strides/effort on match days.
  const calibrationDays = Array.from(rawByDate.values()).filter(
    (r) => r.isMatchDay && r.imaSum > 0 && r.v5v6Efforts > 0,
  );
  let imaPerEffort: number | null = null;
  if (calibrationDays.length > 0) {
    const totalIma = calibrationDays.reduce((s, r) => s + r.imaSum, 0);
    const totalEff = calibrationDays.reduce((s, r) => s + r.v5v6Efforts, 0);
    if (totalEff > 0) imaPerEffort = totalIma / totalEff;
  }

  // Second pass: assemble final DailySprintExposure rows. For match days
  // with missing IMA but present GPS efforts AND a usable calibration
  // ratio, fill in an estimated stride count and tag it.
  const rows: DailySprintExposure[] = Array.from(rawByDate.values())
    .map<DailySprintExposure>((r) => {
      // Real IMA measurement available — use as-is.
      if (r.imaSum > 0) {
        return {
          date: r.date,
          hiBandStrides: r.imaSum,
          isMatchDay: r.isMatchDay,
          isScheduledGame: r.isScheduledGame,
          hiBandStridesEstimated: false,
          v5v6Efforts: r.v5v6Efforts,
        };
      }
      // Match day with no IMA but GPS efforts captured — estimate from
      // per-player ratio. Skip on training days (see calibration note
      // above) and skip when no calibration day exists yet.
      if (
        r.isMatchDay &&
        r.v5v6Efforts > 0 &&
        imaPerEffort != null &&
        imaPerEffort > 0
      ) {
        return {
          date: r.date,
          hiBandStrides: Math.round(r.v5v6Efforts * imaPerEffort),
          isMatchDay: true,
          isScheduledGame: r.isScheduledGame,
          hiBandStridesEstimated: true,
          v5v6Efforts: r.v5v6Efforts,
        };
      }
      // No usable data — leave null so the day doesn't contribute to
      // either the acute sum or the match-day baseline.
      return {
        date: r.date,
        hiBandStrides: null,
        isMatchDay: r.isMatchDay,
        isScheduledGame: r.isScheduledGame,
        hiBandStridesEstimated: false,
        v5v6Efforts: r.v5v6Efforts,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return computeSprintExposure(rows, args.todayIso);
}
