"use client";

/**
 * PlayerDecisionDrawer — Lota B / Fasi 2, step B4.
 *
 * The head-coach per-player read: a slide-in drawer that opens when the coach
 * clicks a player (in the attention list or the group table — including a green
 * one). It is the explainability-first layered read for a single athlete:
 *
 *   (0) verdict colour + one-line status at the top,
 *   (1) the plain "why" (2–3 supporting facts + counterfactual) without a click,
 *   (2) an Unfamiliar-load banner (today vs the player's own usual, with the
 *       ≥70%-above → RED colour rule), confidence, and injury/delta context.
 *
 * Raw S&C detail stays behind "Show details — S&C" (the existing rich modal,
 * wired by the caller). Presentational only — the dashboard maps its already-
 * computed attention/composite data onto these props (no new data, no new API).
 */

import { useEffect } from "react";

export type DrawerColor = "GREEN" | "YELLOW" | "RED" | "GRAY";

export type DecisionDrawerData = {
  playerId: string;
  name: string;
  position?: string | null;
  /** Canonical verdict colour (from the same source the dashboard shows). */
  color: DrawerColor;
  /** One-line coach-friendly status, e.g. "Heavy training load". */
  verdictLabel: string;
  /** The plain "why" — 1–2 sentences, no jargon. */
  why?: string | null;
  /** Supporting facts (attentionReason) — shown as a short list. */
  reasons?: string[];
  /** Unfamiliar load — today vs the player's own usual. spike is a ratio
   *  (1.7 = +70%). Drives the banner + the ≥70%→RED colour rule. */
  load?: {
    spike: number | null;
    breakdown?: Array<{ label: string; value: number }>;
    /** Post-match echo — a spike here is expected, not an overreach. */
    postMatch?: boolean;
  } | null;
  /** The single lever that would change today's verdict. */
  counterfactual?: {
    hypotheticalState: DrawerColor;
    description: string;
  } | null;
  /** Verdict confidence — coverage + freshness of the inputs. */
  confidence?: {
    level: "high" | "moderate" | "low";
    signalCount: number;
    signalTotal: number;
    notes?: string[];
  } | null;
  /** How mature the personal norm behind the verdict is. */
  baselineMaturity?: { obs: number; windowDays: number } | null;
  /** Active injury — leads the read when present. */
  injury?: { kind: "injured" | "rehab" | "rtp"; badge: string; detail: string } | null;
  /** Day-over-day change — the most actionable single morning signal. */
  delta?: { kind: "new" | "worse" | "better" | "same"; summary: string } | null;
};

export type PlayerDecisionDrawerProps = {
  lang: "IS" | "EN";
  open: boolean;
  data: DecisionDrawerData | null;
  onClose: () => void;
  /** "Show details — S&C" — opens the existing rich S&C modal. When omitted the
   *  button is hidden (wired in step B4b). */
  onShowScDetails?: (playerId: string) => void;
};

const COLOR: Record<DrawerColor, { bg: string; fg: string; soft: string; label: { EN: string; IS: string } }> = {
  GREEN: { bg: "#1c7a4a", fg: "#1c7a4a", soft: "#eaf3ec", label: { EN: "Ready", IS: "Klár" } },
  YELLOW: { bg: "#de9328", fg: "#9a6410", soft: "#faf1de", label: { EN: "Modified", IS: "Breytt" } },
  RED: { bg: "#a83e28", fg: "#a83e28", soft: "#f8e9e3", label: { EN: "Recovery", IS: "Hvíld" } },
  GRAY: { bg: "#8a8f8c", fg: "#6b7280", soft: "#f1f1ef", label: { EN: "No verdict", IS: "Enginn úrskurður" } },
};

const CONF: Record<"high" | "moderate" | "low", { en: string; is: string }> = {
  high: { en: "High confidence", is: "Hátt traust" },
  moderate: { en: "Medium confidence", is: "Miðlungs traust" },
  low: { en: "Low confidence", is: "Lágt traust" },
};

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Unfamiliar-load bander: the ≥70%-above-usual → RED rule (handoff B4).
 *  Below that, an elevated spike (≥15%) is amber; anything else is in-line. */
function loadBand(spike: number | null): { tone: DrawerColor; en: string; is: string } | null {
  if (spike == null) return null;
  const pct = Math.round((spike - 1) * 100);
  if (spike >= 1.7) {
    return {
      tone: "RED",
      en: `Today's load is ${pct}% above his usual — well above.`,
      is: `Álag í dag er ${pct}% yfir venju hans — langt yfir.`,
    };
  }
  if (spike >= 1.15) {
    return {
      tone: "YELLOW",
      en: `Today's load is ${pct}% above his usual — elevated.`,
      is: `Álag í dag er ${pct}% yfir venju hans — yfir venju.`,
    };
  }
  if (pct <= -15) {
    return {
      tone: "GRAY",
      en: `Today's load is ${Math.abs(pct)}% below his usual.`,
      is: `Álag í dag er ${Math.abs(pct)}% undir venju hans.`,
    };
  }
  return {
    tone: "GREEN",
    en: `Today's load is in line with his usual.`,
    is: `Álag í dag er í takt við venju hans.`,
  };
}

export default function PlayerDecisionDrawer({ lang, open, data, onClose, onShowScDetails }: PlayerDecisionDrawerProps) {
  const isIS = lang === "IS";

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !data) return null;

  const c = COLOR[data.color];
  const band = loadBand(data.load?.spike ?? null);
  const bandTone = band ? COLOR[band.tone] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={data.name}
    >
      <div
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colour rail */}
        <div className="h-1.5 w-full" style={{ background: c.bg }} />

        {/* Header — Layer 0: verdict at a glance */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: c.soft, color: c.fg }}
            >
              {initials(data.name)}
            </span>
            <div className="min-w-0">
              <h2 className="stat-number truncate text-lg font-bold leading-tight text-zinc-900">{data.name}</h2>
              {data.position ? <div className="text-xs font-medium text-zinc-400">{data.position}</div> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            aria-label={isIS ? "Loka" : "Close"}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Verdict pill + injury + delta */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: c.soft, color: c.fg }}>
            {isIS ? c.label.IS : c.label.EN}
          </span>
          <span className="text-sm font-semibold text-zinc-600">{data.verdictLabel}</span>
          {data.injury ? (
            <span className="rounded-full bg-[#efe8fb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7a5cc4]">
              {data.injury.badge}
            </span>
          ) : null}
          {data.delta ? (
            <span className="text-[11px] font-medium text-zinc-400">{data.delta.summary}</span>
          ) : null}
        </div>

        {/* Layer 1: plain why */}
        {data.why ? (
          <div className="mx-5 mt-3 rounded-xl bg-zinc-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-zinc-700">{data.why}</p>
          </div>
        ) : null}

        {data.reasons?.length ? (
          <ul className="mx-5 mt-3 space-y-1.5">
            {data.reasons.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-700">
                <span className="mt-0.5 shrink-0 text-zinc-400" aria-hidden>•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Unfamiliar-load banner — its own band, with the ≥70%→RED rule */}
        {band && bandTone ? (
          <div
            className="mx-5 mt-4 rounded-xl border px-4 py-3"
            style={{ background: bandTone.soft, borderColor: `${bandTone.fg}33` }}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: bandTone.fg }}>
              {isIS ? "ÓVANALEGT ÁLAG" : "UNFAMILIAR LOAD"}
            </div>
            <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-800">
              {isIS ? band.is : band.en}
              {data.load?.postMatch ? (
                <span className="text-zinc-500"> {isIS ? "(eftir leik — búist við)" : "(post-match — expected)"}</span>
              ) : null}
            </p>
            {data.load?.breakdown?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.load.breakdown.slice(0, 4).map((b, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                  >
                    {b.label} ·{" "}
                    <span className="font-semibold tabular-nums">{Math.round((b.value - 1) * 100)}%</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Counterfactual — the lever */}
        {data.counterfactual ? (
          <div className="mx-5 mt-4 rounded-xl border border-[#d4dcfb] bg-[#eef1fe] px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2740e6]">
              {isIS ? "HVAÐ MYNDI BREYTA ÞESSU" : "WHAT WOULD CHANGE THIS"}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-zinc-800">{data.counterfactual.description}</p>
          </div>
        ) : null}

        {/* Confidence + baseline */}
        {data.confidence ? (
          <div className="mx-5 mt-4 border-t border-zinc-100 pt-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
              <span className="font-semibold text-zinc-600">
                {isIS ? CONF[data.confidence.level].is : CONF[data.confidence.level].en}
              </span>
              <span className="text-zinc-300">·</span>
              <span>
                {data.confidence.signalCount}/{data.confidence.signalTotal} {isIS ? "merki" : "signals"}
              </span>
              {data.baselineMaturity ? (
                <>
                  <span className="text-zinc-300">·</span>
                  <span>
                    {isIS ? "grunnlína" : "baseline"} {data.baselineMaturity.obs}
                    {isIS ? " daga" : "d"}/{data.baselineMaturity.windowDays}
                    {isIS ? " daga" : "d"}
                  </span>
                </>
              ) : null}
            </div>
            {data.confidence.notes?.length ? (
              <div className="mt-1 text-[11px] leading-snug text-zinc-400">{data.confidence.notes.join(" · ")}</div>
            ) : null}
          </div>
        ) : null}

        {/* Injury detail */}
        {data.injury?.detail ? (
          <div className="mx-5 mt-3 rounded-xl bg-[#f6f2fd] px-4 py-2.5 text-xs text-[#5b4794]">
            <span className="font-semibold">{data.injury.badge}</span> · {data.injury.detail}
          </div>
        ) : null}

        {/* Layer 2 entry — Show details (S&C). Wired by the caller in B4b. */}
        {onShowScDetails ? (
          <div className="mt-auto px-5 py-4">
            <button
              type="button"
              onClick={() => onShowScDetails(data.playerId)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              {isIS ? "Sýna nánar — S&C" : "Show details — S&C"}
              <span aria-hidden>→</span>
            </button>
          </div>
        ) : (
          <div className="h-4" />
        )}
      </div>
    </div>
  );
}
