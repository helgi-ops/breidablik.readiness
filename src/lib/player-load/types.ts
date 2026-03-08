export type LoadBand = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

export type PlayerDailyLoadRow = {
  player_id: string;
  team_id: string | null;
  load_date: string;
  total_sessions: number;
  total_load: number;
  avg_rpe: number | null;
  total_duration_minutes: number;
  latest_submission_at: string | null;
  source: string;
};

export type DailyLoadSummaryResponse = {
  dateKey: string;
  teamId: string | null;
  summary: {
    playersWithLoad: number;
    teamTotalLoad: number;
    teamAvgLoad: number | null;
    highestLoad: number;
    avgRpe: number | null;
  };
  rows: Array<
    PlayerDailyLoadRow & {
      player_name: string;
      load_band: LoadBand;
    }
  >;
  missingPlayers: Array<{
    player_id: string;
    player_name: string;
    status: "NO_SUBMISSION";
  }>;
};

// NOTE(player-load roadmap):
// 1) Neural Fatigue Model: yesterday total_load + 3-7 day trend are core accumulation inputs.
// 2) Daily Readiness Model: readiness penalties should consume aggregated load/fatigue context.
// 3) Adaptive Training Engine (ATE): will use load bands/trends for volume/density/session tuning.
// 4) MicroPulse day decision: should evaluate aggregated load state, not raw session rows.
// Pipeline: session_rpe_entries -> player_daily_load -> player_load_metrics -> neural/readiness/ATE.
