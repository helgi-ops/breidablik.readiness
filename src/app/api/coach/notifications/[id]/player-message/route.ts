/**
 * /api/coach/notifications/[id]/player-message
 *
 * AI-drafted recovery message that the coach can send to a flagged
 * player from the notifications page.
 *
 *   GET  → generate (or regenerate) a draft. Always fresh-from-Claude;
 *          drafts aren't cached because the coach is going to edit them
 *          anyway and the cost is ~$0.002 per call.
 *   POST → coach approves (and possibly edits) the draft, we insert into
 *          player_coach_messages and link the row back to the
 *          notification via coach_notifications.player_message_id.
 *
 * ELITE tier only.
 *
 * The generation library lives in src/lib/micropulse/playerRecoveryMessage —
 * the AI never invents recovery actions; it only puts the deterministic
 * library guidance into friendly prose. See that file for the rationale.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";
import { generatePlayerMessage, type NotificationInput } from "@/lib/micropulse/playerRecoveryMessage";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authCoach(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 as const };
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 as const };
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 as const };
  }
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 as const };
  return { userId, teamId, supabase };
}

// Fetch notification + verify it belongs to the coach's team. Returns
// the joined player name + position so the AI prompt has personal
// context. Returns null on not-found / wrong-team (caller turns that
// into a 404).
async function loadNotification(
  supabase: ReturnType<typeof getSupabase>,
  notificationId: string,
  teamId: string,
) {
  const { data } = await supabase
    .from("coach_notifications")
    .select(`
      id, team_id, player_id, parameter, direction, severity,
      value_now, value_prev, summary, summary_is, is_post_match,
      player_message_sent_at, player_message_id,
      players!inner ( full_name, position )
    `)
    .eq("id", notificationId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as {
    id: string;
    team_id: string;
    player_id: string;
    parameter: string;
    direction: string;
    severity: string;
    value_now: number | null;
    value_prev: number | null;
    summary: string | null;
    summary_is: string | null;
    is_post_match: boolean | null;
    player_message_sent_at: string | null;
    player_message_id: string | null;
    players: { full_name: string | null; position: string | null };
  };
}

function notificationToInput(n: NonNullable<Awaited<ReturnType<typeof loadNotification>>>, lang: "EN" | "IS"): NotificationInput {
  return {
    parameter: n.parameter,
    direction: n.direction,
    severity: n.severity,
    player_name: n.players.full_name ?? "Athlete",
    position: n.players.position,
    value_now: n.value_now,
    value_prev: n.value_prev,
    summary: lang === "IS" ? (n.summary_is ?? n.summary) : n.summary,
    is_post_match: n.is_post_match,
  };
}

// ─── GET — generate draft ────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notificationId } = await params;
  if (!notificationId) return NextResponse.json({ error: "Missing notification id" }, { status: 400 });

  const a = await authCoach(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const isElite = await isEliteTeam(a.supabase, a.teamId);
  if (!isElite) return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });

  const notification = await loadNotification(a.supabase, notificationId, a.teamId);
  if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

  // If already sent, return the sent body so coach UI can show the
  // confirmation state instead of generating a new draft.
  if (notification.player_message_sent_at && notification.player_message_id) {
    const { data: msg } = await a.supabase
      .from("player_coach_messages")
      .select("body, created_at")
      .eq("id", notification.player_message_id)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      sent: true,
      sent_at: notification.player_message_sent_at,
      message: (msg as { body?: string } | null)?.body ?? "",
    });
  }

  const lang = (req.nextUrl.searchParams.get("lang") ?? "IS").toUpperCase() === "EN" ? "EN" : "IS";
  try {
    const { message, guidance } = await generatePlayerMessage(notificationToInput(notification, lang), lang);
    return NextResponse.json({ ok: true, sent: false, message, guidance, lang });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed" },
      { status: 500 },
    );
  }
}

// ─── POST — coach sends edited draft ─────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notificationId } = await params;
  if (!notificationId) return NextResponse.json({ error: "Missing notification id" }, { status: 400 });

  const a = await authCoach(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const isElite = await isEliteTeam(a.supabase, a.teamId);
  if (!isElite) return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });

  const notification = await loadNotification(a.supabase, notificationId, a.teamId);
  if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

  if (notification.player_message_sent_at) {
    return NextResponse.json(
      { error: "A recovery message has already been sent for this notification" },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const messageBody = (body.message ?? "").trim();
  if (messageBody.length < 40) {
    return NextResponse.json({ error: "Message too short" }, { status: 400 });
  }
  if (messageBody.length > 2000) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  // Insert into player_coach_messages as the coach (sender_role uppercase
  // to match the existing convention). entry_date defaults to today in
  // Atlantic/Reykjavik like the regular /api/messages endpoint.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });
  const { data: insertedMsg, error: insertErr } = await a.supabase
    .from("player_coach_messages")
    .insert({
      player_id: notification.player_id,
      team_id: a.teamId,
      entry_date: today,
      sender_id: a.userId,
      sender_role: "COACH",
      body: messageBody,
    })
    .select("id")
    .single();

  if (insertErr || !insertedMsg) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to insert message" },
      { status: 500 },
    );
  }

  // Link back so coach UI can show the confirmed state.
  await a.supabase
    .from("coach_notifications")
    .update({
      player_message_sent_at: new Date().toISOString(),
      player_message_id: (insertedMsg as { id: string }).id,
    })
    .eq("id", notificationId);

  return NextResponse.json({ ok: true, message_id: (insertedMsg as { id: string }).id });
}
