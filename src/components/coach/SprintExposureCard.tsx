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
 * GPS sprint distance in TRAINING over the last 7 days vs the player's
 * average sprint distance per match (28-day window). Source: GPS
 * `sprint_distance` (else velocity band 6 distance) — see
 * lib/micropulse/sprintExposure. It used to read IMA Free Running bands 5–8,
 * which are long continuous runs (≥18 s), not sprinting; those are never used
 * here, not even as a fallback. Indoor days have no GPS → "no sprint reading".
 *
 * Layered read (explainability-first):
 *   0. one-sentence verdict
 *   1. 2–3 plain facts (training metres, match average, GPS coverage)
 *   2. bar, thresholds, source + citation behind "Show details"
 */
const fmtM = (n: number | null | undefined) =>
  n != null ? `${Math.round(n).toLocaleString("is-IS")} m` : "—";

export const SprintExposureCard: FC<{ playerId: string; isKinexon?: boolean }> = ({ playerId }) => {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [payload, setPayload] = useState<SprintExposurePayload | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

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

  const noGps7d = payload.noGpsDays7d ?? 0;
  const title = IS ? "Sprettir vikunnar" : "Sprinting this week";
  const subtitle = IS
    ? "Sprett-vegalengd á æfingum síðustu 7 daga vs meðaltal hans í leik · GPS"
    : "Sprint distance in training, last 7 days, vs his match average · GPS";
  const todayNoGpsChip = payload.todayNoGps ? (
    <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
      {IS ? "Í dag: engin GPS-mæling (inni)" : "Today: no GPS reading (indoor)"}
    </span>
  ) : null;
  const sourceNote = IS
    ? "Heimild: GPS sprett-vegalengd (sprint_distance, annars hraðaband 6). Þarf GPS — inniæfingar gefa enga sprett-mælingu og eru aldrei fylltar upp með IMA Free Running böndum (þau mæla löng samfelld hlaup, ekki spretti). Malone 2017: hófleg sprett-útsetning er verndandi og of lítil skilur leikmenn eftir vanbúna; sterkasta meiðsla-merkið eru hröð stökk (Gabbett 2016). Undir 50% af einum leik = of lítið; yfir 180% = snarpur toppur."
    : "Source: GPS sprint distance (sprint_distance, else velocity band 6). Needs GPS — indoor sessions give no sprint reading and are never filled in from IMA Free Running bands (those measure long continuous runs, not sprinting). Malone 2017: moderate sprint exposure is protective and too little leaves players under-prepared; the strongest injury signal is rapid increases (Gabbett 2016). Under 50% of one match = too little; over 180% = a sharp spike.";

  // Not computable — say exactly why, with the no-GPS case first.
  if (payload.band === "INSUFFICIENT_DATA") {
    const noGpsWeek = payload.daysObserved7d < 2 && noGps7d > 0;
    const verdict = noGpsWeek
      ? (IS ? "Engin sprett-mæling — inni / ekkert GPS" : "No sprint reading — indoor / no GPS")
      : (IS ? "Ekki hægt að meta spretti enn" : "Can't rate sprinting yet");
    const facts: string[] = [];
    if (noGps7d > 0) {
      facts.push(IS
        ? `${noGps7d} æfingadag${noGps7d === 1 ? "ur" : "ar"} síðustu 7 daga án GPS (inni) — engin sprett-mæling þá daga.`
        : `${noGps7d} training day${noGps7d === 1 ? "" : "s"} in the last 7 had no GPS (indoor) — no sprint reading on ${noGps7d === 1 ? "that day" : "those days"}.`);
    }
    if (payload.daysObserved7d < 2) {
      facts.push(IS
        ? `Þarf ≥ 2 æfingadaga með GPS síðustu 7 daga. Núna: ${payload.daysObserved7d}.`
        : `Needs ≥ 2 training days with GPS in the last 7. Currently: ${payload.daysObserved7d}.`);
    }
    if (payload.matchDaysObserved < 1) {
      facts.push(IS
        ? "Enginn leikur með GPS-mælingu síðustu 28 daga, svo ekkert leik-viðmið."
        : "No match with a GPS reading in the last 28 days, so no match average to compare with.");
    }
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          {todayNoGpsChip}
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-800">{verdict}</p>
        {facts.length > 0 && (
          <ul className="mt-1.5 list-disc pl-4 text-xs text-slate-600 leading-relaxed">
            {facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="mt-2 text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
        >
          {showDetails ? (IS ? "Fela nánar" : "Hide details") : (IS ? "Sýna nánar" : "Show details")}
        </button>
        {showDetails && <p className="mt-1 text-[10px] text-slate-500 leading-snug">{sourceNote}</p>}
      </div>
    );
  }

  const band: SprintExposureBand = payload.band;
  const pct = payload.exposureRatio != null
    ? Math.round(payload.exposureRatio * 100)
    : null;

  const bandStyle: Record<SprintExposureBand, { bg: string; border: string; text: string; chip: string; bar: string; label: string }> = {
    UNDERLOAD:    { bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-900",    chip: "bg-rose-600 text-white",    bar: "bg-rose-500",    label: IS ? "Of lítið" : "Too little" },
    WATCH:        { bg: "bg-amber-50",   border: "border-amber-300",   text: "text-amber-900",   chip: "bg-amber-600 text-white",   bar: "bg-amber-500",   label: IS ? "Létt" : "Light" },
    SAFE:         { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", chip: "bg-emerald-600 text-white", bar: "bg-emerald-500", label: IS ? "Í lagi" : "On track" },
    OVERLOAD:     { bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-900",    chip: "bg-rose-600 text-white",    bar: "bg-rose-500",    label: IS ? "Toppur" : "Spike" },
    INSUFFICIENT_DATA: { bg: "", border: "", text: "", chip: "", bar: "", label: "" },
  };
  const s = bandStyle[band];

  const verdict = (() => {
    if (band === "UNDERLOAD") return IS ? `Of lítið sprettað á æfingum — ${pct}% af einum leik` : `Too little sprinting in training — ${pct}% of one match`;
    if (band === "WATCH") return IS ? `Létt sprett-vika — ${pct}% af einum leik` : `A light sprint week — ${pct}% of one match`;
    if (band === "OVERLOAD") return IS ? `Mikið sprettað — ${pct}% af einum leik (snarpur toppur)` : `A lot of sprinting — ${pct}% of one match (sharp spike)`;
    return IS ? `Sprettir á réttu róli — ${pct}% af einum leik` : `Sprinting on track — ${pct}% of one match`;
  })();

  const matchAvgNote = (() => {
    const observed = payload.matchDaysObserved;
    const scheduled = payload.matchDaysScheduled ?? observed;
    if (scheduled > observed) {
      return IS
        ? `úr ${observed} af ${scheduled} leikjum (hinir án GPS-gagna)`
        : `from ${observed} of ${scheduled} matches (others had no GPS data)`;
    }
    if (observed === 1) return IS ? "úr 1 leik (lág vissa)" : "from 1 match (low confidence)";
    return IS ? `meðaltal úr ${observed} leikjum` : `average of ${observed} matches`;
  })();

  // Bar fill — 0% empty, 100% = one match, 200%+ caps the bar.
  const fillPct = pct != null ? Math.min(100, Math.max(0, pct / 2)) : 0;

  return (
    <div className={`rounded-lg border-2 ${s.border} ${s.bg} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-bold uppercase tracking-wide ${s.text}`}>{title}</h3>
          <p className={`mt-0.5 text-xs ${s.text} opacity-80`}>{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${s.chip}`}>
            {pct != null ? `${pct}%` : "—"} · {s.label}
          </span>
          {todayNoGpsChip}
        </div>
      </div>

      {/* Level 0 — verdict */}
      <p className={`mt-3 text-sm font-semibold ${s.text}`}>{verdict}</p>

      {/* Level 1 — plain facts, visible without a click */}
      <ul className={`mt-1.5 list-disc pl-4 text-xs ${s.text} leading-relaxed`}>
        <li>
          {IS
            ? `${fmtM(payload.acuteSum7d)} sprettað á ${payload.daysObserved7d} ${payload.daysObserved7d === 1 ? "æfingadegi" : "æfingadögum"} með GPS síðustu 7 daga.`
            : `${fmtM(payload.acuteSum7d)} sprinted over ${payload.daysObserved7d} GPS training day${payload.daysObserved7d === 1 ? "" : "s"} in the last 7.`}
        </li>
        <li>
          {IS
            ? `Hann sprettar að jafnaði ${fmtM(payload.matchDayDemand)} í leik (${matchAvgNote}).`
            : `He sprints ${fmtM(payload.matchDayDemand)} in a typical match (${matchAvgNote}).`}
        </li>
        {noGps7d > 0 && (
          <li>
            {IS
              ? `${noGps7d} æfingadag${noGps7d === 1 ? "ur" : "ar"} inni / án GPS — engin sprett-mæling, ekki talið með.`
              : `${noGps7d} indoor / no-GPS training day${noGps7d === 1 ? "" : "s"} — no sprint reading, not counted.`}
          </li>
        )}
      </ul>

      {narrative && (
        <p className={`mt-2 text-xs ${s.text} leading-snug`}>{narrative}</p>
      )}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="mt-2 text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
      >
        {showDetails ? (IS ? "Fela nánar" : "Hide details") : (IS ? "Sýna nánar" : "Show details")}
      </button>

      {/* Level 2 — bar, thresholds, source + citation */}
      {showDetails && (
        <>
          <div className="mt-2 relative h-3 w-full overflow-hidden rounded-full bg-white border border-slate-200">
            {/* 50% / 80% / 100% / 180% reference lines on a 0–200% scale */}
            <div className="absolute inset-y-0 left-[25%] w-px bg-slate-300" />
            <div className="absolute inset-y-0 left-[40%] w-px bg-slate-300" />
            <div className="absolute inset-y-0 left-[50%] w-px bg-slate-400" title={IS ? "100% = einn leikur" : "100% = one match"} />
            <div className="absolute inset-y-0 left-[90%] w-px bg-slate-300" />
            <div className={`absolute inset-y-0 left-0 ${s.bar}`} style={{ width: `${fillPct}%` }} />
          </div>
          <div className="relative mt-1 h-3 text-[10px] text-slate-500">
            <span className="absolute left-0">0%</span>
            <span className="absolute left-[25%] -translate-x-1/2">50%</span>
            <span className="absolute left-[40%] -translate-x-1/2">80%</span>
            <span className="absolute left-[50%] -translate-x-1/2 font-semibold">100%</span>
            <span className="absolute left-[90%] -translate-x-1/2">180%</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-500 leading-snug">{sourceNote}</p>
        </>
      )}
    </div>
  );
};

export default SprintExposureCard;
