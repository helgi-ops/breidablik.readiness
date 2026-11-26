import "server-only";

/**
 * PT push reminders — in-app nudges' push counterpart, for when the athlete
 * hasn't opened the app. Two reminders, both pointing at the /client surface:
 *
 *   - session  : "You have a session today" (only on actual training days that
 *                aren't logged yet) → /client/log
 *   - weekly   : "Last week: 3 sessions · 4,250 kg" (Sunday recap) → /client/progression
 *
 * Reuses the existing push stack: player_push_subscriptions, sendWebPush (VAPID),
 * and a de-dupe log (pt_reminder_log). Dead subscriptions are pruned on 404/410.
 * Only PT-team clients (teams.team_type = 'personal_trainer') are targeted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSubscriptionGone, sendWebPush } from "@/lib/push/webPush";
import { resolveProgrammeSlot } from "@/lib/trainer/programmeSchedule";
import { isDemoClient } from "@/lib/trainer/demoClient";
import { asAppLang, type AppLang } from "@/lib/micropulse/strengthProgramming/playerLanguage";

type Sub = { id: string; player_id: string; endpoint: string; p256dh: string; auth: string; lang: AppLang };

type PtTeamRow = { team_type: string; default_language?: string | null };
type PtPlayerRow = { id: string; is_demo?: boolean | null; app_language?: string | null; teams: PtTeamRow | PtTeamRow[] | null };

/**
 * The language a reminder is written in: the client's app language when the app has
 * reported one, else the practice's default language, else English.
 */
export function reminderLang(row: Pick<PtPlayerRow, "app_language" | "teams">): AppLang {
  const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
  return asAppLang(row.app_language) ?? asAppLang(team?.default_language) ?? "EN";
}

/** "You have a session today" push text. */
export function ptSessionReminderText(lang: AppLang): { title: string; body: string } {
  return lang === "IS"
    ? { title: "Æfing í dag", body: "Þú átt æfingu í dag 🏋️ — opnaðu hana og skráðu settin." }
    : { title: "Session today", body: "You have a session today 🏋️ — open it and log your sets." };
}

/** Weekly recap push text (only sent when they trained). */
export function ptWeeklyRecapText(lang: AppLang, sessions: number, tonnageKg: number): { title: string; body: string } {
  const kg = Math.round(tonnageKg).toLocaleString(lang === "IS" ? "is-IS" : "en-GB");
  if (lang === "IS") {
    const s = `${sessions} ${sessions === 1 ? "æfing" : "æfingar"}`;
    return { title: "Vikan þín", body: tonnageKg > 0 ? `${s} · ${kg} kg lyft. Flott vinna 💪` : `${s}. Flott vinna 💪` };
  }
  const s = `${sessions} ${sessions === 1 ? "session" : "sessions"}`;
  return { title: "Your week", body: tonnageKg > 0 ? `${s} · ${kg} kg lifted. Great work 💪` : `${s}. Great work 💪` };
}

/**
 * The players a PT reminder may go to: clients of a personal-trainer team, never the
 * seeded demo client (players.is_demo — it has no account, but stay explicit).
 */
export function ptReminderPlayerIds(rows: PtPlayerRow[]): Set<string> {
  return new Set(
    rows
      .filter((p) => {
        const tt = Array.isArray(p.teams) ? p.teams[0]?.team_type : p.teams?.team_type;
        return tt === "personal_trainer" && !isDemoClient(p);
      })
      .map((p) => p.id),
  );
}

/** Active PT-client subscriptions, one per player (latest first). */
async function ptSubscriptions(sb: SupabaseClient): Promise<Sub[]> {
  const { data: subRows } = await sb
    .from("player_push_subscriptions")
    .select("id, player_id, endpoint, p256dh, auth, is_active, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  const subs = (subRows ?? []) as Array<Omit<Sub, "lang"> & { is_active: boolean }>;
  if (subs.length === 0) return [];

  // Keep only players that belong to a personal-trainer team.
  const playerIds = Array.from(new Set(subs.map((s) => s.player_id)));
  const { data: playerRows } = await sb
    .from("players")
    .select("id, team_id, is_demo, app_language, teams!inner(team_type, default_language)")
    .in("id", playerIds);
  const rows = (playerRows ?? []) as PtPlayerRow[];
  const ptPlayers = ptReminderPlayerIds(rows);
  const langOf = new Map(rows.map((r) => [r.id, reminderLang(r)]));

  const seen = new Set<string>();
  const out: Sub[] = [];
  for (const s of subs) {
    if (!ptPlayers.has(s.player_id) || seen.has(s.player_id)) continue;
    if (!s.endpoint || !s.p256dh || !s.auth) continue;
    seen.add(s.player_id);
    out.push({ id: s.id, player_id: s.player_id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, lang: langOf.get(s.player_id) ?? "EN" });
  }
  return out;
}

/** Reserve a (player, date, kind) send. Returns false if already reserved. */
async function reserve(sb: SupabaseClient, playerId: string, dateKey: string, kind: string): Promise<boolean> {
  const { error } = await sb.from("pt_reminder_log").insert({ player_id: playerId, reminder_date: dateKey, kind, status: "sent" });
  if (error) {
    if (error.code === "23505") return false; // already sent
    throw new Error(error.message);
  }
  return true;
}

async function push(sb: SupabaseClient, sub: Sub, payload: Record<string, unknown>): Promise<boolean> {
  try {
    await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
    return true;
  } catch (err) {
    if (isSubscriptionGone(err)) {
      await sb.from("player_push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
    }
    return false;
  }
}

function isoWeekday(iso: string): number {
  return ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7) + 1; // Mon=1..Sun=7
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** Does this client have a scheduled session TODAY (and hasn't logged it yet)? */
async function hasUnloggedSessionToday(sb: SupabaseClient, playerId: string, today: string): Promise<boolean> {
  // Already logged today → no reminder.
  const { data: logged } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date")
    .eq("player_id", playerId)
    .eq("session_date", today)
    .limit(1);
  if ((logged ?? []).length > 0) return false;

  // Explosive / starter assignment.
  const { data: ep } = await sb
    .from("pt_explosive_programme_assignments")
    .select("programme_key, start_date, sessions_per_week, status")
    .eq("client_id", playerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ep) {
    const a = ep as { programme_key: string; start_date: string; sessions_per_week: number | null };
    const { data: phaseRows } = await sb
      .from("pt_explosive_programmes")
      .select("phase, blocks, weeks_per_phase")
      .eq("programme_key", a.programme_key)
      .order("phase", { ascending: true });
    const phases = (phaseRows ?? []) as Array<{ phase: number; blocks: unknown; weeks_per_phase: number | null }>;
    const firstBlocks = Array.isArray(phases[0]?.blocks) ? (phases[0]!.blocks as unknown[]).length : 0;
    const effectiveFreq = a.sessions_per_week && a.sessions_per_week > 0 ? Math.min(6, a.sessions_per_week) : firstBlocks;
    const slot = resolveProgrammeSlot({
      programmeKey: a.programme_key,
      startDate: a.start_date,
      today,
      nBlocks: effectiveFreq,
      weeksPerPhase: phases[0]?.weeks_per_phase ?? 3,
      totalPhases: phases.length || 4,
    });
    return slot.kind === "session";
  }

  // Individual training plan: is there a session row for today's weekday/week?
  const { data: plan } = await sb
    .from("individual_training_plans")
    .select("id, start_date, end_date")
    .eq("player_id", playerId)
    .eq("status", "active")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (plan) {
    const p = plan as { id: string; start_date: string };
    const days = Math.max(0, Math.floor((Date.parse(today) - Date.parse(p.start_date)) / 86_400_000));
    const weekNumber = Math.floor(days / 7) + 1;
    const { data: sess } = await sb
      .from("individual_training_sessions")
      .select("id")
      .eq("plan_id", p.id)
      .eq("week_number", weekNumber)
      .eq("day_of_week", isoWeekday(today))
      .limit(1);
    return (sess ?? []).length > 0;
  }
  return false;
}

export type PtReminderResult = { targeted: number; sent: number; skippedDuplicate: number; failed: number };

/** "You have a session today" — sent on scheduled, unlogged training days. */
export async function sendPtSessionReminders(sb: SupabaseClient, today: string): Promise<PtReminderResult> {
  const subs = await ptSubscriptions(sb);
  let sent = 0, dup = 0, failed = 0, targeted = 0;
  for (const sub of subs) {
    if (!(await hasUnloggedSessionToday(sb, sub.player_id, today))) continue;
    targeted += 1;
    if (!(await reserve(sb, sub.player_id, today, "session"))) { dup += 1; continue; }
    const ok = await push(sb, sub, {
      ...ptSessionReminderText(sub.lang),
      url: "/client/log", type: "pt_session", date_key: today,
    });
    if (ok) sent += 1; else failed += 1;
  }
  return { targeted, sent, skippedDuplicate: dup, failed };
}

/** Sunday recap of last week's training (only if they trained). */
export async function sendPtWeeklyRecap(sb: SupabaseClient, today: string): Promise<PtReminderResult> {
  // Recap the Mon–Sun week that just ended (the week containing yesterday).
  const dow = isoWeekday(today); // Mon=1..Sun=7
  const thisMonday = addDaysIso(today, -(dow - 1));
  const lastMonday = addDaysIso(thisMonday, -7);
  const subs = await ptSubscriptions(sb);
  let sent = 0, dup = 0, failed = 0, targeted = 0;
  for (const sub of subs) {
    const { data: rows } = await sb
      .from("pt_exercise_set_logs")
      .select("session_date, weight_kg, reps")
      .eq("player_id", sub.player_id)
      .gte("session_date", lastMonday)
      .lt("session_date", thisMonday);
    const lw = (rows ?? []) as Array<{ session_date: string; weight_kg: number | null; reps: number | null }>;
    const sessions = new Set(lw.map((r) => r.session_date)).size;
    if (sessions === 0) continue;
    targeted += 1;
    if (!(await reserve(sb, sub.player_id, lastMonday, "weekly"))) { dup += 1; continue; }
    const tonnage = Math.round(lw.reduce((s, r) => s + (r.weight_kg ?? 0) * (r.reps ?? 0), 0));
    const ok = await push(sb, sub, { ...ptWeeklyRecapText(sub.lang, sessions, tonnage), url: "/client/progression", type: "pt_weekly", date_key: lastMonday });
    if (ok) sent += 1; else failed += 1;
  }
  return { targeted, sent, skippedDuplicate: dup, failed };
}
