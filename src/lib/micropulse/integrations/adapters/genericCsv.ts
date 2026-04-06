import type { ExternalMetricCategory, RawIntegrationPayload } from "../types";
import { asNumber, asString, emptyResult, makeConflict, metric, safeArray, type IntegrationProviderAdapter } from "./base";

const CATEGORY_SET: ExternalMetricCategory[] = [
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
];

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((x) => x.trim());
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const values = line.split(",").map((x) => x.trim());
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = values[i] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function asRows(payload: unknown): Record<string, unknown>[] {
  if (typeof payload === "string") {
    const parsed = parseCsv(payload);
    return parsed.map((row) => ({ ...row }));
  }
  return safeArray(payload);
}

function resolveCategory(rawValue: unknown): ExternalMetricCategory {
  const key = String(rawValue ?? "CUSTOM").toUpperCase() as ExternalMetricCategory;
  return CATEGORY_SET.includes(key) ? key : "CUSTOM";
}

function toMetric(row: Record<string, unknown>, raw: RawIntegrationPayload) {
  const metricKey = asString(row.metricKey ?? row.metric_key ?? row.key);
  if (!metricKey) return null;

  const numericValue = asNumber(row.numericValue ?? row.numeric_value ?? row.value);
  const textValue = asString(row.textValue ?? row.text_value ?? row.value_text);
  if (numericValue == null && !textValue) return null;

  return metric({
    provider: "GENERIC_CSV",
    category: resolveCategory(row.category ?? row.metricCategory),
    externalAthleteId: asString(row.externalAthleteId ?? row.external_athlete_id ?? row.athleteId ?? row.athlete_id),
    timestamp: asString(row.timestamp ?? row.date),
    metricKey,
    metricLabel: asString(row.metricLabel ?? row.metric_label ?? row.label),
    numericValue,
    textValue,
    unit: asString(row.unit),
    sourceRef: raw.sourceRef ?? raw.id,
    confidence: asNumber(row.confidence) ?? 0.7,
    metadata: {
      importMode: raw.importMode,
      originalRow: row,
    },
  });
}

export const genericCsvAdapter: IntegrationProviderAdapter = {
  provider: "GENERIC_CSV",
  canHandle(payload) {
    if (typeof payload === "string") return payload.includes(",") && payload.toLowerCase().includes("metrickey");
    if (!payload || typeof payload !== "object") return false;
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes("metric_key") || text.includes("metrickey") || text.includes("generic_csv");
  },
  normalize(raw) {
    const rows = asRows(raw.payload);
    if (!rows.length) {
      return emptyResult("Generic CSV payload had no usable rows.", [
        makeConflict({
          provider: "GENERIC_CSV",
          type: "UNSUPPORTED_PAYLOAD",
          severity: "MODERATE",
          summary: "Could not parse GENERIC_CSV payload rows.",
          rawReferenceId: raw.id,
        }),
      ]);
    }

    const normalizedMetrics = [];
    const conflicts = [];
    const warnings: string[] = [];

    for (const row of rows) {
      const normalizedMetric = toMetric(row, raw);
      if (!normalizedMetric) {
        warnings.push("GENERIC_CSV row skipped because required metric fields were missing.");
        continue;
      }

      if (!normalizedMetric.timestamp) {
        conflicts.push(
          makeConflict({
            provider: "GENERIC_CSV",
            type: "MISSING_TIMESTAMP",
            severity: "LOW",
            summary: `Generic CSV row missing timestamp for metric "${normalizedMetric.metricKey}".`,
            rawReferenceId: raw.id,
            externalAthleteId: normalizedMetric.externalAthleteId,
          }),
        );
      }

      normalizedMetrics.push(normalizedMetric);
    }

    return {
      normalizedMetrics,
      conflicts,
      warnings,
      summary: `GENERIC_CSV normalized ${normalizedMetrics.length} metrics from ${rows.length} row(s).`,
    };
  },
};

