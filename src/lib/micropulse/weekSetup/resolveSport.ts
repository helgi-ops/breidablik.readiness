/**
 * Resolve a team's sport from a team-level source — never `players.sport`,
 * which is populated inconsistently. Canonical source is
 * `team_settings.sport_type` (what the decision engine reads); we fall back to
 * `teams.sport`, then to "football" when nothing is known. Football is the safe
 * default: it keeps the existing MD-day microcycle authoritative, so an unknown
 * team behaves exactly as before.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSportProfile, type SportId, type SportProfile } from "../sportProfiles";

function normalize(v: unknown): SportId | null {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "basketball") return "basketball";
  if (s === "football") return "football";
  return null;
}

export async function resolveTeamSport(
  sb: SupabaseClient,
  teamId: string | null | undefined,
): Promise<SportId> {
  if (!teamId) return "football";
  try {
    const { data: settings } = await sb
      .from("team_settings").select("sport_type").eq("team_id", teamId).maybeSingle();
    const fromSettings = normalize((settings as { sport_type?: string | null } | null)?.sport_type);
    if (fromSettings) return fromSettings;

    const { data: team } = await sb
      .from("teams").select("sport").eq("id", teamId).maybeSingle();
    const fromTeam = normalize((team as { sport?: string | null } | null)?.sport);
    if (fromTeam) return fromTeam;
  } catch {
    /* fall through to football */
  }
  return "football";
}

export async function resolveTeamSportProfile(
  sb: SupabaseClient,
  teamId: string | null | undefined,
): Promise<SportProfile> {
  return getSportProfile(await resolveTeamSport(sb, teamId));
}
