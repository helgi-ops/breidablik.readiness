"use client";

/**
 * /client/lv-profile — last Load-Velocity test + %1RM lookup table.
 *
 * For a client who has done a ramp test with their trainer:
 *   - Top card: predicted 1RM ± SEE, V₀, profile classification
 *   - %RM table: kg → %1RM → predicted velocity (m/s) so the client knows
 *     what bar speed to aim for at each load (González-Badillo 2010,
 *     Banyard 2017)
 */

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Resp = {
  ok: true;
  test: {
    exercise_label: string; test_date: string;
    slope: number; intercept: number;
    est_one_rm: number | null; est_one_rm_high: number | null; est_one_rm_low: number | null;
    mvt: number; v0: number; l0: number | null;
    profile_type: string | null; r_squared: number | null;
  } | null;
  table: Array<{ weight_kg: number; pct_one_rm: number; predicted_velocity_ms: number }>;
  dsi: { ratio: number; tier: string | null } | null;
};

export default function ClientLvProfilePage() {
  const [lang] = useLang();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/client/lv-profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      setData(json as Resp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Kraft-/hraðapróf" : "Load-Velocity Profile"}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lang === "IS"
            ? "Síðasta próf þitt + spá fyrir markhraða á mismunandi þyngdum."
            : "Your latest ramp test + target bar speeds at each load."}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      ) : !data?.test ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {lang === "IS"
            ? "Engin LV próf skráð enn. Þjálfari skráir prófið fyrir þig á næstu PT-tíma."
            : "No LV test recorded yet. Your trainer will log the test at your next session."}
        </div>
      ) : (
        <>
          {/* Header card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-base font-semibold text-slate-900">{data.test.exercise_label}</div>
              <div className="text-xs text-slate-500">{data.test.test_date}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
                  {lang === "IS" ? "Spáð 1RM" : "Predicted 1RM"}
                </div>
                <div className="text-2xl font-semibold text-slate-900 mt-0.5">
                  {data.test.est_one_rm?.toFixed(1) ?? "—"} <span className="text-sm font-normal text-slate-500">kg</span>
                </div>
                {data.test.est_one_rm_low && data.test.est_one_rm_high && (
                  <div className="text-[11px] text-slate-500">
                    ±{((data.test.est_one_rm_high - data.test.est_one_rm_low) / 2).toFixed(1)} kg
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">V₀</div>
                <div className="text-2xl font-semibold text-slate-900 mt-0.5">
                  {data.test.v0?.toFixed(2)} <span className="text-sm font-normal text-slate-500">m/s</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  MVT {data.test.mvt?.toFixed(2)} m/s
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {data.test.profile_type && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 uppercase tracking-wide">
                  {data.test.profile_type}
                </span>
              )}
              {data.test.r_squared != null && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                  R² {data.test.r_squared.toFixed(2)}
                </span>
              )}
              {data.dsi && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 uppercase tracking-wide">
                  DSI {data.dsi.ratio.toFixed(2)}{data.dsi.tier ? ` · ${data.dsi.tier}` : ""}
                </span>
              )}
            </div>
          </div>

          {/* %RM lookup table */}
          {data.table.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">
                {lang === "IS" ? "Markhraði per þyngd" : "Target velocity per load"}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="text-left py-1.5 font-semibold">kg</th>
                      <th className="text-right py-1.5 font-semibold">%1RM</th>
                      <th className="text-right py-1.5 font-semibold">
                        {lang === "IS" ? "Hraði" : "Velocity"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.table.map((r) => (
                      <tr key={r.pct_one_rm} className="border-t border-slate-100">
                        <td className="py-1.5 font-medium tabular-nums">{r.weight_kg.toFixed(1)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">{r.pct_one_rm}%</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-800 font-medium">
                          {r.predicted_velocity_ms.toFixed(2)} <span className="text-slate-500 font-normal">m/s</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                {lang === "IS"
                  ? "Ef hraði þinn er hærri en markið → auktu þyngd næst. Ef lægri → þú ert að nálgast 1RM."
                  : "If your bar speed is faster than target → bump weight next set. Slower → you're nearing 1RM."}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
