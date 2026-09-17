"use client";

/**
 * PeakEffortWindowsCard — peak high-intensity EFFORT windows (Accel / Decel / CoD)
 * for one player, from the CTR fixed-time interval bins (1 / 3 / 5-min), High band.
 *
 * These are effort COUNTS, not sustainable intensity — so they belong here on the
 * decel/IMA surface, NOT on the running Power Curve (which is a running-durability
 * read). Explainability-first: a one-line verdict, 2-3 plain facts, then the raw
 * 1/3/5-min table behind "Show details". Descriptive only — never a readiness colour.
 *
 * Cite: McBurnie 2022 (deceleration burden). Data: GET /api/coach/load/peak-window.
 */

import React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Win = { windowMin: number; accel: number | null; decel: number | null; cod: number | null };
type Resp = { ok?: boolean; matchDate?: string | null; windows?: Win[] };

export default function PeakEffortWindowsCard({
  playerId,
  className = "",
}: {
  playerId: string;
  className?: string;
}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showDetails, setShowDetails] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/load/peak-window?player=${playerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as Resp;
        if (alive) setData(json);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 ${className}`}>
        {is ? "Hleð hámarks álagsglugga…" : "Loading peak effort windows…"}
      </div>
    );
  }
  const windows = (data?.windows ?? []).filter((w) => Number.isFinite(w.windowMin));
  // Self-hide when there's nothing (no CTR fixed-bin efforts for this player yet).
  if (!data?.ok || windows.length === 0) return null;

  const fmt = (n: number | null) => (n == null ? "–" : String(n));
  const peak = windows[0]; // smallest window (usually 1 min) = the most intense minute

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
        {is ? "Ákafustu mínúturnar — hröðun / hemlun / stefnubreyting" : "Most intense minutes — accel / decel / CoD"}
      </div>

      {/* Verdict — the 0-glance read (the single most demanding minute). */}
      <p className="mt-1.5 text-sm font-semibold text-slate-900">
        {is
          ? `Ákafasta mínútan (${peak.windowMin} mín): ${fmt(peak.accel)} hraðar hröðanir · ${fmt(peak.decel)} hemlanir · ${fmt(peak.cod)} stefnubreytingar`
          : `Most intense minute (${peak.windowMin} min): ${fmt(peak.accel)} high-intensity accels · ${fmt(peak.decel)} decels · ${fmt(peak.cod)} change-of-direction`}
      </p>

      {/* 2-3 plain facts (the ~15s read) — provenance, no jargon. */}
      <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-slate-600">
        <li>
          {is
            ? "Há-band talning (ákafar hreyfingar) · stefnubreyting = vinstri + hægri"
            : "High-band counts (intense efforts) · CoD = left + right"}
        </li>
        <li>
          {is
            ? `Hámark hvers glugga í síðasta leik${data.matchDate ? ` (${data.matchDate})` : ""} — 1 / 3 / 5 mín kaflar`
            : `Peak per window in the latest match${data.matchDate ? ` (${data.matchDate})` : ""} — 1 / 3 / 5-min bins`}
        </li>
      </ul>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="mt-2 text-[11px] font-medium text-indigo-700 hover:underline"
      >
        {showDetails ? (is ? "Fela smáatriði" : "Hide details") : (is ? "Sýna smáatriði" : "Show details")}
      </button>

      {showDetails && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3 font-medium">{is ? "Gluggi" : "Window"}</th>
                <th className="py-1 pr-3 font-medium">{is ? "Hröðun" : "Accel"}</th>
                <th className="py-1 pr-3 font-medium">{is ? "Hemlun" : "Decel"}</th>
                <th className="py-1 font-medium">{is ? "Stefnubr." : "CoD"}</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.windowMin} className="border-t border-slate-100">
                  <td className="py-1 pr-3 font-medium text-slate-800">{w.windowMin} {is ? "mín" : "min"}</td>
                  <td className="py-1 pr-3 tabular-nums text-slate-800">{fmt(w.accel)}</td>
                  <td className="py-1 pr-3 tabular-nums text-slate-800">{fmt(w.decel)}</td>
                  <td className="py-1 tabular-nums text-slate-800">{fmt(w.cod)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10.5px] leading-snug text-slate-500">
            {is
              ? "Fastir kaflar (1/3/5 mín) — nálgun á sanna rúllandi hámarkið (sem getur legið á milli tveggja kafla). OpenField gefur ekki enn sannan rúllandi MII-glugga fyrir þessar mælingar. Lýsandi álag — snertir aldrei readiness-litinn. Heimild: McBurnie 2022."
              : "Fixed bins (1/3/5 min) — an approximation of the true rolling max (which can straddle two bins). OpenField doesn't yet expose a true rolling-max MII interval for these metrics. Descriptive load — never touches the readiness colour. Cite: McBurnie 2022."}
          </p>
        </div>
      )}
    </div>
  );
}
