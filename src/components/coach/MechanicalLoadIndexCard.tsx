"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

type MechanicalLoadBand = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "EXTREME";
type ResidualMechanicalLoadBand = "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH";
type MechanicalLoadConfidence = "high" | "medium" | "low";

type ResponseRow = {
  player_id: string;
  player_name: string;
  date: string;
  mli: number | null;
  mli_band: MechanicalLoadBand | null;
  residual_mli: number | null;
  residual_band: ResidualMechanicalLoadBand | null;
  dss: number | null;
  ass: number | null;
  css: number | null;
  gds: number | null;
  confidence: MechanicalLoadConfidence;
  confidence_reason: string;
  flags: string[];
};

type ResponsePayload = {
  ok: boolean;
  error?: string;
  summary?: {
    avgMli: number | null;
    highCount: number;
    extremeCount: number;
    residualElevatedCount: number;
  };
  rows?: ResponseRow[];
  missingPlayers?: Array<{ player_id: string; player_name: string; status: "NO_CATAPULT_DATA" }>;
  rosterCount?: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function bandClass(band: MechanicalLoadBand | null) {
  if (band === "EXTREME") return "border-red-200 bg-red-50 text-red-800";
  if (band === "VERY_HIGH") return "border-orange-200 bg-orange-50 text-orange-800";
  if (band === "HIGH") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "MODERATE") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function residualClass(band: ResidualMechanicalLoadBand | null) {
  if (band === "HIGH") return "border-red-200 bg-red-50 text-red-800";
  if (band === "CAUTION") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "ELEVATED") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function confidenceClass(confidence: MechanicalLoadConfidence) {
  if (confidence === "high") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

// ── Info popover helper ──────────────────────────────────────────────────────

function InfoTh({ children, title, body, className = "" }: { children: React.ReactNode; title: string; body: string; className?: string }) {
  return (
    <th className={`py-1 pr-2 ${className}`}>
      <div className="flex items-center gap-1">
        {children}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
              aria-label={`Info: ${title}`}
            >
              i
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="w-72">
            <p className="text-xs font-semibold text-slate-900 mb-1">{title}</p>
            <p className="text-xs text-slate-600 leading-relaxed">{body}</p>
          </PopoverContent>
        </Popover>
      </div>
    </th>
  );
}

export default function MechanicalLoadIndexCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [dateKey, setDateKey] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ResponsePayload | null>(null);

  const load = async (targetDate = dateKey) => {
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const qs = new URLSearchParams({ date: targetDate });
      if (teamId) qs.set("teamId", teamId);
      const res = await fetch(`/api/coach/player-load/mli?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as ResponsePayload;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load MLI.");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load MLI.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const rows = data?.rows ?? [];
  const anyCss = rows.some((r) => r.css != null);
  // MLI is computed from accel/decel B2-3 efforts — columns Core/Lite Catapult
  // plans don't expose. If no player has an MLI, self-hide rather than show a
  // card of "—" for lower-tier clubs (the load-verdict + GPS surfaces cover them).
  if (data && !rows.some((r) => r.mli != null)) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Catapult Derived</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Mechanical Load Index (MLI)</div>
          <div className="mt-1 text-xs text-slate-500">
            Derived mechanical stress score from acceleration, deceleration and density inputs.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateKey}
            onChange={(e) => {
              const next = e.target.value;
              setDateKey(next);
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) void load(next);
            }}
            className="h-8 rounded-md border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => void load(dateKey)}
            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg MLI</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.avgMli ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Very high / extreme</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : data?.summary?.highCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-rose-700">Extreme days</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-rose-800">{loading ? "—" : data?.summary?.extremeCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-blue-700">Residual elevated</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-blue-800">{loading ? "—" : data?.summary?.residualElevatedCount ?? 0}</div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">Player mechanical load</div>
          {rows.length === 0 ? (
            <div className="mt-2 text-xs text-slate-500">No Catapult mechanical load data for selected date.</div>
          ) : (
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">Player</th>
                    <InfoTh
                      title="MLI (Mechanical Load Index)"
                      body="Vélrænt álagsskor reiknað úr deceleration, acceleration, stefnubreytingum og density. Mælir álag á vöðva, lið og sinar. Flokkar: Low / Moderate / High / Very High / Extreme."
                    >MLI</InfoTh>
                    <InfoTh
                      title="Residual MLI (3 dagar)"
                      body="Uppsafnað vélrænt álag síðustu 3 daga. Vegið: í dag 50%, gær 30%, fyrri dagur 20%. Sýnir hvort leikmaður fær nægan bata á milli æfinga. Flokkar: Normal / Elevated / Caution / High."
                    >Residual</InfoTh>
                    <InfoTh
                      title="Sub-scores"
                      body="DSS = Deceleration Stress Score. ASS = Acceleration Stress Score. CSS = Change-of-direction Stress Score (ef til). GDS = G-force Density Score (player load/mín). Hvert skor er 0–100 miðað við 28d baseline."
                    >Sub-scores</InfoTh>
                    <InfoTh
                      title="Flags"
                      body="Sjálfvirk viðvörunarmerki. T.d. hátt deceleration álag, mikil stefnubreyting, eða óvenjulega há density. Flaggar koma fram þegar einstakir undirþættir fara langt yfir viðmið."
                    >Flags</InfoTh>
                    <InfoTh
                      title="Confidence"
                      body="Hversu traust gögnin eru. High = fullnægjandi Catapult gögn og ≥14d baseline. Medium = styttri baseline eða minni gagnagæði. Low = lágmarks gögn."
                      className="pr-0"
                    >Confidence</InfoTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={`${row.player_id}-${row.date}-${idx}`} className="border-t align-top">
                      <td className="py-1 pr-2 font-medium text-slate-800">{row.player_name}</td>
                      <td className="py-1 pr-2">
                        <span className="tabular-nums font-semibold text-slate-800">{row.mli ?? "—"}</span>
                        <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${bandClass(row.mli_band)}`}>
                          {row.mli_band?.replace("_", " ") ?? "—"}
                        </span>
                      </td>
                      <td className="py-1 pr-2">
                        <span className="tabular-nums font-semibold text-slate-800">{row.residual_mli ?? "—"}</span>
                        <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${residualClass(row.residual_band)}`}>
                          {row.residual_band ?? "—"}
                        </span>
                      </td>
                      <td className="py-1 pr-2 text-slate-600">
                        {[
                          `DSS ${row.dss ?? "—"}`,
                          `ASS ${row.ass ?? "—"}`,
                          ...(anyCss ? [`CSS ${row.css ?? "—"}`] : []),
                          `GDS ${row.gds ?? "—"}`,
                        ].join(" · ")}
                      </td>
                      <td className="py-1 pr-2 text-slate-600">{row.flags.length ? row.flags.join(" • ") : "—"}</td>
                      <td className="py-1">
                        <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${confidenceClass(row.confidence)}`}>
                          {row.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

