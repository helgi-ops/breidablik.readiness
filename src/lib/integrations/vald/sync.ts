import "server-only";

import { getSupabaseServer } from "@/lib/supabaseServer";
import { createValdProvider } from "./provider";
import { getDefaultValdConnectionConfig, decryptValdSecret, encryptValdSecret, VALD_RUNTIME } from "./config";
import { buildValdIngestionKey, hashPayload, shouldReingestValdPayload } from "./idempotency";
import { filterValdAthletesToMicroPulseRoster } from "./filters";
import { inferValdProductFromPayload, mapValdAthleteSummary } from "./mappers";
import type {
  ValdAthleteMatchCandidate,
  ValdConnectionConfig,
  ValdProduct,
  ValdSyncRequest,
  ValdSyncResult,
  ValdTestSummary,
} from "./types";
import { buildValdDailySnapshot } from "@/lib/micropulse/vald/snapshot";

type ValdAccountRow = {
  id: string;
  team_id: string;
  org_id: string | null;
  base_url: string | null;
  auth_mode: string;
  encrypted_client_id: string | null;
  encrypted_client_secret: string | null;
  encrypted_api_key: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  is_enabled: boolean;
  // March 2026 additions
  region: string | null;
  token_url: string | null;
  tenant_id: string | null;
};

type SyncSummary = {
  athletes_seen: number;
  tests_seen: number;
  raw_inserted: number;
  raw_skipped: number;
  raw_updated: number;
  normalized_forcedecks: number;
  normalized_nordbord: number;
  normalized_forceframe: number;
  mapping_missing: number;
  invalid_payloads: number;
  warnings: number;
  athlete_scope_note?: string | null;
  test_scope_note?: string | null;
  provider_diagnostics?: string | null;
};

function emptySummary(): SyncSummary {
  return {
    athletes_seen: 0,
    tests_seen: 0,
    raw_inserted: 0,
    raw_skipped: 0,
    raw_updated: 0,
    normalized_forcedecks: 0,
    normalized_nordbord: 0,
    normalized_forceframe: 0,
    mapping_missing: 0,
    invalid_payloads: 0,
    warnings: 0,
  };
}

function toConfig(row: ValdAccountRow): ValdConnectionConfig {
  const fallback = getDefaultValdConnectionConfig();
  return {
    ...fallback,
    baseUrl: row.base_url ?? fallback.baseUrl,
    authMode: (row.auth_mode as ValdConnectionConfig["authMode"]) ?? fallback.authMode,
    clientId: decryptValdSecret(row.encrypted_client_id),
    clientSecret: decryptValdSecret(row.encrypted_client_secret),
    apiKey: decryptValdSecret(row.encrypted_api_key),
    accessToken: decryptValdSecret(row.encrypted_access_token),
    refreshToken: decryptValdSecret(row.encrypted_refresh_token),
    tokenExpiresAt: row.token_expires_at,
    orgId: row.org_id ?? fallback.orgId,
    // March 2026: region, tokenUrl, tenantId for client_credentials flow
    region: (row.region as ValdConnectionConfig["region"]) ?? fallback.region,
    tokenUrl: row.token_url ?? fallback.tokenUrl,
    tenantId: row.tenant_id ?? fallback.tenantId,
    // Squad filter: sync only athletes from this specific VALD team (e.g. men's team)
    valdTeamId: (row as Record<string, unknown>).vald_team_id as string | null ?? null,
  };
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

function daysAgo(date: string, delta: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - delta);
  return base.toISOString().slice(0, 10);
}

async function getAccount(teamId: string, accountId?: string | null): Promise<ValdAccountRow | null> {
  const sb = getSupabaseServer();
  let query = sb.from("integrations_vald_accounts").select("*").eq("team_id", teamId).eq("provider", "vald").limit(1);
  if (accountId) query = sb.from("integrations_vald_accounts").select("*").eq("id", accountId).eq("team_id", teamId).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as ValdAccountRow | null) ?? null;
}

async function createSyncRun(args: {
  teamId: string;
  accountId: string;
  syncType: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  requestedBy?: string | null;
}) {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("vald_sync_runs")
    .insert({
      team_id: args.teamId,
      account_id: args.accountId,
      sync_type: args.syncType,
      status: "running",
      requested_by: args.requestedBy ?? null,
      date_from: args.dateFrom ?? null,
      date_to: args.dateTo ?? null,
      summary: emptySummary(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as { id: string };
}

async function completeSyncRun(syncRunId: string, status: ValdSyncResult["status"], summary: SyncSummary, errorMessage?: string | null) {
  const sb = getSupabaseServer();
  await sb
    .from("vald_sync_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      summary,
      error_message: errorMessage ?? null,
    })
    .eq("id", syncRunId);
}

async function upsertRawTest(args: {
  teamId: string;
  accountId: string;
  syncRunId: string;
  summary: ValdTestSummary;
}): Promise<{ rawTestId: string | null; action: "inserted" | "updated" | "skipped" }> {
  const sb = getSupabaseServer();
  const payloadHash = hashPayload(args.summary.raw);
  const ingestionKey = buildValdIngestionKey({
    provider: "vald",
    valdTestId: args.summary.testId,
    valdAthleteId: args.summary.athleteId,
    testTimestamp: args.summary.testTimestamp,
    payloadHash,
  });

  const { data: existing } = await sb
    .from("vald_raw_tests")
    .select("id, payload_hash, source_updated_at")
    .eq("team_id", args.teamId)
    .eq("ingestion_key", ingestionKey)
    .maybeSingle();

  if (existing) {
    const shouldUpdate = shouldReingestValdPayload({
      previousPayloadHash: (existing as Record<string, unknown>).payload_hash as string | null,
      previousSourceUpdatedAt: (existing as Record<string, unknown>).source_updated_at as string | null,
      nextSourceUpdatedAt: args.summary.sourceUpdatedAt ?? null,
      nextPayloadHash: payloadHash,
    });
    if (!shouldUpdate) {
      return { rawTestId: String((existing as Record<string, unknown>).id), action: "skipped" };
    }
    const { data, error } = await sb
      .from("vald_raw_tests")
      .update({
        sync_run_id: args.syncRunId,
        payload: args.summary.raw,
        payload_hash: payloadHash,
        source_updated_at: args.summary.sourceUpdatedAt ?? null,
      })
      .eq("id", String((existing as Record<string, unknown>).id))
      .select("id")
      .single();
    if (error) throw error;
    return { rawTestId: String((data as Record<string, unknown>).id), action: "updated" };
  }

  const { data, error } = await sb
    .from("vald_raw_tests")
    .insert({
      team_id: args.teamId,
      account_id: args.accountId,
      sync_run_id: args.syncRunId,
      vald_test_id: args.summary.testId,
      vald_athlete_id: args.summary.athleteId,
      product: args.summary.product,
      test_type: args.summary.testType ?? null,
      test_timestamp: args.summary.testTimestamp,
      source_updated_at: args.summary.sourceUpdatedAt ?? null,
      payload: args.summary.raw,
      payload_hash: payloadHash,
      ingestion_key: ingestionKey,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { rawTestId: String((data as Record<string, unknown>).id), action: "inserted" };
}

async function resolveMicroplayerId(teamId: string, valdAthleteId: string): Promise<string | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("integrations_vald_athlete_map")
    .select("microplayer_id")
    .eq("team_id", teamId)
    .eq("vald_athlete_id", valdAthleteId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as { microplayer_id?: string } | null)?.microplayer_id ?? null;
}

async function getTeamPlayers(teamId: string): Promise<Array<{ id: string; name: string }>> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("players")
    .select("id, full_name")
    .eq("team_id", teamId)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.full_name ?? ""),
  }));
}

async function getMappedValdAthleteIds(teamId: string): Promise<Set<string>> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("integrations_vald_athlete_map")
    .select("vald_athlete_id")
    .eq("team_id", teamId)
    .eq("is_active", true);
  if (error) throw error;
  return new Set(((data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.vald_athlete_id)));
}

async function upsertNormalized(args: {
  teamId: string;
  microplayerId: string | null;
  valdAthleteId: string;
  rawTestId: string;
  product: ValdProduct;
  normalized: Record<string, unknown>;
  trialNumber?: number;
}) {
  const sb = getSupabaseServer();
  const base = {
    team_id: args.teamId,
    microplayer_id: args.microplayerId,
    vald_athlete_id: args.valdAthleteId,
    raw_test_id: args.rawTestId,
    test_timestamp: args.normalized.testTimestamp,
    test_type: args.normalized.testType ?? null,
    is_valid: args.normalized.isValid === true,
    trial_number: args.trialNumber ?? 1,
  };
  if (args.product === "forcedecks") {
    await sb.from("vald_forcedecks_results").upsert({
      ...base,
      jump_height_cm: args.normalized.jumpHeightCm ?? null,
      rsi_mod: args.normalized.rsiMod ?? null,
      eccentric_duration_ms: args.normalized.eccentricDurationMs ?? null,
      concentric_duration_ms: args.normalized.concentricDurationMs ?? null,
      peak_power_w: args.normalized.peakPowerW ?? null,
      relative_peak_power_w_kg: args.normalized.relativePeakPowerWKg ?? null,
      peak_force_n: args.normalized.peakForceN ?? null,
      concentric_impulse_n_s: args.normalized.concentricImpulseNS ?? null,
      time_to_takeoff_ms: args.normalized.timeToTakeoffMs ?? null,
      left_value: args.normalized.leftValue ?? null,
      right_value: args.normalized.rightValue ?? null,
      asymmetry_percent: args.normalized.asymmetryPercent ?? null,
      asymmetry_side: args.normalized.asymmetrySide ?? null,
    }, { onConflict: "raw_test_id,trial_number" });
  } else if (args.product === "nordbord") {
    await sb.from("vald_nordbord_results").upsert({
      ...base,
      left_peak_force_n: args.normalized.leftPeakForceN ?? null,
      right_peak_force_n: args.normalized.rightPeakForceN ?? null,
      left_avg_force_n: args.normalized.leftAvgForceN ?? null,
      right_avg_force_n: args.normalized.rightAvgForceN ?? null,
      asymmetry_percent: args.normalized.asymmetryPercent ?? null,
      asymmetry_side: args.normalized.asymmetrySide ?? null,
    }, { onConflict: "raw_test_id,trial_number" });
  } else if (args.product === "forceframe") {
    await sb.from("vald_forceframe_results").upsert({
      ...base,
      body_region: args.normalized.bodyRegion ?? null,
      movement_pattern: args.normalized.movementPattern ?? null,
      left_peak_force_n: args.normalized.leftPeakForceN ?? null,
      right_peak_force_n: args.normalized.rightPeakForceN ?? null,
      left_relative_force: args.normalized.leftRelativeForce ?? null,
      right_relative_force: args.normalized.rightRelativeForce ?? null,
      asymmetry_percent: args.normalized.asymmetryPercent ?? null,
      asymmetry_side: args.normalized.asymmetrySide ?? null,
    }, { onConflict: "raw_test_id,trial_number" });
  }
}

async function rebuildSnapshots(teamId: string, playerIds: string[], dateFrom: string, dateTo: string) {
  const uniquePlayers = Array.from(new Set(playerIds.filter(Boolean)));
  if (!uniquePlayers.length) return;
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  for (const playerId of uniquePlayers) {
    for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      await buildValdDailySnapshot(teamId, playerId, cursor.toISOString().slice(0, 10));
    }
  }
}

export async function syncValdData(request: ValdSyncRequest): Promise<ValdSyncResult> {
  const teamId = request.teamId;
  const account = await getAccount(teamId, request.accountId ?? null);
  if (!account || !account.is_enabled) {
    return { status: "failed", summary: {}, warnings: [], errors: ["VALD account not configured or disabled."] };
  }

  const dateTo = request.dateTo ?? todayIso();
  const dateFrom = request.dateFrom ?? daysAgo(dateTo, VALD_RUNTIME.syncLookbackDays);
  const syncRun = await createSyncRun({
    teamId,
    accountId: account.id,
    syncType: request.syncType ?? "manual",
    dateFrom,
    dateTo,
    requestedBy: request.requestedBy ?? null,
  });

  const summary = emptySummary();
  const warnings: string[] = [];
  const errors: string[] = [];
  const impactedPlayers: string[] = [];

  try {
    const provider = createValdProvider(toConfig(account));
    const [players, mappedValdAthleteIds, fetchedAthletes] = await Promise.all([
      getTeamPlayers(teamId),
      getMappedValdAthleteIds(teamId),
      provider.fetchAthletes(),
    ]);
    const athletes = filterValdAthletesToMicroPulseRoster(fetchedAthletes, players);
    if (fetchedAthletes.length === 0) {
      summary.athlete_scope_note = "VALD returned no athletes for the current team/tenant scope.";
      warnings.push(summary.athlete_scope_note);
    } else if (athletes.length === 0) {
      summary.athlete_scope_note = `VALD returned ${fetchedAthletes.length} athletes, but none matched the current MicroPulse roster.`;
      warnings.push(summary.athlete_scope_note);
    } else if (athletes.length < fetchedAthletes.length) {
      summary.athlete_scope_note = `VALD returned ${fetchedAthletes.length} athletes; ${athletes.length} matched the current MicroPulse roster.`;
      warnings.push(summary.athlete_scope_note);
    }
    const allowedAthleteIds = new Set<string>([
      ...athletes.map((athlete) => athlete.athleteId),
      ...mappedValdAthleteIds,
    ]);
    summary.athletes_seen = athletes.length;

    const allTests = request.athleteIds?.length
      ? (await Promise.all(request.athleteIds.map((athleteId) => provider.fetchTestsForAthlete(athleteId, dateFrom, dateTo)))).flat()
      : await provider.fetchTestsByDateRange(dateFrom, dateTo);
    const tests = allTests.filter((test) => allowedAthleteIds.has(test.athleteId));
    if (allTests.length === 0) {
      summary.test_scope_note = "VALD returned no tests for the selected date range.";
      warnings.push(summary.test_scope_note);
    } else if (tests.length === 0) {
      summary.test_scope_note = `VALD returned ${allTests.length} tests, but none matched the allowed athlete roster/mappings.`;
      warnings.push(summary.test_scope_note);
    } else if (tests.length < allTests.length) {
      summary.test_scope_note = `VALD returned ${allTests.length} tests; ${tests.length} matched the allowed athlete roster/mappings.`;
      warnings.push(summary.test_scope_note);
    }
    const diagnostics = provider.getDiagnostics();
    if (diagnostics.length > 0) {
      summary.provider_diagnostics = diagnostics.join(" | ");
    }
    summary.tests_seen = tests.length;

    for (const test of tests) {
      const raw = await upsertRawTest({
        teamId,
        accountId: account.id,
        syncRunId: syncRun.id,
        summary: test,
      });
      if (raw.action === "inserted") summary.raw_inserted += 1;
      if (raw.action === "updated") summary.raw_updated += 1;
      if (raw.action === "skipped") summary.raw_skipped += 1;
      if (!raw.rawTestId) continue;

      try {
        const product = provider.getProductFromPayload(test.raw);
        const microplayerId = await resolveMicroplayerId(teamId, test.athleteId);
        if (!microplayerId) {
          summary.mapping_missing += 1;
          warnings.push(`No MicroPulse player mapping for VALD athlete ${test.athleteId}.`);
        } else {
          impactedPlayers.push(microplayerId);
        }

        // ForceDecks: expand trials so each jump gets its own row
        if (product === "forcedecks") {
          const trials = provider.normalizeForceDecksTrials(test.raw);
          for (const trial of trials) {
            await upsertNormalized({
              teamId,
              microplayerId,
              valdAthleteId: test.athleteId,
              rawTestId: raw.rawTestId,
              product: "forcedecks",
              normalized: trial as unknown as Record<string, unknown>,
              trialNumber: trial.trialNumber,
            });
          }
          summary.normalized_forcedecks += trials.length;
        } else {
          // NordBord / ForceFrame — single row per test (no trial expansion)
          const normalized = await provider.normalizeRawTest(test.raw);
          if (!normalized) {
            summary.invalid_payloads += 1;
            warnings.push(`Unknown VALD product for test ${test.testId}.`);
            continue;
          }
          await upsertNormalized({
            teamId,
            microplayerId,
            valdAthleteId: test.athleteId,
            rawTestId: raw.rawTestId,
            product: normalized.product,
            normalized: normalized as Record<string, unknown>,
          });
          if (normalized.product === "nordbord") summary.normalized_nordbord += 1;
          if (normalized.product === "forceframe") summary.normalized_forceframe += 1;
        }
      } catch (error) {
        summary.invalid_payloads += 1;
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }

    await rebuildSnapshots(teamId, impactedPlayers, dateFrom, dateTo);

    // Always rebuild today's snapshot for every team player so the coach view
    // stays current even for players who haven't been tested recently.
    const today = todayIso();
    const allPlayerIds = players.map((p) => p.id);
    for (const playerId of allPlayerIds) {
      await buildValdDailySnapshot(teamId, playerId, today);
    }

    await completeSyncRun(syncRun.id, warnings.length ? "partial" : "success", {
      ...summary,
      warnings: warnings.length,
    });
    return {
      syncRunId: syncRun.id,
      status: warnings.length ? "partial" : "success",
      summary: { ...summary, warnings: warnings.length, dateFrom, dateTo },
      warnings,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    await completeSyncRun(syncRun.id, "failed", { ...summary, warnings: warnings.length }, message);
    return {
      syncRunId: syncRun.id,
      status: "failed",
      summary: { ...summary, warnings: warnings.length, dateFrom, dateTo },
      warnings,
      errors,
    };
  }
}

export async function listValdUnmatchedAthletes(teamId: string): Promise<ValdAthleteMatchCandidate[]> {
  const account = await getAccount(teamId, null);
  if (!account || !account.is_enabled) return [];
  const provider = createValdProvider(toConfig(account));
  const athletes = await provider.fetchAthletes();
  const sb = getSupabaseServer();
  const menPlayers = await getTeamPlayers(teamId);
  const filteredAthletes = filterValdAthletesToMicroPulseRoster(athletes, menPlayers);
  const { data: mappings } = await sb
    .from("integrations_vald_athlete_map")
    .select("vald_athlete_id, microplayer_id, match_source, confidence")
    .eq("team_id", teamId)
    .eq("is_active", true);
  const mapped = new Map<string, Record<string, unknown>>((mappings ?? []).map((row) => [String((row as Record<string, unknown>).vald_athlete_id), row as Record<string, unknown>]));
  return filteredAthletes
    .filter((athlete) => !mapped.has(athlete.athleteId))
    .map((athlete) => ({
      valdAthleteId: athlete.athleteId,
      valdAthleteName: athlete.fullName ?? null,
      valdEmail: athlete.email ?? null,
      valdExternalRef: athlete.externalRef ?? null,
      teamName: athlete.teamName ?? null,
      groupName: athlete.groupName ?? null,
      microplayerId: null,
      microplayerName: null,
      confidence: null,
      matchSource: null,
    }));
}

export async function saveValdAthleteMapping(args: {
  teamId: string;
  microplayerId: string;
  valdAthleteId: string;
  valdAthleteName?: string | null;
  valdEmail?: string | null;
  valdExternalRef?: string | null;
  matchSource: "manual" | "email" | "external_id" | "name_fuzzy";
  confidence?: number | null;
  isActive?: boolean;
}) {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("integrations_vald_athlete_map")
    .upsert({
      team_id: args.teamId,
      microplayer_id: args.microplayerId,
      vald_athlete_id: args.valdAthleteId,
      vald_athlete_name: args.valdAthleteName ?? null,
      vald_email: args.valdEmail ?? null,
      vald_external_ref: args.valdExternalRef ?? null,
      match_source: args.matchSource,
      confidence: args.confidence ?? null,
      is_active: args.isActive ?? true,
    }, { onConflict: "team_id,microplayer_id,vald_athlete_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listValdSyncHistory(teamId: string) {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("vald_sync_runs")
    .select("*")
    .eq("team_id", teamId)
    .order("started_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return data ?? [];
}

export async function getValdAccountState(teamId: string) {
  const account = await getAccount(teamId, null);
  return account;
}

export async function saveValdAccount(args: {
  teamId: string;
  orgId?: string | null;
  baseUrl?: string | null;
  authMode: "api_key" | "oauth" | "unknown";
  clientId?: string | null;
  clientSecret?: string | null;
  apiKey?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  region?: string | null;
  tokenUrl?: string | null;
  tenantId?: string | null;
  valdTeamId?: string | null;
  isEnabled: boolean;
}) {
  const sb = getSupabaseServer();
  const existing = await getAccount(args.teamId, null);
  const payload = {
    team_id: args.teamId,
    org_id: args.orgId ?? null,
    provider: "vald",
    connection_name: "VALD",
    base_url: args.baseUrl ?? null,
    auth_mode: args.authMode,
    encrypted_client_id: args.clientId ? encryptValdSecret(args.clientId) : existing?.encrypted_client_id ?? null,
    encrypted_client_secret: args.clientSecret ? encryptValdSecret(args.clientSecret) : existing?.encrypted_client_secret ?? null,
    encrypted_api_key: args.apiKey ? encryptValdSecret(args.apiKey) : existing?.encrypted_api_key ?? null,
    encrypted_access_token: args.accessToken ? encryptValdSecret(args.accessToken) : existing?.encrypted_access_token ?? null,
    encrypted_refresh_token: args.refreshToken ? encryptValdSecret(args.refreshToken) : existing?.encrypted_refresh_token ?? null,
    token_expires_at: args.tokenExpiresAt ?? existing?.token_expires_at ?? null,
    region: args.region ?? existing?.region ?? null,
    token_url: args.tokenUrl ?? existing?.token_url ?? null,
    tenant_id: args.tenantId ?? existing?.tenant_id ?? null,
    vald_team_id: args.valdTeamId !== undefined ? (args.valdTeamId ?? null) : ((existing as Record<string, unknown> | null)?.vald_team_id as string | null ?? null),
    is_enabled: args.isEnabled,
  };
  const { data, error } = existing
    ? await sb.from("integrations_vald_accounts").update(payload).eq("id", existing.id).select("*").single()
    : await sb.from("integrations_vald_accounts").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}
