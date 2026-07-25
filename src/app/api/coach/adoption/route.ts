export const runtime = "nodejs";

/**
 * /api/coach/adoption
 *
 * GET — reads THIS coach's own usage against benchmarks and returns at most one
 * adoption nudge (the pure classifier decides; this route only assembles signals).
 *
 * No new instrumentation: it consumes the usage_events telemetry that already
 * carries role='COACH' + path (service-role only — hence server-side), plus the
 * compliance view and coach_week_setup. Every unknown signal degrades to a
 * NON-triggering value so a missing query can never fire a false nudge. The outcome
 * tie-in is left null here — a real cross-club "clubs that do X see Y" stat is a
 * follow-up; the module omits it rather than inventing one.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { classifyAdoption, type AdoptionInput } from "@/lib/micropulse/adoption/coachAdoption";

const WINDOW_DAYS = 28;

// Deeper "why" surfaces — opening any one counts as breadth of use.
const DEEP_SURFACES = new Set<string>([
  "/coach/load-intelligence", "/coach/decel-intelligence", "/coach/ima-intelligence",
  "/coach/hsr-intelligence", "/coach/quadrant", "/coach/indoor-load",
  "/coach/position-comparison", "/coach/match-movement",
]);

function isoMonday(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + ((day === 0 ? -6 : 1) - day));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 as const };
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 as const };
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 as const };
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 as const };
  return { userId, teamId };
}

/** Squad check-in share over [fromISO, toISO], or null when nothing is comparable. */
async function complianceShare(
  sb: ReturnType<typeof getSupabase>, teamId: string, fromISO: string, toISO: string,
): Promise<number | null> {
  try {
    const { data, error } = await sb
      .from("v_player_submission_compliance")
      .select("checkin_status")
      .eq("team_id", teamId)
      .gte("day", fromISO)
      .lte("day", toISO);
    if (error || !data || data.length === 0) return null;
    const submitted = data.filter((r) => (r as { checkin_status?: string }).checkin_status === "submitted").length;
    return submitted / data.length;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sb = getSupabase();
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - WINDOW_DAYS);

  // ── Usage signals (this coach's own page views) ──────────────────────────
  let historyDays = 0;
  let daysSinceLastLogin: number | null = null;
  let sessionsPerWeek = 0;
  let distinctPathsOpened = 0;
  let openedAnyIntelligence = false;

  try {
    const { data: ev } = await sb
      .from("usage_events")
      .select("path, occurred_at")
      .eq("user_id", auth.userId)
      .eq("event_type", "page_view")
      .gte("occurred_at", windowStart.toISOString())
      .order("occurred_at", { ascending: false });
    const rows = (ev ?? []) as Array<{ path: string; occurred_at: string }>;

    // Earliest-ever page view → how much history we can judge on.
    const { data: firstRow } = await sb
      .from("usage_events")
      .select("occurred_at")
      .eq("user_id", auth.userId)
      .eq("event_type", "page_view")
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const firstAt = (firstRow as { occurred_at?: string } | null)?.occurred_at;

    historyDays = firstAt ? Math.min(WINDOW_DAYS * 2, daysBetween(now, new Date(firstAt))) : 0;
    daysSinceLastLogin = rows.length
      ? daysBetween(now, new Date(rows[0].occurred_at))
      : firstAt ? daysBetween(now, new Date(firstAt)) : null;

    const dayset = new Set(rows.map((r) => r.occurred_at.slice(0, 10)));
    sessionsPerWeek = dayset.size / (WINDOW_DAYS / 7);
    const pathset = new Set(rows.map((r) => r.path));
    distinctPathsOpened = pathset.size;
    openedAnyIntelligence = [...pathset].some((p) => DEEP_SURFACES.has(p));
  } catch {
    // Can't read usage → fall through with historyDays 0 → insufficient (quiet).
  }

  // ── Week setup present for the current week? ─────────────────────────────
  let weekSetupPresent = true; // unknown → don't fire a false nudge
  try {
    const { data: ws } = await sb
      .from("coach_week_setup")
      .select("id")
      .eq("team_id", auth.teamId)
      .eq("week_start_date", isoMonday(now))
      .maybeSingle();
    weekSetupPresent = !!ws;
  } catch { /* keep the safe default */ }

  // ── Check-in compliance now vs the previous window ───────────────────────
  const d = (back: number) => { const x = new Date(now); x.setDate(now.getDate() - back); return isoDay(x); };
  const checkinComplianceNow = await complianceShare(sb, auth.teamId, d(6), d(0));
  const checkinCompliancePrev = await complianceShare(sb, auth.teamId, d(13), d(7));

  const input: AdoptionInput = {
    historyDays,
    daysSinceLastLogin,
    sessionsPerWeek,
    distinctPathsOpened,
    openedAnyIntelligence,
    weekSetupPresent,
    checkinComplianceNow: checkinComplianceNow ?? 1, // unknown → non-triggering
    checkinCompliancePrev,
    outcomeTieIn: null, // never invented; a real cross-club stat is a follow-up
  };

  const verdict = classifyAdoption(input);
  return NextResponse.json({ ok: true, verdict, signals: input });
}
