"use client";

/**
 * WearableConnectCard
 *
 * Player-facing card to (a) connect a wearable, (b) see status + last
 * sync, (c) disconnect. Renders inside the Privacy/Settings tab on the
 * player PWA. Honest about which providers actually work today vs
 * "coming soon" — no fake feature flags.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import {
  WEARABLE_PROVIDER_LABEL,
  WEARABLE_PROVIDER_AVAILABLE,
  type WearableProviderKey,
} from "@/lib/wearables/types";

type Connection = {
  id: string;
  provider: WearableProviderKey;
  device_label: string | null;
  scopes: string[];
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

type SleepRow = {
  sleep_date: string;
  provider: string;
  total_sleep_min: number | null;
  sleep_efficiency_pct: number | null;
  provider_score: number | null;
};

type StatusResp = {
  ok: true;
  connections: Connection[];
  recentSleep: SleepRow[];
};

function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function relative(iso: string | null, lang: "IS" | "EN"): string {
  if (!iso) return lang === "IS" ? "aldrei" : "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return lang === "IS" ? "rétt í þessu" : "just now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return lang === "IS" ? `${min} mín síðan` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return lang === "IS" ? `${hr} klst síðan` : `${hr}h ago`;
  const days = Math.round(hr / 24);
  return lang === "IS" ? `${days} dögum síðan` : `${days}d ago`;
}

export default function WearableConnectCard() {
  const [lang] = useLang();
  const isIS = lang === "IS";
  const [data, setData] = useState<StatusResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<WearableProviderKey | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/wearables/status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "Failed to load");
        return;
      }
      setData(j as StatusResp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    }
  }, []);

  useEffect(() => {
    void load();

    // Show post-OAuth toast when redirected back from callback with a flag
    const u = new URL(window.location.href);
    const connected = u.searchParams.get("wearable_connected");
    const error = u.searchParams.get("wearable_error");
    if (connected || error) {
      // Clean the URL so refresh doesn't re-show the toast
      u.searchParams.delete("wearable_connected");
      u.searchParams.delete("wearable_error");
      u.searchParams.delete("wearable_message");
      window.history.replaceState({}, "", u.toString());
      if (error) setErr(`OAuth: ${error}`);
    }
  }, [load]);

  async function handleConnect(provider: WearableProviderKey) {
    setBusyProvider(provider);
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/wearables/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider }),
      });
      const j = await res.json();
      if (!res.ok || !j.authorizeUrl) {
        setErr(j.error ?? "Failed to start OAuth");
        return;
      }
      // Send the player to the provider's OAuth page
      window.location.href = j.authorizeUrl;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleDisconnect(provider: WearableProviderKey) {
    const confirmMsg = isIS
      ? "Aftengja klukkuna? Söguleg gögn varðveitast en ný gögn streyma ekki lengur."
      : "Disconnect the wearable? Historical data is preserved but no new data will sync.";
    if (!window.confirm(confirmMsg)) return;
    setBusyProvider(provider);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/wearables/disconnect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Failed to disconnect");
        return;
      }
      await load();
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleSyncNow(provider: WearableProviderKey) {
    setBusyProvider(provider);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/wearables/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Sync failed");
        return;
      }
      await load();
    } finally {
      setBusyProvider(null);
    }
  }

  const connectedByProvider = useMemo(() => {
    const map = new Map<WearableProviderKey, Connection>();
    for (const c of data?.connections ?? []) map.set(c.provider, c);
    return map;
  }, [data]);

  const lastNight = data?.recentSleep?.[0] ?? null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isIS ? "Tengja klukku" : "Connect a wearable"}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          {isIS
            ? "Tengdu Polar-klukkuna þína og við lesum svefn + HRV beint úr Flow. Engin sjálfsmæling lengur, gögnin verða nákvæmari og þú sparar tíma á hverjum morgni."
            : "Connect your Polar watch and we read sleep + HRV straight from Flow. No more self-reporting, more accurate data, and you save time every morning."}
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* Last-night summary if we have any data */}
      {lastNight && lastNight.total_sleep_min != null && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700">
            {isIS ? "Síðasta nótt" : "Last night"} · {WEARABLE_PROVIDER_LABEL[lastNight.provider as WearableProviderKey] ?? lastNight.provider}
          </div>
          <div className="mt-0.5 flex items-baseline gap-3">
            <span className="text-lg font-semibold text-emerald-900 tabular-nums">
              {formatMinutes(lastNight.total_sleep_min)}
            </span>
            {lastNight.sleep_efficiency_pct != null && (
              <span className="text-xs text-emerald-800">
                {isIS ? "Skilvirkni" : "Efficiency"} {Math.round(lastNight.sleep_efficiency_pct)}%
              </span>
            )}
            {lastNight.provider_score != null && (
              <span className="text-xs text-emerald-800">
                {isIS ? "Skor" : "Score"} {Math.round(lastNight.provider_score)}/100
              </span>
            )}
          </div>
        </div>
      )}

      {/* Provider list */}
      <div className="space-y-2">
        {(Object.keys(WEARABLE_PROVIDER_LABEL) as WearableProviderKey[]).map((key) => {
          const available = WEARABLE_PROVIDER_AVAILABLE[key];
          const conn = connectedByProvider.get(key);
          const label = WEARABLE_PROVIDER_LABEL[key];
          const busy = busyProvider === key;

          return (
            <div
              key={key}
              className={`rounded-xl border p-3 flex items-start justify-between gap-3 ${
                conn
                  ? "border-emerald-200 bg-emerald-50/40"
                  : available
                    ? "border-slate-200 bg-white"
                    : "border-slate-100 bg-slate-50/50"
              }`}
            >
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${available || conn ? "text-slate-900" : "text-slate-400"}`}>
                  {label}
                  {conn && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      {isIS ? "Tengt" : "Connected"}
                    </span>
                  )}
                  {!available && !conn && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {isIS ? "Kemur fljótlega" : "Coming soon"}
                    </span>
                  )}
                </div>
                {conn && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isIS ? "Síðasta samstilling" : "Last synced"}: {relative(conn.last_synced_at, isIS ? "IS" : "EN")}
                    {conn.last_sync_error && (
                      <span className="text-red-600 ml-1.5">· {conn.last_sync_error}</span>
                    )}
                  </div>
                )}
                {!conn && available && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isIS
                      ? "Tengdu Polar Flow reikninginn þinn — sleep + HRV + nightly recharge"
                      : "Connect your Polar Flow account — sleep + HRV + nightly recharge"}
                  </div>
                )}
              </div>

              <div className="shrink-0 flex flex-col gap-1.5 items-end">
                {conn ? (
                  <>
                    <button
                      onClick={() => handleSyncNow(key)}
                      disabled={busy}
                      className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {busy ? (isIS ? "…" : "…") : (isIS ? "Samstilla" : "Sync now")}
                    </button>
                    <button
                      onClick={() => handleDisconnect(key)}
                      disabled={busy}
                      className="rounded-md text-[11px] text-slate-500 hover:text-red-600 disabled:opacity-50"
                    >
                      {isIS ? "Aftengja" : "Disconnect"}
                    </button>
                  </>
                ) : available ? (
                  <button
                    onClick={() => handleConnect(key)}
                    disabled={busy}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {busy ? "…" : (isIS ? "Tengja" : "Connect")}
                  </button>
                ) : (
                  <button
                    disabled
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed"
                  >
                    {isIS ? "Bíður" : "Soon"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        {isIS
          ? "Gögnin þín varðveitast hjá þjálfaranum og hjá MicroPulse. Aldrei deilt með þriðja aðila. Þú getur aftengt hvenær sem er."
          : "Your data is only visible to your coach and MicroPulse. Never shared with third parties. You can disconnect at any time."}
      </p>
    </div>
  );
}
