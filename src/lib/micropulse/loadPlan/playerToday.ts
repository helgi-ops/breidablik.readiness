import "server-only";

/**
 * src/lib/micropulse/loadPlan/playerToday.ts
 *
 * ONE source for a player's "today" load picture, shared by the morning outlook
 * (/api/player/today-load) and the evening recap (/api/player/today-recap) so the
 * recap's planned target is provably the SAME number the morning card showed.
 *
 * Everything is the player's OWN data (works for inactive demo players too):
 *   - outlook: the microcycle plan (resolveMdContext + planSessionLoad).
 *   - personalTarget: the player's own average player-load on past days of the
 *     SAME MD-day (their "usual MD-4") — real sessions only (estimated excluded).
 *   - flag: their own load trend (ACWR band → build/ok/reduce).
 *   - eased: their own check-in colour (canonical v8) — yellow/red.
 *   - actualToday: today's REAL (non-estimated) player-load, for the recap.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMdContext, sameMdDayDates } from "@/lib/micropulse/loadPlan/forTeam";
import { planSessionLoad, type PlannedSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { computePlayerLoadAcwr } from "@/lib/micropulse/playerLoadAcwr";

export type PlayerToday = {
  planned: PlannedSessionLoad;
  personalTarget: number | null;
  personalN: number;
  flag: "ok" | "build" | "reduce" | null;
  eased: "yellow" | "red" | null;
  /** Today's own REAL (non-estimated) player load, or null if none captured yet. */
  actualToday: number | null;
};

function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function computePlayerToday(
  sb: SupabaseClient, playerId: string, teamId: string, today: string,
): Promise<PlayerToday> {
  // Outlook (shared microcycle engine).
  const md = await resolveMdContext(sb, teamId, today);
  const planned = planSessionLoad({ mdDay: md.mdDay, dayType: md.dayType, focus: md.focus });

  // The player's own load history (180 days), REAL sessions only (exclude
  // estimated pod-forgot rows — they must not feed a "usual" or an "actual").
  const since = addDaysISO(today, -180);
  const { data: rows } = await sb
    .from("player_external_load_daily")
    .select("date, total_player_load, raw_payload_json")
    .eq("player_id", playerId)
    .in("source", ["catapult", "manual"])
    .gte("date", since)
    .lte("date", today);
  const loadByDate = new Map<string, number>();
  for (const r of (rows ?? []) as Array<{ date: string; total_player_load: number | null; raw_payload_json: unknown }>) {
    if ((r.raw_payload_json as { estimated?: boolean } | null)?.estimated) continue;
    const v = typeof r.total_player_load === "number" ? r.total_player_load : Number(r.total_player_load);
    if (Number.isFinite(v) && v > 0) loadByDate.set(r.date, Math.max(loadByDate.get(r.date) ?? 0, v));
  }

  // Personal target = the player's own average on past days of THIS MD-day.
  let personalTarget: number | null = null;
  let personalN = 0;
  if (planned.applicable && planned.mdLabel) {
    const dates = await sameMdDayDates(sb, teamId, planned.mdLabel, today);
    const vals = dates.map((d) => loadByDate.get(d)).filter((v): v is number => typeof v === "number" && v > 0);
    if (vals.length) {
      personalTarget = Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
      personalN = vals.length;
    }
  }

  // Load trend (own ACWR) → plain flag.
  const acwr = computePlayerLoadAcwr(
    Array.from(loadByDate.entries()).map(([date, load]) => ({ date, load })),
    today,
  );
  const flag: PlayerToday["flag"] =
    acwr.band === "SAFE" ? "ok" : acwr.band === "UNDERTRAIN" ? "build" : (acwr.band === "WATCH" || acwr.band === "RISK") ? "reduce" : null;

  // Own readiness colour (canonical v8) for the "eased" note.
  let eased: PlayerToday["eased"] = null;
  try {
    const { data: rd } = await sb
      .from("v_coach_readiness_today_v8").select("final_color")
      .eq("player_id", playerId).eq("entry_date", today).maybeSingle();
    const c = String((rd as { final_color?: string | null } | null)?.final_color ?? "").toLowerCase();
    eased = c === "red" ? "red" : c === "yellow" ? "yellow" : null;
  } catch { /* readiness optional */ }

  return { planned, personalTarget, personalN, flag, eased, actualToday: loadByDate.get(today) ?? null };
}
