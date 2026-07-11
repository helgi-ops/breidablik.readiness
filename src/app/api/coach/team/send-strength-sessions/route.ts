/**
 * POST /api/coach/team/send-strength-sessions
 *
 * Bulk-sends the prescribed strength session to every active player on the
 * coach's team. Iterates sequentially (not parallel) to avoid hammering
 * the loader pipeline and so push-notification quotas behave.
 *
 * Body:
 *   { md?: "4"|"3"|"2"|"1"|"+1"|"AUTO", note?: string, lang?: "IS"|"EN" }
 *
 * Returns:
 *   { sent: number, skipped: number, failed: number, results: [...] }
 *
 * Auth: coach token only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadPlayerStrengthSnapshot } from "@/lib/micropulse/strengthProgramming/loader";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { formatSessionForPlayer } from "@/lib/micropulse/strengthProgramming/formatForPlayer";
import { persistTodayStrengthOverride } from "@/lib/micropulse/strengthProgramming/persistTodayOverride";
import type { MdContext } from "@/lib/micropulse/strengthProgramming/types";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

export const runtime = "nodejs";
export const maxDuration = 60;


async function getCoachAuth(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role, display_name")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return {
    userId,
    teamId,
    coachName: (prof?.display_name as string | null) ?? undefined,
  } as const;
}

function parseMdOverride(raw: string | null | undefined): MdContext | null {
  if (!raw) return null;
  const v = raw.toUpperCase().trim();
  switch (v) {
    case "4": case "MD-4": return "MD-4";
    case "3": case "MD-3": return "MD-3";
    case "2": case "MD-2": return "MD-2";
    case "1": case "MD-1": return "MD-1";
    case "+1": case "MD+1": return "MD+1";
    default: return null;
  }
}

async function notifyPlayer(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  preview: string,
) {
  try {
    const { data: subs } = await supabase
      .from("player_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("player_id", playerId)
      .eq("is_active", true);
    if (!subs?.length) return;
    const payload = {
      title: "MicroPulse — Strength session",
      body: preview.length > 100 ? preview.slice(0, 97) + "..." : preview,
      url: "/player",
    };
    for (const sub of subs as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      try {
        await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      } catch (err) {
        if (isSubscriptionGone(err)) {
          await supabase
            .from("player_push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
        }
      }
    }
  } catch {
    // silent — push is best-effort
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { md?: string; note?: string; lang?: "IS" | "EN" } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body is fine
  }
  const mdOverride = parseMdOverride(body.md);
  const lang: "IS" | "EN" = body.lang === "EN" ? "EN" : "IS";
  const note = body.note?.trim().slice(0, 300) ?? "";

  // Get all active players on the coach's team.
  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, team_id")
    .eq("team_id", auth.teamId)
    .eq("is_active", true);

  const playerRows = (players ?? []) as Array<{ id: string; full_name: string | null; team_id: string }>;
  if (playerRows.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, results: [] });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const results: Array<{
    playerId: string;
    playerName: string;
    status: "sent" | "skipped" | "failed";
    reason?: string;
  }> = [];

  // Sequential — keeps payload size + push quotas predictable.
  for (const p of playerRows) {
    const playerName = p.full_name ?? p.id;
    try {
      const snapshot = await loadPlayerStrengthSnapshot(supabase, {
        playerId: p.id,
        playerName,
        teamId: p.team_id,
        todayIso,
        mdContextOverride: mdOverride,
      });
      const session = buildStrengthSession(snapshot);
      if (!session) {
        results.push({ playerId: p.id, playerName, status: "skipped", reason: "Off-day / unsupported context" });
        continue;
      }

      // Skip silently if the session is empty (e.g. injury, RECOVERY verdict
      // stripped all blocks) — those players are handled via rehab/recovery
      // protocols, not strength sessions.
      const totalEx = session.blocks.reduce((s, b) => s + b.exercises.length, 0);
      if (totalEx === 0) {
        results.push({ playerId: p.id, playerName, status: "skipped", reason: "No strength prescribed today" });
        continue;
      }

      let messageBody = formatSessionForPlayer(session, lang, auth.coachName);
      if (note) messageBody += `\n\n— Coach note:\n${note}`;
      messageBody = messageBody.slice(0, 2000);

      const { error: insertErr } = await supabase
        .from("player_coach_messages")
        .insert({
          player_id: p.id,
          team_id: p.team_id,
          entry_date: todayIso,
          sender_id: auth.userId,
          sender_role: "coach",
          body: messageBody,
        });

      if (insertErr) {
        results.push({ playerId: p.id, playerName, status: "failed", reason: insertErr.message });
        continue;
      }

      // Make it the player's Today card too — "sent = seen".
      await persistTodayStrengthOverride(supabase, {
        session,
        playerId: p.id,
        teamId: p.team_id,
        dateIso: todayIso,
        coachId: auth.userId,
        lang,
      });

      void notifyPlayer(supabase, p.id,
        `Strength session (${session.mdContext}, ~${session.durationMin} min)`);

      results.push({ playerId: p.id, playerName, status: "sent" });
    } catch (e) {
      results.push({
        playerId: p.id,
        playerName,
        status: "failed",
        reason: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({ sent, skipped, failed, results });
}
