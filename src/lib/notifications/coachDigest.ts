import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";
import { sendTransactionalEmail } from "@/lib/email/sendTransactionalEmail";
import { getTeamPlanTier } from "@/lib/micropulse/elite";
import { computeAdminSignals, type OwnedSignal } from "@/lib/micropulse/coachSignals/adminCompute";

/**
 * Coach morning digest — proactive-delivery Addition 1 (docs/tasks/proactive-delivery-brief.md).
 *
 * Once each morning (piggybacked on the existing daily_outlook cron window) this
 * composes a plain summary of today's coach_signals and delivers it to every
 * COACH who opted in (coach_notification_preferences.morning_digest = true), for
 * teams on PRO tier or above. Deduped per (coach, 'digest', date) so the cron's
 * ±30-min double-fire never double-sends.
 *
 * Descriptive only — the digest restates the same signals that sit BESIDE the
 * readiness colour; it never reads or writes readiness_entries.color. Content is
 * English by default (per CLAUDE.md); per-coach language is a follow-up (no
 * language column on profiles yet).
 */

const LEVEL_RANK: Record<string, number> = { elevated: 0, task: 1, watch: 2, steady: 3 };
const CONF_RANK: Record<string, number> = { high: 0, moderate: 1, low: 2 };

type DigestItem = { label: { en: string; is: string }; why: { en: string; is: string }; href: string };
export type Digest = {
  tone: "action" | "watch" | "steady";
  summary: { en: string; is: string };
  items: DigestItem[]; // most-actionable first
};

/** Compose the digest from a team's computed signals. Pure. */
export function buildMorningDigest(signals: OwnedSignal[]): Digest {
  const actionable = signals.filter((s) => s.level === "elevated" || s.level === "task");
  const watch = signals.filter((s) => s.level === "watch");
  const pool = (actionable.length ? actionable : watch)
    .slice()
    .sort((a, b) =>
      (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9) ||
      (CONF_RANK[a.confidence ?? "low"] ?? 9) - (CONF_RANK[b.confidence ?? "low"] ?? 9),
    );

  const items: DigestItem[] = pool.map((s) => ({
    label: { en: s.label?.en ?? "", is: s.label?.is ?? s.label?.en ?? "" },
    why: { en: s.why?.en?.[0] ?? "", is: s.why?.is?.[0] ?? s.why?.en?.[0] ?? "" },
    href: s.href ?? "/coach",
  }));

  const nAction = actionable.length;
  const nWatch = watch.length;
  if (nAction > 0) {
    return {
      tone: "action",
      summary: {
        en: `${nAction} ${nAction === 1 ? "read needs" : "reads need"} attention`,
        is: `${nAction} ${nAction === 1 ? "atriði kallar" : "atriði kalla"} á athygli`,
      },
      items,
    };
  }
  if (nWatch > 0) {
    return {
      tone: "watch",
      summary: { en: `${nWatch} to keep an eye on`, is: `${nWatch} til að fylgjast með` },
      items,
    };
  }
  return {
    tone: "steady",
    summary: {
      en: "All steady — nothing needs action today.",
      is: "Allt í jafnvægi — ekkert kallar á aðgerð í dag.",
    },
    items: [],
  };
}

/** English push payload (kept short). */
function pushPayload(digest: Digest): { title: string; body: string; url: string } {
  const top = digest.items.slice(0, 3).map((i) => i.label.en).filter(Boolean).join("; ");
  const body = digest.tone === "steady" ? digest.summary.en : `${digest.summary.en}: ${top}`;
  return { title: "MicroPulse — morning briefing", body, url: "/coach" };
}

/** English email (plain text + minimal inline-styled HTML, no external assets). */
function emailContent(digest: Digest): { subject: string; text: string; html: string } {
  const subject = `MicroPulse morning briefing — ${digest.summary.en}`;
  const lines = digest.items.map((i) => `• ${i.label.en}${i.why.en ? ` — ${i.why.en}` : ""}`);
  const text = [digest.summary.en, "", ...lines, "", "Open MicroPulse for the full picture."].join("\n");
  const htmlItems = digest.items
    .map((i) => `<li style="margin:0 0 6px"><strong>${escapeHtml(i.label.en)}</strong>${i.why.en ? ` — ${escapeHtml(i.why.en)}` : ""}</li>`)
    .join("");
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#14181c;max-width:560px">
    <h2 style="font-size:18px;margin:0 0 4px">MicroPulse — morning briefing</h2>
    <p style="font-size:15px;margin:0 0 12px;color:#334">${escapeHtml(digest.summary.en)}</p>
    ${htmlItems ? `<ul style="padding-left:18px;margin:0 0 12px;font-size:14px">${htmlItems}</ul>` : ""}
    <p style="font-size:12px;color:#667;margin:12px 0 0">Descriptive load & readiness signals — they never change a player's readiness verdict. You opted in; manage this in Settings.</p>
  </div>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

async function pushToCoach(sb: SupabaseClient, profileId: string, payload: Record<string, unknown>): Promise<boolean> {
  const { data: subs } = await sb
    .from("coach_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId)
    .eq("is_active", true);
  const rows = (subs ?? []) as Array<{ id: string; endpoint: string | null; p256dh: string | null; auth: string | null }>;
  let ok = false;
  for (const s of rows) {
    if (!s.endpoint || !s.p256dh || !s.auth) continue;
    try {
      await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
      ok = true;
    } catch (err) {
      if (isSubscriptionGone(err)) {
        await sb.from("coach_push_subscriptions").update({ is_active: false }).eq("id", s.id);
      } else {
        console.error("[coach-digest] push error", err);
      }
    }
  }
  return ok;
}

export type CoachDigestResult = {
  teamsConsidered: number;
  teamsBelowTier: number;
  coachesSent: number;
  coachesSkippedAlreadySent: number;
  pushCount: number;
  emailCount: number;
};

/**
 * Run the morning digest for every opted-in coach. dateKey = today (Reykjavík).
 * Idempotent: a coach who already has a 'digest' log row for dateKey is skipped.
 */
export async function runCoachMorningDigest(
  sb: SupabaseClient,
  opts: { dateKey: string },
): Promise<CoachDigestResult> {
  const { dateKey } = opts;
  const res: CoachDigestResult = {
    teamsConsidered: 0, teamsBelowTier: 0, coachesSent: 0,
    coachesSkippedAlreadySent: 0, pushCount: 0, emailCount: 0,
  };

  // 1. Opted-in coaches + their CURRENT team (profiles.team_id is source of truth).
  const { data: prefs } = await sb
    .from("coach_notification_preferences")
    .select("profile_id, channel")
    .eq("morning_digest", true);
  const prefRows = (prefs ?? []) as Array<{ profile_id: string; channel: string }>;
  if (prefRows.length === 0) return res;

  const channelByCoach = new Map(prefRows.map((r) => [r.profile_id, r.channel]));
  const { data: profs } = await sb
    .from("profiles")
    .select("id, team_id")
    .in("id", prefRows.map((r) => r.profile_id));
  const coachesByTeam = new Map<string, string[]>();
  for (const p of (profs ?? []) as Array<{ id: string; team_id: string | null }>) {
    if (!p.team_id) continue;
    const list = coachesByTeam.get(p.team_id) ?? [];
    list.push(p.id);
    coachesByTeam.set(p.team_id, list);
  }

  for (const [teamId, coachIds] of coachesByTeam) {
    res.teamsConsidered++;

    // 2. PRO+ only (deterministic digest is a PRO feature; FREE gets nothing).
    const tier = await getTeamPlanTier(sb, teamId);
    if (tier !== "PRO" && tier !== "ELITE") { res.teamsBelowTier++; continue; }

    // 3. Compose from fresh, tokenless signals.
    const signals = await computeAdminSignals(sb, teamId, dateKey).catch(() => [] as OwnedSignal[]);
    const digest = buildMorningDigest(signals);

    // Email addresses for this team's coaches (auth.users via RPC).
    const emailByCoach = new Map<string, string>();
    if (coachIds.some((id) => (channelByCoach.get(id) ?? "push") !== "push")) {
      const { data: emailRows } = await sb.rpc("get_team_coaches_with_email", { p_team_id: teamId });
      for (const r of (emailRows ?? []) as Array<{ profile_id: string; email: string | null }>) {
        if (r.email) emailByCoach.set(r.profile_id, r.email);
      }
    }

    for (const profileId of coachIds) {
      // 4. Dedupe — skip a coach who already received today's digest.
      const { data: already } = await sb
        .from("coach_notification_log")
        .select("id")
        .eq("profile_id", profileId).eq("kind", "digest").eq("signal_key", dateKey)
        .limit(1).maybeSingle();
      if (already) { res.coachesSkippedAlreadySent++; continue; }

      const channel = channelByCoach.get(profileId) ?? "push";
      let sentChannel: string | null = null;
      let providerMessageId: string | null = null;

      if (channel === "push" || channel === "both") {
        const ok = await pushToCoach(sb, profileId, pushPayload(digest));
        if (ok) { res.pushCount++; sentChannel = "push"; }
      }
      if (channel === "email" || channel === "both") {
        const to = emailByCoach.get(profileId);
        if (to) {
          try {
            const { subject, text, html } = emailContent(digest);
            const r = await sendTransactionalEmail({ to, subject, text, html });
            if (r.ok) { res.emailCount++; sentChannel = sentChannel ? "both" : "email"; providerMessageId = r.providerMessageId ?? null; }
          } catch (err) {
            console.error("[coach-digest] email error", err);
          }
        }
      }

      // 5. Log only a real delivery (so a fully-failed send retries next fire).
      if (sentChannel) {
        res.coachesSent++;
        await sb.from("coach_notification_log").insert({
          profile_id: profileId, team_id: teamId, kind: "digest", signal_key: dateKey,
          channel: sentChannel, as_of: dateKey, provider_message_id: providerMessageId,
        });
      }
    }
  }

  return res;
}

// ── Preview / send-test (coach-triggered, no dedupe, respects tier upstream) ──
/** Compose today's digest for a team without sending — for the Settings preview. */
export async function previewDigest(sb: SupabaseClient, teamId: string, dateKey: string): Promise<Digest> {
  const signals = await computeAdminSignals(sb, teamId, dateKey).catch(() => [] as OwnedSignal[]);
  return buildMorningDigest(signals);
}

/** Deliver a one-off test digest to a single coach (the caller). No log row — tests never dedupe. */
export async function sendTestDigest(
  sb: SupabaseClient,
  opts: { profileId: string; teamId: string; dateKey: string; channel: string; email?: string | null },
): Promise<{ push: boolean; email: boolean }> {
  const digest = await previewDigest(sb, opts.teamId, opts.dateKey);
  let push = false, email = false;
  if (opts.channel === "push" || opts.channel === "both") {
    push = await pushToCoach(sb, opts.profileId, pushPayload(digest));
  }
  if ((opts.channel === "email" || opts.channel === "both") && opts.email) {
    try {
      const { subject, text, html } = emailContent(digest);
      const r = await sendTransactionalEmail({ to: opts.email, subject: `[Test] ${subject}`, text, html });
      email = r.ok;
    } catch (err) { console.error("[coach-digest] test email error", err); }
  }
  return { push, email };
}

// ── Addition 2 — threshold alerts ────────────────────────────────────────────
// Event-style per-signal pushes for a NEW actionable read, opt-in + PRO+. The
// coach_notification_log doubles as the "new signal" memory: a signal alerts only
// if it hasn't alerted within COOLDOWN_DAYS, which both detects newness and
// suppresses flicker without a fragile yesterday's-cache diff. Conservative gate
// (elevated/task + confidence ≥ moderate) — the yellow-oversensitivity lesson —
// with suppressed lower-signal counted for the flag-rate audit. Push-only: alerts
// are an immediate channel; the digest carries email. Descriptive; never the colour.

const ALERT_COOLDOWN_DAYS = 3;

/** engine:player (team-level rows key on engine alone). */
function alertKey(s: OwnedSignal): string {
  return `${s.engine}:${s.playerId ?? "team"}`;
}

function alertPayload(s: OwnedSignal): { title: string; body: string; url: string } {
  const label = s.label?.en ?? "Signal";
  const why = s.why?.en?.[0] ?? "";
  const cf = s.counterfactual?.en ?? "";
  const body = [why, cf].filter(Boolean).join(" — ") || label;
  return { title: `⚠️ ${label}`, body, url: s.href ?? "/coach" };
}

export type ThresholdAlertResult = {
  teamsConsidered: number;
  teamsBelowTier: number;
  alertsSent: number;      // (coach × signal) pushes delivered
  signalsFlagged: number;  // distinct actionable signals across teams
  suppressedLowSignal: number; // actionable-level but confidence < moderate
  skippedCooldown: number; // coach already alerted for this signal within cooldown
};

/**
 * Push a per-signal alert to every opted-in (threshold_alerts) coach on a PRO+ team
 * for each newly-actionable signal. dateKey = today (Reykjavík). Idempotent via the
 * cooldown + the (profile_id, kind, signal_key, as_of) unique index.
 */
export async function runThresholdAlerts(
  sb: SupabaseClient,
  opts: { dateKey: string },
): Promise<ThresholdAlertResult> {
  const { dateKey } = opts;
  const res: ThresholdAlertResult = {
    teamsConsidered: 0, teamsBelowTier: 0, alertsSent: 0,
    signalsFlagged: 0, suppressedLowSignal: 0, skippedCooldown: 0,
  };

  const { data: prefs } = await sb
    .from("coach_notification_preferences")
    .select("profile_id")
    .eq("threshold_alerts", true);
  const prefRows = (prefs ?? []) as Array<{ profile_id: string }>;
  if (prefRows.length === 0) return res;

  const { data: profs } = await sb
    .from("profiles").select("id, team_id")
    .in("id", prefRows.map((r) => r.profile_id));
  const coachesByTeam = new Map<string, string[]>();
  for (const p of (profs ?? []) as Array<{ id: string; team_id: string | null }>) {
    if (!p.team_id) continue;
    const list = coachesByTeam.get(p.team_id) ?? [];
    list.push(p.id);
    coachesByTeam.set(p.team_id, list);
  }

  // Cooldown floor: any alert for this signal_key on/after this date suppresses a re-alert.
  const cooldownFloor = (() => {
    const d = new Date(`${dateKey}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ALERT_COOLDOWN_DAYS);
    return d.toISOString();
  })();

  for (const [teamId, coachIds] of coachesByTeam) {
    res.teamsConsidered++;
    const tier = await getTeamPlanTier(sb, teamId);
    if (tier !== "PRO" && tier !== "ELITE") { res.teamsBelowTier++; continue; }

    const signals = await computeAdminSignals(sb, teamId, dateKey).catch(() => [] as OwnedSignal[]);
    const actionableLevel = signals.filter((s) => s.level === "elevated" || s.level === "task");
    const actionable = actionableLevel.filter((s) => s.confidence === "high" || s.confidence === "moderate");
    res.suppressedLowSignal += actionableLevel.length - actionable.length;
    res.signalsFlagged += actionable.length;

    for (const signal of actionable) {
      const key = alertKey(signal);
      for (const profileId of coachIds) {
        // Cooldown / newness: already alerted this signal within the window?
        const { data: recent } = await sb
          .from("coach_notification_log")
          .select("id")
          .eq("profile_id", profileId).eq("kind", "alert").eq("signal_key", key)
          .gte("sent_at", cooldownFloor)
          .limit(1).maybeSingle();
        if (recent) { res.skippedCooldown++; continue; }

        const ok = await pushToCoach(sb, profileId, alertPayload(signal));
        if (!ok) continue; // no active push sub → nothing delivered, no log (retry next run)
        res.alertsSent++;
        await sb.from("coach_notification_log").upsert(
          { profile_id: profileId, team_id: teamId, kind: "alert", signal_key: key, channel: "push", as_of: dateKey },
          { onConflict: "profile_id,kind,signal_key,as_of", ignoreDuplicates: true },
        );
      }
    }
  }

  if (res.suppressedLowSignal > 0 || res.signalsFlagged > 0) {
    console.log(`[coach-alerts] ${dateKey}: flagged=${res.signalsFlagged} sent=${res.alertsSent} suppressedLowSignal=${res.suppressedLowSignal} cooldownSkipped=${res.skippedCooldown}`);
  }
  return res;
}
