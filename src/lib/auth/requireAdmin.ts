import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserIdFromBearer } from "@/lib/notifications/auth";

/** Admin = the canonical is_admin flag (what the /admin layout gates on) OR role='ADMIN'. */
export async function isAdminUser(sb: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await sb.from("profiles").select("role, is_admin").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const p = (data ?? {}) as { role?: string | null; is_admin?: boolean | null };
  return p.is_admin === true || String(p.role ?? "").toUpperCase() === "ADMIN";
}

/** Throws "Unauthorized" / "Forbidden" (see authErrorToResponse). Returns the admin's user id. */
export async function requireAdminUser(sb: SupabaseClient, req: Request): Promise<string> {
  // Live session check: a signed-out admin session stops working at once, not when its token expires.
  const userId = await getUserIdFromBearer(sb, req, { requireLiveSession: true });
  if (!userId) throw new Error("Unauthorized");
  if (!(await isAdminUser(sb, userId))) throw new Error("Forbidden");
  return userId;
}
