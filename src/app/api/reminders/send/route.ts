/**
 * Manual local test:
 * curl -X POST http://localhost:3000/api/reminders/send \
 *   -H "Authorization: Bearer <REMINDER_CRON_SECRET>"
 */
import { NextResponse } from "next/server";
import type { BatchResponse } from "firebase-admin/messaging";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAppTimezone, getTodayDateKey } from "@/lib/timezone";

export const runtime = "nodejs";

type PlayerRow = {
  id: string;
  user_id: string | null;
};

type CheckinRow = {
  player_id: string;
};

type TokenRow = {
  id: string;
  player_id: string;
  fcm_token: string;
  is_active: boolean | null;
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (auth === expected) return true;

  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return querySecret === secret;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  try {
    const sb = getSupabaseAdmin();
    const messaging = getFirebaseAdminMessaging();
    const timeZone = getAppTimezone();
    const today = getTodayDateKey(timeZone);

    // Players expected to check in today:
    // - players with linked auth user (`user_id` exists)
    const { data: playersData, error: playersErr } = await sb.from("players").select("id, user_id").not("user_id", "is", null);
    if (playersErr) throw new Error(`players query failed: ${playersErr.message}`);
    const players = (playersData ?? []) as PlayerRow[];

    const allPlayerIds = players.map((p) => p.id);
    if (!allPlayerIds.length) {
      return NextResponse.json({
        ok: true,
        dateKey: today,
        timezone: timeZone,
        totalPlayersMatched: 0,
        totalTokens: 0,
        sent: 0,
        failed: 0,
        removedInvalidTokens: 0,
      });
    }

    const { data: checkinData, error: checkinErr } = await sb
      .from("readiness_entries")
      .select("player_id")
      .eq("entry_date", today)
      .in("player_id", allPlayerIds);
    if (checkinErr) throw new Error(`readiness_entries query failed: ${checkinErr.message}`);

    const checkedInSet = new Set(((checkinData ?? []) as CheckinRow[]).map((r) => r.player_id));
    const pendingPlayerIds = allPlayerIds.filter((id) => !checkedInSet.has(id));

    if (!pendingPlayerIds.length) {
      return NextResponse.json({
        ok: true,
        dateKey: today,
        timezone: timeZone,
        totalPlayersMatched: 0,
        totalTokens: 0,
        sent: 0,
        failed: 0,
        removedInvalidTokens: 0,
      });
    }

    const { data: tokenData, error: tokenErr } = await sb
      .from("player_push_tokens")
      .select("id, player_id, fcm_token, is_active")
      .eq("is_active", true)
      .in("player_id", pendingPlayerIds);
    if (tokenErr) throw new Error(`player_push_tokens query failed: ${tokenErr.message}`);

    const tokenRows = (tokenData ?? []) as TokenRow[];
    const tokenMetaByToken = new Map<string, TokenRow>();

    for (const row of tokenRows) {
      const token = String(row.fcm_token ?? "").trim();
      if (!token) continue;
      if (!tokenMetaByToken.has(token)) tokenMetaByToken.set(token, row);
    }

    const tokens = Array.from(tokenMetaByToken.keys());
    if (!tokens.length) {
      return NextResponse.json({
        ok: true,
        dateKey: today,
        timezone: timeZone,
        totalPlayersMatched: pendingPlayerIds.length,
        totalTokens: 0,
        sent: 0,
        failed: 0,
        removedInvalidTokens: 0,
      });
    }

    let sent = 0;
    let failed = 0;
    const invalidTokenIds = new Set<string>();

    const batches = chunk(tokens, 500);
    for (const batchTokens of batches) {
      const response: BatchResponse = await messaging.sendEachForMulticast({
        tokens: batchTokens,
        notification: {
          title: "MicroPulse Reminder",
          body: "Don't forget today's readiness check-in.",
        },
        data: {
          type: "daily_checkin",
          screen: "checkin",
        },
        webpush: {
          fcmOptions: {
            link: "/player/checkin",
          },
        },
      });

      sent += response.successCount;
      failed += response.failureCount;

      response.responses.forEach((res, idx) => {
        if (res.success) return;
        const code = res.error?.code ?? "";
        if (!INVALID_TOKEN_CODES.has(code)) return;
        const token = batchTokens[idx];
        const meta = tokenMetaByToken.get(token);
        if (meta?.id) invalidTokenIds.add(meta.id);
      });
    }

    let removedInvalidTokens = 0;
    if (invalidTokenIds.size > 0) {
      const ids = Array.from(invalidTokenIds);
      const { error: deactivateErr } = await sb
        .from("player_push_tokens")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (!deactivateErr) removedInvalidTokens = ids.length;
    }

    return NextResponse.json({
      ok: true,
      dateKey: today,
      timezone: timeZone,
      totalPlayersMatched: pendingPlayerIds.length,
      totalTokens: tokens.length,
      sent,
      failed,
      removedInvalidTokens,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Reminder send failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
