import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type RegisterBody = {
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  userAgent?: string;
};

type ProfileRow = {
  player_id: string | null;
  role?: string | null;
};

type PlayerRow = {
  id: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function messageFromError(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

async function getAuthUserIdFromBearer(sb: ReturnType<typeof getAdminClient>, req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function resolvePlayerIdForUser(sb: ReturnType<typeof getAdminClient>, userId: string): Promise<string | null> {
  const { data: pByUser, error: pByUserErr } = await sb
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (pByUserErr) throw new Error(pByUserErr.message);
  if ((pByUser as PlayerRow | null)?.id) return (pByUser as PlayerRow).id;

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("player_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) throw new Error(profileErr.message);
  return (profile as ProfileRow | null)?.player_id ?? null;
}

async function resolveRoleForUser(
  sb: ReturnType<typeof getAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProfileRow | null)?.role ?? null;
}

export async function POST(req: Request) {
  try {
    const sb = getAdminClient();

    const userId = await getAuthUserIdFromBearer(sb, req);
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
    const nowIso = new Date().toISOString();
    const userAgent = String(body.userAgent ?? req.headers.get("user-agent") ?? "").trim() || null;

    // Player path: store in player_push_subscriptions (existing behavior)
    if (playerId) {
      const { error: upsertErr } = await sb.from("player_push_subscriptions").upsert(
        {
          player_id: playerId,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgent,
          is_active: true,
          updated_at: nowIso,
          last_seen_at: nowIso,
        },
        { onConflict: "endpoint" }
      );
      if (upsertErr) {
        return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
      }
      // Same stale-subscription cleanup as the coach path: keep one active
      // subscription per push host (device family) for this player.
      try {
        const host = new URL(endpoint).host;
        await sb.from("player_push_subscriptions")
          .update({ is_active: false, updated_at: nowIso })
          .eq("player_id", playerId)
          .eq("is_active", true)
          .neq("endpoint", endpoint)
          .like("endpoint", `https://${host}/%`);
      } catch { /* non-fatal — the new subscription is already registered */ }
      return NextResponse.json({ ok: true, kind: "player", playerId });
    }

    // Coach/admin path: store in coach_push_subscriptions keyed on profile_id
    const role = String((await resolveRoleForUser(sb, userId)) ?? "").toLowerCase();
    if (role === "coach" || role === "admin" || role === "staff") {
      const { error: upsertErr } = await sb.from("coach_push_subscriptions").upsert(
        {
          profile_id: userId,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgent,
          is_active: true,
          updated_at: nowIso,
          last_seen_at: nowIso,
        },
        { onConflict: "endpoint" }
      );
      if (upsertErr) {
        return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
      }
      // Prevent stale-subscription pile-up: iOS PWA reinstalls / OS updates mint a
      // NEW endpoint each time but the old one stays is_active, so a coach who
      // re-added the app accumulated several subscriptions and received every
      // alert once per stale endpoint. When a device re-subscribes, deactivate
      // this profile's OTHER active subscriptions on the SAME push host (= same
      // device family), keeping only the one just registered.
      try {
        const host = new URL(endpoint).host;
        await sb.from("coach_push_subscriptions")
          .update({ is_active: false, updated_at: nowIso })
          .eq("profile_id", userId)
          .eq("is_active", true)
          .neq("endpoint", endpoint)
          .like("endpoint", `https://${host}/%`);
      } catch { /* non-fatal — the new subscription is already registered */ }
      return NextResponse.json({ ok: true, kind: "coach", profileId: userId });
    }

    return NextResponse.json(
      { ok: false, error: "Authenticated user is neither a player nor a coach/admin" },
      { status: 400 },
    );
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: messageFromError(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
