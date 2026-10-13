/**
 * GET|POST /api/strength/auto-send  — cron-only.
 *
 * Opt-in automatic strength send. For every team with teams.strength_auto_send =
 * true, build each active player's session (in the team's mode) and persist it as
 * their Today session — the same output as the manual "Send strength sessions",
 * with no coach click. Runs each morning (Vercel cron).
 *
 * Review gate preserved: the team opted in; the coach can still manually re-send /
 * override; and this NEVER overwrites a session the coach already sent today
 * (skip-if-exists). Only strength days produce a session (buildStrengthSession
 * returns null otherwise → skipped). Idempotent per (player, entry_date).
 *
 * Auth: Bearer token == CRON_SECRET (or REMINDER_CRON_SECRET). Descriptive —
 * never the readiness colour.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadPlayerStrengthSnapshot, resolveAutoMdContext } from "@/lib/micropulse/strengthProgramming/loader";
import { resolveTeamCustomTable, customProgrammeCoversDay } from "@/lib/micropulse/strengthProgramming/customProgrammeActive";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { persistTodayStrengthOverride } from "@/lib/micropulse/strengthProgramming/persistTodayOverride";
import { applyBlockToSession } from "@/lib/micropulse/strengthProgramming/blockEmphasis";
import { loadCoachStrengthRules } from "@/lib/micropulse/strengthProgramming/coachStrengthRules";
import { resolveCurrentBlock } from "@/lib/micropulse/strengthProgramming/resolveCurrentBlock";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

export const runtime = "nodejs";
// Raised from 60s: the old sequential loop timed out ~17/26 players. Players are now processed in
// bounded-concurrency batches (SEND_CONCURRENCY), so a full squad finishes in seconds — the higher cap
// is just headroom for many teams / slow builds.
export const maxDuration = 300;
// How many players to build+persist in parallel per batch. Bounded to avoid hammering the DB / push
// service while still clearing a 26-player squad in a few batches.
const SEND_CONCURRENCY = 8;

type Sb = ReturnType<typeof getSupabaseAdmin>;

async function notifyPlayer(sb: Sb, playerId: string, preview: string) {
  try {
    const { data: subs } = await sb
      .from("player_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("player_id", playerId)
      .eq("is_active", true);
    if (!subs?.length) return;
    const payload = { title: "MicroPulse — Strength session", body: preview.slice(0, 100), url: "/player" };
    for (const s of subs as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>) {
      if (!s.endpoint || !s.p256dh || !s.auth) continue;
      try {
        await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
      } catch (err) {
        if (isSubscriptionGone(err)) await sb.from("player_push_subscriptions").update({ is_active: false }).eq("id", s.id);
      }
    }
  } catch { /* best-effort */ }
}

async function run(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected = process.env.CRON_SECRET ?? process.env.REMINDER_CRON_SECRET ?? "";
  if (!expected) return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  if (!token || token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: teams } = await sb
    .from("teams")
    .select("id, strength_send_mode, strength_auto_send")
    .eq("strength_auto_send", true);
  const teamRows = (teams ?? []) as Array<{ id: string; strength_send_mode: string | null }>;

  let sent = 0, skipped = 0, failed = 0;
  const perTeam: Array<{ teamId: string; sent: number; skipped: number; failed: number }> = [];

  for (const team of teamRows) {
    const mode: "individualised" | "standard" = team.strength_send_mode === "standard" ? "standard" : "individualised";

    // Only send on a planned training day. No week_plans row for today (week not set
    // up) ⇒ the MD engine would default to MD-3 and fabricate a session; an explicit
    // OFF ⇒ a rest day. Skip the whole team in both cases — no auto strength on a
    // rest/unplanned day (mirrors today-strength-default + the player Today guard).
    const { data: wpRow } = await sb
      .from("week_plans")
      .select("day_type")
      .eq("team_id", team.id)
      .eq("day_date", todayIso)
      .maybeSingle();
    const dayType = String((wpRow as { day_type?: string } | null)?.day_type ?? "").trim().toUpperCase();
    if (!wpRow || dayType === "OFF") {
      perTeam.push({ teamId: team.id, sent: 0, skipped: 0, failed: 0 });
      continue;
    }

    const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", team.id).eq("is_active", true);
    const rows = (players ?? []) as Array<{ id: string; full_name: string | null }>;
    let ts = 0, tk = 0, tf = 0;

    // The coach's meso block + authored rule for today (team-level — one lookup per team).
    const [coachRules, coachBlock] = await Promise.all([
      loadCoachStrengthRules(sb, team.id),
      resolveCurrentBlock(sb, team.id, todayIso),
    ]);
    // Standard mode: the team's authored Custom Programme table + the day's team MD (team-level). When it
    // covers a player we stand aside — no engine override — so their Today resolution serves it; still push.
    const teamCustom = mode === "standard" ? await resolveTeamCustomTable(sb, team.id, todayIso) : null;
    const teamMd = mode === "standard" ? await resolveAutoMdContext(sb, team.id, todayIso) : null;

    // One player's send — pure per-player, returns a status. Run in bounded-concurrency batches so a
    // full squad finishes well inside maxDuration (the old sequential loop timed out ~17/26 at 60s).
    const runPlayer = async (p: { id: string; full_name: string | null }): Promise<"sent" | "skipped" | "failed"> => {
      try {
        // Never overwrite what the coach already sent today (review gate).
        const { data: existing } = await sb
          .from("player_today_strength_override")
          .select("player_id").eq("player_id", p.id).eq("entry_date", todayIso).maybeSingle();
        if (existing) return "skipped";

        // Custom Programme covers today → don't write an engine override; just nudge. Layer-3 serves it.
        if (teamCustom && teamMd && (await customProgrammeCoversDay(sb, { teamId: team.id, playerId: p.id, mdDay: teamMd, todayIso, ctx: teamCustom }))) {
          void notifyPlayer(sb, p.id, "Your strength session is ready");
          return "sent";
        }

        const snapshot = await loadPlayerStrengthSnapshot(sb, { playerId: p.id, playerName: p.full_name ?? undefined, teamId: team.id, todayIso });
        let session = buildStrengthSession(snapshot, [], { mode });
        if (!session || session.blocks.length === 0) return "skipped"; // off-day / injured / recovery
        // MESO layer: tilt toward today's block + apply the coach's authored rule, before persist.
        if (coachBlock) {
          session = applyBlockToSession(session, coachBlock.goalKey, coachBlock.phase, coachRules?.block?.[`${coachBlock.goalKey}:${coachBlock.phase}`]) ?? session;
        }

        const persisted = await persistTodayStrengthOverride(sb, { session, playerId: p.id, teamId: team.id, dateIso: todayIso, lang: "EN", origin: "auto" });
        if (!persisted.ok) return "failed";
        void notifyPlayer(sb, p.id, `Strength session (${session.mdContext}, ~${session.durationMin} min)`);
        return "sent";
      } catch { return "failed"; }
    };

    for (let i = 0; i < rows.length; i += SEND_CONCURRENCY) {
      const batch = await Promise.all(rows.slice(i, i + SEND_CONCURRENCY).map(runPlayer));
      for (const r of batch) { if (r === "sent") ts++; else if (r === "skipped") tk++; else tf++; }
    }
    sent += ts; skipped += tk; failed += tf;
    perTeam.push({ teamId: team.id, sent: ts, skipped: tk, failed: tf });
  }

  return NextResponse.json({ ok: true, teams: teamRows.length, sent, skipped, failed, perTeam });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
