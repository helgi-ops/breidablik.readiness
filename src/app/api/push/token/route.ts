import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  fcmToken?: string;
  deviceLabel?: string | null;
  platform?: string | null;
  userAgent?: string | null;
  isActive?: boolean;
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

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
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
    const fcmToken = String(body.fcmToken ?? "").trim();

    if (!fcmToken) {
      return NextResponse.json({ ok: false, error: "fcmToken is required" }, { status: 400 });
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

    const { error: upsertErr } = await sb.from("player_push_tokens").upsert(
      {
        player_id: playerId,
        fcm_token: fcmToken,
        device_label: body.deviceLabel ?? null,
        platform: body.platform ?? null,
        user_agent: body.userAgent ?? req.headers.get("user-agent") ?? null,
        is_active: body.isActive ?? true,
        last_seen_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "fcm_token" }
    );

    if (upsertErr) throw new Error(upsertErr.message);

    // Keep only the latest token active for this player/device flow.
    const { error: deactivateOldErr } = await sb
      .from("player_push_tokens")
      .update({ is_active: false, updated_at: nowIso })
      .eq("player_id", playerId)
      .neq("fcm_token", fcmToken);

    if (deactivateOldErr) throw new Error(deactivateOldErr.message);

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
    const fcmToken = String(body.fcmToken ?? "").trim();

    if (!fcmToken) {
      return NextResponse.json({ ok: false, error: "fcmToken is required" }, { status: 400 });
    }

    const { error } = await sb
      .from("player_push_tokens")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("fcm_token", fcmToken);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
