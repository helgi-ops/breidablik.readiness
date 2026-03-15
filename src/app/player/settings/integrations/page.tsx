"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

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

type WhoopConnectResponse = {
  ok?: boolean;
  error?: string;
  redirectUrl?: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function PlayerIntegrationsSettingsPage() {
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"connecting" | "syncing" | "disconnecting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [status, setStatus] = useState<WhoopStatusResponse | null>(null);

  const stateLabel = useMemo(() => {
    if (!status) return "idle";
    if (status.status === "active") return "connected";
    if (status.status === "pending") return "connecting";
    if (status.status === "error") return "sync_error";
    if (status.status === "revoked") return "revoked";
    return "idle";
  }, [status]);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    let {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error) {
        session = refreshed.session;
      }
    }

    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [supabase]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/whoop/status", {
        cache: "no-store",
        headers: await authHeaders(),
      });
      const data = (await response.json()) as WhoopStatusResponse;
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load WHOOP status.");
      setStatus(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load WHOOP status.";
      if (msg.toLowerCase().includes("unauthorized")) {
        setError("Please sign in to manage WHOOP integration.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void loadStatus();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadStatus, supabase]);

  async function connectWhoop() {
    setBusy("connecting");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/whoop/connect", {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = (await response.json()) as WhoopConnectResponse;
      if (!response.ok || !data.ok || !data.redirectUrl) {
        throw new Error(data.error || "Unable to initialize WHOOP OAuth.");
      }
      window.location.href = data.redirectUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to initialize WHOOP OAuth.";
      if (msg.toLowerCase().includes("unauthorized")) {
        setError("Please sign in to manage WHOOP integration.");
      } else {
        setError(msg);
      }
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("syncing");
    setError(null);
    setInfo(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/integrations/whoop/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      });
      const data = (await response.json()) as { success?: boolean; error?: string; partial?: boolean };
      if (!response.ok || !data.success) throw new Error(data.error || "WHOOP sync failed.");
      setInfo(data.partial ? "WHOOP synced with partial data." : "WHOOP synced successfully.");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "WHOOP sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnecting");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/whoop/disconnect", {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "WHOOP disconnect failed.");
      setInfo("WHOOP disconnected.");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "WHOOP disconnect failed.");
    } finally {
      setBusy(null);
    }
  }

  const helperText =
    status?.status === "active"
      ? "WHOOP connected. Your recent data can now be used as an input source in MicroPulse."
      : status?.status === "error"
        ? "WHOOP connection needs attention. Try syncing again or reconnecting."
        : "Connect your WHOOP account to sync sleep, recovery, HRV and workout data into MicroPulse.";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Player settings</div>
        <h1 className="mt-1 text-xl font-semibold text-zinc-950">Integrations</h1>

        <section className="mt-4 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">WHOOP</h2>
              <p className="mt-1 text-sm text-zinc-600">{helperText}</p>
            </div>
            <span className="rounded-full border px-2 py-1 text-xs font-medium text-zinc-700">
              {loading ? "loading" : stateLabel}
            </span>
          </div>

          <div className="mt-4 grid gap-3 rounded-lg border bg-zinc-50 p-3 text-sm text-zinc-700 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">Status</div>
              <div className="font-medium">{loading ? "Loading..." : status?.status ?? "not_connected"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">Last synced</div>
              <div>{loading ? "Loading..." : formatDateTime(status?.lastSyncedAt ?? null)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">Last sync state</div>
              <div>{loading ? "Loading..." : status?.lastSyncStatus ?? "never"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">Latest snapshot date</div>
              <div>{loading ? "Loading..." : status?.latestSnapshotDate ?? "—"}</div>
            </div>
          </div>

          {status?.lastSyncError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{status.lastSyncError}</div>
          ) : null}
          {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {info ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={connectWhoop}
              disabled={busy !== null}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "connecting" ? "Connecting..." : "Connect WHOOP"}
            </button>
            <button
              type="button"
              onClick={syncNow}
              disabled={busy !== null}
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy === "syncing" ? "Syncing..." : "Sync now"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy !== null}
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
            >
              {busy === "disconnecting" ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
