import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CatapultAthlete, CatapultAthleteMapRecord } from "./types";

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  email?: string | null;
};

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/þ/gi, "th")
    .replace(/ð/gi, "d")
    .replace(/æ/gi, "ae")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function athleteFullName(athlete: CatapultAthlete): string {
  return [athlete.firstName, athlete.lastName].filter(Boolean).join(" ").trim();
}

function tokenizeName(value: string | null | undefined): string[] {
  return normalizeName(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function nameInitial(value: string | null | undefined): string | null {
  const token = tokenizeName(value)[0];
  return token ? token[0] : null;
}

function getCatapultNameCandidates(athlete: CatapultAthlete): string[] {
  const raw = athleteFullName(athlete);
  const normalized = normalizeName(raw);
  const candidates = new Set<string>();
  if (normalized) candidates.add(normalized);

  const first = tokenizeName(athlete.firstName)[0] ?? "";
  const lastTokens = tokenizeName(athlete.lastName);
  const lastInitial = lastTokens[0]?.[0] ?? "";
  if (first && lastInitial) {
    candidates.add(`${first} ${lastInitial}`);
  }

  if (first) {
    candidates.add(first);
  }

  return Array.from(candidates);
}

function matchesCatapultNameHeuristic(player: PlayerRow, athlete: CatapultAthlete): boolean {
  const playerTokens = tokenizeName(player.full_name);
  if (!playerTokens.length) return false;

  const athleteFirst = tokenizeName(athlete.firstName)[0] ?? "";
  if (!athleteFirst) return false;
  if (playerTokens[0] !== athleteFirst) return false;

  const athleteLastInitial = nameInitial(athlete.lastName);
  if (!athleteLastInitial) return true;

  const remainingPlayerTokens = playerTokens.slice(1);
  return remainingPlayerTokens.some((token) => token.startsWith(athleteLastInitial));
}

async function loadPlayersWithEmail(): Promise<PlayerRow[]> {
  const sb = getSupabaseAdmin();
  const { data: players, error: playersError } = await sb
    .from("players")
    .select("id, full_name, team_id, is_active")
    .eq("is_active", true);
  if (playersError) throw new Error(playersError.message);

  const byId = new Map<string, PlayerRow>(
    ((players ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        full_name: (row.full_name as string | null) ?? null,
        team_id: (row.team_id as string | null) ?? null,
        email: null,
      } as PlayerRow,
    ])
  );

  const { data: emailRows, error } = await sb.rpc("get_active_players_with_email", { p_team_id: null });
  if (!error && Array.isArray(emailRows)) {
    for (const row of emailRows as Array<Record<string, unknown>>) {
      const id = String(row.player_id);
      const current = byId.get(id);
      if (!current) {
        byId.set(id, {
          id,
          full_name: (row.full_name as string | null) ?? null,
          team_id: (row.team_id as string | null) ?? null,
          email: (row.email as string | null) ?? null,
        });
        continue;
      }
      current.email = (row.email as string | null) ?? current.email ?? null;
    }
  }

  return Array.from(byId.values()).map((row) => ({
    id: String(row.id),
    full_name: row.full_name ?? null,
    team_id: row.team_id ?? null,
    email: row.email ?? null,
  }));
}

export async function getManualCatapultMappings(): Promise<Map<string, CatapultAthleteMapRecord>> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("catapult_athlete_map")
    .select("catapult_athlete_id, micropulse_player_id, catapult_athlete_name, catapult_email, match_method, confidence");
  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.catapult_athlete_id),
      {
        catapultAthleteId: String(row.catapult_athlete_id),
        micropulsePlayerId: String(row.micropulse_player_id),
        catapultAthleteName: (row.catapult_athlete_name as string | null) ?? null,
        catapultEmail: (row.catapult_email as string | null) ?? null,
        matchMethod: ((row.match_method as string | null) ?? "manual") as CatapultAthleteMapRecord["matchMethod"],
        confidence: Number(row.confidence ?? 1),
      },
    ])
  );
}

export async function upsertCatapultAthleteMapping(record: CatapultAthleteMapRecord): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("catapult_athlete_map").upsert(
    {
      catapult_athlete_id: record.catapultAthleteId,
      micropulse_player_id: record.micropulsePlayerId,
      catapult_athlete_name: record.catapultAthleteName ?? null,
      catapult_email: record.catapultEmail ?? null,
      match_method: record.matchMethod,
      confidence: record.confidence,
    },
    { onConflict: "catapult_athlete_id" }
  );
  if (error) throw new Error(error.message);
}

export async function mapCatapultAthleteToPlayer(athlete: CatapultAthlete): Promise<CatapultAthleteMapRecord | null> {
  const manualMap = await getManualCatapultMappings();
  const existing = manualMap.get(athlete.id);
  if (existing) return existing;

  const players = await loadPlayersWithEmail();
  const athleteEmail = String(athlete.email ?? "").trim().toLowerCase();
  if (athleteEmail) {
    const emailMatch = players.find((player) => String(player.email ?? "").trim().toLowerCase() === athleteEmail);
    if (emailMatch) {
      return {
        catapultAthleteId: athlete.id,
        micropulsePlayerId: emailMatch.id,
        catapultAthleteName: athleteFullName(athlete) || null,
        catapultEmail: athlete.email ?? null,
        matchMethod: "email",
        confidence: 0.98,
      };
    }
  }

  const normalizedAthleteName = normalizeName(athleteFullName(athlete));
  if (!normalizedAthleteName) return null;
  const nameMatch = players.find((player) => normalizeName(player.full_name) === normalizedAthleteName);
  if (nameMatch) {
    return {
      catapultAthleteId: athlete.id,
      micropulsePlayerId: nameMatch.id,
      catapultAthleteName: athleteFullName(athlete) || null,
      catapultEmail: athlete.email ?? null,
      matchMethod: "name",
      confidence: 0.72,
    };
  }

  const candidateNames = new Set(getCatapultNameCandidates(athlete));
  const heuristicMatches = players.filter((player) => {
    const normalizedPlayerName = normalizeName(player.full_name);
    if (!normalizedPlayerName) return false;
    if (candidateNames.has(normalizedPlayerName)) return true;
    return matchesCatapultNameHeuristic(player, athlete);
  });

  if (heuristicMatches.length !== 1) return null;

  return {
    catapultAthleteId: athlete.id,
    micropulsePlayerId: heuristicMatches[0].id,
    catapultAthleteName: athleteFullName(athlete) || null,
    catapultEmail: athlete.email ?? null,
    matchMethod: "name",
    confidence: 0.64,
  };
}
