/**
 * GET /api/player/return-to-training
 *
 * Player-facing, self-scoped view of their OWN graded return-to-training plan.
 * Resolves the player from their auth token (never a path param), reuses the
 * same buildRttForPlayer engine the coach page uses, and returns only an
 * ENCOURAGING PROGRESS SUMMARY — which week, this week's focus, what unlocks
 * next, and a gentle on-track signal. No ACWR, no re-injury framing, no raw
 * numbers: that stays on the coach/S&C surface. Returns { active: false } when
 * the player isn't in a started plan (the card then renders nothing).
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { buildRttForPlayer } from "@/lib/micropulse/rttForPlayer";
import { RTT_QUALITY_LABELS } from "@/lib/micropulse/returnToTraining";
import type { QualityKey } from "@/lib/micropulse/returnToTraining";

export const runtime = "nodejs";

const DEFAULT_ORDER = ["volume", "distance", "hsr", "sprint", "accel", "decel", "decelHigh", "cod", "efforts"] as const;

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: pl } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ active: false });

    const built = await buildRttForPlayer(sb, playerId, teamId, 180);
    const r = built.result;
    const plan = r.plan;
    // Active only once a coach has STARTED the graded return and a plan exists.
    if (!plan || !built.rttStartDate) return NextResponse.json({ active: false });

    const order = (r.qualityOrder && r.qualityOrder.length ? r.qualityOrder : DEFAULT_ORDER) as readonly string[];
    const totalWeeks = Math.max(1, ...plan.weeks.map((w) => w.week));
    const currentWeek = Math.min(totalWeeks, Math.max(1, plan.currentWeek));

    // This week's focus = qualities actively trained (unlocked) this week.
    const thisWeekFocus = order.filter((q) =>
      plan.weeks.some((w) => w.week === currentWeek && w.quality === q && !w.locked && w.target > 0),
    );
    // What newly unlocks next week (a "coming up" carrot).
    const unlocksNext = order.filter((q) =>
      plan.weeks.some((w) => w.quality === q && w.unlockWeek === currentWeek + 1),
    );

    // Gentle on-track signal from this week's adherence. "over" = ahead of the
    // week's cap (the one thing worth easing back on); otherwise "on".
    const adh = r.adherence?.find((a) => a.week === currentWeek) ?? null;
    const overCells = adh ? adh.cells.filter((c) => c.status === "over" && c.target > 0) : [];
    const onTrack: "on" | "over" | null = !adh ? null : overCells.length > 0 ? "over" : "on";

    // This week's raw numbers per quality — surfaced only behind the player's
    // "Show numbers" toggle (layered read), so the default card stays plain.
    const cells = adh?.cells ?? [];
    const weekNumbers = thisWeekFocus.map((q) => {
      const cell = cells.find((c) => c.quality === q) ?? null;
      const meta = RTT_QUALITY_LABELS[q as QualityKey];
      const dp = meta?.dp ?? 0;
      const round = (n: number) => Number(n.toFixed(dp));
      const planTarget = plan.weeks.find((w) => w.week === currentWeek && w.quality === q)?.target ?? cell?.target ?? 0;
      return {
        key: q,
        target: round(cell?.target ?? planTarget),
        actual: cell ? round(cell.actual) : null,
        unit: meta?.unit ?? "",
        status: cell?.status ?? null,
      };
    });

    return NextResponse.json({
      active: true,
      currentWeek,
      totalWeeks,
      finalWeek: currentWeek >= totalWeeks,
      thisWeekFocus,
      unlocksNext,
      onTrack,
      sessionsThisWeek: adh?.sessions ?? 0,
      inProgress: adh?.inProgress ?? true,
      weekNumbers,
    });
  } catch (e) {
    // Never break Today over this optional card — just render nothing.
    return NextResponse.json({ active: false, error: e instanceof Error ? e.message : "error" });
  }
}
