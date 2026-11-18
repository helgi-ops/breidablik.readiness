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
import { normalizeSendMode, type SendMode } from "@/lib/micropulse/strengthProgramming/sendMode";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveAutoMdContext } from "@/lib/micropulse/strengthProgramming/loader";
import { buildAutoSession, loadAutoTeamContext } from "@/lib/micropulse/strengthProgramming/autoSession";
import { playerRow, teamRow, writeSendLog, type SendLogRow } from "@/lib/micropulse/strengthProgramming/sendLog";
import { asAppLang, loadPlayerLanguages, type AppLang } from "@/lib/micropulse/strengthProgramming/playerLanguage";
import { resolveTeamCustomTable, customProgrammeCoversDay } from "@/lib/micropulse/strengthProgramming/customProgrammeActive";
import { persistTodayStrengthOverride } from "@/lib/micropulse/strengthProgramming/persistTodayOverride";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";
import { getFreeLockedTeamIds } from "@/lib/micropulse/elite";

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
    .select("id, strength_send_mode, strength_auto_send, default_language")
    .eq("strength_auto_send", true);
  // FREE clubs get no automatic sends (paying + PT teams only).
  const freeLocked = await getFreeLockedTeamIds(sb);
  const teamRows = ((teams ?? []) as Array<{ id: string; strength_send_mode: string | null; default_language?: string | null }>).filter((t) => !freeLocked.has(t.id));

  let sent = 0, skipped = 0, failed = 0;
  const perTeam: Array<{ teamId: string; sent: number; skipped: number; failed: number }> = [];

  for (const team of teamRows) {
    // Three modes (2026-11-17): standard / individualised / individualised + goals (players take part; sendMode.ts).
    const mode: SendMode = normalizeSendMode(team.strength_send_mode);

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
      // The send log says why (the coach sees it on /coach/strength; no week = in the morning digest too).
      await writeSendLog(sb, [teamRow(team.id, todayIso, "not_sent", !wpRow ? "no_week_plan" : "off_day")]);
      continue;
    }

    const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", team.id).eq("is_active", true);
    const rows = (players ?? []) as Array<{ id: string; full_name: string | null }>;
    let ts = 0, tk = 0, tf = 0;
    // One send-log row per player (written once per team, after the batches). C, 2026-11-18.
    const logRows: SendLogRow[] = [teamRow(team.id, todayIso, "sent", null)];
    const log = (pid: string, status: "sent" | "skipped" | "failed", reason: string | null, level: SendLogRow["readiness_level"] = null) =>
      logRows.push(playerRow(team.id, todayIso, pid, status, reason, level));

    // Team-level inputs (coach's block + rule, swaps, 8-week goal lifts), one read per team. The same builder
    // rebuilds an untouched automatic session when the player checks in (autoSession.ts, 2026-11-18).
    const autoCtx = await loadAutoTeamContext(sb, { teamId: team.id, mode, todayIso, playerIds: rows.map((r) => r.id) });
    // Each player's session (and push) in the language they use the app in; else the team's default, else English (D).
    const langs = await loadPlayerLanguages(sb, rows.map((r) => r.id));
    const teamLang: AppLang = asAppLang(team.default_language) ?? "EN";
    // Standard mode: the team's authored Custom Programme table + the day's team MD (team-level). When it
    // covers a player we stand aside — no engine override — so their Today resolution serves it; still push.
    const teamCustom = mode === "standard" ? await resolveTeamCustomTable(sb, team.id, todayIso) : null;
    const teamMd = mode === "standard" ? await resolveAutoMdContext(sb, team.id, todayIso) : null;

    // One player's send — pure per-player, returns a status. Run in bounded-concurrency batches so a
    // full squad finishes well inside maxDuration (the old sequential loop timed out ~17/26 at 60s).
    const runPlayer = async (p: { id: string; full_name: string | null }): Promise<"sent" | "skipped" | "failed"> => {
      const lang = langs.get(p.id) ?? teamLang;
      try {
        // Never overwrite what the coach already sent today (review gate).
        const { data: existing } = await sb
          .from("player_today_strength_override")
          .select("player_id, origin").eq("player_id", p.id).eq("entry_date", todayIso).maybeSingle();
        if (existing) {
          // A second run the same morning keeps the first run's log row; a coach's own send is named.
          if ((existing as { origin?: string | null }).origin !== "auto") log(p.id, "skipped", "already_sent");
          return "skipped";
        }

        // Custom Programme covers today → don't write an engine override; just nudge. Layer-3 serves it.
        // Basketball keys by weekday (not the football MD tag), so it runs even when teamMd is absent.
        if (teamCustom && (teamCustom.isBasketball || teamMd) && (await customProgrammeCoversDay(sb, { teamId: team.id, playerId: p.id, mdDay: teamMd ?? "", todayIso, ctx: teamCustom }))) {
          void notifyPlayer(sb, p.id, lang === "IS" ? "Styrktaræfing dagsins er tilbúin" : "Your strength session is ready");
          log(p.id, "sent", "custom_programme");
          return "sent";
        }

        // Standard mode without a covering Custom Programme: the engine fallback is a GENERIC
        // built-in template (team palette is individualised-only), so auto-send must NOT silently
        // push it to the squad. Skip these players — the coach builds a Custom Programme (or sends
        // manually, where the UI warns). Individualised is unaffected (it builds the palette session).
        if (mode === "standard") { log(p.id, "skipped", "standard_no_programme"); return "skipped"; }

        // Built with today's check-in when there is one; otherwise a normal day, rebuilt at check-in.
        const built = await buildAutoSession(sb, autoCtx, p);
        if ("skip" in built) { log(p.id, "skipped", built.skip); return "skipped"; } // injured / no session today
        const { session, readinessLevel } = built;

        const persisted = await persistTodayStrengthOverride(sb, { session, playerId: p.id, teamId: team.id, dateIso: todayIso, lang, origin: "auto", readinessLevel });
        if (!persisted.ok) { log(p.id, "failed", persisted.error ?? "save failed"); return "failed"; }
        log(p.id, "sent", null, readinessLevel);
        void notifyPlayer(sb, p.id, lang === "IS"
          ? `Styrktaræfing dagsins (~${session.durationMin} mín)`
          : `Strength session (${session.contextLabel ?? session.mdContext}, ~${session.durationMin} min)`);
        return "sent";
      } catch (e) { log(p.id, "failed", e instanceof Error ? e.message : "error"); return "failed"; }
    };

    for (let i = 0; i < rows.length; i += SEND_CONCURRENCY) {
      const batch = await Promise.all(rows.slice(i, i + SEND_CONCURRENCY).map(runPlayer));
      for (const r of batch) { if (r === "sent") ts++; else if (r === "skipped") tk++; else tf++; }
    }
    sent += ts; skipped += tk; failed += tf;
    await writeSendLog(sb, logRows);
    perTeam.push({ teamId: team.id, sent: ts, skipped: tk, failed: tf });
  }

  return NextResponse.json({ ok: true, teams: teamRows.length, sent, skipped, failed, perTeam });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
