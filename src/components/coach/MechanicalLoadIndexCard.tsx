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
  date?: string;
  requestedDate?: string;
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

export default function MechanicalLoadIndexCard({ teamId, lang = "EN" }: { teamId?: string | null; lang?: "EN" | "IS" }) {
  const is = lang === "IS";
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
  // Genuine no-data only: a club whose Catapult tier never exposes the accel/
  // decel B2-3 efforts MLI is built from (Core/Lite). Note the API already falls
  // back to the most recent session, so a rest day for an IMA-tier club does NOT
  // land here — it shows that last session below with a "last session" note.
  if (data && !rows.some((r) => r.mli != null)) return null;

  // The rows may be from an earlier date than requested (rest day → last session).
  const shownDate = data?.date ?? null;
  const staleSession = !!(data?.requestedDate && shownDate && shownDate !== data.requestedDate);

  // Answer-first: one plain sentence before the tiles/table.
  const highRows = rows.filter((r) => r.mli_band === "VERY_HIGH" || r.mli_band === "EXTREME");
  const residualElevated = data?.summary?.residualElevatedCount ?? 0;
  const topNames = (arr: ResponseRow[]) => arr.slice(0, 3).map((r) => r.player_name.split(" ")[0]).join(", ");
  const mliVerdict: string | null =
    loading || rows.length === 0
      ? null
      : highRows.length > 0
        ? is
          ? `${highRows.length} í mjög háu vélrænu álagi — hæstir: ${topNames(highRows)}.`
          : `${highRows.length} ${highRows.length === 1 ? "player is" : "players are"} at very high mechanical load — highest: ${topNames(highRows)}.`
        : residualElevated > 0
          ? is
            ? `Vélrænt álag í lagi, en ${residualElevated} með uppsafnað álag (ekki fullur bati á milli æfinga).`
            : `Mechanical load is in range, but ${residualElevated} ${residualElevated === 1 ? "player has" : "players have"} elevated residual load (not fully recovered between sessions).`
          : is
            ? "Vélrænt álag er í eðlilegu bili hjá öllum."
            : "Mechanical load is in a normal range across the squad.";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{is ? "Frá Catapult" : "Catapult Derived"}</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{is ? "Vélrænt álagsskor (MLI)" : "Mechanical Load Index (MLI)"}</div>
          <div className="mt-1 text-xs text-slate-500">
            {is
              ? "Vélrænt álagsskor reiknað úr hröðun, hemlun og density."
              : "Derived mechanical stress score from acceleration, deceleration and density inputs."}
          </div>
          {staleSession && shownDate ? (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {is ? "Engin æfing umbeðinn dag — sýni síðustu session (" : "No session on the requested day — showing the last session ("}
              {new Date(`${shownDate}T00:00:00`).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" })}
              ).
            </div>
          ) : null}
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
            {loading ? (is ? "Hleður…" : "Loading...") : (is ? "Uppfæra" : "Refresh")}
          </button>
        </div>
      </div>

      {mliVerdict && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          {mliVerdict}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{is ? "Meðal MLI" : "Avg MLI"}</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{loading ? "—" : data?.summary?.avgMli ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">{is ? "Mjög hátt / öfgar" : "Very high / extreme"}</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-800">{loading ? "—" : data?.summary?.highCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-rose-700">{is ? "Öfga-dagar" : "Extreme days"}</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-rose-800">{loading ? "—" : data?.summary?.extremeCount ?? 0}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-blue-700">{is ? "Uppsafnað hátt" : "Residual elevated"}</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-blue-800">{loading ? "—" : data?.summary?.residualElevatedCount ?? 0}</div>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">{is ? "Vélrænt álag per leikmann" : "Player mechanical load"}</div>
          {rows.length === 0 ? (
            <div className="mt-2 text-xs text-slate-500">{is ? "Engin Catapult vélræn-álagsgögn fyrir valinn dag." : "No Catapult mechanical load data for selected date."}</div>
          ) : (
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">{is ? "Leikmaður" : "Player"}</th>
                    <InfoTh
                      title={is ? "MLI (Vélrænt álagsskor)" : "MLI (Mechanical Load Index)"}
                      body={is
                        ? "Vélrænt álagsskor reiknað úr hemlun, hröðun, stefnubreytingum og density. Mælir álag á vöðva, lið og sinar. Flokkar: Low / Moderate / High / Very High / Extreme."
                        : "Mechanical load score from deceleration, acceleration, change-of-direction and density. Measures load on muscle, joints and tendons. Bands: Low / Moderate / High / Very High / Extreme."}
                    >MLI</InfoTh>
                    <InfoTh
                      title={is ? "Uppsafnað MLI (3 dagar)" : "Residual MLI (3 days)"}
                      body={is
                        ? "Uppsafnað vélrænt álag síðustu 3 daga. Vegið: í dag 50%, gær 30%, fyrri dagur 20%. Sýnir hvort leikmaður fær nægan bata á milli æfinga. Flokkar: Normal / Elevated / Caution / High."
                        : "Accumulated mechanical load over the last 3 days. Weighted: today 50%, yesterday 30%, day before 20%. Shows whether a player is recovering enough between sessions. Bands: Normal / Elevated / Caution / High."}
                    >{is ? "Uppsafnað" : "Residual"}</InfoTh>
                    <InfoTh
                      title={is ? "Undirskor" : "Sub-scores"}
                      body={is
                        ? "DSS = Deceleration Stress Score. ASS = Acceleration Stress Score. CSS = Change-of-direction Stress Score (ef til). GDS = G-force Density Score (player load/mín). Hvert skor er 0–100 miðað við 28d baseline."
                        : "DSS = Deceleration Stress Score. ASS = Acceleration Stress Score. CSS = Change-of-direction Stress Score (if present). GDS = G-force Density Score (player load/min). Each score is 0–100 vs the 28-day baseline."}
                    >{is ? "Undirskor" : "Sub-scores"}</InfoTh>
                    <InfoTh
                      title={is ? "Flögg" : "Flags"}
                      body={is
                        ? "Sjálfvirk viðvörunarmerki. T.d. hátt hemlunar-álag, mikil stefnubreyting, eða óvenjulega há density. Flögg koma fram þegar einstakir undirþættir fara langt yfir viðmið."
                        : "Automatic warning markers — e.g. high deceleration load, heavy change-of-direction, or unusually high density. Flags appear when individual sub-components run well over threshold."}
                    >{is ? "Flögg" : "Flags"}</InfoTh>
                    <InfoTh
                      title={is ? "Vissa" : "Confidence"}
                      body={is
                        ? "Hversu traust gögnin eru. High = fullnægjandi Catapult gögn og ≥14d baseline. Medium = styttri baseline eða minni gagnagæði. Low = lágmarks gögn."
                        : "How trustworthy the data is. High = sufficient Catapult data and a ≥14-day baseline. Medium = shorter baseline or lower data quality. Low = minimal data."}
                      className="pr-0"
                    >{is ? "Vissa" : "Confidence"}</InfoTh>
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

