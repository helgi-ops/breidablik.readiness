import type { ImportConflictRecord, IntegrationProviderKey, NormalizedExternalMetric, ProviderAdapterResult } from "./types";
import { buildImportConflict } from "./conflicts";
import { resolvePlayerMapping, type InternalPlayerCandidate } from "./playerMapping";
import type { PlayerMappingRecord } from "./types";

/** Normalizes adapter output into canonical metric records with stable defaults. */
export function buildNormalizedExternalMetrics(result: ProviderAdapterResult): NormalizedExternalMetric[] {
  return result.normalizedMetrics.map((metric) => ({
    ...metric,
    metricKey: String(metric.metricKey ?? "").trim().toLowerCase(),
    metricLabel: metric.metricLabel ?? null,
    unit: metric.unit ?? null,
    confidence: metric.confidence ?? 0.7,
    metadata: metric.metadata ?? null,
  }));
}

/** Attaches internal player IDs to normalized metrics using deterministic mapping resolution. */
export function attachInternalPlayerIds(args: {
  provider: IntegrationProviderKey;
  metrics: NormalizedExternalMetric[];
  mappingRecords: PlayerMappingRecord[];
  internalPlayers: InternalPlayerCandidate[];
}): { metrics: NormalizedExternalMetric[]; conflicts: ImportConflictRecord[]; mappingUpdates: PlayerMappingRecord[] } {
  const { provider, metrics, mappingRecords, internalPlayers } = args;
  const conflicts: ImportConflictRecord[] = [];
  const mappingUpdates: PlayerMappingRecord[] = [];

  const mapped = metrics.map((metric) => {
    if (metric.playerId) return metric;

    const externalAthleteId = metric.externalAthleteId ?? null;
    const direct = mappingRecords.find(
      (record) =>
        record.provider === provider &&
        record.status === "MAPPED" &&
        externalAthleteId &&
        String(record.externalAthleteId ?? "") === String(externalAthleteId),
    );
    if (direct) {
      return {
        ...metric,
        playerId: direct.internalPlayerId,
        playerName: direct.internalPlayerName ?? null,
      };
    }

    const resolved = resolvePlayerMapping({
      provider,
      externalAthleteId,
      externalAthleteName: metric.playerName ?? null,
      existingMappings: mappingRecords,
      internalPlayers,
    });

    if (resolved.mapping) {
      mappingUpdates.push(resolved.mapping);
      return {
        ...metric,
        playerId: resolved.mapping.internalPlayerId,
        playerName: resolved.mapping.internalPlayerName ?? metric.playerName ?? null,
      };
    }

    conflicts.push(
      buildImportConflict({
        provider,
        type: "PLAYER_UNMATCHED",
        severity: "MODERATE",
        summary: `Player could not be matched for metric "${metric.metricKey}".`,
        playerName: metric.playerName ?? null,
        externalAthleteId: metric.externalAthleteId ?? null,
        details: {
          metricKey: metric.metricKey,
          timestamp: metric.timestamp,
        },
      }),
    );

    return metric;
  });

  return { metrics: mapped, conflicts, mappingUpdates };
}

/** Coach-facing summary for post-normalization metric output. */
export function summarizeNormalizedMetrics(metrics: NormalizedExternalMetric[]): string {
  if (!metrics.length) return "No normalized metrics available.";
  const byCategory = metrics.reduce<Record<string, number>>((acc, metric) => {
    acc[metric.category] = (acc[metric.category] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => `${count} ${category.toLowerCase()}`);
  return `Normalized ${metrics.length} metric(s): ${parts.join(", ")}.`;
}

