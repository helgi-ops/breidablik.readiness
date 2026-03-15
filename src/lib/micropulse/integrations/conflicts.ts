import type { ImportConflictRecord } from "./types";

/** Builds a typed import conflict record for deterministic conflict handling and auditability. */
export function buildImportConflict(args: Omit<ImportConflictRecord, "id" | "createdAt">): ImportConflictRecord {
  return {
    ...args,
    id: `conflict:${args.provider}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
}

/** Groups conflicts by conflict type for focused triage in integrations UI. */
export function groupImportConflictsByType(conflicts: ImportConflictRecord[]): Record<ImportConflictRecord["type"], ImportConflictRecord[]> {
  return {
    PLAYER_UNMATCHED: conflicts.filter((item) => item.type === "PLAYER_UNMATCHED"),
    DUPLICATE_MAPPING: conflicts.filter((item) => item.type === "DUPLICATE_MAPPING"),
    INVALID_METRIC: conflicts.filter((item) => item.type === "INVALID_METRIC"),
    MISSING_TIMESTAMP: conflicts.filter((item) => item.type === "MISSING_TIMESTAMP"),
    UNSUPPORTED_PAYLOAD: conflicts.filter((item) => item.type === "UNSUPPORTED_PAYLOAD"),
    TEAM_MISMATCH: conflicts.filter((item) => item.type === "TEAM_MISMATCH"),
  };
}

/** Summarizes integration conflicts into a concise staff-facing line. */
export function summarizeImportConflicts(conflicts: ImportConflictRecord[]): string {
  if (!conflicts.length) return "No unresolved import conflicts.";
  const high = conflicts.filter((item) => item.severity === "HIGH").length;
  const moderate = conflicts.filter((item) => item.severity === "MODERATE").length;
  const low = conflicts.filter((item) => item.severity === "LOW").length;
  return `${conflicts.length} conflict(s): ${high} high, ${moderate} moderate, ${low} low severity.`;
}

