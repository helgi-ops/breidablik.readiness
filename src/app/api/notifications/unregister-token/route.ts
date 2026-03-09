import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserIdFromBearer, resolvePlayerIdForUser } from "@/lib/notifications/auth";

export const runtime = "nodejs";

type Body = {
  endpoint?: string;
};

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();

    const userId = await getUserIdFromBearer(sb, req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const endpoint = String(body.endpoint ?? "").trim();
    if (!endpoint) {
      return NextResponse.json({ ok: false, error: "endpoint is required" }, { status: 400 });
    }

    const playerId = await resolvePlayerIdForUser(sb, userId);
    if (!playerId) {
      return NextResponse.json({ ok: false, error: "Authenticated user is not mapped to a player" }, { status: 400 });
    }

    const { error } = await sb
      .from("player_push_subscriptions")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", playerId)
      .eq("endpoint", endpoint);

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
