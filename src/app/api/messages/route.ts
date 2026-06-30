export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { sendWebPush, isSubscriptionGone } from "@/lib/push/webPush";

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
 *
 * A coach is "on the team" if EITHER:
 *   - profiles.team_id matches the player's team, OR
 *   - coach_teams has a matching (coach_id, team_id) row.
 *
 * Push subscriptions for coaches live in coach_push_subscriptions
 * (keyed on profile_id), separate from player_push_subscriptions.
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

  if (!player?.team_id) return;
  const teamId = player.team_id;

  // Coaches via profiles.team_id (case-insensitive role)
  const { data: profileCoaches } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("team_id", teamId);

  const profileCoachIds = (profileCoaches ?? [])
    .filter((c: any) => {
      const r = String(c.role ?? "").toLowerCase();
      return r === "coach" || r === "admin" || r === "staff";
    })
    .map((c: any) => c.id as string);

  // Coaches via coach_teams (covers coaches without profiles.team_id set)
  const { data: ctRows } = await supabase
    .from("coach_teams")
    .select("coach_id")
    .eq("team_id", teamId);
  const coachTeamsIds = (ctRows ?? []).map((r: any) => r.coach_id as string);

  const coachIds = Array.from(new Set([...profileCoachIds, ...coachTeamsIds])).filter(Boolean);
  if (coachIds.length === 0) return;

  // Fetch their push subscriptions
  const { data: subscriptions } = await supabase
    .from("coach_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", coachIds)
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
          .from("coach_push_subscriptions")
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
 * GET /api/messages?playerId=...[&date=YYYY-MM-DD]
 * Fetch chat thread for a player.
 *
 * Default behaviour: last 7 days of messages (matches the
 * player_coach_messages table's 7-day retention policy). This avoids
 * the midnight-rollover bug where messages "disappeared" because the
 * UI passed today's entry_date and yesterday's messages were filtered
 * out at view time even though they were still in the database.
 *
 * Opt-in `date` param: strict per-day fetch — used by surfaces that
 * tie chat to a single check-in (e.g. coach reviewing Pétur's Tuesday
 * note specifically). Without `date` the thread is the rolling 7-day
 * conversation stream.
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
    // Explicit date — strict single-day filter (back-compat).
    query = query.eq("entry_date", date);
  } else {
    // Default — rolling 7-day window matching DB retention.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    query = query.gte("created_at", sevenDaysAgo.toISOString());
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

  const roleLower = String(profile.role ?? "").toLowerCase();
  const senderRole = (roleLower === "admin" || roleLower === "staff") ? "coach" : roleLower === "coach" ? "coach" : "player";

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

  if (senderRole === "coach") {
    // Coaches may have team_id set in coach_teams instead of profiles.team_id
    let coachOwnsTeam = profile.team_id === player.team_id;
    if (!coachOwnsTeam) {
      const { data: ct } = await supabase
        .from("coach_teams")
        .select("team_id")
        .eq("coach_id", uid)
        .eq("team_id", player.team_id)
        .limit(1);
      coachOwnsTeam = Array.isArray(ct) && ct.length > 0;
    }
    if (!coachOwnsTeam) {
      return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
    }
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
