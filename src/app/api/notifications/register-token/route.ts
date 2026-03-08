import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserIdFromBearer, resolvePlayerIdForUser } from "@/lib/notifications/auth";

export const runtime = "nodejs";

type RegisterBody = {
  fcmToken?: string;
  deviceLabel?: string | null;
  platform?: string | null;
  userAgent?: string | null;
};

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();

    const userId = await getUserIdFromBearer(sb, req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RegisterBody;
    const fcmToken = String(body.fcmToken ?? "").trim();

    if (!fcmToken) {
      return NextResponse.json({ ok: false, error: "fcmToken is required" }, { status: 400 });
    }

    const playerId = await resolvePlayerIdForUser(sb, userId);
    if (!playerId) {
      return NextResponse.json({ ok: false, error: "Authenticated user is not mapped to a player" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const { error } = await sb.from("player_push_tokens").upsert(
      {
        player_id: playerId,
        fcm_token: fcmToken,
        device_label: body.deviceLabel ?? null,
        platform: body.platform ?? "web",
        user_agent: body.userAgent ?? req.headers.get("user-agent") ?? null,
        is_active: true,
        updated_at: nowIso,
        last_seen_at: nowIso,
      },
      { onConflict: "fcm_token" }
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, playerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
