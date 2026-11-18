/**
 * Send log for the automatic strength send (2026-11-18, review item C). Table `strength_send_log`
 * (migration 20261118110000): one row per team per day (subject 'team') and one per player.
 *
 * The 09:00 cron writes it; a check-in rebuild stamps the player's row. `summarizeSendLog` is the one read used by
 * the coach's strength page and the morning digest. Writing never fails a send. Descriptive only: never the colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamSkipReason = "no_week_plan" | "off_day";
export type PlayerSkipReason = "already_sent" | "injured" | "no_session" | "standard_no_programme";

export type SendLogRow = {
  team_id: string;
  send_date: string;
  subject_key: string; // "team" | player id
  player_id: string | null;
  status: "sent" | "skipped" | "failed" | "not_sent";
  reason: string | null;
  readiness_level: "GREEN" | "YELLOW" | "RED" | null;
  rebuilt_at?: string | null;
  created_at?: string | null;
};

export const teamRow = (teamId: string, date: string, status: "sent" | "not_sent", reason: TeamSkipReason | null): SendLogRow => ({
  team_id: teamId, send_date: date, subject_key: "team", player_id: null, status, reason, readiness_level: null,
});

export const playerRow = (
  teamId: string, date: string, playerId: string,
  status: "sent" | "skipped" | "failed", reason: string | null, level: SendLogRow["readiness_level"] = null,
): SendLogRow => ({
  team_id: teamId, send_date: date, subject_key: playerId, player_id: playerId, status,
  reason: reason ? reason.slice(0, 200) : null, readiness_level: level,
});

/** Upsert the rows (best effort: a failure is logged, never thrown). */
export async function writeSendLog(sb: SupabaseClient, rows: SendLogRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    const now = new Date().toISOString();
    const { error } = await sb
      .from("strength_send_log")
      .upsert(rows.map((r) => ({ ...r, updated_at: now })), { onConflict: "team_id,send_date,subject_key" });
    if (error) console.error("strength_send_log write failed:", error.message);
  } catch (e) {
    console.error("strength_send_log write failed:", e instanceof Error ? e.message : e);
  }
}

/** A check-in rebuilt the player's automatic session: stamp the row (best effort). */
export async function markRebuilt(sb: SupabaseClient, args: { teamId: string; playerId: string; date: string; level: SendLogRow["readiness_level"] }): Promise<void> {
  try {
    const now = new Date().toISOString();
    await sb.from("strength_send_log")
      .update({ rebuilt_at: now, readiness_level: args.level, updated_at: now })
      .eq("team_id", args.teamId).eq("send_date", args.date).eq("subject_key", args.playerId);
  } catch { /* best effort */ }
}

// ─── The read: one summary for the page and the digest ─────────────────────────────────────────────

export type Bi = { en: string; is: string };

export type SendLogSummary = {
  date: string;
  /** ran = the 09:00 run happened for the team; not_sent = it skipped the whole team; missing = no run logged. */
  state: "ran" | "not_sent" | "missing";
  teamReason: TeamSkipReason | null;
  ranAt: string | null;
  sent: number;
  rebuilt: number;
  failed: number;
  skipped: Record<PlayerSkipReason | "other", number>;
  /** Players to name (failed first, then skipped), with a plain reason. */
  people: Array<{ playerId: string; status: "skipped" | "failed"; reason: Bi }>;
  /** The one-line verdict. */
  line: Bi;
  /** Something the coach should act on (failed, or the week not set). */
  needsAction: boolean;
};

const PLAYER_REASON: Record<PlayerSkipReason, Bi> = {
  already_sent: { en: "you had already sent one", is: "þú hafðir þegar sent æfingu" },
  injured: { en: "injured (rehab only)", is: "meiðsli (endurhæfing eingöngu)" },
  no_session: { en: "no strength session today", is: "engin styrktaræfing í dag" },
  standard_no_programme: { en: "no Custom Programme covers today", is: "ekkert æfingakerfi nær yfir daginn" },
};

const plural = (n: number, en: string, ens: string) => (n === 1 ? en : ens);

export function summarizeSendLog(rows: SendLogRow[], date: string): SendLogSummary {
  const day = rows.filter((r) => r.send_date === date);
  const team = day.find((r) => r.subject_key === "team") ?? null;
  const players = day.filter((r) => r.subject_key !== "team");
  const skipped: SendLogSummary["skipped"] = { already_sent: 0, injured: 0, no_session: 0, standard_no_programme: 0, other: 0 };
  let sent = 0, failed = 0, rebuilt = 0;
  const people: SendLogSummary["people"] = [];
  for (const r of players) {
    if (r.rebuilt_at) rebuilt++;
    if (r.status === "sent") sent++;
    else if (r.status === "failed") {
      failed++;
      people.push({ playerId: r.subject_key, status: "failed", reason: { en: "couldn't be saved, send it by hand", is: "vistaðist ekki, sendu hana handvirkt" } });
    } else if (r.status === "skipped") {
      const k = (r.reason && r.reason in PLAYER_REASON ? r.reason : "other") as PlayerSkipReason | "other";
      skipped[k]++;
      if (k !== "already_sent") people.push({ playerId: r.subject_key, status: "skipped", reason: k === "other" ? { en: "skipped", is: "sleppt" } : PLAYER_REASON[k] });
    }
  }
  people.sort((a, b) => (a.status === b.status ? 0 : a.status === "failed" ? -1 : 1));

  const state: SendLogSummary["state"] = !team ? "missing" : team.status === "not_sent" ? "not_sent" : "ran";
  const teamReason = (team?.reason as TeamSkipReason | null) ?? null;

  let line: Bi;
  if (state === "missing") line = { en: "No automatic send is logged for this day.", is: "Engin sjálfvirk sending er skráð þennan dag." };
  else if (state === "not_sent") {
    line = teamReason === "no_week_plan"
      ? { en: "Nothing was sent: the week isn't set up for this day.", is: "Ekkert var sent: vikan er ekki sett upp fyrir þennan dag." }
      : { en: "Nothing was sent: a day off in the week plan.", is: "Ekkert var sent: frídagur í vikuplaninu." };
  } else {
    const en = [`Sent to ${sent} ${plural(sent, "player", "players")}`];
    const is = [`Sent á ${sent} ${sent === 1 ? "leikmann" : "leikmenn"}`];
    if (skipped.already_sent) { en.push(`${skipped.already_sent} had yours already`); is.push(`${skipped.already_sent} ${skipped.already_sent === 1 ? "var" : "voru"} með þína þegar`); }
    if (skipped.injured) { en.push(`${skipped.injured} injured`); is.push(`${skipped.injured} í meiðslum`); }
    if (skipped.no_session) { en.push(`${skipped.no_session} no session today`); is.push(`${skipped.no_session} án æfingar í dag`); }
    if (skipped.standard_no_programme) { en.push(`${skipped.standard_no_programme} no programme`); is.push(`${skipped.standard_no_programme} án æfingakerfis`); }
    if (skipped.other) { en.push(`${skipped.other} skipped`); is.push(`${skipped.other} sleppt`); }
    en.push(`${failed} failed`); is.push(`${failed} ${failed === 1 ? "mistókst" : "mistókust"}`);
    if (rebuilt) { en.push(`${rebuilt} adjusted to their check-in`); is.push(`${rebuilt} ${rebuilt === 1 ? "lagaðist" : "löguðust"} að innskráningu`); }
    line = { en: en.join(" · "), is: is.join(" · ") };
  }

  return {
    date, state, teamReason, ranAt: team?.created_at ?? null, sent, rebuilt, failed, skipped, people, line,
    needsAction: failed > 0 || (state === "not_sent" && teamReason === "no_week_plan"),
  };
}

/** The morning-digest item for a day's send: only when a player's session failed to save (else nothing). */
export function sendLogDigestItems(s: SendLogSummary): Array<{ label: Bi; why: Bi; href: string }> {
  if (s.failed === 0) return [];
  const n = s.failed;
  return [{
    label: {
      en: `Automatic strength send: ${n} ${n === 1 ? "session" : "sessions"} not saved yesterday`,
      is: `Sjálfvirk styrktarsending: ${n} ${n === 1 ? "æfing vistaðist" : "æfingar vistuðust"} ekki í gær`,
    },
    why: {
      en: "Those players got no session from the 09:00 send. Check the strength page and send by hand if needed.",
      is: "Þeir leikmenn fengu enga æfingu úr sendingunni kl. 09:00. Skoðaðu styrktarsíðuna og sendu handvirkt ef þarf.",
    },
    href: "/coach/strength",
  }];
}
