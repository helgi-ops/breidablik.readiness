"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  buildIntegrationStatusSummary,
  getAvailableProviderDescriptors,
  ingestRawIntegrationPayload,
  loadImportConflicts,
  loadImportHistory,
  loadIntegrationConnections,
  loadPlayerMappingRecords,
  saveIntegrationConnection,
  type ImportConflictRecord,
  type IntegrationConnection,
  type IntegrationImportRecord,
  type PlayerMappingRecord,
} from "@/lib/micropulse/integrations";
import IntegrationConnectionsPanel from "./IntegrationConnectionsPanel";
import IntegrationStatusTable from "./IntegrationStatusTable";
import PlayerMappingPanel from "./PlayerMappingPanel";
import ImportHistoryPanel from "./ImportHistoryPanel";
import ImportConflictPanel from "./ImportConflictPanel";
import ManualImportPanel from "./ManualImportPanel";
import LiveIntegrationCenterPage from "@/components/integrationsLive/LiveIntegrationCenterPage";
import CatapultSetupWizard from "./CatapultSetupWizard";
import UnmatchedAthletesPanel from "./UnmatchedAthletesPanel";
import { buildRealtimeDomainEvent, publishRealtimeEvent, useIntegrationRealtime } from "@/lib/micropulse/realtime";
import LiveStatusBanner from "@/components/realtime/LiveStatusBanner";
import ActivityFeedPanel from "@/components/realtime/ActivityFeedPanel";

function defaultConnections(): IntegrationConnection[] {
  const descriptors = getAvailableProviderDescriptors();
  return descriptors.map((descriptor) => ({
    id: `connection:${descriptor.provider.toLowerCase()}`,
    provider: descriptor.provider,
    organizationId: "default-org",
    teamId: null,
    status: "DISCONNECTED",
    displayName: descriptor.displayName,
    enabled: false,
    configSummary: descriptor.description ?? null,
    // Keep SSR/client initial render deterministic to avoid hydration drift.
    createdAt: null,
    updatedAt: null,
  }));
}

function refreshState() {
  const connections = loadIntegrationConnections();
  return {
    connections: connections.length ? connections : defaultConnections(),
    imports: loadImportHistory(200),
    conflicts: loadImportConflicts(300),
    mappings: loadPlayerMappingRecords(),
  };
}

type IntegrationCenterState = {
  connections: IntegrationConnection[];
  imports: IntegrationImportRecord[];
  conflicts: ImportConflictRecord[];
  mappings: PlayerMappingRecord[];
};

export default function IntegrationCenterPage() {
  const [state, setState] = useState<IntegrationCenterState>(() => ({
    connections: defaultConnections(),
    imports: [],
    conflicts: [],
    mappings: [],
  }));
  const [lastImport, setLastImport] = useState<IntegrationImportRecord | null>(null);
  const integrationRealtime = useIntegrationRealtime("default-org", "admin");
  const descriptors = useMemo(() => getAvailableProviderDescriptors(), []);
  const statusSummary = useMemo(
    () =>
      buildIntegrationStatusSummary({
        connections: state.connections,
        imports: state.imports,
        conflicts: state.conflicts,
      }),
    [state.connections, state.imports, state.conflicts],
  );

  useEffect(() => {
    const currentConnections = loadIntegrationConnections();
    if (!currentConnections.length) {
      for (const connection of defaultConnections()) saveIntegrationConnection(connection);
    }
    const onStorage = () => setState(refreshState());
    const hydrateTimer = window.setTimeout(onStorage, 0);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggleConnectionEnabled(connectionId: string) {
    const current = state.connections.find((connection) => connection.id === connectionId);
    if (!current) return;
    const next: IntegrationConnection = {
      ...current,
      enabled: !current.enabled,
      status: !current.enabled ? "CONNECTED" : "DISABLED",
      updatedAt: new Date().toISOString(),
      lastSyncAt: !current.enabled ? new Date().toISOString() : current.lastSyncAt,
      lastErrorMessage: !current.enabled ? null : current.lastErrorMessage,
    };
    saveIntegrationConnection(next);
    publishRealtimeEvent(
      buildRealtimeDomainEvent({
        type: "SYNC_JOB_UPDATED",
        scopeType: "INTEGRATION",
        scopeId: next.provider,
        provider: next.provider,
        summary: `${next.provider} connection ${next.enabled ? "enabled" : "disabled"}.`,
        payload: {
          status: next.status,
          enabled: next.enabled,
        },
        dedupeKey: `connection_toggle:${next.provider}`,
        severity: "NOTICE",
      }),
    );
    setState(refreshState());
  }

  function runManualImport(args: { provider: IntegrationConnection["provider"]; importMode: IntegrationImportRecord["importMode"]; payload: unknown; sourceRef?: string | null }) {
    const connection = state.connections.find((item) => item.provider === args.provider) ?? null;
    const result = ingestRawIntegrationPayload({
      provider: args.provider,
      importMode: args.importMode,
      payload: args.payload,
      sourceRef: args.sourceRef ?? null,
      connectionId: connection?.id ?? null,
      existingMappings: state.mappings,
    });
    setLastImport(result.record);
    publishRealtimeEvent(
      buildRealtimeDomainEvent({
        type: result.record.status === "FAILED" ? "INTEGRATION_IMPORT_FAILED" : "INTEGRATION_IMPORT_COMPLETED",
        scopeType: "INTEGRATION",
        scopeId: result.record.provider,
        provider: result.record.provider,
        summary: result.record.summary,
        payload: {
          status: result.record.status,
          importedCount: result.record.importedCount,
          failedCount: result.record.failedCount,
          unmatchedCount: result.record.unmatchedCount,
        },
        severity: result.record.status === "FAILED" ? "WARNING" : "INFO",
      }),
    );

    if (connection) {
      const nextConnection: IntegrationConnection = {
        ...connection,
        status: result.record.status === "FAILED" ? "ERROR" : "CONNECTED",
        lastSyncAt: result.record.completedAt ?? new Date().toISOString(),
        lastSuccessAt:
          result.record.status === "SUCCESS" || result.record.status === "PARTIAL"
            ? result.record.completedAt ?? new Date().toISOString()
            : connection.lastSuccessAt,
        lastErrorAt: result.record.status === "FAILED" ? result.record.completedAt ?? new Date().toISOString() : null,
        lastErrorMessage: result.record.status === "FAILED" ? result.record.errors.join(" | ") || "Import failed." : null,
        updatedAt: new Date().toISOString(),
      };
      saveIntegrationConnection(nextConnection);
    }

    setState(refreshState());
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Integrations Center</h1>
        <p className="text-sm text-gray-600">Provider connections, ingestion status, player mapping, conflict visibility, and manual import boundaries.</p>
      </div>

      <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">WHOOP OAuth integration</div>
            <div className="text-[11px] text-gray-600">Manage secure WHOOP connect/sync/disconnect flow in settings.</div>
          </div>
          <Link href="/settings/integrations" className="rounded border bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-gray-50">
            Open integrations settings
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-gray-900">WIMU PRO (Hudl) upload</div>
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700">beta</span>
            </div>
            <div className="text-[11px] text-gray-600">SPRO CSV / Excel import — preview & validate field mapping before storage.</div>
          </div>
          <Link href="/coach/integrations/wimu" className="rounded border bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-gray-50">
            Open WIMU upload
          </Link>
        </div>
      </div>

      <CatapultSetupWizard />
      <UnmatchedAthletesPanel />
      <IntegrationConnectionsPanel descriptors={descriptors} connections={state.connections} onToggleEnabled={toggleConnectionEnabled} />
      <LiveStatusBanner health={integrationRealtime.summary} label="Live integration updates" />
      <IntegrationStatusTable connections={state.connections} imports={state.imports} conflicts={state.conflicts} summary={statusSummary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <PlayerMappingPanel mappings={state.mappings} />
        <ManualImportPanel descriptors={descriptors} onImport={runManualImport} lastSummary={lastImport?.summary ?? null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ImportHistoryPanel imports={state.imports} />
        <ImportConflictPanel conflicts={state.conflicts} />
      </div>
      <ActivityFeedPanel items={integrationRealtime.activity} title="Live integration activity" />

      <LiveIntegrationCenterPage />
    </div>
  );
}
