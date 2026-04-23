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
 * Fetch all active players on a coach's team.
 */
async function fetchActivePlayersOnTeam(
  supabase: ReturnType<typeof getSupabase>,
  teamId: string
) {
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .eq("team_id", teamId)
    .eq("status", "ACTIVE");

  return players?.map((p) => p.id) ?? [];
}

/**
 * Send push notifications to multiple players via their subscriptions.
 * Fire-and-forget: errors are logged but don't block the response.
 */
async function sendBroadcastNotificationsAsync(
  supabase: ReturnType<typeof getSupabase>,
  playerIds: string[],
  messageBody: string
) {
  try {
    if (playerIds.length === 0) return;

    // Query all subscriptions for the target players in one batch
    const { data: subscriptions } = await supabase
      .from("player_push_subscriptions")
      .select("id, player_id, endpoint, p256dh, auth")
      .in("player_id", playerIds)
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
        console.error("Error sending broadcast push notification:", err);
      }
    }
  } catch (err) {
    console.error("Error sending broadcast push notifications:", err);
    // Silently fail—don't break the message send
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
 * POST /api/messages/broadcast
 * Send a message to multiple players at once.
 * Body: { playerIds: string[], body: string }
 *
 * Only coaches and admins can broadcast.
 * If playerIds is empty or contains "all", fetch ALL active players on the coach's team.
 */
export async function POST(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { uid, profile, supabase } = result;

  const body = await req.json();
  const { playerIds: requestedPlayerIds = [], body: messageBody } = body;

  if (!messageBody?.trim()) {
    return NextResponse.json({ error: "Missing message body" }, { status: 400 });
  }

  // DB stores roles as uppercase ("COACH", "ADMIN", "PLAYER") — normalize before compare
  const normalizedRole = String(profile.role ?? "").toLowerCase();
  const senderRole =
    normalizedRole === "admin" ? "admin" : normalizedRole === "coach" || normalizedRole === "staff" ? "coach" : "player";

  // Only coaches and admins can broadcast
  if (senderRole === "player") {
    return NextResponse.json({ error: "Only coaches and admins can broadcast messages" }, { status: 403 });
  }

  // Coaches may not have profile.team_id set — fall back to coach_teams
  let teamId: string | null = profile.team_id ?? null;
  if (!teamId && senderRole === "coach") {
    const { data: ct } = await supabase
      .from("coach_teams")
      .select("team_id, is_primary")
      .eq("coach_id", uid)
      .order("is_primary", { ascending: false })
      .limit(1);
    teamId = (ct?.[0]?.team_id as string | undefined) ?? null;
  }

  if (!teamId) {
    return NextResponse.json({ error: "Coach has no team assigned" }, { status: 400 });
  }

  // Determine target player IDs
  let playerIds = requestedPlayerIds;
  if (playerIds.length === 0 || (playerIds.length === 1 && playerIds[0] === "all")) {
    // Fetch all active players on the team
    playerIds = await fetchActivePlayersOnTeam(supabase, teamId);
  }

  if (playerIds.length === 0) {
    return NextResponse.json({ error: "No players found or specified" }, { status: 400 });
  }

  // Get today's date in Iceland timezone
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

  // Prepare batch insert: one message per player
  const messages = playerIds.map((playerId: string) => ({
    player_id: playerId,
    team_id: teamId,
    entry_date: date,
    sender_id: uid,
    sender_role: senderRole,
    body: messageBody.trim().slice(0, 2000),
  }));

  const { error: insertError } = await supabase
    .from("player_coach_messages")
    .insert(messages);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Send push notifications (fire-and-forget)
  sendBroadcastNotificationsAsync(supabase, playerIds, messageBody.trim());

  return NextResponse.json({ sent: playerIds.length });
}
