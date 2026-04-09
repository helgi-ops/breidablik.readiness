export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Send push notifications to recipients based on sender role.
 * Fire-and-forget: errors are logged but don't block the response.
 */
async function sendNotificationsAsync(
  supabase: ReturnType<typeof getSupabase>,
  senderRole: string,
  playerId: string,
  messageBody: string,
  senderName?: string
) {
  try {
    if (senderRole === "coach" || senderRole === "admin") {
      // Coach/admin sends to player: notify the PLAYER
      await notifyPlayer(supabase, playerId, messageBody);
    } else if (senderRole === "player") {
      // Player sends to coach: notify COACHES on the same team
      await notifyCoachesOnTeam(supabase, playerId, messageBody, senderName);
    }
  } catch (err) {
    console.error("Error sending push notifications:", err);
    // Silently fail—don't break the message send
  }
}

/**
 * Notify a player via push subscriptions.
 */
async function notifyPlayer(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  messageBody: string
) {
  const { data: subscriptions } = await supabase
    .from("player_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("player_id", playerId)
    .eq("is_active", true);

  if (!subscriptions || subscriptions.length === 0) return;

  const truncatedBody = messageBody.substring(0, 100);
  const payload = {
    title: "Þjálfari",
    body: truncatedBody,
    url: "/player",
  };

  for (const sub of subscriptions) {
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
      console.error("Error sending push to player subscription:", err);
    }
  }
}

/**
 * Notify coaches on the same team as the player.
 */
async function notifyCoachesOnTeam(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  messageBody: string,
  senderName?: string
) {
  // Get the player's team
  const { data: player } = await supabase
    .from("players")
    .select("team_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) return;

  // Get coach profiles on the same team
  const { data: coachProfiles } = await supabase
    .from("profiles")
    .select("id, player_id, display_name")
    .eq("team_id", player.team_id)
    .in("role", ["COACH", "coach", "ADMIN", "admin"]);

  if (!coachProfiles || coachProfiles.length === 0) return;

  // Get player_ids that have push subscriptions
  const coachPlayerIds = coachProfiles
    .filter((cp) => cp.player_id)
    .map((cp) => cp.player_id);

  if (coachPlayerIds.length === 0) return;

  const { data: subscriptions } = await supabase
    .from("player_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("player_id", coachPlayerIds)
    .eq("is_active", true);

  if (!subscriptions || subscriptions.length === 0) return;

  const truncatedBody = messageBody.substring(0, 100);
  const title = senderName || "Leikmaður";
  const payload = {
    title,
    body: truncatedBody,
    url: "/coach/conversations",
  };

  for (const sub of subscriptions) {
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
      console.error("Error sending push to coach subscription:", err);
    }
  }
}

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu" };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Ógilt token" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id, player_id")
    .eq("id", userRes.user.id)
    .maybeSingle();

  if (!profile) return { error: "Profile not found" };

  return { uid: userRes.user.id, profile, supabase };
}

/**
 * GET /api/messages?playerId=...&date=...
 * Fetch chat thread for a player on a given date.
 */
export async function GET(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { supabase } = result;

  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const date = url.searchParams.get("date");

  if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });

  let query = supabase
    .from("player_coach_messages")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });

  if (date) {
    query = query.eq("entry_date", date);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: data ?? [] });
}

/**
 * POST /api/messages
 * Send a new message. Body: { playerId, entryDate, body }
 */
export async function POST(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { uid, profile, supabase } = result;

  const body = await req.json();
  const { playerId, entryDate, body: messageBody } = body;

  if (!playerId || !messageBody?.trim()) {
    return NextResponse.json({ error: "Missing playerId or body" }, { status: 400 });
  }

  const senderRole = profile.role === "admin" ? "admin" : profile.role === "coach" ? "coach" : "player";

  // Verify access: players must be themselves
  if (senderRole === "player" && profile.player_id !== playerId) {
    return NextResponse.json({ error: "Cannot send messages for other players" }, { status: 403 });
  }

  // Get team_id from the player
  const { data: player } = await supabase
    .from("players")
    .select("team_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  if (senderRole !== "player" && senderRole !== "admin" && profile.team_id !== player.team_id) {
    return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
  }

  const date =
    entryDate ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

  const { data: msg, error } = await supabase
    .from("player_coach_messages")
    .insert({
      player_id: playerId,
      team_id: player.team_id,
      entry_date: date,
      sender_id: uid,
      sender_role: senderRole,
      body: messageBody.trim().slice(0, 2000),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send push notifications (fire-and-forget)
  sendNotificationsAsync(supabase, senderRole, playerId, messageBody.trim());

  return NextResponse.json({ message: msg });
}
