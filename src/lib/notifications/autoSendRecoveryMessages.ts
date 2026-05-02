import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isEliteTeam } from "@/lib/micropulse/elite";
import {
  generatePlayerMessage,
  type NotificationInput,
} from "@/lib/micropulse/playerRecoveryMessage";
import { pushCoachMessageToPlayer } from "@/lib/notifications/playerPush";

/**
 * Stig 2 — auto-send orchestrator.
 *
 * Scans a team's coach_notifications for rows that:
 *   - have NOT had a player message sent yet, AND
 *   - have NOT been acknowledged by a coach yet, AND
 *   - fired in the last `lookbackMinutes` window.
 *
 * For each one, generates an AI recovery message via the same library
 * the coach-review modal uses, inserts it into player_coach_messages,
 * stamps coach_notifications.player_message_sent_at + .player_message_id
 * + .auto_sent = true, and pushes the message to the player's PWA.
 *
 * Gating:
 *   - Skip entirely unless the team is on the ELITE plan tier.
 *   - Skip entirely unless team_settings.auto_send_player_recovery_messages
 *     is true. Both checks defend against config drift.
 *
 * Failure mode: if AI generation fails for one notification, we log and
 * continue — the row stays auto-send-eligible so the next pass (or a
 * coach manually drafting) picks it up. We never throw out of the
 * orchestrator; any partial failures land in the returned `errors`
 * counter but don't block the overall sync that called us.
 *
 * Returns the count actually sent in this pass.
 */
export async function autoSendPendingForTeam(
  supabase: SupabaseClient,
  teamId: string,
  opts: {
    /** Default IS — match the coach-review modal default for the locale Breiðablik runs in. */
    lang?: "EN" | "IS";
    /** Don't auto-send notifications older than this many minutes. Default 60. */
    lookbackMinutes?: number;
    /** Hard cap so a backfill burst doesn't flood the AI provider. */
    maxPerPass?: number;
  } = {},
): Promise<{ sent: number; skipped: number; errors: number }> {
  const lang = opts.lang ?? "IS";
  const lookback = opts.lookbackMinutes ?? 60;
  const cap = opts.maxPerPass ?? 25;

  // Tier gate first — non-ELITE never auto-sends regardless of setting.
  const elite = await isEliteTeam(supabase, teamId);
  if (!elite) return { sent: 0, skipped: 0, errors: 0 };

  // Setting gate — coach must have flipped the toggle.
  const { data: settingsRow } = await supabase
    .from("team_settings")
    .select("auto_send_player_recovery_messages")
    .eq("team_id", teamId)
    .maybeSingle();
  const enabled = Boolean(
    (settingsRow as { auto_send_player_recovery_messages?: boolean } | null)
      ?.auto_send_player_recovery_messages,
  );
  if (!enabled) return { sent: 0, skipped: 0, errors: 0 };

  // Pull eligible notifications.
  const since = new Date(Date.now() - lookback * 60_000).toISOString();
  const { data: pending, error: pendingErr } = await supabase
    .from("coach_notifications")
    .select(`
      id, parameter, direction, severity, value_now, value_prev,
      summary, summary_is, is_post_match, fired_at,
      player_id, players!inner ( full_name, position )
    `)
    .eq("team_id", teamId)
    .is("player_message_sent_at", null)
    .is("acknowledged_at", null)
    .gte("fired_at", since)
    .order("fired_at", { ascending: true })
    .limit(cap);

  if (pendingErr || !pending || pending.length === 0) {
    return { sent: 0, skipped: 0, errors: pendingErr ? 1 : 0 };
  }

  type Row = {
    id: string;
    parameter: string;
    direction: string;
    severity: string;
    value_now: number | null;
    value_prev: number | null;
    summary: string | null;
    summary_is: string | null;
    is_post_match: boolean | null;
    fired_at: string;
    player_id: string;
    players: { full_name: string | null; position: string | null };
  };

  const rows = pending as unknown as Row[];

  // Atlantic/Reykjavik to match the regular /api/messages entry_date.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const input: NotificationInput = {
      parameter: row.parameter,
      direction: row.direction,
      severity: row.severity,
      player_name: row.players.full_name ?? "Athlete",
      position: row.players.position,
      value_now: row.value_now,
      value_prev: row.value_prev,
      summary: lang === "IS" ? (row.summary_is ?? row.summary) : row.summary,
      is_post_match: row.is_post_match,
    };

    let messageBody: string;
    try {
      const result = await generatePlayerMessage(input, lang);
      messageBody = result.message.trim();
    } catch (err) {
      console.error("[autoSendRecovery] AI generation failed for notif", row.id, err);
      errors++;
      continue;
    }

    // Defensive: abort this row if generation produced something the
    // manual API would reject anyway.
    if (messageBody.length < 40 || messageBody.length > 2000) {
      skipped++;
      continue;
    }

    // Insert player message. sender_id is null (system), sender_role
    // remains COACH so the player UI treats it the same as any other
    // coach message — the badge + bookkeeping is on the coach side.
    const { data: inserted, error: insertErr } = await supabase
      .from("player_coach_messages")
      .insert({
        player_id: row.player_id,
        team_id: teamId,
        entry_date: today,
        sender_id: null,
        sender_role: "COACH",
        body: messageBody,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("[autoSendRecovery] insert failed", row.id, insertErr);
      errors++;
      continue;
    }

    const messageId = (inserted as { id: string }).id;

    // Link back to notification + mark auto_sent so the coach UI knows
    // not to render the "Draft AI msg" button.
    const { error: updateErr } = await supabase
      .from("coach_notifications")
      .update({
        player_message_sent_at: new Date().toISOString(),
        player_message_id: messageId,
        auto_sent: true,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.error("[autoSendRecovery] link-back failed", row.id, updateErr);
      // Don't roll back — the player got the message, just log.
    }

    // Push to player's PWA so they get a phone notification.
    try {
      await pushCoachMessageToPlayer(supabase, row.player_id, messageBody);
    } catch (err) {
      console.error("[autoSendRecovery] push failed", row.id, err);
      // Same as above — message is delivered to the app inbox even if
      // push fails.
    }

    sent++;
  }

  return { sent, skipped, errors };
}
