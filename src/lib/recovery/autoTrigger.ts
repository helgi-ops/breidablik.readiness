import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAssignment } from "./loader";

/**
 * Stage 2 — auto-trigger recovery protocols based on yesterday's match load.
 *
 * Logic (run nightly via cron, or hourly for tighter detection):
 *   1. Find players whose most recent player_external_load_daily row is from
 *      "yesterday" or "today" AND has total_player_load > player's 28-day match
 *      baseline × 1.0.
 *   2. For each match-load player:
 *        - Auto-assign Post-Match VST Reset (due same evening, end of day)
 *        - Auto-assign MD+1 Recovery Bundle (due next morning ~8am UTC)
 *   3. Both inserts are idempotent (ensureAssignment dedupes on same date).
 *
 * The function is intentionally pure-DB and deterministic — no notifications
 * sent here. Push notifications can be added in a follow-up step.
 */

export type AutoTriggerResult = {
  scanned: number;
  matchLoadPlayers: number;
  assignmentsCreated: number;
  errors: string[];
};

const POST_MATCH_SLUG = "post_match_vst_reset";
const MD_PLUS_1_SLUG = "md_plus_1_recovery_bundle";

const PL_TRIGGER_MULTIPLIER = 1.0; // PL > player's match-day baseline × 1.0

export async function runRecoveryAutoTrigger(
  sb: SupabaseClient,
  args: { todayIso?: string } = {},
): Promise<AutoTriggerResult> {
  const todayIso = args.todayIso ?? new Date().toISOString().slice(0, 10);
  const result: AutoTriggerResult = {
    scanned: 0,
    matchLoadPlayers: 0,
    assignmentsCreated: 0,
    errors: [],
  };

  // Resolve protocol IDs (one query, cached for the whole run)
  const { data: protos, error: protoErr } = await sb
    .from("recovery_protocols")
    .select("id, slug")
    .in("slug", [POST_MATCH_SLUG, MD_PLUS_1_SLUG])
    .eq("active", true);
  if (protoErr || !protos || protos.length < 2) {
    result.errors.push(`Protocol lookup failed: ${protoErr?.message ?? "missing slugs"}`);
    return result;
  }
  const protoIds = new Map(protos.map((p) => [p.slug, p.id]));
  const postMatchId = protoIds.get(POST_MATCH_SLUG)!;
  const mdPlus1Id = protoIds.get(MD_PLUS_1_SLUG)!;

  // Pull today's Catapult rows for all players
  const { data: rows, error: rowsErr } = await sb
    .from("player_external_load_daily")
    .select("player_id, total_player_load, date")
    .eq("source", "catapult")
    .eq("date", todayIso);
  if (rowsErr) {
    result.errors.push(`Daily-row scan failed: ${rowsErr.message}`);
    return result;
  }

  result.scanned = rows?.length ?? 0;
  if (!rows || rows.length === 0) return result;

  // Pull team_id per player in one batch
  const playerIds = rows.map((r) => r.player_id);
  const { data: playerRows } = await sb
    .from("players")
    .select("id, team_id")
    .in("id", playerIds);
  const teamByPlayer = new Map<string, string | null>();
  for (const p of playerRows ?? []) teamByPlayer.set(p.id as string, (p.team_id as string | null) ?? null);

  // Pull each player's 28-day chronic mean to compare against
  const { data: chronicRows, error: chronicErr } = await sb
    .from("player_external_load_daily")
    .select("player_id, total_player_load")
    .eq("source", "catapult")
    .in("player_id", playerIds)
    .gte("date", new Date(Date.parse(todayIso) - 27 * 86_400_000).toISOString().slice(0, 10))
    .lte("date", todayIso);
  if (chronicErr) {
    result.errors.push(`Chronic-baseline scan failed: ${chronicErr.message}`);
    return result;
  }

  const chronicByPlayer = new Map<string, { sum: number; count: number }>();
  for (const r of chronicRows ?? []) {
    const v = Number(r.total_player_load ?? 0);
    if (!Number.isFinite(v) || v <= 0) continue;
    const id = r.player_id as string;
    const acc = chronicByPlayer.get(id) ?? { sum: 0, count: 0 };
    acc.sum += v;
    acc.count += 1;
    chronicByPlayer.set(id, acc);
  }

  // Process each player
  const todayDate = new Date(`${todayIso}T00:00:00Z`);
  const eveningDue = new Date(todayDate);
  eveningDue.setUTCHours(22, 0, 0, 0);
  const tomorrowMorningDue = new Date(todayDate);
  tomorrowMorningDue.setUTCDate(tomorrowMorningDue.getUTCDate() + 1);
  tomorrowMorningDue.setUTCHours(8, 0, 0, 0);

  for (const row of rows) {
    const pl = Number(row.total_player_load ?? 0);
    if (!Number.isFinite(pl) || pl <= 0) continue;

    const chronic = chronicByPlayer.get(row.player_id);
    if (!chronic || chronic.count < 8) continue; // need baseline

    const baseline = chronic.sum / chronic.count;
    if (pl <= baseline * PL_TRIGGER_MULTIPLIER) continue;

    result.matchLoadPlayers += 1;
    const teamId = teamByPlayer.get(row.player_id) ?? null;

    // Same-day evening: Post-Match VST Reset
    const postRes = await ensureAssignment(sb, {
      protocolId: postMatchId,
      playerId: row.player_id,
      teamId,
      dueAt: eveningDue.toISOString(),
      triggerReason: "auto_match_load",
      triggerMetadata: {
        match_load: pl,
        baseline,
        multiplier: PL_TRIGGER_MULTIPLIER,
      },
    });
    if (postRes.created) result.assignmentsCreated += 1;

    // Tomorrow morning: MD+1 Recovery Bundle
    const md1Res = await ensureAssignment(sb, {
      protocolId: mdPlus1Id,
      playerId: row.player_id,
      teamId,
      dueAt: tomorrowMorningDue.toISOString(),
      triggerReason: "auto_md_plus_1",
      triggerMetadata: {
        match_load: pl,
        baseline,
      },
    });
    if (md1Res.created) result.assignmentsCreated += 1;
  }

  return result;
}
