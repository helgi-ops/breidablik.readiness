import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDateKeyInTimezone,
  getOperationalTimezone,
  type ReminderProfile,
} from "@/lib/notifications/schedule";
import { getReminderSlotsForDateKey, isPlayerExpectedForRpe } from "@/lib/session-rpe/reminderConfig";

type EligiblePlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  user_id: string | null;
};

type TeamProfileRow = {
  id: string;
  reminder_profile: string | null;
};

type SubmissionRow = {
  player_id: string;
  session_load: number | null;
  submitted_at: string | null;
  session_date: string;
};

type LogRow = {
  player_id: string;
  status: "sent" | "skipped" | "failed";
  metadata: Record<string, unknown> | null;
  sent_at: string | null;
  scheduled_slot: string;
};

function isMissingRpeNotificationLogError(input: unknown) {
  const err = input as { code?: string; message?: string; details?: string } | null | undefined;
  const code = String(err?.code ?? "");
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();
  if (code === "42P01") return true;
  return text.includes("rpe_notification_log") && (text.includes("schema cache") || text.includes("does not exist"));
}

export type RpeCompliancePlayer = {
  player_id: string;
  player_name: string;
  team_id: string | null;
};

export type RpeSubmittedPlayer = RpeCompliancePlayer & {
  submitted_at: string | null;
  total_sessions: number;
  total_load: number;
};

export type RpeMissingPlayer = RpeCompliancePlayer & {
  reminder_status: "sent" | "skipped_no_token" | "failed" | "not_sent_yet";
  latest_submission_date: string | null;
};

export type RpeComplianceSummary = {
  dateKey: string;
  slotKeys: string[];
  expectedCount: number;
  submittedCount: number;
  missingCount: number;
  notExpectedCount: number;
  compliancePct: number | null;
  remindersSent: number;
  remindersSkipped: number;
  remindersFailed: number;
  latestReminderAt: string | null;
};

export type RpeCompliancePayload = {
  summary: RpeComplianceSummary;
  expectedPlayers: RpeCompliancePlayer[];
  submittedPlayers: RpeSubmittedPlayer[];
  missingPlayers: RpeMissingPlayer[];
  notExpectedPlayers: RpeCompliancePlayer[];
};

async function getTeamIdsForProfile(
  sb: SupabaseClient,
  profile: ReminderProfile,
): Promise<Set<string>> {
  const { data, error } = await sb
    .from("teams")
    .select("id, reminder_profile")
    .eq("reminder_profile", profile);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TeamProfileRow[];
  return new Set(rows.map((r) => String(r.id)));
}

export async function getEligiblePlayersForRpe(
  sb: SupabaseClient,
  args: { teamId?: string | null; profile?: ReminderProfile }
): Promise<RpeCompliancePlayer[]> {
  let query = sb.from("players").select("id, full_name, team_id, user_id").not("user_id", "is", null);
  if (args.teamId) {
    query = query.eq("team_id", args.teamId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const all = ((data ?? []) as EligiblePlayerRow[]).map((row) => ({
    player_id: row.id,
    player_name: row.full_name ?? "Unknown player",
    team_id: row.team_id ?? null,
  }));

  if (!args.profile) return all;

  const teamIds = await getTeamIdsForProfile(sb, args.profile);
  return all.filter((p) => p.team_id && teamIds.has(String(p.team_id)));
}

function summarizeSubmissions(rows: SubmissionRow[], playersById: Map<string, RpeCompliancePlayer>) {
  const map = new Map<string, RpeSubmittedPlayer>();
  for (const row of rows) {
    const base = playersById.get(row.player_id);
    if (!base) continue;
    const cur = map.get(row.player_id) ?? {
      ...base,
      submitted_at: null,
      total_sessions: 0,
      total_load: 0,
    };
    cur.total_sessions += 1;
    cur.total_load += Number(row.session_load ?? 0);
    if (!cur.submitted_at || (row.submitted_at && row.submitted_at > cur.submitted_at)) {
      cur.submitted_at = row.submitted_at ?? cur.submitted_at;
    }
    map.set(row.player_id, cur);
  }
  return map;
}

export async function getRpeComplianceForDate(
  sb: SupabaseClient,
  args?: { teamId?: string | null; dateKey?: string; timeZone?: string; profile?: ReminderProfile }
): Promise<RpeCompliancePayload> {
  const timeZone = args?.timeZone ?? getOperationalTimezone();
  const dateKey = args?.dateKey ?? getDateKeyInTimezone(new Date(), timeZone);
  const slots = getReminderSlotsForDateKey(dateKey, timeZone, null, args?.profile ?? "breidablik_custom");
  const slotKeys = slots.map((s) => s.slotKey);

  const allPlayers = await getEligiblePlayersForRpe(sb, {
    teamId: args?.teamId ?? null,
    profile: args?.profile,
  });
  const playersById = new Map(allPlayers.map((p) => [p.player_id, p]));

  const expectedPlayers: RpeCompliancePlayer[] = [];
  const notExpectedPlayers: RpeCompliancePlayer[] = [];
  for (const player of allPlayers) {
    if (isPlayerExpectedForRpe({ dateKey, timeZone, profile: args?.profile })) expectedPlayers.push(player);
    else notExpectedPlayers.push(player);
  }

  const expectedIds = expectedPlayers.map((p) => p.player_id);
  const queryIds = expectedIds.length ? expectedIds : allPlayers.map((p) => p.player_id);

  let submissions: SubmissionRow[] = [];
  if (queryIds.length) {
    const { data, error } = await sb
      .from("session_rpe_entries")
      .select("player_id, session_load, submitted_at, session_date")
      .eq("session_date", dateKey)
      .in("player_id", queryIds);
    if (error) throw new Error(error.message);
    submissions = (data ?? []) as SubmissionRow[];
  }

  const submittedMap = summarizeSubmissions(submissions, playersById);
  const submittedPlayers = Array.from(submittedMap.values()).sort((a, b) => {
    const ta = a.submitted_at ?? "";
    const tb = b.submitted_at ?? "";
    return tb.localeCompare(ta);
  });
  const submittedSet = new Set(submittedPlayers.map((p) => p.player_id));

  let logs: LogRow[] = [];
  if (queryIds.length) {
    const { data, error } = await sb
      .from("rpe_notification_log")
      .select("player_id, status, metadata, sent_at, scheduled_slot")
      .eq("reminder_date", dateKey)
      .eq("notification_type", "session_rpe_missing")
      .in("player_id", queryIds);
    if (!error) {
      logs = (data ?? []) as LogRow[];
    } else if (!isMissingRpeNotificationLogError(error)) {
      throw new Error(error.message);
    }
  }

  const latestLogByPlayer = new Map<string, LogRow>();
  for (const row of logs) {
    const cur = latestLogByPlayer.get(row.player_id);
    if (!cur || String(row.sent_at ?? "") > String(cur.sent_at ?? "")) {
      latestLogByPlayer.set(row.player_id, row);
    }
  }

  const missingPlayers: RpeMissingPlayer[] = [];
  for (const player of expectedPlayers) {
    if (submittedSet.has(player.player_id)) continue;
    const log = latestLogByPlayer.get(player.player_id);
    let reminder_status: RpeMissingPlayer["reminder_status"] = "not_sent_yet";
    if (log?.status === "sent") reminder_status = "sent";
    else if (log?.status === "failed") reminder_status = "failed";
    else if (log?.status === "skipped") {
      const reason = String(log.metadata?.reason ?? "");
      reminder_status = reason === "no_push_token" ? "skipped_no_token" : "not_sent_yet";
    }
    missingPlayers.push({
      ...player,
      reminder_status,
      latest_submission_date: null,
    });
  }

  // Optional coach context: latest prior submission date for missing players.
  const missingIds = missingPlayers.map((p) => p.player_id);
  if (missingIds.length) {
    const { data, error } = await sb
      .from("session_rpe_entries")
      .select("player_id, session_date")
      .in("player_id", missingIds)
      .lte("session_date", dateKey)
      .order("session_date", { ascending: false });
    if (!error) {
      const latestDate = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ player_id: string; session_date: string }>) {
        if (!latestDate.has(row.player_id)) latestDate.set(row.player_id, row.session_date);
      }
      for (const player of missingPlayers) {
        player.latest_submission_date = latestDate.get(player.player_id) ?? null;
      }
    }
  }

  let remindersSent = 0;
  let remindersSkipped = 0;
  let remindersFailed = 0;
  let latestReminderAt: string | null = null;
  for (const row of logs) {
    if (row.status === "sent") remindersSent += 1;
    else if (row.status === "skipped") remindersSkipped += 1;
    else if (row.status === "failed") remindersFailed += 1;
    if (!latestReminderAt || String(row.sent_at ?? "") > latestReminderAt) {
      latestReminderAt = row.sent_at ?? latestReminderAt;
    }
  }

  const expectedCount = expectedPlayers.length;
  const submittedCount = expectedPlayers.filter((p) => submittedSet.has(p.player_id)).length;
  const missingCount = missingPlayers.length;
  const compliancePct = expectedCount > 0 ? Math.round((submittedCount / expectedCount) * 1000) / 10 : null;

  return {
    summary: {
      dateKey,
      slotKeys,
      expectedCount,
      submittedCount,
      missingCount,
      notExpectedCount: notExpectedPlayers.length,
      compliancePct,
      remindersSent,
      remindersSkipped,
      remindersFailed,
      latestReminderAt,
    },
    expectedPlayers,
    submittedPlayers,
    missingPlayers,
    notExpectedPlayers,
  };
}

export async function getPlayerRpeStatus(
  sb: SupabaseClient,
  args: { playerId: string; dateKey?: string; timeZone?: string }
) {
  const timeZone = args.timeZone ?? getOperationalTimezone();
  const dateKey = args.dateKey ?? getDateKeyInTimezone(new Date(), timeZone);
  const expectedToday = isPlayerExpectedForRpe({ dateKey, timeZone });

  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("submitted_at")
    .eq("player_id", args.playerId)
    .eq("session_date", dateKey)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ submitted_at: string | null }>;
  const todayEntriesCount = rows.length;
  const latestSubmissionAt = rows[0]?.submitted_at ?? null;
  const submittedToday = todayEntriesCount > 0;

  let state: "SUBMITTED_TODAY" | "REMINDER_DUE_TODAY" | "NOT_YET_SUBMITTED" | "NOT_EXPECTED_TODAY";
  if (submittedToday) state = "SUBMITTED_TODAY";
  else if (!expectedToday) state = "NOT_EXPECTED_TODAY";
  else state = "REMINDER_DUE_TODAY";

  // TODO(session-rpe): This compliance status will feed ACWR reliability,
  // neural load quality, and adaptive decision confidence in later phases.
  return {
    dateKey,
    expectedToday,
    submittedToday,
    todayEntriesCount,
    latestSubmissionAt,
    state,
  };
}
