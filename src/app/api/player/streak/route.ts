import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

/**
 * GET /api/player/streak
 *
 * Returns current checkin streak, RPE streak, and 28-day completion rates
 * for the authenticated player.
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    // ── Fetch last 28 days of checkin dates ─────────────────────────────
    const today = new Date();
    const daysBack28 = new Date(today);
    daysBack28.setDate(daysBack28.getDate() - 27); // 28 days including today
    const todayStr = today.toISOString().slice(0, 10);
    const from28Str = daysBack28.toISOString().slice(0, 10);

    // For streak we need more history (up to 365 days back)
    const daysBack365 = new Date(today);
    daysBack365.setDate(daysBack365.getDate() - 364);
    const from365Str = daysBack365.toISOString().slice(0, 10);

    const [checkinRes, rpeRes] = await Promise.all([
      sb
        .from("readiness_entries")
        .select("entry_date")
        .eq("player_id", playerId)
        .gte("entry_date", from365Str)
        .lte("entry_date", todayStr)
        .order("entry_date", { ascending: false }),
      sb
        .from("session_rpe_entries")
        .select("session_date")
        .eq("player_id", playerId)
        .gte("session_date", from365Str)
        .lte("session_date", todayStr)
        .order("session_date", { ascending: false }),
    ]);

    if (checkinRes.error) throw new Error(checkinRes.error.message);
    if (rpeRes.error) throw new Error(rpeRes.error.message);

    // ── Build date sets ─────────────────────────────────────────────────
    const checkinDates = new Set(
      (checkinRes.data ?? []).map((r: { entry_date: string }) => r.entry_date)
    );
    const rpeDates = new Set(
      (rpeRes.data ?? []).map((r: { session_date: string }) => r.session_date)
    );

    // ── Calculate streaks (consecutive days ending today or yesterday) ──
    const checkinStreak = calculateStreak(checkinDates, today);
    const rpeStreak = calculateStreak(rpeDates, today);

    // ── Calculate 28-day completion rates ────────────────────────────────
    const checkinCount28 = countDaysInRange(checkinDates, from28Str, todayStr);
    const rpeCount28 = countDaysInRange(rpeDates, from28Str, todayStr);

    return NextResponse.json({
      ok: true,
      data: {
        checkin: {
          currentStreak: checkinStreak,
          days28: checkinCount28,
          rate28: Math.round((checkinCount28 / 28) * 100),
        },
        rpe: {
          currentStreak: rpeStreak,
          days28: rpeCount28,
          rate28: Math.round((rpeCount28 / 28) * 100),
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

/**
 * Calculate current streak of consecutive days.
 * Streak can start from today or yesterday (allows for "hasn't done today yet").
 */
function calculateStreak(dates: Set<string>, today: Date): number {
  const todayStr = toDateStr(today);

  // Start from today if present, otherwise from yesterday
  let startDate: Date;
  if (dates.has(todayStr)) {
    startDate = new Date(today);
  } else {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dates.has(toDateStr(yesterday))) {
      startDate = yesterday;
    } else {
      return 0;
    }
  }

  let streak = 0;
  const cursor = new Date(startDate);
  for (let i = 0; i < 365; i++) {
    if (dates.has(toDateStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function countDaysInRange(dates: Set<string>, from: string, to: string): number {
  let count = 0;
  const cursor = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cursor <= end) {
    if (dates.has(toDateStr(cursor))) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
