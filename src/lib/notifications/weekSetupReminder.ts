import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

/**
 * Week-setup reminder — a morning nudge to the coach when this week's plan hasn't
 * been set up yet.
 *
 * For every team with strength auto-send ON, if there is no `week_plans` row for
 * TODAY, the coach clearly hasn't set the week up. We remind the team's coaches to
 * do so — piggybacked on the morning outlook cron window (~08:00), which is BEFORE
 * the 09:00 strength auto-send, so the coach has time to react.
 *
 * MD context itself still resolves from the fixture list (`match_schedule`) via
 * `fetchMdContext`, so the session isn't blindly wrong; the message says whether MD
 * is being guessed from a fixture or is unknown. Deduped per (coach, 'week_setup',
 * today). Descriptive operational reminder — it never touches the readiness verdict.
 */

const DAY = 24 * 60 * 60 * 1000;

export type WeekSetupReminderResult = {
  teamsChecked: number;
  teamsNeedingSetup: number;
  coachesNotified: number;
  coachesSkippedAlreadySent: number;
  pushCount: number;
};

/** Coaches on a team: role-tagged profiles ∪ coach_teams (same resolution as push.ts). */
async function resolveCoachIds(sb: SupabaseClient, teamId: string): Promise<string[]> {
  const { data: profs } = await sb.from("profiles").select("id, role").eq("team_id", teamId);
  const roleIds = ((profs ?? []) as Array<{ id: string; role: string | null }>)
    .filter((c) => ["coach", "admin", "staff"].includes(String(c.role ?? "").toLowerCase()))
    .map((c) => c.id);
  const { data: ct } = await sb.from("coach_teams").select("coach_id").eq("team_id", teamId);
  const ctIds = ((ct ?? []) as Array<{ coach_id: string }>).map((r) => r.coach_id);
  return Array.from(new Set([...roleIds, ...ctIds])).filter(Boolean);
}

async function pushToCoach(sb: SupabaseClient, profileId: string, payload: Record<string, unknown>): Promise<boolean> {
  const { data: subs } = await sb
    .from("coach_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId)
    .eq("is_active", true);
  let ok = false;
  for (const s of (subs ?? []) as Array<{ id: string; endpoint: string | null; p256dh: string | null; auth: string | null }>) {
    if (!s.endpoint || !s.p256dh || !s.auth) continue;
    try {
      await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
      ok = true;
    } catch (err) {
      if (isSubscriptionGone(err)) {
        await sb.from("coach_push_subscriptions").update({ is_active: false }).eq("id", s.id);
      } else {
        console.error("[week-setup] push error", err);
      }
    }
  }
  return ok;
}

export async function runWeekSetupReminder(
  sb: SupabaseClient,
  opts: { dateKey: string },
): Promise<WeekSetupReminderResult> {
  const { dateKey } = opts;
  const res: WeekSetupReminderResult = {
    teamsChecked: 0, teamsNeedingSetup: 0, coachesNotified: 0,
    coachesSkippedAlreadySent: 0, pushCount: 0,
  };

  // Only teams that auto-send matter here: a forgotten week means the 09:00 send
  // pushes a guessed session. (Manual-send teams set the day themselves at send time.)
  const { data: teams } = await sb
    .from("teams")
    .select("id")
    .eq("strength_auto_send", true);
  const teamRows = (teams ?? []) as Array<{ id: string }>;

  for (const team of teamRows) {
    res.teamsChecked++;

    // "Set up" for today = a week_plans row exists for today's date.
    const { data: plan } = await sb
      .from("week_plans")
      .select("day_date")
      .eq("team_id", team.id)
      .eq("day_date", dateKey)
      .limit(1)
      .maybeSingle();
    if (plan) continue; // today is planned → nothing to nudge
    res.teamsNeedingSetup++;

    // Can MD at least be guessed from the fixture list? Tailors the message.
    const todayMs = new Date(`${dateKey}T00:00:00Z`).getTime();
    const isoAt = (o: number) => new Date(todayMs + o * DAY).toISOString().slice(0, 10);
    const { data: fixtures } = await sb
      .from("match_schedule")
      .select("match_date")
      .eq("team_id", team.id)
      .gte("match_date", isoAt(-3))
      .lte("match_date", isoAt(5));
    const hasFixture = ((fixtures ?? []) as Array<{ match_date: string | null }>).some((r) => r.match_date);

    const body = hasFixture
      ? "Þú átt eftir að setja upp vikuna í dag. Sjálf-sending styrktaræfinga keyrir kl. 09:00 — MD-dagur er ágiskaður út frá leikjaskránni þangað til. Opnaðu Vikuskipulag."
      : "Þú átt eftir að setja upp vikuna í dag og engin leikjaskrá fannst. Sjálf-sending keyrir kl. 09:00 — settu upp vikuna svo æfingarnar verði réttar. Opnaðu Vikuskipulag.";
    const payload = { title: "⚠️ Vika ekki uppsett", body, url: "/coach/week-setup" };

    const coachIds = await resolveCoachIds(sb, team.id);
    for (const profileId of coachIds) {
      // Dedupe — one reminder per coach per day.
      const { data: already } = await sb
        .from("coach_notification_log")
        .select("id")
        .eq("profile_id", profileId).eq("kind", "week_setup").eq("signal_key", dateKey)
        .limit(1).maybeSingle();
      if (already) { res.coachesSkippedAlreadySent++; continue; }

      const ok = await pushToCoach(sb, profileId, payload);
      if (ok) {
        res.coachesNotified++;
        res.pushCount++;
        await sb.from("coach_notification_log").insert({
          profile_id: profileId, team_id: team.id, kind: "week_setup", signal_key: dateKey,
          channel: "push", as_of: dateKey,
        });
      }
    }
  }

  return res;
}
