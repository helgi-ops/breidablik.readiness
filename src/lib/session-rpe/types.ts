export const SESSION_TYPES = ["match", "team_training", "gym", "recovery", "individual", "other"] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

export type SessionRpeEntry = {
  id: string;
  player_id: string;
  team_id: string | null;
  session_date: string;
  session_type: SessionType;
  session_name: string | null;
  duration_minutes: number;
  rpe: number;
  session_load: number;
  source: string;
  notes: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

export type SessionRpePayload = {
  session_date: string;
  session_type: SessionType;
  session_name?: string;
  duration_minutes: number;
  rpe: number;
  notes?: string;
};

export type LoadBand = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type PlayerDailyLoad = {
  player_id: string;
  player_name: string;
  team_id: string | null;
  session_date: string;
  total_sessions: number;
  daily_load_total: number;
  avg_rpe: number | null;
  total_duration_minutes: number;
  latest_submission_at: string | null;
};
