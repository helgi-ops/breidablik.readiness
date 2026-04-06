import type { ImportConflictRecord, NormalizedExternalMetric, ProviderAdapterResult } from "./types";
import { buildImportConflict } from "./conflicts";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const SUPPORTED_CATEGORIES = new Set([
  "RECOVERY",
  "READINESS",
  "SLEEP",
  "LOAD",
  "GPS",
  "FORCE",
  "WELLNESS",
  "SESSION",
  "HEART_RATE",
  "CUSTOM",
]);

export type MetricValidationResult = {
  metric: NormalizedExternalMetric | null;
  warnings: string[];
  errors: string[];
  conflicts: ImportConflictRecord[];
};

/** Validates one normalized metric; deterministic checks keep import outcomes explainable. */
export function validateNormalizedMetric(metric: NormalizedExternalMetric): MetricValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const conflicts: ImportConflictRecord[] = [];

  if (!metric.provider) errors.push("Missing provider.");
  if (!metric.metricKey) errors.push("Missing metricKey.");

  if (!SUPPORTED_CATEGORIES.has(metric.category)) {
    errors.push(`Unsupported category "${metric.category}".`);
    conflicts.push(
      buildImportConflict({
        provider: metric.provider,
        type: "INVALID_METRIC",
        severity: "MODERATE",
        summary: `Unsupported metric category "${metric.category}" for "${metric.metricKey}".`,
        externalAthleteId: metric.externalAthleteId ?? null,
      }),
    );
  }

  if (metric.numericValue != null && !isFiniteNumber(metric.numericValue)) {
    errors.push("numericValue must be finite.");
  }
  if (metric.timestamp == null || !String(metric.timestamp).trim()) {
    warnings.push("Missing timestamp.");
    conflicts.push(
      buildImportConflict({
        provider: metric.provider,
        type: "MISSING_TIMESTAMP",
        severity: "LOW",
        summary: `Metric "${metric.metricKey}" missing timestamp.`,
        externalAthleteId: metric.externalAthleteId ?? null,
      }),
    );
  }
  if (!metric.playerId && metric.externalAthleteId) {
    warnings.push("Player not mapped.");
  }
  if (metric.numericValue == null && !metric.textValue) {
    errors.push("Metric requires numericValue or textValue.");
  }

  if (errors.length) {
    conflicts.push(
      buildImportConflict({
        provider: metric.provider,
        type: "INVALID_METRIC",
        severity: "HIGH",
        summary: `Metric "${metric.metricKey}" failed validation.`,
        externalAthleteId: metric.externalAthleteId ?? null,
        details: {
          errors,
          timestamp: metric.timestamp,
        },
      }),
    );
  }

  return {
    metric: errors.length ? null : metric,
    warnings,
    errors,
    conflicts,
  };
}

/** Validates adapter output shape before batch processing. */
export function validateProviderAdapterResult(result: ProviderAdapterResult): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!Array.isArray(result.normalizedMetrics)) errors.push("Adapter result missing normalizedMetrics array.");
  if (!Array.isArray(result.conflicts)) errors.push("Adapter result missing conflicts array.");
  if (!Array.isArray(result.warnings)) errors.push("Adapter result missing warnings array.");

  if (!result.normalizedMetrics.length && !result.conflicts.length) {
    warnings.push("Adapter returned no metrics and no conflicts.");
  }

  return { warnings, errors };
}

/** Validates a normalized metric batch while preserving partial import behavior. */
export function validateImportBatch(metrics: NormalizedExternalMetric[]): {
  validMetrics: NormalizedExternalMetric[];
  warnings: string[];
  errors: string[];
  conflicts: ImportConflictRecord[];
} {
  const validMetrics: NormalizedExternalMetric[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const conflicts: ImportConflictRecord[] = [];

  for (const metric of metrics) {
    const result = validateNormalizedMetric(metric);
    if (result.metric) validMetrics.push(result.metric);
    warnings.push(...result.warnings);
    errors.push(...result.errors);
    conflicts.push(...result.conflicts);
  }

  return { validMetrics, warnings, errors, conflicts };
}

