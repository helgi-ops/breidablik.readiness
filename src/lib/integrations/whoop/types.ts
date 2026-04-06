import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";

export interface WhoopTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

export interface WhoopProfile {
  user_id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface WhoopRecoveryRecord {
  id: string;
  user_id?: string | null;
  created_at?: string | null;
  score?: {
    recovery_score?: number | null;
    hrv_rmssd_milli?: number | null;
    resting_heart_rate?: number | null;
    respiratory_rate?: number | null;
  } | null;
}

export interface WhoopSleepRecord {
  id: string;
  created_at?: string | null;
  score?: {
    sleep_performance_percentage?: number | null;
    sleep_consistency_percentage?: number | null;
    sleep_efficiency_percentage?: number | null;
  } | null;
  total_in_bed_time_milli?: number | null;
  total_sleep_time_milli?: number | null;
}

export interface WhoopWorkoutRecord {
  id: string;
  created_at?: string | null;
  strain?: number | null;
  score?: {
    strain?: number | null;
    average_heart_rate?: number | null;
    max_heart_rate?: number | null;
  } | null;
  average_heart_rate?: number | null;
  max_heart_rate?: number | null;
}

export interface WhoopCollectionResponse<T> {
  records: T[];
  next_token?: string | null;
  nextToken?: string | null;
}

export interface WhoopIntegrationRecord {
  id: string;
  athlete_id: string;
  provider: "whoop";
  status: "pending" | "active" | "error" | "revoked";
  external_user_id: string | null;
  external_email?: string | null;
  external_first_name?: string | null;
  external_last_name?: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  scopes: string[] | null;
  access_token_expires_at: string | null;
  last_synced_at: string | null;
  last_sync_status: "success" | "error" | "never" | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhoopSyncResult {
  ok: boolean;
  athleteId: string;
  date: string;
  status?: "success" | "partial" | "not_connected" | "error";
  snapshot?: NormalizedMonitoringSnapshot;
  partial: boolean;
  warnings: string[];
  error?: string;
  lastSyncedAt?: string | null;
}
