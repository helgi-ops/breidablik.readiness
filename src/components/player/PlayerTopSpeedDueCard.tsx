"use client";

/**
 * PlayerTopSpeedDueCard — the player's own "Top speed due" reminder on Today.
 *
 * Shows only when it has been more than 10 days since the player last ran at 90% of their own top speed (more
 * than 21 days = long gap). Same rule and same read as the coach's Today pill (`/api/player/near-max` →
 * `nearMaxExposure`), in the player's voice. Layered: (0) one sentence, (1) 2–3 plain facts + how sure,
 * (2) "behind the numbers" with the top-speed source and the studies.
 *
 * A reminder beside the readiness colour, never it. Silent when there is nothing to say, on any error, and for
 * FREE clubs (the route returns no card).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { NearMaxPlayerCard } from "@/lib/micropulse/nearMaxExposure/playerCopy";

export default function PlayerTopSpeedDueCard({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const [card, setCard] = React.useState<NearMaxPlayerCard | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/player/near-max", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const j = (await res.json()) as { card?: NearMaxPlayerCard | null };
        const c = j?.card;
        if (alive && c && c.verdict && Array.isArray(c.facts) && Array.isArray(c.details)) setCard(c);
      } catch { /* optional card — never break Today */ }
    })();
    return () => { alive = false; };
  }, []);

  if (!card) return null;
  return <TopSpeedDueCardView card={card} lang={lang} />;
}

/** The card itself, given its copy (split out so it can be rendered without a login). */
export function TopSpeedDueCardView({ card, lang = "EN" }: { card: NearMaxPlayerCard; lang?: "IS" | "EN" }) {
  const IS = lang === "IS";
  const pick = (b: { en: string; is: string } | null | undefined) => (b ? (IS ? b.is : b.en) : "");

  return (
    <div data-player-card="top-speed-due" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        <span className="text-sm font-bold text-zinc-900">{pick(card.title)}</span>
        <span
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500"
          title={IS ? "Áminning við hliðina á litnum þínum. Hún breytir honum ekki." : "A reminder beside your colour. It does not change it."}
        >
          {IS ? "Áminning" : "Reminder"}
        </span>
      </div>

      <p className="mt-2 text-[15px] font-semibold leading-snug text-zinc-900">{pick(card.verdict)}</p>

      <ul className="mt-2 space-y-1 text-[13px] leading-snug text-zinc-700">
        {card.facts.map((f, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
            <span>{pick(f)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-zinc-500">{pick(card.confidence)}</p>

      <details className="mt-3 group/behind">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700">
          <span className="transition group-open/behind:rotate-90">▸</span>
          {IS ? "Á bak við tölurnar" : "Behind the numbers"}
        </summary>
        <ul className="mt-2 list-inside list-disc space-y-1 rounded-xl border border-zinc-200 bg-white/70 p-3 text-[11px] leading-relaxed text-zinc-600">
          {card.details.map((d, i) => <li key={i}>{pick(d)}</li>)}
        </ul>
      </details>
    </div>
  );
}
