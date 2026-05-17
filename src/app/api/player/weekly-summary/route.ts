/**
 * GET /api/player/weekly-summary
 *
 * Rolling 7-day digest for the authenticated player — feeds the
 * "Vikan þín" card on the Today tab.
 *
 * Returns:
 *   - checkin/RPE compliance counts (out of 7)
 *   - average readiness sub-scores
 *   - total RPE load + average RPE
 *   - sparkline data (1 point per day, 7 points total)
 *   - wearable sleep / HRV summary when connected
 *   - stress-day count (readiness stress_mood ≤ 2)
 *
 * Used by: src/components/player/WeeklyDigestCard.tsx
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

const APP_TZ = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";

function todayInTz(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build the 7 ISO dates from `fromDate` to `toDate` inclusive. */
function dateRange(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    out.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return out;
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function sum(values: Array<number | null | undefined>): number {
  return values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .reduce((a, b) => a + b, 0);
}

type ReadinessRow = {
  entry_date: string;
  total_score: number | null;
  sleep_quality: number | null;
  fatigue_energy: number | null;
  muscle_soreness: number | null;
  stress_mood: number | null;
};

type RpeRow = {
  session_date: string;
  rpe: number | null;
  session_load: number | null;
  duration_minutes: number | null;
};

type WearableSleepRow = {
  sleep_date: string;
  total_sleep_min: number | null;
  sleep_efficiency_pct: number | null;
  provider_score: number | null;
};

type WearableDailyRow = {
  measurement_date: string;
  hrv_rmssd_ms: number | null;
  resting_hr_bpm: number | null;
  provider_recovery_score: number | null;
};

/** Compute current consecutive-day streak ending today or yesterday.
 *  Lets the player keep their streak alive even if they haven't logged today
 *  yet — same behaviour as the standalone /api/player/streak endpoint. */
function calculateStreak(dateSet: Set<string>, todayKey: string): number {
  const today = new Date(`${todayKey}T00:00:00Z`);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  let cursor: Date;
  if (dateSet.has(todayKey)) {
    cursor = today;
  } else if (dateSet.has(yesterday.toISOString().slice(0, 10))) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (dateSet.has(key)) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const toDate = todayInTz(APP_TZ);
    const fromDate = shiftDate(toDate, -6); // 7 days inclusive
    const dates = dateRange(fromDate, toDate);

    // For streak calculation we need a wider window — 60 days is enough for
    // 99% of players (longer streaks are gravy; we cap the iteration anyway).
    const streakFromDate = shiftDate(toDate, -59);

    // Fire everything in parallel. Wearable queries may return empty if the
    // table is missing or the player hasn't connected — we tolerate that.
    const [readinessRes, rpeRes, sleepRes, dailyRes, streakCheckinRes, streakRpeRes] = await Promise.all([
      sb
        .from("readiness_entries")
        .select("entry_date, total_score, sleep_quality, fatigue_energy, muscle_soreness, stress_mood")
        .eq("player_id", playerId)
        .gte("entry_date", fromDate)
        .lte("entry_date", toDate)
        .order("entry_date", { ascending: true }),
      sb
        .from("session_rpe_entries")
        .select("session_date, rpe, session_load, duration_minutes")
        .eq("player_id", playerId)
        .gte("session_date", fromDate)
        .lte("session_date", toDate),
      sb
        .from("wearable_sleep_data")
        .select("sleep_date, total_sleep_min, sleep_efficiency_pct, provider_score")
        .eq("player_id", playerId)
        .gte("sleep_date", fromDate)
        .lte("sleep_date", toDate)
        .order("sleep_date", { ascending: true }),
      sb
        .from("wearable_daily_data")
        .select("measurement_date, hrv_rmssd_ms, resting_hr_bpm, provider_recovery_score")
        .eq("player_id", playerId)
        .gte("measurement_date", fromDate)
        .lte("measurement_date", toDate)
        .order("measurement_date", { ascending: true }),
      sb
        .from("readiness_entries")
        .select("entry_date")
        .eq("player_id", playerId)
        .gte("entry_date", streakFromDate)
        .lte("entry_date", toDate),
      sb
        .from("session_rpe_entries")
        .select("session_date")
        .eq("player_id", playerId)
        .gte("session_date", streakFromDate)
        .lte("session_date", toDate),
    ]);

    if (readinessRes.error) throw new Error(readinessRes.error.message);
    if (rpeRes.error) throw new Error(rpeRes.error.message);
    // Wearable tables may not exist in some envs — fall back to []
    const sleepRows: WearableSleepRow[] = sleepRes.error ? [] : ((sleepRes.data ?? []) as WearableSleepRow[]);
    const dailyRows: WearableDailyRow[] = dailyRes.error ? [] : ((dailyRes.data ?? []) as WearableDailyRow[]);

    const readinessRows = (readinessRes.data ?? []) as ReadinessRow[];
    const rpeRows = (rpeRes.data ?? []) as RpeRow[];

    // Build per-date maps for sparklines
    const readinessByDate = new Map<string, ReadinessRow>();
    for (const r of readinessRows) readinessByDate.set(r.entry_date, r);

    const rpeByDate = new Map<string, { totalLoad: number; rpeSum: number; count: number }>();
    for (const r of rpeRows) {
      const cur = rpeByDate.get(r.session_date) ?? { totalLoad: 0, rpeSum: 0, count: 0 };
      cur.totalLoad += Number(r.session_load ?? 0);
      cur.rpeSum += Number(r.rpe ?? 0);
      cur.count += 1;
      rpeByDate.set(r.session_date, cur);
    }

    const sleepByDate = new Map<string, WearableSleepRow>();
    for (const s of sleepRows) sleepByDate.set(s.sleep_date, s);

    const dailyByDate = new Map<string, WearableDailyRow>();
    for (const d of dailyRows) dailyByDate.set(d.measurement_date, d);

    // ── Build daily series for sparklines ─────────────────────────────────
    const series = dates.map((date) => {
      const r = readinessByDate.get(date);
      const rpe = rpeByDate.get(date);
      const sleep = sleepByDate.get(date);
      const daily = dailyByDate.get(date);
      return {
        date,
        totalScore: r?.total_score ?? null,
        sleepQuality: r?.sleep_quality ?? null,
        rpeLoad: rpe?.totalLoad ?? null,
        avgRpe: rpe && rpe.count > 0 ? Math.round((rpe.rpeSum / rpe.count) * 10) / 10 : null,
        sleepMin: sleep?.total_sleep_min ?? null,
        hrvMs: daily?.hrv_rmssd_ms ?? null,
      };
    });

    // ── Aggregates ────────────────────────────────────────────────────────
    const checkinCount = readinessRows.length;
    const rpeDayCount = rpeByDate.size;

    const avgReadiness = avg(readinessRows.map((r) => r.total_score));
    const avgSleepQuality = avg(readinessRows.map((r) => r.sleep_quality));
    const avgFatigue = avg(readinessRows.map((r) => r.fatigue_energy));
    const avgSoreness = avg(readinessRows.map((r) => r.muscle_soreness));
    const avgStress = avg(readinessRows.map((r) => r.stress_mood));

    const avgRpe = avg(rpeRows.map((r) => r.rpe));
    const totalLoad = sum(rpeRows.map((r) => r.session_load));
    const totalDurationMin = sum(rpeRows.map((r) => r.duration_minutes));

    const avgSleepMin = avg(sleepRows.map((s) => s.total_sleep_min));
    const avgHrvMs = avg(dailyRows.map((d) => d.hrv_rmssd_ms));
    const avgRestingHr = avg(dailyRows.map((d) => d.resting_hr_bpm));
    const avgRecoveryScore = avg(dailyRows.map((d) => d.provider_recovery_score));

    // Stress days: readiness 1-6 scale, stress_mood ≤ 2 = high stress day
    const stressDays = readinessRows.filter((r) =>
      typeof r.stress_mood === "number" && r.stress_mood <= 2
    ).length;

    // Best & worst sleep nights for narrative pulls
    const sleepNumbers = sleepRows
      .map((s) => s.total_sleep_min)
      .filter((n): n is number => typeof n === "number");
    const bestSleepMin = sleepNumbers.length ? Math.max(...sleepNumbers) : null;
    const worstSleepMin = sleepNumbers.length ? Math.min(...sleepNumbers) : null;

    // Streak data — uses 60-day historical window for consecutive-day counts.
    const checkinStreakDates = new Set<string>(
      ((streakCheckinRes.data ?? []) as Array<{ entry_date: string }>).map((r) => r.entry_date),
    );
    const rpeStreakDates = new Set<string>(
      ((streakRpeRes.data ?? []) as Array<{ session_date: string }>).map((r) => r.session_date),
    );
    const checkinStreak = calculateStreak(checkinStreakDates, toDate);
    const rpeStreak = calculateStreak(rpeStreakDates, toDate);

    return NextResponse.json({
      ok: true,
      data: {
        window: { fromDate, toDate, days: 7 },
        compliance: {
          checkinCount,
          checkinRate: Math.round((checkinCount / 7) * 100),
          rpeDayCount,
          rpeDayRate: Math.round((rpeDayCount / 7) * 100),
        },
        streak: {
          checkin: checkinStreak,
          rpe: rpeStreak,
        },
        readiness: {
          avgTotal: avgReadiness,
          avgSleepQuality,
          avgFatigue,
          avgSoreness,
          avgStress,
          stressDays,
        },
        load: {
          sessionCount: rpeRows.length,
          avgRpe,
          totalLoad: Math.round(totalLoad),
          totalDurationMin: Math.round(totalDurationMin),
        },
        wearable: {
          connected: sleepRows.length > 0 || dailyRows.length > 0,
          sleepNights: sleepRows.length,
          avgSleepMin,
          bestSleepMin,
          worstSleepMin,
          avgHrvMs,
          avgRestingHr,
          avgRecoveryScore,
        },
        series,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}
