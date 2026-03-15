import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "@/lib/email/sendTransactionalEmail";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";

export type EmailReminderType = "readiness" | "rpe";

type PlayerEmailRow = {
  player_id: string;
  team_id: string | null;
  user_id: string;
  full_name: string | null;
  first_name: string | null;
  email: string;
  is_active: boolean;
};

type WeekPlanRow = {
  team_id: string;
  day_type: string | null;
};

type RunDetail = {
  playerId: string;
  email: string | null;
  status:
    | "sent"
    | "skipped_no_email"
    | "skipped_inactive"
    | "skipped_already_submitted"
    | "skipped_not_training_day"
    | "skipped_duplicate"
    | "failed";
  reason: string;
};

export type EmailReminderRunResult = {
  reminderType: EmailReminderType;
  sentForDate: string;
  timeZone: string;
  eligiblePlayers: number;
  selectedPlayers: number;
  sentCount: number;
  skippedCount: number;
  duplicateBlockedCount: number;
  failedCount: number;
  details: RunDetail[];
};

function toDateString(dateKey: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  return new Date(dateKey).toISOString().slice(0, 10);
}

function firstNameFromRow(row: PlayerEmailRow): string {
  const first = String(row.first_name ?? "").trim();
  if (first) return first;
  const full = String(row.full_name ?? "").trim();
  if (full) return full.split(/\s+/)[0] ?? "Player";
  const mail = String(row.email ?? "").trim();
  if (mail.includes("@")) return mail.split("@")[0] || "Player";
  return "Player";
}

function readinessEmailText(firstName: string): { subject: string; text: string } {
  return {
    subject: "MicroPulse – Daily Readiness Check",
    text: `Hi ${firstName},\n\nPlease complete your daily readiness check in MicroPulse before the day starts.\n\nYour response helps the coaching staff monitor recovery, fatigue, and training readiness.\n\nOpen check-in:\nhttps://www.micropulse.is/player\n\nThank you.`,
  };
}

function rpeEmailText(firstName: string): { subject: string; text: string } {
  return {
    subject: "MicroPulse – Post Training RPE",
    text: `Hi ${firstName},\n\nPlease submit your post-training RPE in MicroPulse.\n\nThis helps us track internal load and understand how demanding the session was for you.\n\nOpen RPE:\nhttps://www.micropulse.is/player\n\nThank you.`,
  };
}

async function getActivePlayersWithEmail(sb: SupabaseClient, teamId?: string | null): Promise<PlayerEmailRow[]> {
  const { data, error } = await sb.rpc("get_active_players_with_email", {
    p_team_id: teamId ?? null,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as PlayerEmailRow[]).filter((p) => !!p.player_id);
}

async function getSubmittedReadinessPlayerIds(sb: SupabaseClient, dateKey: string, playerIds: string[]): Promise<Set<string>> {
  if (!playerIds.length) return new Set();
  const { data, error } = await sb
    .from("readiness_entries")
    .select("player_id")
    .eq("entry_date", dateKey)
    .in("player_id", playerIds);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ player_id: string }>).map((r) => String(r.player_id)));
}

async function getSubmittedRpePlayerIds(sb: SupabaseClient, dateKey: string, playerIds: string[]): Promise<Set<string>> {
  if (!playerIds.length) return new Set();
  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("player_id")
    .eq("session_date", dateKey)
    .in("player_id", playerIds);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ player_id: string }>).map((r) => String(r.player_id)));
}

async function getTrainingDayTeamMap(sb: SupabaseClient, dateKey: string, teamIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (!teamIds.length) return map;

  const { data, error } = await sb.from("week_plans").select("team_id, day_type").eq("day_date", dateKey).in("team_id", teamIds);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as WeekPlanRow[]) {
    const dayType = String(row.day_type ?? "").toUpperCase();
    map.set(String(row.team_id), dayType !== "OFF");
  }

  return map;
}

async function reserveEmailLog(
  sb: SupabaseClient,
  args: { playerId: string; reminderType: EmailReminderType; sentForDate: string; subject: string; emailTo: string }
): Promise<string | null> {
  const { data, error } = await sb
    .from("email_reminder_log")
    .insert({
      player_id: args.playerId,
      reminder_type: args.reminderType,
      sent_for_date: args.sentForDate,
      delivery_channel: "email",
      status: "pending",
      subject: args.subject,
      email_to: args.emailTo,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  return ((data as { id?: string } | null)?.id ?? null) as string | null;
}

async function finalizeEmailLog(
  sb: SupabaseClient,
  args: { logId: string; status: "sent" | "failed" | "skipped"; providerMessageId?: string | null; errorMessage?: string | null; metadata?: Record<string, unknown> }
) {
  const { error } = await sb
    .from("email_reminder_log")
    .update({
      status: args.status,
      provider_message_id: args.providerMessageId ?? null,
      error_message: args.errorMessage ?? null,
      metadata: args.metadata ?? {},
      sent_at: new Date().toISOString(),
    })
    .eq("id", args.logId);

  if (error) throw new Error(error.message);
}

export async function runReadinessEmailReminders(
  sb: SupabaseClient,
  args?: { dateKey?: string; timeZone?: string; teamId?: string | null }
): Promise<EmailReminderRunResult> {
  const timeZone = args?.timeZone ?? getOperationalTimezone();
  const dateKey = toDateString(args?.dateKey ?? getDateKeyInTimezone(new Date(), timeZone));

  const players = await getActivePlayersWithEmail(sb, args?.teamId ?? null);
  const playerIds = players.map((p) => p.player_id);
  const submittedSet = await getSubmittedReadinessPlayerIds(sb, dateKey, playerIds);

  const details: RunDetail[] = [];
  let selectedPlayers = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let duplicateBlockedCount = 0;
  let failedCount = 0;

  for (const player of players) {
    if (!player.is_active) {
      skippedCount += 1;
      details.push({ playerId: player.player_id, email: player.email ?? null, status: "skipped_inactive", reason: "player_inactive" });
      continue;
    }

    if (!player.email) {
      skippedCount += 1;
      details.push({ playerId: player.player_id, email: null, status: "skipped_no_email", reason: "missing_email" });
      continue;
    }

    if (submittedSet.has(player.player_id)) {
      skippedCount += 1;
      details.push({ playerId: player.player_id, email: player.email, status: "skipped_already_submitted", reason: "already_submitted_readiness" });
      continue;
    }

    const firstName = firstNameFromRow(player);
    const copy = readinessEmailText(firstName);
    const logId = await reserveEmailLog(sb, {
      playerId: player.player_id,
      reminderType: "readiness",
      sentForDate: dateKey,
      subject: copy.subject,
      emailTo: player.email,
    });

    if (!logId) {
      duplicateBlockedCount += 1;
      details.push({ playerId: player.player_id, email: player.email, status: "skipped_duplicate", reason: "duplicate_blocked" });
      continue;
    }

    selectedPlayers += 1;

    try {
      const sent = await sendTransactionalEmail({
        to: player.email,
        subject: copy.subject,
        text: copy.text,
      });
      sentCount += 1;
      details.push({ playerId: player.player_id, email: player.email, status: "sent", reason: "email_sent" });
      await finalizeEmailLog(sb, {
        logId,
        status: "sent",
        providerMessageId: sent.providerMessageId ?? null,
      });
    } catch (error) {
      failedCount += 1;
      details.push({
        playerId: player.player_id,
        email: player.email,
        status: "failed",
        reason: error instanceof Error ? error.message : "email_send_failed",
      });
      await finalizeEmailLog(sb, {
        logId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "email_send_failed",
      });
    }
  }

  return {
    reminderType: "readiness",
    sentForDate: dateKey,
    timeZone,
    eligiblePlayers: players.length,
    selectedPlayers,
    sentCount,
    skippedCount,
    duplicateBlockedCount,
    failedCount,
    details,
  };
}

export async function runRpeEmailReminders(
  sb: SupabaseClient,
  args?: { dateKey?: string; timeZone?: string; teamId?: string | null }
): Promise<EmailReminderRunResult> {
  const timeZone = args?.timeZone ?? getOperationalTimezone();
  const dateKey = toDateString(args?.dateKey ?? getDateKeyInTimezone(new Date(), timeZone));

  const players = await getActivePlayersWithEmail(sb, args?.teamId ?? null);
  const playerIds = players.map((p) => p.player_id);
  const submittedSet = await getSubmittedRpePlayerIds(sb, dateKey, playerIds);
  const teamIds = Array.from(new Set(players.map((p) => String(p.team_id ?? "")).filter(Boolean)));
  const trainingDayByTeam = await getTrainingDayTeamMap(sb, dateKey, teamIds);

  const details: RunDetail[] = [];
  let selectedPlayers = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let duplicateBlockedCount = 0;
  let failedCount = 0;

  for (const player of players) {
    if (!player.is_active) {
      skippedCount += 1;
      details.push({ playerId: player.player_id, email: player.email ?? null, status: "skipped_inactive", reason: "player_inactive" });
      continue;
    }

    if (!player.email) {
      skippedCount += 1;
      details.push({ playerId: player.player_id, email: null, status: "skipped_no_email", reason: "missing_email" });
      continue;
    }

    const trainingDay = player.team_id ? trainingDayByTeam.get(String(player.team_id)) === true : false;
    if (!trainingDay) {
      skippedCount += 1;
      details.push({ playerId: player.player_id, email: player.email, status: "skipped_not_training_day", reason: "not_training_day_today" });
      continue;
    }

    if (submittedSet.has(player.player_id)) {
      skippedCount += 1;
      details.push({ playerId: player.player_id, email: player.email, status: "skipped_already_submitted", reason: "already_submitted_rpe" });
      continue;
    }

    const firstName = firstNameFromRow(player);
    const copy = rpeEmailText(firstName);
    const logId = await reserveEmailLog(sb, {
      playerId: player.player_id,
      reminderType: "rpe",
      sentForDate: dateKey,
      subject: copy.subject,
      emailTo: player.email,
    });

    if (!logId) {
      duplicateBlockedCount += 1;
      details.push({ playerId: player.player_id, email: player.email, status: "skipped_duplicate", reason: "duplicate_blocked" });
      continue;
    }

    selectedPlayers += 1;

    try {
      const sent = await sendTransactionalEmail({
        to: player.email,
        subject: copy.subject,
        text: copy.text,
      });
      sentCount += 1;
      details.push({ playerId: player.player_id, email: player.email, status: "sent", reason: "email_sent" });
      await finalizeEmailLog(sb, {
        logId,
        status: "sent",
        providerMessageId: sent.providerMessageId ?? null,
      });
    } catch (error) {
      failedCount += 1;
      details.push({
        playerId: player.player_id,
        email: player.email,
        status: "failed",
        reason: error instanceof Error ? error.message : "email_send_failed",
      });
      await finalizeEmailLog(sb, {
        logId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "email_send_failed",
      });
    }
  }

  return {
    reminderType: "rpe",
    sentForDate: dateKey,
    timeZone,
    eligiblePlayers: players.length,
    selectedPlayers,
    sentCount,
    skippedCount,
    duplicateBlockedCount,
    failedCount,
    details,
  };
}
