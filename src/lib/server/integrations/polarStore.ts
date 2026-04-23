import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { PolarTeamIntegrationRecord } from "@/lib/integrations/polar/types";

function nowIso(): string {
  return new Date().toISOString();
}

function isMissingRelationOrColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703";
}

/**
 * Resolve the team_id a coach can connect Polar for.
 * Falls back to coach_teams table since profile.team_id is often null for coaches.
 */
export async function resolveCoachTeamId(userId: string): Promise<string | null> {
  const sb = getSupabaseAdmin();

  const { data: profile } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
  const fromProfile = (profile as { team_id?: string | null } | null)?.team_id ?? null;
  if (fromProfile) return fromProfile;

  const { data: coachRows } = await sb
    .from("coach_teams")
    .select("team_id, is_primary")
    .eq("coach_id", userId)
    .order("is_primary", { ascending: false })
    .limit(1);

  return ((coachRows as { team_id?: string | null }[] | null)?.[0]?.team_id ?? null) as string | null;
}

export async function getPolarIntegrationByTeam(teamId: string): Promise<PolarTeamIntegrationRecord | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("team_integrations")
    .select("*")
    .eq("team_id", teamId)
    .eq("provider", "polar")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingRelationOrColumnError(error)) return null;
    throw error;
  }
  return ((data as PolarTeamIntegrationRecord[] | null)?.[0] ?? null);
}

export async function upsertPolarIntegration(
  record: Partial<PolarTeamIntegrationRecord> & { team_id: string }
): Promise<PolarTeamIntegrationRecord> {
  const sb = getSupabaseAdmin();
  const payload: Record<string, unknown> = {
    provider: "polar",
    team_id: record.team_id,
    updated_at: nowIso(),
  };
  if (record.status !== undefined) payload.status = record.status;
  if (record.external_team_id !== undefined) payload.external_team_id = record.external_team_id;
  if (record.access_token !== undefined) payload.access_token = record.access_token;
  if (record.refresh_token !== undefined) payload.refresh_token = record.refresh_token;
  if (record.token_type !== undefined) payload.token_type = record.token_type;
  if (record.scopes !== undefined) payload.scopes = record.scopes;
  if (record.access_token_expires_at !== undefined) payload.access_token_expires_at = record.access_token_expires_at;
  if (record.last_synced_at !== undefined) payload.last_synced_at = record.last_synced_at;
  if (record.last_sync_status !== undefined) payload.last_sync_status = record.last_sync_status;
  if (record.last_sync_error !== undefined) payload.last_sync_error = record.last_sync_error;
  if (record.connected_by_user_id !== undefined) payload.connected_by_user_id = record.connected_by_user_id;
  if (record.provider_metadata !== undefined) payload.provider_metadata = record.provider_metadata;

  const { data, error } = await sb
    .from("team_integrations")
    .upsert(payload, { onConflict: "team_id,provider" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as PolarTeamIntegrationRecord;
}

export async function markPolarIntegrationRevoked(teamId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb
    .from("team_integrations")
    .update({
      status: "revoked",
      access_token: null,
      refresh_token: null,
      access_token_expires_at: null,
      updated_at: nowIso(),
    })
    .eq("team_id", teamId)
    .eq("provider", "polar");
}
