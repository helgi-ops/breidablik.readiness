"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type WhoopStatusResponse = {
  ok: boolean;
  error?: string;
  connected: boolean;
  status: "pending" | "active" | "error" | "revoked" | "not_connected";
  provider: "whoop";
  lastSyncedAt: string | null;
  lastSyncStatus: "success" | "error" | "never" | null;
  lastSyncError: string | null;
  latestSnapshotDate: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function IntegrationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [status, setStatus] = useState<WhoopStatusResponse | null>(null);

  const connectionLabel = useMemo(() => {
    if (!status || status.status === "not_connected") return "Not connected";
    if (status.status === "active") return "Connected";
    if (status.status === "pending") return "Connecting";
    if (status.status === "error") return "Sync error";
    return "Revoked";
  }, [status]);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/whoop/status", { cache: "no-store" });
      const data = (await response.json()) as WhoopStatusResponse;
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load WHOOP status.");
      setStatus(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load WHOOP status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function syncNow() {
    setBusy("sync");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/whoop/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as { ok: boolean; error?: string; partial?: boolean };
      if (!response.ok || !data.ok) throw new Error(data.error || "WHOOP sync failed.");
      setInfo(data.partial ? "WHOOP synced with partial data for today." : "WHOOP synced successfully.");
      await loadStatus();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "WHOOP sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/whoop/disconnect", { method: "POST" });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "WHOOP disconnect failed.");
      setInfo("WHOOP disconnected.");
      await loadStatus();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "WHOOP disconnect failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Integrations</div>
        <h1 className="mt-1 text-xl font-semibold text-zinc-950">WHOOP Integration</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Connect WHOOP to import recovery, sleep, and workout context into MicroPulse monitoring snapshots.
        </p>

        <div className="mt-4 grid gap-3 rounded-xl border bg-zinc-50 p-3 text-sm text-zinc-700 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</div>
            <div className="font-semibold text-zinc-900">{loading ? "Loading…" : connectionLabel}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Last synced</div>
            <div>{loading ? "Loading…" : formatDateTime(status?.lastSyncedAt ?? null)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Latest snapshot date</div>
            <div>{loading ? "Loading…" : status?.latestSnapshotDate ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sync status</div>
            <div>{loading ? "Loading…" : status?.lastSyncStatus ?? "never"}</div>
          </div>
        </div>

        {status?.lastSyncError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{status.lastSyncError}</div>
        ) : null}
        {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {info ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/api/integrations/whoop/connect" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white">
            Connect WHOOP
          </Link>
          <button
            type="button"
            onClick={syncNow}
            disabled={busy !== null}
            className="rounded-lg border bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy === "sync" ? "Syncing..." : "Sync now"}
          </button>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy !== null}
            className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
          >
            {busy === "disconnect" ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      </div>
    </main>
  );
}
