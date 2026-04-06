import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserIdFromBearer, resolvePlayerIdForUser } from "@/lib/notifications/auth";

export const runtime = "nodejs";

type RegisterBody = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
};

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();

    const userId = await getUserIdFromBearer(sb, req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RegisterBody;
    const endpoint = String(body.subscription?.endpoint ?? "").trim();
    const p256dh = String(body.subscription?.keys?.p256dh ?? "").trim();
    const auth = String(body.subscription?.keys?.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: "subscription.endpoint and subscription.keys are required" }, { status: 400 });
    }

    const playerId = await resolvePlayerIdForUser(sb, userId);
    if (!playerId) {
      return NextResponse.json({ ok: false, error: "Authenticated user is not mapped to a player" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const { error } = await sb.from("player_push_subscriptions").upsert(
      {
        player_id: playerId,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get("user-agent") ?? null,
        is_active: true,
        updated_at: nowIso,
        last_seen_at: nowIso,
      },
      { onConflict: "endpoint" }
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
