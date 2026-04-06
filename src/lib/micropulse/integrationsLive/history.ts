import type { SyncExecutionResult, SyncJobRecord } from "./types";
import { saveSyncHistoryEntry as persistHistoryEntry } from "./persistence";

export type SyncHistoryEntry = {
  id: string;
  provider: string;
  status: string;
  summary: string;
  timestamp: string;
  jobId?: string | null;
};

/** Builds one sync history entry from sync job + execution result for observability timeline. */
export function buildSyncHistoryEntry(args: { job: SyncJobRecord; result: SyncExecutionResult }): SyncHistoryEntry {
  return {
    id: `history:${args.job.id}:${Date.now()}`,
    provider: args.job.provider,
    status: args.result.status,
    summary: args.result.summary,
    timestamp: new Date().toISOString(),
    jobId: args.job.id,
  };
}

/** Summarizes sync history into concise operational text. */
export function summarizeSyncHistory(entries: SyncHistoryEntry[]): string {
  if (!entries.length) return "No sync history available.";
  const success = entries.filter((item) => item.status === "SUCCESS" || item.status === "PARTIAL").length;
  const failed = entries.filter((item) => item.status === "FAILED").length;
  const retrying = entries.filter((item) => item.status === "RETRYING").length;
  return `${entries.length} run(s): ${success} successful/partial, ${failed} failed, ${retrying} retrying.`;
}

/** Lists most recent sync failures for quick staff attention triage. */
export function listRecentSyncFailures(entries: SyncHistoryEntry[], limit = 10): SyncHistoryEntry[] {
  return [...entries]
    .filter((item) => item.status === "FAILED")
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, limit);
}

export function saveSyncHistoryEntry(entry: SyncHistoryEntry): SyncHistoryEntry {
  return persistHistoryEntry(entry);
}

