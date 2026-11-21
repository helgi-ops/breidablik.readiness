/**
 * Trainer auth + "is this client on a team I hold?" for /api/trainer/* routes.
 *
 * The trainer routes run on the service-role client, so RLS does not stop a
 * write. Any route that takes a client id (players.id) from the request must
 * check, before it reads or writes that client's rows, that the client's team
 * is one the caller holds:
 *   - ADMIN: any team (the documented admin cross-team model).
 *   - COACH / STAFF: profiles.team_id, or a coach_teams row for that team.
 *
 * A client the caller can't reach answers 404 — the same as a client that does
 * not exist — so the route doesn't tell a stranger which ids are real.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseServer";

const TRAINER_ROLES = new Set(["COACH", "ADMIN", "STAFF"]);

export type TrainerCaller = {
  userId: string;
  role: string; // upper case
  profileTeamId: string | null;
  sb: SupabaseClient;
};

export type TrainerAuthFailure = { error: string; status: number };

export function isAuthFailure(x: unknown): x is TrainerAuthFailure {
  return !!x && typeof x === "object" && "error" in x && "status" in x;
}

/** Bearer token → a COACH / ADMIN / STAFF caller, or a 401 / 403. */
export async function requireTrainer(req: Request): Promise<TrainerCaller | TrainerAuthFailure> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 };
  const sb = getSupabaseServer();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 };
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const p = prof as { role?: string | null; team_id?: string | null } | null;
  const role = String(p?.role ?? "").toUpperCase();
  if (!TRAINER_ROLES.has(role)) return { error: "Forbidden", status: 403 };
  return { userId, role, profileTeamId: p?.team_id ?? null, sb };
}

/** Does the caller hold this team? ADMIN: yes. Others: primary team or coach_teams. */
export async function trainerHoldsTeam(caller: TrainerCaller, teamId: string | null): Promise<boolean> {
  if (!teamId) return false;
  if (caller.role === "ADMIN") return true;
  if (caller.profileTeamId != null && caller.profileTeamId === teamId) return true;
  const { data, error } = await caller.sb
    .from("coach_teams")
    .select("team_id")
    .eq("coach_id", caller.userId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * The client must exist and sit on a team the caller holds. Returns the
 * client's team id (for stamping team_id on inserts), or a 404 / 500.
 */
export async function requireClientOnTrainerTeam(
  caller: TrainerCaller,
  clientId: string | null | undefined,
): Promise<{ clientTeamId: string } | TrainerAuthFailure> {
  if (!clientId) return { error: "Missing clientId", status: 400 };
  const { data, error } = await caller.sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
  if (error) return { error: "Could not check the client", status: 500 };
  const clientTeamId = (data as { team_id?: string | null } | null)?.team_id ?? null;
  if (!clientTeamId || !(await trainerHoldsTeam(caller, clientTeamId))) {
    return { error: "Client not found", status: 404 };
  }
  return { clientTeamId };
}

/** requireTrainer + requireClientOnTrainerTeam in one call. */
export async function requireTrainerForClient(
  req: Request,
  clientId: string | null | undefined,
): Promise<(TrainerCaller & { clientTeamId: string }) | TrainerAuthFailure> {
  const caller = await requireTrainer(req);
  if (isAuthFailure(caller)) return caller;
  const client = await requireClientOnTrainerTeam(caller, clientId);
  if (isAuthFailure(client)) return client;
  return { ...caller, clientTeamId: client.clientTeamId };
}
