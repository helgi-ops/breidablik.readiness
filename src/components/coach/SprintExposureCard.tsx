"use client";

import { useEffect, useState, type FC } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type {
  SprintExposureBand,
  SprintExposurePayload,
} from "@/lib/micropulse/sprintExposure";

/**
 * SprintExposureCard — volume-side sprint metric for a single player.
 *
 * Renders the 7-day sum of IMA bands 5-8 strides vs the player's 28-day
 * match-day demand baseline. Coach sees instantly whether the player is
 * undertrained (Malone 2018 elevated injury risk), in the safe zone, or
 * in a spike band.
 *
 * Hides itself when there's not enough match-day baseline data yet
 * (needs ≥ 2 match days in the 28-day window).
 */
export const SprintExposureCard: FC<{ playerId: string }> = ({ playerId }) => {
  const [lang] = useLang();
  const [payload, setPayload] = useState<SprintExposurePayload | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) {
          if (alive) setLoading(false);
          return;
        }
        const res = await fetch(`/api/coach/player/${playerId}/sprint-exposure?lang=${lang}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (alive) setLoading(false);
          return;
        }
        const json = await res.json();
        if (!alive) return;
        setPayload(json.payload ?? null);
        setNarrative(String(json.text ?? ""));
      } catch {
        /* silent — card just won't render */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId, lang]);

  if (loading) return null;
  if (!payload) return null;

  // Empty state — show a small explainer instead of hiding completely so
  // coach knows the card exists but is awaiting data. Hides only the
  // visual bar + numbers, keeps the title visible.
  if (payload.band === "INSUFFICIENT_DATA") {
    const why =
      payload.matchDaysObserved < 2
        ? (lang === "IS"
            ? `Þarf ≥ 2 leikdaga (≥60 mín) með IMA bands 5-8 stride gögnum í síðustu 28 dögum til að reikna match-day demand. Núna: ${payload.matchDaysObserved} leikdagar með band-gögnum.`
            : `Need ≥ 2 match days (≥60 min) with IMA bands 5-8 stride data in the last 28 days to compute match-day demand. Currently: ${payload.matchDaysObserved} match days with band data.`)
        : (lang === "IS"
            ? `Þarf ≥ 2 æfingadaga með bands 5-8 stride gögnum í síðustu viku. Núna: ${payload.daysObserved7d} af 7.`
            : `Need ≥ 2 training days with bands 5-8 stride data in the last 7 days. Currently: ${payload.daysObserved7d} of 7.`);
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
          {lang === "IS" ? "Sprint Exposure (vika)" : "Sprint Exposure (week)"}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {lang === "IS"
            ? "IMA bands 5-8 strides síðustu 7 daga vs leikdags-meðaltal (Malone 2018)"
            : "IMA bands 5-8 strides last 7d vs match-day average (Malone 2018)"}
        </p>
        <p className="mt-3 text-xs text-slate-600 leading-relaxed">
          {why}
        </p>
        <p className="mt-2 text-[10px] text-slate-400 leading-snug">
          {lang === "IS"
            ? "Eftir Catapult IMA Free Running fix nýlega geta eldri activities vantað bands 5-8 stride gögn. Kortið birtist sjálfkrafa um leið og baseline er reiknanlegur."
            : "After the recent Catapult IMA Free Running fix, older activities may be missing bands 5-8 stride data. The card lights up automatically once the baseline is computable."}
        </p>
      </div>
    );
  }

  const band: SprintExposureBand = payload.band;
  const pct = payload.exposureRatio != null
    ? Math.round(payload.exposureRatio * 100)
    : null;

  const bandStyle: Record<SprintExposureBand, { bg: string; border: string; text: string; chip: string; label: string }> = {
    UNDERLOAD:    { bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-900",    chip: "bg-rose-600 text-white",    label: lang === "IS" ? "Undertrained" : "Underload" },
    WATCH:        { bg: "bg-amber-50",   border: "border-amber-300",   text: "text-amber-900",   chip: "bg-amber-600 text-white",   label: "Watch" },
    SAFE:         { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", chip: "bg-emerald-600 text-white", label: "Safe" },
    OVERLOAD:     { bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-900",    chip: "bg-rose-600 text-white",    label: "Spike" },
    INSUFFICIENT_DATA: { bg: "", border: "", text: "", chip: "", label: "" },
  };
  const s = bandStyle[band];

  // Bar fill — 0% is empty, 100% matches match demand, 150%+ caps the bar.
  const fillPct = pct != null ? Math.min(100, Math.max(0, pct * (100 / 150))) : 0;

  return (
    <div className={`rounded-lg border-2 ${s.border} ${s.bg} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-bold uppercase tracking-wide ${s.text}`}>
            {lang === "IS" ? "Sprint Exposure (vika)" : "Sprint Exposure (week)"}
          </h3>
          <p className={`mt-0.5 text-xs ${s.text} opacity-80`}>
            {lang === "IS"
              ? "IMA bands 5-8 strides síðustu 7 daga vs leikdags-meðaltal"
              : "IMA bands 5-8 strides last 7d vs match-day average"}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${s.chip}`}>
          {pct != null ? `${pct}%` : "—"} · {s.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 relative h-3 w-full overflow-hidden rounded-full bg-white border border-slate-200">
        {/* 50% / 80% / 100% / 150% reference lines */}
        <div className="absolute inset-y-0 left-[33.33%] w-px bg-slate-300" />
        <div className="absolute inset-y-0 left-[53.33%] w-px bg-slate-300" />
        <div className="absolute inset-y-0 left-[66.66%] w-px bg-slate-400" title="100% = match demand" />
        <div
          className={`absolute inset-y-0 left-0 ${
            band === "UNDERLOAD" ? "bg-rose-500"
              : band === "WATCH" ? "bg-amber-500"
              : band === "SAFE" ? "bg-emerald-500"
              : "bg-rose-500"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>0%</span>
        <span>50%</span>
        <span>80%</span>
        <span className="font-semibold">100%</span>
        <span>150%</span>
      </div>

      {/* Numbers */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-slate-500">
            {lang === "IS" ? "Vika (7d)" : "Week (7d)"}
          </div>
          <div className="mt-0.5 text-sm font-bold text-slate-900">
            {payload.acuteSum7d != null ? Math.round(payload.acuteSum7d).toLocaleString("is-IS") : "—"}
          </div>
          <div className="text-[9px] text-slate-500">{lang === "IS" ? "sprint-strides" : "sprint-strides"}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-slate-500">
            {lang === "IS" ? "Leikdags-demand" : "Match demand"}
          </div>
          <div className="mt-0.5 text-sm font-bold text-slate-900">
            {payload.matchDayDemand != null ? Math.round(payload.matchDayDemand).toLocaleString("is-IS") : "—"}
          </div>
          <div className="text-[9px] text-slate-500">
            {(() => {
              const observed = payload.matchDaysObserved;
              const measured = payload.matchDaysMeasured ?? observed;
              const estimated = payload.matchDaysEstimated ?? 0;
              const scheduled = payload.matchDaysScheduled ?? observed;
              // Layered attribution — explain estimation source first,
              // schedule gap second, low confidence third.
              if (estimated > 0) {
                if (measured === 0) {
                  return lang === "IS"
                    ? `úr ${observed} leikjum (öll GPS-áætluð)`
                    : `from ${observed} matches (all GPS-estimated)`;
                }
                return lang === "IS"
                  ? `úr ${observed} leikjum (${measured} mæld + ${estimated} GPS-áætluð)`
                  : `from ${observed} matches (${measured} measured + ${estimated} GPS-estimated)`;
              }
              if (scheduled > observed) {
                return lang === "IS"
                  ? `úr ${observed} af ${scheduled} leikjum (gögn vantar fyrir hina)`
                  : `from ${observed} of ${scheduled} matches (others missing data)`;
              }
              if (observed === 1) {
                return lang === "IS" ? "úr 1 leik (lág vissa)" : "from 1 match (low confidence)";
              }
              return lang === "IS"
                ? `meðaltal úr ${observed} leikjum`
                : `avg of ${observed} matches`;
            })()}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-slate-500">
            {lang === "IS" ? "Skráðir dagar" : "Days observed"}
          </div>
          <div className="mt-0.5 text-sm font-bold text-slate-900">{payload.daysObserved7d} / 7</div>
          <div className="text-[9px] text-slate-500">{lang === "IS" ? "í síðustu viku" : "in last 7 days"}</div>
        </div>
      </div>

      {narrative && (
        <p className={`mt-3 text-xs ${s.text} leading-snug`}>{narrative}</p>
      )}

      <p className="mt-2 text-[10px] text-slate-500 leading-snug">
        {lang === "IS"
          ? "Malone 2018: vikuleg sprint exposure undir 50% af leikdags-meðaltali er tengd 3× hærri hamstring-meiðslaáhættu. Yfir 150% er accumulated spike."
          : "Malone 2018: weekly sprint exposure below 50% of match demand is linked to ~3× hamstring injury risk. Over 150% is an accumulated spike."}
      </p>
    </div>
  );
};

export default SprintExposureCard;
