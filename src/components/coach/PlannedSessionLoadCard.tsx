"use client";

/**
 * PlannedSessionLoadCard
 *
 * Today-page card that turns the Week-setup MD context into a planned
 * session-load target for the coach: load type (mixed / locomotive /
 * mechanical), band, sRPE target and approximate share of match demand.
 *
 * Decision-support, not a prescription — the MD plan is shown as the
 * target, and today's squad readiness is surfaced as a separate note
 * (it does not silently rewrite the number).
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  planSessionLoad,
  type SessionLoadType,
  type SessionLoadBand,
} from "@/lib/micropulse/plannedSessionLoad";

export type PlannedSessionLoadCardProps = {
  lang: "IS" | "EN";
  mdDay: string | number | null;
  dayType: string | null;
  focus: string | null;
  /** Days since the previous match (from v_training_day_context_team). */
  daysSincePrev?: number | null;
  /** Days until the next match (from v_training_day_context_team). */
  daysToNext?: number | null;
  /** Today's readiness flag counts — drive the separate readiness note. */
  redCount: number;
  yellowCount: number;
  totalPlayers: number;
};

const BAND_STYLE: Record<SessionLoadBand, { bg: string; border: string; text: string; chip: string }> = {
  light:     { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", chip: "bg-emerald-600" },
  moderate:  { bg: "bg-sky-50",     border: "border-sky-200",     text: "text-sky-800",     chip: "bg-sky-600" },
  high:      { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-900",   chip: "bg-amber-600" },
  very_high: { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-900",    chip: "bg-rose-600" },
};

function bandLabel(band: SessionLoadBand, lang: "IS" | "EN"): string {
  const is = lang === "IS";
  switch (band) {
    case "light":     return is ? "LÉTT" : "LIGHT";
    case "moderate":  return is ? "HÓFLEGT" : "MODERATE";
    case "high":      return is ? "HÁTT" : "HIGH";
    case "very_high": return is ? "MJÖG HÁTT" : "VERY HIGH";
  }
}

const TYPE_STYLE: Record<SessionLoadType, string> = {
  locomotive: "border-indigo-300 bg-indigo-50 text-indigo-800",
  mechanical: "border-orange-300 bg-orange-50 text-orange-800",
  mixed:      "border-slate-300 bg-slate-50 text-slate-700",
};

function typeLabel(t: SessionLoadType, lang: "IS" | "EN"): string {
  const is = lang === "IS";
  switch (t) {
    case "locomotive": return is ? "Locomotive · hlaup" : "Locomotive · running";
    case "mechanical": return is ? "Mechanical · hröðun/hemlun" : "Mechanical · accel-decel";
    case "mixed":      return is ? "Mixed · blandað" : "Mixed";
  }
}

export default function PlannedSessionLoadCard(props: PlannedSessionLoadCardProps) {
  const {
    lang, mdDay, dayType, focus,
    daysSincePrev, daysToNext,
    redCount, yellowCount, totalPlayers,
  } = props;
  const is = lang === "IS";

  const plan = planSessionLoad({
    mdDay, dayType, focus,
    daysSincePrev: daysSincePrev ?? null,
    daysToNext: daysToNext ?? null,
  });

  const title = is ? "Áætlað æfingaálag" : "Planned session load";

  // ── Non-training day (match / off / no-md) — muted state ───────────────
  // For OFF days we now compose a microcycle-aware paragraph (place in the
  // week, what to expect tomorrow, optional Buchheit/principle reference)
  // so the card still earns its space on a quiet day.
  if (!plan.applicable) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold">
              {title}
            </div>
            {plan.mdLabel ? (
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                {plan.mdLabel}
              </div>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {is ? plan.rationaleIS : plan.rationaleEN}
          </p>
        </CardContent>
      </Card>
    );
  }

  const s = BAND_STYLE[plan.band];

  // ── Readiness note — shown when today's squad is meaningfully flagged.
  // The plan number is NOT rewritten; this is a separate "ease off" cue.
  const flagged = redCount + yellowCount;
  const showReadinessNote =
    totalPlayers > 0 && (redCount >= 1 || flagged >= Math.ceil(totalPlayers * 0.25));

  return (
    <Card className={`shadow-sm ${s.border} ${s.bg}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold">{title}</div>
            <div className={`mt-0.5 text-lg font-semibold ${s.text}`}>
              {bandLabel(plan.band, lang)}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {plan.mdLabel ? `${plan.mdLabel} · ` : ""}
              {is ? "úr Week setup" : "from Week setup"}
            </div>
          </div>
          <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${TYPE_STYLE[plan.loadType]}`}>
            {typeLabel(plan.loadType, lang)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Three targets — sRPE intensity×duration, sRPE load, % of match */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
              {is ? "Ákefð × lengd" : "Intensity × time"}
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
              RPE {plan.rpe} · {plan.durationMin}′
            </div>
          </div>
          <div
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
            title={is
              ? "Session-RPE álag: ákefð × mínútur. Mælikvarði á heildar innra álag æfingar."
              : "Session-RPE load: intensity × minutes. A measure of the session's total internal load."}
          >
            <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
              {is ? "Heildarálag" : "Total load"}
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
              {plan.sessionLoad.toLocaleString(is ? "is-IS" : "en-GB")}
              <span className="ml-0.5 text-[9px] font-normal text-slate-400">AU</span>
            </div>
            <div className="text-[9px] text-slate-400">
              {is ? "ákefð × mín (sRPE)" : "intensity × min (sRPE)"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
              {is ? "Hlutfall af leik" : "Share of match"}
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
              ~{plan.matchPct}%
            </div>
          </div>
        </div>

        {/* Rationale — one line, tied to the MD day */}
        <p className={`text-xs leading-relaxed ${s.text}`}>
          {is ? plan.rationaleIS : plan.rationaleEN}
        </p>

        {/* Readiness-adjusted note — separate from the plan number */}
        {showReadinessNote ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
            <span className="font-semibold">
              {is ? "Readiness í dag: " : "Readiness today: "}
            </span>
            {redCount > 0 ? `${redCount} ${is ? "í rauðu" : "red"}` : ""}
            {redCount > 0 && yellowCount > 0 ? " · " : ""}
            {yellowCount > 0 ? `${yellowCount} ${is ? "í gulu" : "yellow"}` : ""}
            {" — "}
            {is
              ? "íhugaðu neðri mörk áætlaðs álags eða einstaklingsmiðaðar breytingar."
              : "consider the lower end of the planned load, or individualised adjustments."}
          </div>
        ) : null}

        <p className="text-[10px] leading-snug text-slate-400">
          {is
            ? "Viðmið úr microcycle-uppbyggingu (Buchheit o.fl. 2024) — stuðningur við ákvörðun þjálfara, ekki fyrirmæli."
            : "Derived from microcycle structure (Buchheit et al. 2024) — coach decision-support, not a prescription."}
        </p>

        {/* Link to the full Pre-Session report — same microcycle source, expanded
            into per-KPI GPS targets, per-player targets, readiness and a PDF. */}
        <a
          href="/coach/load-plan"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          {is ? "Opna fulla æfingaskýrslu (target, per-leikmann, PDF) →" : "Open full Pre-Session report (targets, per-player, PDF) →"}
        </a>
      </CardContent>
    </Card>
  );
}
