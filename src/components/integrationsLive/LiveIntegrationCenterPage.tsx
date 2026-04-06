"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAvailableProviderDescriptors, type IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type {
  ProviderConnectionRuntimeStatus,
  ProviderCredentialRecord,
  SyncHealthSummary,
  SyncJobRecord,
  WebhookEventRecord,
} from "@/lib/micropulse/integrationsLive";
import { buildRealtimeDomainEvent, publishRealtimeEvent } from "@/lib/micropulse/realtime";
import ProviderConnectionCard from "./ProviderConnectionCard";
import CredentialStatusPanel from "./CredentialStatusPanel";
import SyncHealthPanel from "./SyncHealthPanel";
import SyncJobHistoryPanel from "./SyncJobHistoryPanel";
import WebhookStatusPanel from "./WebhookStatusPanel";

type LiveStatusResponse = {
  credentials: ProviderCredentialRecord[];
  jobs: SyncJobRecord[];
  webhookEvents: WebhookEventRecord[];
  statuses: ProviderConnectionRuntimeStatus[];
  healthSummary: SyncHealthSummary;
};

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export default function LiveIntegrationCenterPage() {
  const providers = useMemo(() => getAvailableProviderDescriptors().map((descriptor) => descriptor.provider), []);
  const [data, setData] = useState<LiveStatusResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastActionSummary, setLastActionSummary] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations-live/status", { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; error?: string } & Partial<LiveStatusResponse>;
      if (!json.ok) {
        setError(json.error ?? "Failed to load live integration status.");
        return;
      }
      setData({
        credentials: json.credentials ?? [],
        jobs: json.jobs ?? [],
        webhookEvents: json.webhookEvents ?? [],
        statuses: json.statuses ?? [],
        healthSummary: json.healthSummary as SyncHealthSummary,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connectProvider(provider: IntegrationProviderKey) {
    const result = await postJson("/api/integrations-live/connections/start", {
      provider,
      authMode: "MANUAL",
      organizationId: "default-org",
    });
    setLastActionSummary(result?.result?.summary ?? result?.error ?? "Connection start attempted.");
    publishRealtimeEvent(
      buildRealtimeDomainEvent({
        type: "SYNC_JOB_UPDATED",
        scopeType: "INTEGRATION",
        scopeId: provider,
        provider,
        summary: result?.result?.summary ?? result?.error ?? `${provider} connection start attempted.`,
        severity: result?.ok ? "NOTICE" : "WARNING",
      }),
    );
    await refresh();
  }

  async function disconnectProvider(provider: IntegrationProviderKey) {
    const result = await postJson("/api/integrations-live/connections/disconnect", { provider, reason: "Disconnected from live integrations center." });
    setLastActionSummary(result?.runtimeStatus?.summary ?? result?.error ?? "Disconnect attempted.");
    publishRealtimeEvent(
      buildRealtimeDomainEvent({
        type: "SYNC_JOB_UPDATED",
        scopeType: "INTEGRATION",
        scopeId: provider,
        provider,
        summary: result?.runtimeStatus?.summary ?? result?.error ?? `${provider} disconnect attempted.`,
        severity: result?.ok ? "NOTICE" : "WARNING",
      }),
    );
    await refresh();
  }

  async function triggerManualSync(provider: IntegrationProviderKey) {
    const result = await postJson("/api/integrations-live/sync/trigger", {
      provider,
      triggerSource: "MANUAL",
      payload: {
        data: [
          {
            athlete_id: "demo-athlete",
            timestamp: new Date().toISOString(),
            recovery_score: 72,
            sleep_duration: 25400,
            session_load: 310,
          },
        ],
      },
    });
    setLastActionSummary(result?.result?.summary ?? result?.error ?? "Manual sync attempted.");
    publishRealtimeEvent(
      buildRealtimeDomainEvent({
        type: "SYNC_JOB_UPDATED",
        scopeType: "INTEGRATION",
        scopeId: provider,
        provider,
        summary: result?.result?.summary ?? result?.error ?? `${provider} manual sync attempted.`,
        severity: result?.result?.status === "FAILED" ? "WARNING" : "NOTICE",
        payload: result?.result ? { status: result.result.status } : null,
      }),
    );
    await refresh();
  }

  const statuses = data?.statuses ?? [];
  const runtimeByProvider = new Map(statuses.map((status) => [status.provider, status]));

  return (
    <div className="space-y-4 rounded-xl border bg-slate-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Live Sync + Auth + Webhooks</h2>
          <p className="text-xs text-gray-600">Server-orchestrated provider auth lifecycle, sync jobs, webhook processing, retry visibility, and connection health.</p>
        </div>
        <button type="button" className="rounded border bg-white px-2 py-1 text-xs" onClick={() => void refresh()}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div> : null}
      {lastActionSummary ? <div className="rounded border bg-white p-2 text-xs text-gray-700">{lastActionSummary}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <ProviderConnectionCard
            key={provider}
            provider={provider}
            runtime={runtimeByProvider.get(provider) ?? null}
            onConnect={(value) => void connectProvider(value)}
            onDisconnect={(value) => void disconnectProvider(value)}
            onManualSync={(value) => void triggerManualSync(value)}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CredentialStatusPanel credentials={data?.credentials ?? []} />
        <SyncHealthPanel summary={data?.healthSummary ?? null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SyncJobHistoryPanel jobs={data?.jobs ?? []} />
        <WebhookStatusPanel events={data?.webhookEvents ?? []} />
      </div>
    </div>
  );
}
