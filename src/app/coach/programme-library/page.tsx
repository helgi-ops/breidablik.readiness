"use client";

/**
 * Coach view — Programme library (tabbed hub).
 *
 * Collapses six sidebar entries into ONE hub with real inline tabs, part of the
 * coach-surface consolidation (docs/tasks/coach-pages-audit-background-vs-destination.md,
 * step 1). Each tab lazily code-splits and mounts the EXISTING page body — the six
 * standalone routes are untouched and keep working for deep links / bookmarks; this
 * hub just renders the same self-contained client component inside a tab panel. No
 * body was rewritten.
 *
 * The visible tab set depends on mode (teams.team_type), mirroring the sidebar's
 * football-coach vs personal-trainer split:
 *   - football coach: Programmes · Custom · Isometric · Recovery
 *   - personal trainer: Starter · Custom · Exercise library
 * PT-only tabs are never shown to a football coach and vice-versa.
 *
 * Deep-linkable: /coach/programme-library?tab=custom. Default = first tab for the
 * mode. force-dynamic because several mounted bodies are force-dynamic + self-fetch.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang";
import { getSupabaseClient } from "@/lib/supabaseClient";

function TabLoading() {
  const [lang] = useLang();
  return <div className="p-8 text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>;
}

// Lazy, code-split bodies. ssr:false — each is a self-contained "use client"
// surface that resolves its own team from auth, so it only needs to boot client-
// side, and only when its tab is first opened (six heavy bodies never boot at once).
const Bodies = {
  programmes: nextDynamic(() => import("../templates/page"), { ssr: false, loading: TabLoading }),
  custom: nextDynamic(() => import("../custom-templates/page"), { ssr: false, loading: TabLoading }),
  isometric: nextDynamic(() => import("../isometric-protocols/page"), { ssr: false, loading: TabLoading }),
  recovery: nextDynamic(() => import("../recovery-protocols/page"), { ssr: false, loading: TabLoading }),
  starter: nextDynamic(() => import("../starter-templates/page"), { ssr: false, loading: TabLoading }),
  exercises: nextDynamic(() => import("../my-exercises/page"), { ssr: false, loading: TabLoading }),
} as const;

type TabKey = keyof typeof Bodies;

const TAB_LABEL: Record<TabKey, { EN: string; IS: string }> = {
  programmes: { EN: "Programmes", IS: "Prógrömm" },
  custom: { EN: "Custom programmes", IS: "Sérsniðin prógramm" },
  isometric: { EN: "Isometric protocols", IS: "Ísómetrísk prótocol" },
  recovery: { EN: "Recovery protocols", IS: "Recovery protocols" },
  starter: { EN: "Starter templates", IS: "Tilbúin kerfi" },
  exercises: { EN: "Exercise library", IS: "Æfingasafn" },
};

// Mode-gated tab sets (order mirrors the two sidebar arrays).
const FOOTBALL_TABS: TabKey[] = ["programmes", "custom", "isometric", "recovery"];
const PT_TABS: TabKey[] = ["starter", "custom", "exercises"];

function Hub() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const params = useSearchParams();
  const requested = params.get("tab");

  const [isPt, setIsPt] = React.useState<boolean | null>(null);
  const [active, setActive] = React.useState<TabKey | null>(null);

  // Resolve mode (football coach vs personal trainer) — same source the sidebar
  // uses: profiles.team_id -> teams.team_type.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: auth } = await sb.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) { if (alive) setIsPt(false); return; }
        const { data: prof } = await sb.from("profiles").select("team_id").eq("id", userId).maybeSingle();
        const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        if (!teamId) { if (alive) setIsPt(false); return; }
        const { data: team } = await sb.from("teams").select("team_type").eq("id", teamId).maybeSingle();
        const tt = String((team as { team_type?: string | null } | null)?.team_type ?? "").toLowerCase();
        if (alive) setIsPt(tt === "personal_trainer");
      } catch {
        if (alive) setIsPt(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const tabs = React.useMemo<TabKey[]>(() => (isPt === null ? [] : isPt ? PT_TABS : FOOTBALL_TABS), [isPt]);

  // Once the mode (and thus the tab set) is known, pick the initial tab: the
  // requested one if valid for this mode, else the first available.
  React.useEffect(() => {
    if (active != null || !tabs.length) return;
    const wanted = requested as TabKey | null;
    setActive(wanted && tabs.includes(wanted) ? wanted : tabs[0]);
  }, [tabs, requested, active]);

  const pick = (t: TabKey) => {
    setActive(t);
    // Deep-link without a reload so the active tab is shareable / bookmarkable.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };

  const ActiveBody = active ? Bodies[active] : null;

  return (
    <div className="w-full">
      <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
          {isEN ? "Programme library" : "Prógrammasafn"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isEN
            ? "Your S&C programmes, custom builds, and protocol libraries — all in one place."
            : "S&C prógrömmin þín, sérsniðnar smíðar og prótocol-söfn — allt á einum stað."}
        </p>

        {/* Tab bar */}
        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label={isEN ? "Programme library tabs" : "Prógrammasafn flipar"}>
          {tabs.map((t) => {
            const on = t === active;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={on}
                onClick={() => pick(t)}
                className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  on
                    ? "border-violet-500 text-violet-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
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
        {isPt === null || active === null ? <TabLoading /> : ActiveBody ? <ActiveBody /> : null}
      </div>
    </div>
  );
}

export default function ProgrammeLibraryPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <Hub />
    </Suspense>
  );
}
