import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export type TrainerTeamCtx = { sb: SupabaseClient; userId: string; teamId: string };
export type TrainerTeamErr = { error: string; status: number };

/**
 * Bearer-token auth for a trainer acting on their own personal-trainer practice.
 * The team is ?team_id= (team switcher) or the profile's team; access must come from
 * profiles.team_id or coach_teams, and the team must be team_type 'personal_trainer'.
 */
export async function requireTrainerPractice(req: Request): Promise<TrainerTeamCtx | TrainerTeamErr> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 };

  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 };

  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const p = (prof ?? {}) as { role?: string | null; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 };

  const requested = new URL(req.url).searchParams.get("team_id");
  const teamId = requested || p.team_id || null;
  if (!teamId) return { error: "No team context", status: 400 };

  if (teamId !== p.team_id) {
    const { data: link } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", teamId).maybeSingle();
    if (!link) return { error: "Forbidden", status: 403 };
  }

  const { data: team } = await sb.from("teams").select("team_type").eq("id", teamId).maybeSingle();
  if (String((team as { team_type?: string } | null)?.team_type ?? "") !== "personal_trainer") {
    return { error: "Not a personal-trainer practice", status: 400 };
  }
  return { sb, userId, teamId };
}
