"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import ValdIntegrationCard from "@/components/integrations/vald/ValdIntegrationCard";
import ValdConnectionForm from "@/components/integrations/vald/ValdConnectionForm";
import ValdSyncPanel from "@/components/integrations/vald/ValdSyncPanel";
import ValdAthleteMappingTable from "@/components/integrations/vald/ValdAthleteMappingTable";
import ValdSyncHistoryTable from "@/components/integrations/vald/ValdSyncHistoryTable";

type ValdPageState = {
  account: Record<string, unknown> | null;
  history: Array<Record<string, unknown>>;
  unmatched: Array<{ valdAthleteId: string; valdAthleteName?: string | null; valdEmail?: string | null; valdExternalRef?: string | null }>;
  players: Array<{ id: string; name: string }>;
};

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

export default function ValdSettingsPage() {
  const supabase = getSupabaseClient();
  const [state, setState] = useState<ValdPageState>({ account: null, history: [], unmatched: [], players: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"test" | "sync" | "resync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [form, setForm] = useState({
    baseUrl: process.env.NEXT_PUBLIC_VALD_BASE_URL ?? "https://api.valdperformance.com",
    authMode: "unknown" as "api_key" | "oauth" | "unknown",
    clientId: "",
    clientSecret: "",
    apiKey: "",
    orgId: "",
    isEnabled: false,
  });

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  }, [supabase]);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [syncRes, playersRes] = await Promise.all([
        fetch("/api/integrations/vald/sync", { cache: "no-store", headers: await authHeaders() }),
        supabase.from("players").select("id, full_name").order("full_name", { ascending: true }),
      ]);
      const syncData = await syncRes.json();
      if (!syncRes.ok || !syncData.ok) throw new Error(syncData.error || "Unable to load VALD state.");
      const players = ((playersRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: String(row.full_name ?? row.id),
      }));
      setState({ account: syncData.account ?? null, history: syncData.history ?? [], unmatched: syncData.unmatched ?? [], players });
      if (syncData.account) {
        setForm((prev) => ({
          ...prev,
          baseUrl: String(syncData.account.base_url ?? prev.baseUrl),
          authMode: (String(syncData.account.auth_mode ?? prev.authMode) as typeof prev.authMode),
          orgId: String(syncData.account.org_id ?? ""),
          isEnabled: syncData.account.is_enabled === true,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load VALD state.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, supabase]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const saveAndTest = useCallback(async () => {
    setBusy("test");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/vald/test-connection", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ ...form, persist: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "VALD test failed.");
      setInfo("VALD connection saved and tested successfully.");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "VALD test failed.");
    } finally {
      setBusy(null);
    }
  }, [authHeaders, form, loadState]);

  const syncLatest = useCallback(async () => {
    setBusy("sync");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/vald/sync", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "VALD sync failed.");
      setInfo(`VALD sync finished: ${JSON.stringify(data.summary ?? {})}`);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "VALD sync failed.");
    } finally {
      setBusy(null);
    }
  }, [authHeaders, dateFrom, dateTo, loadState]);

  const resync = useCallback(async () => {
    setBusy("resync");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/vald/resync", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "VALD re-sync failed.");
      setInfo(`VALD re-sync finished: ${JSON.stringify(data.summary ?? {})}`);
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "VALD re-sync failed.");
    } finally {
      setBusy(null);
    }
  }, [authHeaders, dateFrom, dateTo, loadState]);

  const mapAthlete = useCallback(async (args: { valdAthleteId: string; microplayerId: string; valdAthleteName?: string | null; valdEmail?: string | null; valdExternalRef?: string | null }) => {
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/integrations/vald/athlete-match", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ ...args, matchSource: "manual", confidence: 1 }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save mapping.");
      setInfo("VALD athlete mapped successfully.");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save mapping.");
    }
  }, [authHeaders, loadState]);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Dashboard settings</div>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">VALD integration</h1>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {info ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div> : null}
      <ValdIntegrationCard account={state.account} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ValdConnectionForm value={form} onChange={setForm} onSaveAndTest={saveAndTest} busy={busy === "test"} />
        <ValdSyncPanel
          onSyncLatest={syncLatest}
          onResync={resync}
          busy={busy === "sync" ? "sync" : busy === "resync" ? "resync" : null}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ValdAthleteMappingTable candidates={state.unmatched} players={state.players} onMap={mapAthlete} />
        <ValdSyncHistoryTable history={state.history} />
      </div>
      {loading ? <div className="text-sm text-zinc-500">Loading…</div> : null}
    </main>
  );
}
