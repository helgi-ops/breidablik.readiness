export type AcwrBand = "INSUFFICIENT_DATA" | "LOW" | "SAFE" | "CAUTION" | "RISK";
export type LoadTrend = "RISING" | "STABLE" | "DROPPING" | null;

export type PlayerLoadMetricsRow = {
  player_id: string;
  team_id: string | null;
  metric_date: string;
  daily_load: number;
  acute_load_7d: number | null;
  chronic_load_28d: number | null;
  acwr: number | null;
  load_trend: LoadTrend;
};

export type PlayerLoadMetricsSummary = {
  avgAcuteLoad: number | null;
  avgChronicLoad: number | null;
  avgAcwr: number | null;
  acwrCautionCount: number;
  acwrRiskCount: number;
};

// NOTE(player-load-metrics):
// ACWR here is a contextual load metric derived from Session RPE aggregates.
// It is not a standalone readiness decision. Future chain:
// session_rpe_entries -> player_daily_load -> player_load_metrics
// -> neural_fatigue_model -> readiness_adjustment -> ATE -> day decision.

