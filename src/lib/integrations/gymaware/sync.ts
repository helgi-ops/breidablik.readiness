import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchGymAwareAthletes, fetchGymAwareSummaries } from "./api";
import type { GymAwareSyncResult } from "./types";

function dateKey(input?: string | null): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return new Date().toISOString().slice(0, 10);
}

async function logIntegrationEvent(args: {
  provider: string;
  scope: string;
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from("integration_logs").insert({
      provider: args.provider,
      scope: args.scope,
      status: args.status,
      message: args.message,
      metadata: args.metadata ?? {},
    });
  } catch {
    // Avoid sync failure because logging table is unavailable.
  }
}

function normalizedName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Auto-match GymAware athletes to MicroPulse players by name.
 * Similar approach as Catapult mapping — exact name then first-name + last-initial heuristic.
 */
async function matchAthletes(
  teamId: string,
): Promise<{
  matched: Map<string, string>; // gymAwareAthleteId → micropulsePlayerId
  unmatched: Array<{ id: string; name: string }>;
  warnings: string[];
}> {
  const sb = getSupabaseAdmin();
  const warnings: string[] = [];

  // Load existing manual mappings
  const { data: existingMap } = await sb
    .from("gymaware_athlete_map")
    .select("gymaware_athlete_id, micropulse_player_id");

  const manualMap = new Map<string, string>();
  for (const row of existingMap ?? []) {
    manualMap.set(row.gymaware_athlete_id, row.micropulse_player_id);
  }

  // Load GymAware settings to get credentials
  const { data: settings } = await sb
    .from("gymaware_settings")
    .select("account_id, api_token")
    .eq("team_id", teamId)
    .single();

  if (!settings) {
    warnings.push("No GymAware settings found for team");
    return { matched: manualMap, unmatched: [], warnings };
  }

  // Fetch GymAware athletes
  let gymAthletes: Array<{ id: string; firstName: string; lastName: string }> = [];
  try {
    console.log(`[GymAware Sync] Fetching athletes with accountId=${settings.account_id}`);
    gymAthletes = await fetchGymAwareAthletes({
      accountId: settings.account_id,
      apiToken: settings.api_token,
    });
    console.log(`[GymAware Sync] Found ${gymAthletes.length} athletes:`, gymAthletes.map((a) => `${a.firstName} ${a.lastName} (${a.id})`));
  } catch (err) {
    const msg = `Failed to fetch GymAware athletes: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[GymAware Sync] ${msg}`);
    warnings.push(msg);
    return { matched: manualMap, unmatched: [], warnings };
  }

  // Load MicroPulse players for this team
  const { data: players } = await sb
    .from("players")
    .select("id, full_name")
    .eq("team_id", teamId);

  const playersByNormalizedName = new Map<string, string>();
  for (const p of players ?? []) {
    const norm = normalizedName(p.full_name);
    if (norm) playersByNormalizedName.set(norm, p.id);
  }

  const matched = new Map<string, string>(manualMap);
  const unmatched: Array<{ id: string; name: string }> = [];

  for (const ga of gymAthletes) {
    if (matched.has(ga.id)) continue;

    const gaFullName = normalizedName(`${ga.firstName} ${ga.lastName}`);
    if (!gaFullName) {
      unmatched.push({ id: ga.id, name: "(no name)" });
      continue;
    }

    // Exact name match
    const exactMatch = playersByNormalizedName.get(gaFullName);
    if (exactMatch) {
      matched.set(ga.id, exactMatch);
      // Save to DB
      await sb.from("gymaware_athlete_map").upsert(
        {
          gymaware_athlete_id: ga.id,
          micropulse_player_id: exactMatch,
          gymaware_athlete_name: `${ga.firstName} ${ga.lastName}`.trim(),
          match_method: "name",
          confidence: 0.9,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "gymaware_athlete_id" },
      );
      continue;
    }

    // Heuristic: first name + last initial
    const gaFirst = normalizedName(ga.firstName);
    const gaLastInitial = normalizedName(ga.lastName)?.charAt(0);
    if (gaFirst && gaLastInitial) {
      for (const [pName, pId] of playersByNormalizedName) {
        const parts = pName.split(" ");
        if (parts.length >= 2 && parts[0] === gaFirst && parts[parts.length - 1].startsWith(gaLastInitial)) {
          matched.set(ga.id, pId);
          await sb.from("gymaware_athlete_map").upsert(
            {
              gymaware_athlete_id: ga.id,
              micropulse_player_id: pId,
              gymaware_athlete_name: `${ga.firstName} ${ga.lastName}`.trim(),
              match_method: "name",
              confidence: 0.7,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "gymaware_athlete_id" },
          );
          break;
        }
      }
    }

    if (!matched.has(ga.id)) {
      const displayName = `${ga.firstName} ${ga.lastName}`.trim() || "(no name)";
      unmatched.push({ id: ga.id, name: displayName });
      warnings.push(`Unmatched GymAware athlete ${ga.id} (${displayName})`);
    }
  }

  return { matched, unmatched, warnings };
}

/**
 * Main GymAware sync.
 * Fetches VBT sets for a date range and stores them in gymaware_vbt_sessions.
 *
 * When `endDate` is provided, does a range sync (for initial backfill).
 * GymAware API supports max ~30 day ranges, so we chunk if needed.
 */
export async function syncGymAware(
  teamId: string,
  targetDate?: string,
  endDate?: string,
): Promise<GymAwareSyncResult> {
  const sb = getSupabaseAdmin();
  const startDate = dateKey(targetDate);
  const finalEnd = endDate ?? startDate;
  const warnings: string[] = [];

  await logIntegrationEvent({
    provider: "gymaware",
    scope: "daily-sync",
    status: "started",
    message: `Starting GymAware sync for ${startDate}${endDate ? ` to ${finalEnd}` : ""}`,
    metadata: { teamId, startDate, endDate: finalEnd },
  });

  // Load settings
  const { data: settings, error: settingsErr } = await sb
    .from("gymaware_settings")
    .select("account_id, api_token, reference_exercise, last_sync_at")
    .eq("team_id", teamId)
    .single();

  if (settingsErr || !settings) {
    const msg = "No GymAware settings found for team";
    await logIntegrationEvent({
      provider: "gymaware",
      scope: "daily-sync",
      status: "error",
      message: msg,
      metadata: { teamId, error: settingsErr?.message },
    });
    return { date: startDate, setsFetched: 0, setsStored: 0, athletesMatched: 0, unmatchedCount: 0, warnings: [msg] };
  }

  const config = { accountId: settings.account_id, apiToken: settings.api_token };

  // Match athletes
  const { matched, unmatched, warnings: matchWarnings } = await matchAthletes(teamId);
  warnings.push(...matchWarnings);

  // Build date chunks (max 28 days per API call — GymAware limit is ~1 month)
  const chunks: Array<{ start: string; end: string }> = [];
  {
    let cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${finalEnd}T00:00:00Z`);
    while (cursor <= end) {
      const chunkEnd = new Date(cursor.getTime() + 27 * 86400000);
      const actualEnd = chunkEnd > end ? end : chunkEnd;
      chunks.push({
        start: cursor.toISOString().slice(0, 10),
        end: actualEnd.toISOString().slice(0, 10),
      });
      cursor = new Date(actualEnd.getTime() + 86400000);
    }
  }

  let totalFetched = 0;
  let storedCount = 0;

  // Collect all sets from GymAware
  let allFetchedSets: Awaited<ReturnType<typeof fetchGymAwareSummaries>> = [];

  console.log(`[GymAware Sync] Fetching summaries in ${chunks.length} chunk(s)...`);

  for (const chunk of chunks) {
    try {
      console.log(`[GymAware Sync] Fetching chunk ${chunk.start} → ${chunk.end}`);
      const sets = await fetchGymAwareSummaries(config, { startDate: chunk.start, endDate: chunk.end });
      console.log(`[GymAware Sync] Chunk ${chunk.start}→${chunk.end}: ${sets.length} sets`);
      allFetchedSets.push(...sets);
      totalFetched += sets.length;
    } catch (err) {
      const msg = `Failed to fetch GymAware summaries (${chunk.start} to ${chunk.end}): ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[GymAware Sync] ${msg}`);
      warnings.push(msg);
    }
  }

  // Filter to matched athletes and store
  console.log(`[GymAware Sync] Storing ${allFetchedSets.length} sets for ${matched.size} matched athletes...`);

  for (const set of allFetchedSets) {
    const playerId = matched.get(set.athleteId);
    if (!playerId) continue;

    const { error: upsertErr } = await sb.from("gymaware_vbt_sessions").upsert(
      {
        player_id: playerId,
        session_date: set.date,
        exercise_name: set.exerciseName,
        load_kg: set.loadKg,
        reps: set.reps,
        mean_velocity: set.concMeanVelocity,
        peak_velocity: set.concPeakVelocity,
        mean_power: set.concMeanPower,
        peak_power: set.concPeakPower,
        ecc_mean_velocity: set.eccMeanVelocity,
        height: set.height,
        best_rep_mean_velocity: null, // Not available from summaries endpoint
        gymaware_set_id: set.setId,
        gymaware_athlete_id: set.athleteId,
        raw_json: set.raw,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "player_id,session_date,gymaware_set_id" },
    );

    if (upsertErr) {
      warnings.push(`Failed to store set ${set.setId}: ${upsertErr.message}`);
    } else {
      storedCount++;
    }
  }

  // Update last_sync_at
  await sb
    .from("gymaware_settings")
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("team_id", teamId);

  const summary = `GymAware sync ${startDate}→${finalEnd}: ${totalFetched} sets fetched, ${storedCount} stored, ${matched.size} athletes matched, ${unmatched.length} unmatched`;
  await logIntegrationEvent({
    provider: "gymaware",
    scope: "daily-sync",
    status: "success",
    message: summary,
    metadata: { teamId, startDate, endDate: finalEnd, setsFetched: totalFetched, storedCount, matchedCount: matched.size, unmatchedCount: unmatched.length },
  });

  return {
    date: startDate,
    setsFetched: totalFetched,
    setsStored: storedCount,
    athletesMatched: matched.size,
    unmatchedCount: unmatched.length,
    warnings,
  };
}
