"use client";

/**
 * Coach view — Strength Training Hub (tabbed hub).
 *
 * One home for strength planning, which was scattered across /coach/strength (+ its folded-in
 * training-programme Week tab), /coach/plan-builder, /coach/programme-library, and /coach/lv-profile.
 * Same proven pattern as programme-library: each tab lazily code-splits and mounts the EXISTING,
 * self-contained page body — the standalone routes are untouched and keep working for deep links,
 * the player week view, and the admin flows. No body was rewritten, no second copy.
 *
 * Readiness- and microcycle-connected: the SYSTEM reads readiness + the microcycle to deliver the
 * dose (unchanged spine); this hub is where the strength coach PLANS. The "Build rules" tab (where
 * the coach sets how the build is structured) is a placeholder in Phase 1 and becomes the real
 * editor in Phase 2. Content/planning surface — never the readiness colour or the daily decision.
 *
 * Deep-linkable: /coach/strength-hub?tab=builder. force-dynamic because the mounted bodies are
 * force-dynamic + self-fetch.
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

// Lazy, code-split bodies. ssr:false — each is a self-contained "use client" surface that resolves
// its own team from auth, so it boots client-side only when its tab is first opened.
const Bodies = {
  send: nextDynamic(() => import("../strength/page"), { ssr: false, loading: TabLoading }),
  builder: nextDynamic(() => import("../plan-builder/page"), { ssr: false, loading: TabLoading }),
  library: nextDynamic(() => import("../programme-library/page"), { ssr: false, loading: TabLoading }),
  profiles: nextDynamic(() => import("../lv-profile/page"), { ssr: false, loading: TabLoading }),
  rules: nextDynamic(() => import("../strength-rules/page"), { ssr: false, loading: TabLoading }),
} as const;

type TabKey = keyof typeof Bodies;

const TAB_LABEL: Record<TabKey, { EN: string; IS: string }> = {
  send: { EN: "Today & send", IS: "Í dag & senda" },
  builder: { EN: "Plan builder", IS: "Kerfasmiður" },
  library: { EN: "Programme library", IS: "Prógrammasafn" },
  profiles: { EN: "Load-Velocity", IS: "Kraft-/hraðapróf" },
  rules: { EN: "Build rules", IS: "Uppbyggingar-reglur" },
};
const TABS: TabKey[] = ["send", "builder", "library", "profiles", "rules"];

function Hub() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const params = useSearchParams();
  const requested = params.get("tab") as TabKey | null;

  const [active, setActive] = React.useState<TabKey>(requested && TABS.includes(requested) ? requested : "send");

  const pick = (t: TabKey) => {
    setActive(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url.toString());
    } catch { /* deep-link sync is best-effort */ }
  };

  const ActiveBody = Bodies[active];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
          {isEN ? "Strength Training" : "Styrktarþjálfun"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isEN
            ? "Plan the strength build in one place — the system reads readiness + the microcycle, you set the rules."
            : "Skipuleggðu styrktaruppbygginguna á einum stað — kerfið les readiness + míkró-lotuna, þú setur reglurnar."}
        </p>

        {/* Tab bar */}
        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label={isEN ? "Strength hub tabs" : "Styrktar-hub flipar"}>
          {TABS.map((t) => {
            const on = t === active;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={on}
                onClick={() => pick(t)}
                className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  on ? "border-violet-500 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {isEN ? TAB_LABEL[t].EN : TAB_LABEL[t].IS}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab body — only the active one is mounted (lazy). */}
      <div className="min-h-[40vh]">
        {ActiveBody ? <ActiveBody /> : null}
      </div>
    </div>
  );
}

export default function StrengthHubPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <Hub />
    </Suspense>
  );
}
