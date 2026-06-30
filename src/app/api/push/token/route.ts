import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Body = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  endpoint?: string;
};

type ProfilePlayerRow = {
  player_id: string | null;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}


async function getUserIdFromBearer(sb: ReturnType<typeof getAdminClient>, req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function POST(req: Request) {
  try {
    const sb = getAdminClient();
    const userId = await getUserIdFromBearer(sb, req);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const endpoint = String(body.subscription?.endpoint ?? "").trim();
    const p256dh = String(body.subscription?.keys?.p256dh ?? "").trim();
    const auth = String(body.subscription?.keys?.auth ?? "").trim();

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: "subscription.endpoint and subscription.keys are required" }, { status: 400 });
    }

    const { data: profile, error: profErr } = await sb
      .from("profiles")
      .select("player_id")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) throw new Error(profErr.message);

    const playerId = (profile as ProfilePlayerRow | null)?.player_id ?? null;
    if (!playerId) {
      return NextResponse.json({ ok: false, error: "User is not linked to a player profile." }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const { error: upsertErr } = await sb.from("player_push_subscriptions").upsert(
      {
        player_id: playerId,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get("user-agent") ?? null,
        is_active: true,
        last_seen_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "endpoint" }
    );

    if (upsertErr) throw new Error(upsertErr.message);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getAdminClient();
    const userId = await getUserIdFromBearer(sb, req);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const endpoint = String(body.endpoint ?? body.subscription?.endpoint ?? "").trim();

    if (!endpoint) {
      return NextResponse.json({ ok: false, error: "endpoint is required" }, { status: 400 });
    }

    const { error } = await sb
      .from("player_push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("endpoint", endpoint);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
