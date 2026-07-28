"use client";

/**
 * TeamMetabolicSummary
 *
 * Coach Command Center panel: shows team-level metabolic load overview.
 * Mirrors the visual style / self-fetching pattern of MechanicalLoadIndexCard,
 * including the full per-player scrollable table.
 *
 * Consumes data from GET /api/coach/player-load/metabolic.
 */

import React, { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import FatigueTypeChip from "@/components/micropulse/FatigueTypeChip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";
import type { MetabolicLoadBand, CompositeFatigueType, MetabolicLoadConfidence, MetabolicRecommendationCode } from "@/lib/micropulse/metabolicLoad";

// ─── Types (matches API response shape) ───────────────────────────────────

type PlayerMetabolicRow = {
  player_id: string;
  player_name: string;
  date: string;
  metabolic_load_score: number | null;
  metabolic_load_band: MetabolicLoadBand | null;
  metabolic_flag: string;
  fatigue_type: CompositeFatigueType;
  recommendation_code: MetabolicRecommendationCode;
  recommendation_hints: string[];
  avg_power_w_kg: number | null;
  peak_power_w_kg: number | null;
  hml_distance_m: number | null;
  time_above_threshold_s: number | null;
  metabolic_data_valid: boolean;
  metabolic_power_gen: string | null;
  confidence: MetabolicLoadConfidence;
  data_confidence: number;
  rpe_z: number | null;
  delta_score: number | null;
  volatility7d: number | null;
  session_type: string | null;
};

type MissingPlayer = {
  player_id: string;
  player_name: string;
  status: "NO_CATAPULT_DATA";
};

type MetabolicApiPayload = {
  ok: boolean;
  error?: string;
  summary?: {
    avgMetabolicScore: number | null;
    highCount: number;
    validCount: number;
    missingCount: number;
  };
  rows?: PlayerMetabolicRow[];
  missingPlayers?: MissingPlayer[];
  rosterCount?: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const BAND_STYLES: Record<MetabolicLoadBand, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
  moderate: "border-amber-200 bg-amber-50 text-amber-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  very_high: "border-rose-200 bg-rose-50 text-rose-800",
};

const CONFIDENCE_STYLES: Record<MetabolicLoadConfidence, string> = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

function fmt1(v: number | null): string {
  return v != null && Number.isFinite(v) ? v.toFixed(1) : "—";
}

function fmtScore(v: number | null): string {
  return v != null && Number.isFinite(v) ? Math.round(v).toString() : "—";
}

function fmtHml(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`;
}

function fmtTime(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDelta(v: number | null): { label: string; className: string } {
  if (v == null || !Number.isFinite(v)) return { label: "—", className: "text-slate-400" };
  if (v > 5) return { label: `↑ +${v.toFixed(1)}`, className: "font-semibold text-orange-500" };
  if (v < -5) return { label: `↓ ${v.toFixed(1)}`, className: "font-semibold text-emerald-600" };
  return { label: `→ ${v > 0 ? "+" : ""}${v.toFixed(1)}`, className: "text-slate-500" };
}

function fmtVolatility(v: number | null): { label: string; className: string } {
  if (v == null || !Number.isFinite(v)) return { label: "—", className: "text-slate-400" };
  if (v > 15) return { label: v.toFixed(1), className: "font-semibold text-rose-500" };
  if (v > 8) return { label: v.toFixed(1), className: "text-amber-600" };
  return { label: v.toFixed(1), className: "text-slate-500" };
}

function fmtRpeZ(v: number | null): { label: string; className: string } {
  if (v == null || !Number.isFinite(v)) return { label: "—", className: "text-slate-400" };
  const sign = v > 0 ? "+" : "";
  const label = `${sign}${v.toFixed(2)}`;
  if (v >= 1.5) return { label, className: "font-semibold text-rose-600" };
  if (v >= 1.0) return { label, className: "font-semibold text-orange-500" };
  if (v >= 0) return { label, className: "text-slate-600" };
  return { label, className: "text-emerald-600" };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Info popover helper ────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function TeamMetabolicSummary({
  teamId,
  className = "",
}: {
  teamId?: string | null;
  className?: string;
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [dateKey, setDateKey] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<MetabolicApiPayload | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

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
      const res = await fetch(`/api/coach/player-load/metabolic?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as MetabolicApiPayload;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load metabolic data.");
      setPayload(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load metabolic data.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const summary = payload?.summary;
  const rows = payload?.rows ?? [];
  const missingPlayers = payload?.missingPlayers ?? [];
  // The metabolic composite needs di Prampero metabolic power + time-above-HML —
  // signals Core/Lite Catapult plans don't expose (they carry HML distance only,
  // which is surfaced in Squad Load instead). If no player has valid metabolic
  // data, self-hide rather than show an empty composite for lower-tier clubs.
  if (payload && rows.length > 0 && !rows.some((r) => r.metabolic_data_valid)) return null;

  // Answer-first: one plain sentence before the tiles/table — how many are
  // carrying high metabolic (energy-system) load, and who's highest.
  const highRows = rows.filter((r) => r.metabolic_load_band === "high" || r.metabolic_load_band === "very_high");
  const metabolicVerdict: string | null =
    loading || !rows.some((r) => r.metabolic_data_valid)
      ? null
      : highRows.length > 0
        ? `${highRows.length} ${highRows.length === 1 ? "player is" : "players are"} carrying high metabolic (energy-system) load — highest: ${[...highRows]
            .sort((a, b) => (b.metabolic_load_score ?? 0) - (a.metabolic_load_score ?? 0))
            .slice(0, 3)
            .map((r) => r.player_name.split(" ")[0])
            .join(", ")}.`
        : "Metabolic load is in a normal range across the squad.";

  // Layer-1 supporting facts (no click): the highest scorers, the dominant
  // fatigue type, and how many are in a normal range — the ~15-second read.
  const metabolicFacts: string | null = (() => {
    if (loading || !rows.some((r) => r.metabolic_data_valid)) return null;
    const valid = rows.filter((r) => r.metabolic_data_valid);
    const high = valid.filter((r) => r.metabolic_load_band === "high" || r.metabolic_load_band === "very_high");
    const normal = valid.length - high.length;
    if (high.length === 0) return `${valid.length} players with valid data — all in a normal range.`;
    const top = [...high]
      .sort((a, b) => (b.metabolic_load_score ?? 0) - (a.metabolic_load_score ?? 0))
      .slice(0, 2)
      .map((r) => `${r.player_name.split(" ")[0]} ${r.metabolic_load_score ?? "—"}`)
      .join(", ");
    const counts = new Map<string, number>();
    for (const r of high) {
      const k = String(r.fatigue_type ?? "");
      if (!k || k === "none") continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let dom: string | null = null, max = 0;
    for (const [k, v] of counts) if (v > max) { max = v; dom = k; }
    const domLabel = dom ? dom.replace(/_/g, " ") : null;
    return `Highest: ${top}${domLabel ? ` · mostly ${domLabel}` : ""}. ${normal} in a normal range.`;
  })();

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Catapult Derived</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Metabolic Load Score</div>
          <div className="mt-1 text-xs text-slate-500">
            Weighted z-score composite: HMLD · time above threshold · peak &amp; avg metabolic power.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CoachTutorialButton slug="metabolic-load" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
          <input
            type="date"
            value={dateKey}
            max={todayISO()}
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
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {metabolicVerdict && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-sm font-medium text-slate-800">{metabolicVerdict}</p>
          {metabolicFacts && <p className="mt-0.5 text-xs text-slate-500">{metabolicFacts}</p>}
        </div>
      )}

      {/* ── Summary tiles ─────────────────────────────────────────── */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg score</div>
          <div className="mt-1 text-base font-semibold tabular-nums">
            {loading ? "—" : fmtScore(summary?.avgMetabolicScore ?? null)}
          </div>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-orange-700">High / very high</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-orange-800">
            {loading ? "—" : summary?.highCount ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700">Valid GNSS data</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-emerald-800">
            {loading ? "—" : summary?.validCount ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">No data</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-slate-700">
            {loading ? "—" : summary?.missingCount ?? 0}
          </div>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}

      {/* ── Full player table ─────────────────────────────────────── */}
      {!loading && !error ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-700">Player metabolic load</div>

          {rows.length === 0 && missingPlayers.length === 0 ? (
            <div className="mt-2 text-xs text-slate-500">No metabolic data for selected date.</div>
          ) : (
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">Player</th>
                    <InfoTh
                      title="Metabolic Load Score"
                      body="Vegið z-score samsett skor sem mælir orkukerfisálag. Byggist á metabolic power, HMLD vegalengd og tíma yfir HML viðmiðum. Flokkar: low / moderate / high / very high."
                    >Score</InfoTh>
                    <InfoTh
                      title="Fatigue Type"
                      body="Hvaða tegund þreytu ræður. Global = bæði innra og ytra álag hátt. Mechanical = vélrænt álag (decel/accel) drifkraftur. Metabolic = orkukerfisálag (metabolic power) drifkraftur. Normal = ekkert óeðlilegt."
                    >Fatigue type</InfoTh>
                    <InfoTh
                      title="Avg W/kg (Meðal metabolic power)"
                      body="Meðal metabolic power á kg líkamsþunga yfir æfinguna. Mælir meðalorkunotkun — hærra gildi = meiri heildarorkukrafa á vöðvakerfi."
                    >Avg W/kg</InfoTh>
                    <InfoTh
                      title="Peak W/kg (Hámarks metabolic power)"
                      body="Hæsta metabolic power á kg sem leikmaður náði í æfingunni. Sýnir hámarksorkukröfu — mikilvægt til að meta spretts- og háhraðaálag."
                    >Peak W/kg</InfoTh>
                    <InfoTh
                      title="HMLD (High Metabolic Load Distance)"
                      body="Vegalengd hlaupið yfir metabolic power viðmiðum (≈25.5 W/kg). Sýnir hversu mikla háorkuvinnu leikmaður vann — meira en bara hraði, tekur líka til acceleration."
                    >HMLD</InfoTh>
                    <InfoTh
                      title="T>thresh (Tími yfir viðmiðum)"
                      body="Fjöldi sekúndna sem leikmaður var yfir metabolic power viðmiðum. Lengri tími = meira álag á orkukerfi, aðallega hjarta- og æðakerfi."
                    >T&gt;thresh</InfoTh>
                    <InfoTh
                      title="RPE z-score"
                      body="Staðlað frávik RPE (Rate of Perceived Exertion) frá 28d meðaltali. ≥1.5 = leikmaður finnur fyrir verulega meira álagi en venjulega. Neikvætt gildi = léttari en venjulega."
                    >RPE z</InfoTh>
                    <InfoTh
                      title="Δ 5d (5 daga breyting)"
                      body="Breyting á metabolic load skori miðað við 5 daga meðaltal. ↑ = hækkandi álag, ↓ = minnkandi. Stórar breytingar (>5 stig) benda til ójafns álagsmunstur."
                    >Δ 5d</InfoTh>
                    <InfoTh
                      title="Vol 7d (7 daga sveiflur)"
                      body="Dreifni (volatility) í metabolic load síðustu 7 daga. Hátt gildi (>15) = mjög sveiflukennt álag sem eykur meiðslaáhættu. Lágt gildi = stöðugt álag."
                    >Vol 7d</InfoTh>
                    <InfoTh
                      title="Confidence"
                      body="Hversu traust gögnin eru. High = fullnægjandi GNSS gögn og ≥14d baseline. Medium = styttri baseline eða minni gagnagæði. Low = lágmarks gögn."
                      className="pr-0"
                    >Confidence</InfoTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <React.Fragment key={row.player_id}>
                      <tr
                        className="border-t align-top cursor-pointer hover:bg-slate-50"
                        onClick={() => setExpandedPlayer(expandedPlayer === row.player_id ? null : row.player_id)}
                        title={row.recommendation_hints?.length ? "Click to see recommendations" : undefined}
                      >
                        <td className="py-1 pr-2 font-medium text-slate-800">
                          <span className="flex items-center gap-1">
                            {row.recommendation_hints?.length > 0 && (
                              <span className="text-[10px] text-slate-400">
                                {expandedPlayer === row.player_id ? "▾" : "▸"}
                              </span>
                            )}
                            {row.player_name}
                          </span>
                        </td>

                        {/* Score + band badge */}
                        <td className="py-1 pr-2">
                          {row.metabolic_data_valid ? (
                            <>
                              <span className="font-semibold tabular-nums text-slate-800">
                                {fmtScore(row.metabolic_load_score)}
                              </span>
                              {row.metabolic_load_band && (
                                <span
                                  className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${BAND_STYLES[row.metabolic_load_band]}`}
                                >
                                  {row.metabolic_load_band.replace("_", " ")}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 italic">no GNSS</span>
                          )}
                        </td>

                        {/* Fatigue type chip */}
                        <td className="py-1 pr-2">
                          <FatigueTypeChip type={row.fatigue_type} size="sm" />
                        </td>

                        {/* Raw metabolic values */}
                        <td className="py-1 pr-2 tabular-nums text-slate-600">{fmt1(row.avg_power_w_kg)}</td>
                        <td className="py-1 pr-2 tabular-nums text-slate-600">{fmt1(row.peak_power_w_kg)}</td>
                        <td className="py-1 pr-2 tabular-nums text-slate-600">{fmtHml(row.hml_distance_m)}</td>
                        <td className="py-1 pr-2 tabular-nums text-slate-600">{fmtTime(row.time_above_threshold_s)}</td>

                        {/* RPE z-score */}
                        <td className="py-1 pr-2 tabular-nums">
                          {(() => { const { label, className } = fmtRpeZ(row.rpe_z); return <span className={className}>{label}</span>; })()}
                        </td>

                        {/* Delta 5d */}
                        <td className="py-1 pr-2 tabular-nums">
                          {(() => { const { label, className } = fmtDelta(row.delta_score); return <span className={className}>{label}</span>; })()}
                        </td>

                        {/* Volatility 7d */}
                        <td className="py-1 pr-2 tabular-nums">
                          {(() => { const { label, className } = fmtVolatility(row.volatility7d); return <span className={className}>{label}</span>; })()}
                        </td>

                        {/* Confidence badge */}
                        <td className="py-1">
                          <span
                            className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLES[row.confidence]}`}
                          >
                            {row.confidence}
                          </span>
                        </td>
                      </tr>

                      {/* Expandable recommendation hints */}
                      {expandedPlayer === row.player_id && row.recommendation_hints?.length > 0 && (
                        <tr className="bg-slate-50">
                          <td colSpan={11} className="px-4 py-2">
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                              Recommendations
                            </div>
                            <ul className="space-y-0.5">
                              {row.recommendation_hints.map((hint, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                                  {hint}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}

                  {/* Missing players (no Catapult data at all) */}
                  {missingPlayers.map((mp) => (
                    <tr key={mp.player_id} className="border-t align-top opacity-50">
                      <td className="py-1 pr-2 font-medium text-slate-500">{mp.player_name}</td>
                      <td className="py-1 pr-2 text-slate-400 italic" colSpan={7}>
                        no Catapult data
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
