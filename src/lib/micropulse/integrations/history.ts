import type { IntegrationImportRecord } from "./types";

/** Builds a stable import history entry from an import record for audit timelines. */
export function buildImportHistoryEntry(record: IntegrationImportRecord): IntegrationImportRecord {
  return { ...record };
}

/** Summarizes a list of import records for quick operational review. */
export function summarizeImportHistory(records: IntegrationImportRecord[]): string {
  if (!records.length) return "No import history available.";
  const success = records.filter((record) => record.status === "SUCCESS").length;
  const partial = records.filter((record) => record.status === "PARTIAL").length;
  const failed = records.filter((record) => record.status === "FAILED").length;
  return `${records.length} import(s): ${success} success, ${partial} partial, ${failed} failed.`;
}

/** Returns concise recent import lines sorted newest-first. */
export function listRecentImportSummaries(records: IntegrationImportRecord[], limit = 10): string[] {
  return [...records]
    .sort((a, b) => String(b.completedAt ?? b.startedAt ?? "").localeCompare(String(a.completedAt ?? a.startedAt ?? "")))
    .slice(0, limit)
    .map((record) => `${record.provider}: ${record.summary}`);
}

