"use client";

/**
 * Coach view — Match hub (tabbed).
 *
 * Collapses the two match-related "Team Planning" sidebar entries — Fixtures and
 * Match minutes — into ONE hub with inline tabs, same pattern as the Load Intelligence
 * hub (docs/tasks/team-planning-prune-brief). Each tab lazily code-splits and mounts the
 * EXISTING page body; both standalone routes (/coach/fixtures, /coach/match-minutes) stay
 * live for deep links / bookmarks and the coach_signals "confirm minutes" chip. No body
 * was rewritten.
 *
 * Why these two belong together: Fixtures is the upstream match-day source (Week setup
 * reads a week's match day from it) and Match minutes is the MD+1 data entry for the same
 * games — both are "the match" seen from the planning side, before and after.
 *
 * Deep-linkable: /coach/match-hub?tab=minutes. Default = Fixtures (the upstream input).
 * force-dynamic because both mounted bodies are force-dynamic + self-fetch.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang";

function TabLoading() {
  const [lang] = useLang();
  return <div className="p-8 text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>;
}

// Lazy, code-split bodies. ssr:false — each is a self-contained "use client" surface
// that resolves its own team from auth, so it only boots client-side, and only when
// its tab is first opened.
const Bodies = {
  fixtures: nextDynamic(() => import("../fixtures/page"), { ssr: false, loading: TabLoading }),
  minutes: nextDynamic(() => import("../match-minutes/page"), { ssr: false, loading: TabLoading }),
} as const;

type TabKey = keyof typeof Bodies;

const TABS: Array<{ key: TabKey; label: { EN: string; IS: string } }> = [
  { key: "fixtures", label: { EN: "Fixtures", IS: "Leikjadagatal" } },
  { key: "minutes", label: { EN: "Match minutes", IS: "Leikmínútur" } },
];

function Hub() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const params = useSearchParams();
  const requested = params.get("tab") as TabKey | null;

  const [active, setActive] = React.useState<TabKey>(
    requested && TABS.some((t) => t.key === requested) ? requested : "fixtures",
  );

  const pick = (t: TabKey) => {
    setActive(t);
    // Deep-link without a reload so the active tab is shareable / bookmarkable.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };

  const ActiveBody = Bodies[active];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
          {isEN ? "Match hub" : "Leikir"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isEN
            ? "The match from the planning side — set the fixtures Week setup reads, then record who played and for how long."
            : "Leikurinn frá skipulagshliðinni — settu leikina sem Vikuskipulag les, og skráðu svo hverjir spiluðu og hve lengi."}
        </p>

        {/* Tab bar */}
        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label={isEN ? "Match hub tabs" : "Leikir flipar"}>
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => pick(t.key)}
                className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  on
                    ? "border-[#2740e6] text-[#2740e6]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {isEN ? t.label.EN : t.label.IS}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab body — only the active one is mounted (lazy). */}
      <div className="min-h-[40vh]">
        <ActiveBody />
      </div>
    </div>
  );
}

export default function MatchHubPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <Hub />
    </Suspense>
  );
}
