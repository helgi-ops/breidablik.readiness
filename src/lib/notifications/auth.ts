import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function bearerFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function getUserIdFromCookieSession(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  const serverClient = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        try {
          for (const c of cookiesToSet) {
            cookieStore.set(c.name, c.value, c.options);
          }
        } catch {
          // Read-only cookie contexts are valid in some route executions.
          // In that case we still allow server-side auth reads via existing cookies.
        }
      },
    },
  });

  const { data, error } = await serverClient.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function getUserIdFromBearer(sb: SupabaseClient, req: Request): Promise<string | null> {
  const token = bearerFromRequest(req);
  if (!token) {
    return getUserIdFromCookieSession();
  }

  const { data, error } = await sb.auth.getUser(token);
  if (!error && data?.user?.id) return data.user.id;

  return getUserIdFromCookieSession();
}

export async function requireCoachUserId(sb: SupabaseClient, req: Request): Promise<string> {
  const userId = await getUserIdFromBearer(sb, req);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);

  const role = String((data as { role?: string | null } | null)?.role ?? "").toUpperCase();
  const isCoach = role === "COACH" || role === "ADMIN" || role === "STAFF";
  if (!isCoach) {
    throw new Error("Forbidden");
  }

  return userId;
}

export async function resolvePlayerIdForUser(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data: byPlayers, error: byPlayersErr } = await sb.from("players").select("id").eq("user_id", userId).maybeSingle();
  if (byPlayersErr) throw new Error(byPlayersErr.message);

  const playerFromPlayers = (byPlayers as { id?: string | null } | null)?.id ?? null;
  if (playerFromPlayers) return playerFromPlayers;

  const { data: byProfile, error: byProfileErr } = await sb
    .from("profiles")
    .select("player_id")
    .eq("id", userId)
    .maybeSingle();

  if (byProfileErr) throw new Error(byProfileErr.message);
  return (byProfile as { player_id?: string | null } | null)?.player_id ?? null;
}
