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
import { loadPlayerStrengthSnapshot } from "@/lib/micropulse/strengthProgramming/loader";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { persistTodayStrengthOverride } from "@/lib/micropulse/strengthProgramming/persistTodayOverride";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", team.id).eq("is_active", true);
    const rows = (players ?? []) as Array<{ id: string; full_name: string | null }>;
    let ts = 0, tk = 0, tf = 0;

    for (const p of rows) {
      try {
        // Never overwrite what the coach already sent today (review gate).
        const { data: existing } = await sb
          .from("player_today_strength_override")
          .select("player_id").eq("player_id", p.id).eq("entry_date", todayIso).maybeSingle();
        if (existing) { tk++; continue; }

        const snapshot = await loadPlayerStrengthSnapshot(sb, { playerId: p.id, playerName: p.full_name ?? undefined, teamId: team.id, todayIso });
        const session = buildStrengthSession(snapshot, [], { mode });
        if (!session || session.blocks.length === 0) { tk++; continue; } // off-day / injured / recovery

        const persisted = await persistTodayStrengthOverride(sb, { session, playerId: p.id, teamId: team.id, dateIso: todayIso, lang: "EN" });
        if (!persisted.ok) { tf++; continue; }
        void notifyPlayer(sb, p.id, `Strength session (${session.mdContext}, ~${session.durationMin} min)`);
        ts++;
      } catch { tf++; }
    }
    sent += ts; skipped += tk; failed += tf;
    perTeam.push({ teamId: team.id, sent: ts, skipped: tk, failed: tf });
  }

  return NextResponse.json({ ok: true, teams: teamRows.length, sent, skipped, failed, perTeam });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
