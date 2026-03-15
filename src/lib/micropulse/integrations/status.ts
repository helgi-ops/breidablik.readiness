import type { ImportConflictRecord, IntegrationConnection, IntegrationImportRecord, IntegrationStatusSummary } from "./types";

/** Summarizes connection health across providers for Integration Center visibility. */
export function summarizeConnectionHealth(connections: IntegrationConnection[]): string {
  if (!connections.length) return "No integration connections configured.";
  const connected = connections.filter((connection) => connection.status === "CONNECTED" && connection.enabled).length;
  const errored = connections.filter((connection) => connection.status === "ERROR").length;
  const pending = connections.filter((connection) => connection.status === "PENDING").length;
  return `${connected} connected, ${pending} pending, ${errored} in error.`;
}

/** Summarizes recent import outcomes from import history records. */
export function summarizeRecentImports(imports: IntegrationImportRecord[]): string {
  if (!imports.length) return "No recent imports.";
  const recent = [...imports]
    .sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")))
    .slice(0, 5);
  const success = recent.filter((record) => record.status === "SUCCESS").length;
  const partial = recent.filter((record) => record.status === "PARTIAL").length;
  const failed = recent.filter((record) => record.status === "FAILED").length;
  return `Last ${recent.length} imports: ${success} success, ${partial} partial, ${failed} failed.`;
}

/** Builds a top-level integrations health summary using connection, import, and conflict state. */
export function buildIntegrationStatusSummary(args: {
  connections: IntegrationConnection[];
  imports: IntegrationImportRecord[];
  conflicts: ImportConflictRecord[];
}): IntegrationStatusSummary {
  const { connections, imports, conflicts } = args;
  const recentImports = [...imports].sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? ""))).slice(0, 20);
  const recentSuccessfulImports = recentImports.filter((record) => record.status === "SUCCESS" || record.status === "PARTIAL").length;
  const recentFailedImports = recentImports.filter((record) => record.status === "FAILED").length;

  const connectedProviders = connections.filter((connection) => connection.enabled && connection.status === "CONNECTED").length;
  const providersWithErrors = connections.filter((connection) => connection.status === "ERROR").length;
  const unresolvedConflicts = conflicts.length;

  return {
    connectedProviders,
    providersWithErrors,
    recentSuccessfulImports,
    recentFailedImports,
    unresolvedConflicts,
    summaryText: `${summarizeConnectionHealth(connections)} ${summarizeRecentImports(imports)} ${unresolvedConflicts} unresolved conflict(s).`,
  };
}

