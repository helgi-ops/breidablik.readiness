// Polar Team Pro API types — based on Polar Team Pro Web Service docs.
// Real response shapes may vary by partner-agreement endpoint version;
// adjust as needed once you have a sandbox account.

export type PolarTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  x_user_id?: number; // returned for AccessLink (per-user)
  x_team_id?: number; // returned for Team Pro (per-team)
  scope?: string;
};

export type PolarTeamSummary = {
  id: string;
  name: string;
  organisation?: { id: string; name: string };
  player_count?: number;
  created?: string;
  modified?: string;
};

export type PolarPlayer = {
  id: string;
  team_id?: string;
  first_name?: string;
  last_name?: string;
  nickname?: string | null;
  birthdate?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
};

export type PolarSession = {
  id: string;
  team_id?: string;
  start_time: string;     // ISO 8601
  end_time?: string;
  type?: "TRAINING" | "GAME" | "TEST" | string;
  name?: string;
  participants?: PolarSessionParticipant[];
};

export type PolarSessionParticipant = {
  player_id: string;
  duration_seconds?: number;
  training_load?: number;
  avg_hr?: number;
  max_hr?: number;
  avg_speed_kmh?: number;
  distance_m?: number;
  sprints?: number;
  calories?: number;
};

// Internal record representing the team_integrations row.
export type PolarTeamIntegrationRecord = {
  id: string;
  team_id: string;
  provider: "polar";
  status: "pending" | "active" | "error" | "revoked";
  external_team_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  scopes: string[] | null;
  access_token_expires_at: string | null;
  last_synced_at: string | null;
  last_sync_status: "success" | "error" | "never" | null;
  last_sync_error: string | null;
  connected_by_user_id: string | null;
  provider_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
