"use client";

/**
 * Coach signal chips — the Today briefing's background-signal row (coach-pages-
 * audit-background-vs-destination.md). Reads /api/coach/signals (the coach_signals
 * cache) and renders a chip ONLY for signals whose level !== "steady": matchday
 * fit, session-vs-plan, and the "confirm MD+1 minutes" task. Each chip opens its
 * drill-down page. Exception-gated + conservative — silent when nothing needs the
 * coach. ADVISORY: sits beside the readiness colour, never becomes it.
 */

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Bi = { en: string; is: string };
type Signal = {
  engine: string;
  level: "steady" | "watch" | "elevated" | "task";
  label: Bi;
  why: { en: string[]; is: string[] };
  confidence: "high" | "moderate" | "low" | null;
  counterfactual: Bi | null;
  href: string;
  playerId?: string | null;
};

const LEVEL_STYLE: Record<string, { chip: string; dot: string }> = {
  elevated: { chip: "border-[#e6c9c0] bg-[#f6e2dc] text-[#a83e28]", dot: "#a83e28" },
  watch: { chip: "border-[#efdcb8] bg-[#fbf0dc] text-[#a86f14]", dot: "#de9328" },
  task: { chip: "border-[#c9d0f7] bg-[#eef0fb] text-[#2740e6]", dot: "#2740e6" },
  steady: { chip: "border-zinc-200 bg-white text-zinc-500", dot: "#a9a493" },
};

export default function CoachSignalChips({ teamId, lang, signals: provided }: { teamId: string | null; lang: "EN" | "IS"; signals?: Signal[] | null }) {
  const isEN = lang !== "IS";
  const [fetched, setFetched] = React.useState<Signal[] | null>(null);

  // When the parent already fetched /api/coach/signals it passes them in (one
  // fetch for the whole Today page — the endpoint's first call triggers the
  // day's compute, so a single caller avoids a redundant delete+insert race).
  // Falls back to self-fetching when mounted standalone.
  React.useEffect(() => {
    if (provided !== undefined) return;
    if (!teamId) { setFetched(null); return; }
    let alive = true;
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) return;
      const res = await fetch("/api/coach/signals", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()).catch(() => null);
      if (alive) setFetched(res?.ok ? (res.signals as Signal[]) : null);
    })();
    return () => { alive = false; };
  }, [teamId, provided]);

  const signals = provided !== undefined ? provided : fetched;
  // Team-level chips only (per-player signals render inside the attention rows).
  const actionable = (signals ?? []).filter((s) => s.level !== "steady" && !s.playerId);
  if (actionable.length === 0) return null; // silent unless something needs the coach

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actionable.map((s) => {
        const st = LEVEL_STYLE[s.level] ?? LEVEL_STYLE.watch;
        const why = (isEN ? s.why.en : s.why.is)[0] ?? "";
        const title = [...(isEN ? s.why.en : s.why.is), s.counterfactual ? (isEN ? s.counterfactual.en : s.counterfactual.is) : ""].filter(Boolean).join("\n");
        return (
          <Link key={s.engine} href={s.href} title={title}
            className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:brightness-[0.98] ${st.chip}`}>
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: st.dot }} />
            <span className="font-semibold">{isEN ? s.label.en : s.label.is}</span>
            {why ? <span className="opacity-80">· {why}</span> : null}
            <span className="opacity-60 transition group-hover:translate-x-0.5">→</span>
          </Link>
        );
      })}
    </div>
  );
}
