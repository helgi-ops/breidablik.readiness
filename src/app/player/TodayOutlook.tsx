"use client";

/**
 * Today's field-session outlook — the microcycle load forecast for the player's
 * PITCH/football session (band + intensity, ~duration, focus, % of a match, the
 * personal MD-x usual, and a plain principle reason). Data from
 * /api/player/today-load (shared source with the coach Pre-session report), so
 * the player's outlook can never disagree with the coach plan.
 *
 * The full card lives on /player/sessions (co-located with the coach-posted
 * session); the Today tab shows a compact teaser that links across. Presentational
 * pieces here are fetch-free; `SessionsTodayOutlook` self-fetches for the
 * sessions page. Descriptive / anticipatory — never the readiness colour.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type TodayLoad = {
  show: boolean;
  matchDay: boolean;
  mdLabel: string | null;
  band: "light" | "moderate" | "high" | "very_high";
  loadType: "mechanical" | "locomotive" | "mixed";
  durationMin: number;
  matchPct: number;
  rationaleEN: string;
  rationaleIS: string;
  personalTarget: number | null;
  personalN: number;
  flag: "ok" | "build" | "reduce" | null;
  eased: "yellow" | "red" | null;
};

export const LOAD_BAND: Record<TodayLoad["band"], { pct: number; en: string; is: string; color: string }> = {
  light:     { pct: 30,  en: "Easy",      is: "Létt",        color: "#2b8a54" },
  moderate:  { pct: 55,  en: "Moderate",  is: "Miðlungs",    color: "#2740e6" },
  high:      { pct: 80,  en: "Hard",      is: "Erfitt",      color: "#de9328" },
  very_high: { pct: 100, en: "Very hard", is: "Mjög erfitt", color: "#a83e28" },
};
const LOAD_FOCUS: Record<TodayLoad["loadType"], { en: string; is: string }> = {
  mechanical: { en: "force", is: "kraftur" },
  locomotive: { en: "speed", is: "hraði" },
  mixed:      { en: "mixed", is: "blandað" },
};
const LOAD_FLAG: Record<"ok" | "build" | "reduce", { en: string; is: string; cls: string }> = {
  ok:     { en: "on track",      is: "á áætlun",              cls: "bg-emerald-50 text-emerald-700" },
  build:  { en: "room to build", is: "svigrúm til að byggja", cls: "bg-sky-50 text-sky-700" },
  reduce: { en: "ease back",     is: "taktu af",              cls: "bg-amber-50 text-amber-700" },
};

/** "MD-3" → "3 days to match"; "MD" → "match day"; "MD+1" → "1 day since match". */
export function mdGloss(mdLabel: string | null, is: boolean): string | null {
  if (!mdLabel) return null;
  const s = mdLabel.toUpperCase().replace(/\s+/g, "");
  if (s === "MD" || s === "MD0") return is ? "leikdagur" : "match day";
  const m = s.match(/^MD([+-])(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  if (m[1] === "-") return n === 1 ? (is ? "leikur á morgun" : "match tomorrow") : (is ? `${n} dagar í leik` : `${n} days to match`);
  return n === 1 ? (is ? "1 dagur frá leik" : "1 day since match") : (is ? `${n} dagar frá leik` : `${n} days since match`);
}

/** Full outlook card (presentational — no fetch, no portal). */
export function TodayOutlookCard({ data, is, accent = "#2b8a54" }: { data: TodayLoad; is: boolean; accent?: string }) {
  if (data.matchDay) {
    return (
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-[#faf7f0] p-4 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <span aria-hidden>⚽</span>{is ? "ÆFING DAGSINS" : "TODAY'S SESSION"}
        </div>
        <div className="mt-1.5 text-xl font-bold tracking-tight text-zinc-900">{is ? "Leikdagur! 🔥" : "Match day! 🔥"}</div>
        <div className="mt-1 text-sm leading-relaxed text-zinc-600">{is ? "Í dag er leikur — engin áætluð æfing. Gefðu allt." : "It's match day — no planned training. Leave it all out there."}</div>
      </div>
    );
  }

  const b = LOAD_BAND[data.band];
  const focus = LOAD_FOCUS[data.loadType];
  const gloss = mdGloss(data.mdLabel, is);
  const flag = data.flag ? LOAD_FLAG[data.flag] : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-[#faf7f0] p-4 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span className="flex items-center gap-1.5"><span aria-hidden>📋</span>{is ? "ÁÆTLUN DAGSINS" : "TODAY'S OUTLOOK"}</span>
        {data.mdLabel && <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-600">{data.mdLabel}{gloss ? ` · ${gloss}` : ""}</span>}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold tracking-tight text-zinc-900">{is ? b.is : b.en}</span>
        <span className="text-sm text-zinc-500">· ~{data.durationMin} {is ? "mín" : "min"}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.color }} />
      </div>

      <div className="mt-2 text-sm text-zinc-700">
        <span className="text-zinc-400">{is ? "Áhersla: " : "Focus: "}</span>{is ? focus.is : focus.en}
        <span className="text-zinc-400"> · </span>{is ? `~${data.matchPct}% af leik` : `~${data.matchPct}% of a match`}
      </div>

      {data.personalTarget != null && (
        <div className="mt-2 border-t border-zinc-200/70 pt-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-600">{is ? `Á ${data.mdLabel} dögum ferðu venjulega í` : `On ${data.mdLabel} days you usually do`}</span>
            <span className="font-semibold text-zinc-900">~{data.personalTarget}</span>
            {flag && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${flag.cls}`}>{is ? flag.is : flag.en}</span>}
          </div>
          {data.personalN > 0 && (
            <div className="mt-0.5 text-[10px] text-zinc-400">{is ? `úr ${data.personalN} ${data.mdLabel}-æfingum` : `from ${data.personalN} past ${data.mdLabel} sessions`}</div>
          )}
        </div>
      )}
      {data.eased && (
        <div className="mt-1 text-xs leading-snug text-amber-700">
          {is ? "Aðeins minnkað miðað við líðan þína í dag." : "Eased a little for how you're feeling today."}
        </div>
      )}

      <div className="mt-2 text-[11px] leading-snug text-zinc-500">{is ? data.rationaleIS : data.rationaleEN}</div>
    </div>
  );
}

/** Compact one-line teaser for the Today tab (caller wraps in a link to /player/sessions). */
export function TodayOutlookTeaser({ data, is }: { data: TodayLoad; is: boolean }) {
  if (data.matchDay) {
    return (
      <span className="flex items-center gap-2">
        <span aria-hidden>⚽</span>
        <span className="font-semibold text-zinc-900">{is ? "Leikdagur" : "Match day"}</span>
      </span>
    );
  }
  const b = LOAD_BAND[data.band];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span aria-hidden>⚽</span>
      <span className="font-semibold text-zinc-900">{is ? "Vallaræfing í dag" : "Pitch session today"}</span>
      <span className="text-zinc-400">·</span>
      <span className="font-semibold" style={{ color: b.color }}>{is ? b.is : b.en}</span>
      <span className="text-zinc-500">· ~{data.durationMin} {is ? "mín" : "min"}</span>
      {data.mdLabel && <span className="truncate text-zinc-400">· {data.mdLabel}</span>}
    </span>
  );
}

/** Self-fetching full card for /player/sessions. Self-hides on off-days / no plan. */
export function SessionsTodayOutlook({ is, accent }: { is: boolean; accent?: string | null }) {
  const [data, setData] = useState<TodayLoad | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/player/today-load", { headers: { Authorization: `Bearer ${token}` } });
        const j = (await res.json()) as TodayLoad;
        if (!cancelled && res.ok && j?.show) setData(j);
      } catch {
        /* optional card — never break the page */
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (!data?.show) return null;
  return (
    <div className="mb-4">
      <TodayOutlookCard data={data} is={is} accent={accent ?? undefined} />
    </div>
  );
}
