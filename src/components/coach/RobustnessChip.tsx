"use client";

/**
 * RobustnessChip — the injury early-warning (Robustness watch #5) as a compact chip BESIDE the readiness
 * colour on a player card / drawer. Shows the WORD level (steady / watch / elevated), never a colour and
 * never the readiness verdict; the verdict + counterfactual are the tooltip, and it links to the full
 * /coach/readiness-signals page as the drill-down "why". Advisory / performance-only — it reads signals
 * to warn, it never sets or overrides the readiness colour.
 *
 * Reads the same per-player endpoint the RobustnessWatchCard uses (rules compute the level). Renders
 * nothing while loading, on error, or when there's no data — so it's silent until there's something to say.
 */

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { RobustnessLevel, RobustnessWatch } from "@/lib/micropulse/robustnessWatch";

type Resp = { ok: boolean; name: string | null; watch: RobustnessWatch };

const TONE: Record<RobustnessLevel, { dot: string; bg: string; text: string }> = {
  steady:   { dot: "#1c7a4a", bg: "#eaf3ee", text: "#1c7a4a" },
  watch:    { dot: "#de9328", bg: "#fbf0dc", text: "#a86f14" },
  elevated: { dot: "#a83e28", bg: "#f6e7e1", text: "#a83e28" },
};
const WORD: Record<RobustnessLevel, { en: string; is: string }> = {
  steady:   { en: "Steady",   is: "Stöðug" },
  watch:    { en: "Watch",    is: "Fylgstu með" },
  elevated: { en: "Elevated", is: "Hækkað" },
};

export default function RobustnessChip({ playerId, lang, date, className = "" }: { playerId: string; lang: "EN" | "IS"; date?: string; className?: string }) {
  const is = lang === "IS";
  const [watch, setWatch] = React.useState<RobustnessWatch | null>(null);
  React.useEffect(() => {
    if (!playerId) { setWatch(null); return; }
    let alive = true;
    (async () => {
      try {
        const { data: sess } = await getSupabaseClient().auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const qs = date ? `?date=${encodeURIComponent(date)}` : "";
        const res = await fetch(`/api/coach/player/${playerId}/robustness-watch${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (alive && res.ok && j?.ok && j.watch) setWatch(j.watch);
        else if (alive) setWatch(null);
      } catch { if (alive) setWatch(null); }
    })();
    return () => { alive = false; };
  }, [playerId, date]);

  if (!watch) return null;
  const t = TONE[watch.level];
  const label = is ? WORD[watch.level].is : WORD[watch.level].en;
  const tip = [
    is ? watch.verdict.is : watch.verdict.en,
    watch.counterfactual ? (is ? watch.counterfactual.is : watch.counterfactual.en) : "",
    `${is ? "vissa" : "confidence"}: ${watch.confidence}`,
  ].filter(Boolean).join("\n");

  return (
    <Link
      href="/coach/readiness-signals"
      title={tip}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ background: t.bg, color: t.text }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
      {is ? "Álagsþol" : "Robustness"}: {label}
    </Link>
  );
}
