/**
 * POST /api/coach/player/[id]/send-strength-session
 *
 * Builds the prescribed strength session for the player (today, MD-context
 * auto or overridden), formats it as a plain-text message and inserts it
 * into player_coach_messages so it shows up in the player's app inbox.
 * Fires a push notification via the existing PWA infrastructure.
 *
 * Body:
 *   { md?: "4"|"3"|"2"|"1"|"MD+1"|"AUTO", note?: string, lang?: "IS"|"EN" }
 *
 * Auth: coach token; player must be on coach's team.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadPlayerStrengthSnapshot } from "@/lib/micropulse/strengthProgramming/loader";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { formatSessionForPlayer } from "@/lib/micropulse/strengthProgramming/formatForPlayer";
import type { MdContext } from "@/lib/micropulse/strengthProgramming/types";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

export const runtime = "nodejs";


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
  return {
    userId,
    teamId: (prof?.team_id as string | null) ?? null,
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

/** Fire-and-forget push notification to the player's active subscriptions. */
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  }

  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Verify player belongs to coach's team.
  const { data: playerRow } = await supabase
    .from("players")
    .select("id, team_id, full_name")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerRow || (auth.teamId && (playerRow as { team_id: string }).team_id !== auth.teamId)) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  let body: { md?: string; note?: string; lang?: "IS" | "EN" } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Empty body is fine — fall back to AUTO context
  }
  const mdOverride = parseMdOverride(body.md);
  const lang: "IS" | "EN" = body.lang === "EN" ? "EN" : "IS";

  const todayIso = new Date().toISOString().slice(0, 10);
  const snapshot = await loadPlayerStrengthSnapshot(supabase, {
    playerId,
    playerName: (playerRow as { full_name: string | null }).full_name ?? undefined,
    teamId: (playerRow as { team_id: string }).team_id,
    todayIso,
    mdContextOverride: mdOverride,
  });

  const session = buildStrengthSession(snapshot);
  if (!session) {
    return NextResponse.json(
      { error: "No strength session prescribed today (off-day, MD+2 or unsupported context)." },
      { status: 400 },
    );
  }

  let messageBody = formatSessionForPlayer(session, lang, auth.coachName);
  if (body.note?.trim()) {
    const note = body.note.trim().slice(0, 300);
    messageBody += `\n\n— Coach note:\n${note}`;
  }

  // Insert into player_coach_messages — same shape as /api/messages POST.
  const { data: msg, error: insertErr } = await supabase
    .from("player_coach_messages")
    .insert({
      player_id: playerId,
      team_id: (playerRow as { team_id: string }).team_id,
      entry_date: todayIso,
      sender_id: auth.userId,
      sender_role: "coach",
      body: messageBody.slice(0, 2000),
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Fire-and-forget push (player sees the message immediately too)
  void notifyPlayer(supabase, playerId, `Strength session (${session.mdContext}, ~${session.durationMin} min)`);

  return NextResponse.json({
    ok: true,
    messageId: (msg as { id: string }).id,
    mdContext: session.mdContext,
    durationMin: session.durationMin,
    bodyPreview: messageBody.slice(0, 200),
  });
}
