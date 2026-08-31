"use client";

/**
 * Coach view — Load Intelligence hub (tabbed).
 *
 * Collapses the eight "Load Monitoring" *Intelligence* sidebar entries into ONE hub
 * with real inline tabs, part of the coach-surface consolidation
 * (docs/tasks/load-monitoring-intelligence-consolidation-brief.md;
 * docs/tasks/coach-pages-audit-background-vs-destination.md, step 1). Each tab lazily
 * code-splits and mounts the EXISTING page body — all eight standalone routes are
 * untouched and keep working for deep links / bookmarks; this hub just renders the
 * same self-contained client component inside a tab panel. No body was rewritten.
 *
 * Tier gating is LOAD-BEARING here (more than any other section): the visible tab set
 * is filtered by the SAME rules the sidebar's filterForTier applies, reusing the SAME
 * exported href-sets (LITE_HIDDEN / FULL_HIDDEN / NO_GPS_HIDDEN / basketball keeps) so
 * a tab is shown in the hub exactly when its link showed in the sidebar:
 *   - Lite tier hides Decel / Indoor / IMA (Full-only, B2-3 / IMA premium); basketball
 *     keeps IMA (inertial, works indoors).
 *   - Full tier hides HSR (redundant with the higher-fidelity Decel page).
 *   - No-hardware indoor teams also drop the GPS-only pages (power-curve, quadrant),
 *     except the ones a basketball team has a native version of.
 * The flags are resolved the same way CoachShell resolves them (get_catapult_data_tier
 * RPC + sport + no-GPS-in-30d probe).
 *
 * Deep-linkable: /coach/load-intelligence-hub?tab=decel. Default = first visible tab.
 * force-dynamic because several mounted bodies are force-dynamic + self-fetch.
 *
 * Descriptive load context only — none of the eight ever touches the readiness colour.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import {
  LITE_HIDDEN_HREFS,
  FULL_HIDDEN_HREFS,
  NO_GPS_HIDDEN_HREFS,
  BASKETBALL_KEEP_LITE_HREFS,
  BASKETBALL_KEEP_HREFS,
  BASKETBALL_ONLY_HREFS,
} from "../CoachSidebar";

function TabLoading() {
  const [lang] = useLang();
  return <div className="p-8 text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>;
}

// Lazy, code-split bodies. ssr:false — each is a self-contained "use client" surface
// that resolves its own team from auth, so it only needs to boot client-side, and only
// when its tab is first opened (eight heavy bodies never boot at once).
const Bodies = {
  load: nextDynamic(() => import("../load-intelligence/page"), { ssr: false, loading: TabLoading }),
  powerCurve: nextDynamic(() => import("../power-curve-intelligence/page"), { ssr: false, loading: TabLoading }),
  hsr: nextDynamic(() => import("../hsr-intelligence/page"), { ssr: false, loading: TabLoading }),
  quadrant: nextDynamic(() => import("../quadrant/page"), { ssr: false, loading: TabLoading }),
  indoor: nextDynamic(() => import("../indoor-load/page"), { ssr: false, loading: TabLoading }),
  decel: nextDynamic(() => import("../decel-intelligence/page"), { ssr: false, loading: TabLoading }),
  heartRate: nextDynamic(() => import("../heart-rate-intelligence/page"), { ssr: false, loading: TabLoading }),
  ima: nextDynamic(() => import("../ima-intelligence/page"), { ssr: false, loading: TabLoading }),
} as const;

type TabKey = keyof typeof Bodies;

// Each tab carries the href its sidebar link used, so the SAME gating sets apply.
const TABS: Array<{ key: TabKey; href: string; label: { EN: string; IS: string } }> = [
  { key: "load", href: "/coach/load-intelligence", label: { EN: "Load", IS: "Álag" } },
  { key: "powerCurve", href: "/coach/power-curve-intelligence", label: { EN: "Power Curve", IS: "Afl-kúrfa" } },
  { key: "hsr", href: "/coach/hsr-intelligence", label: { EN: "HSR", IS: "HSR" } },
  { key: "quadrant", href: "/coach/quadrant", label: { EN: "Quadrant", IS: "Quadrant" } },
  { key: "indoor", href: "/coach/indoor-load", label: { EN: "Indoor Load", IS: "Innandyra álag" } },
  { key: "decel", href: "/coach/decel-intelligence", label: { EN: "Decel", IS: "Hraðaminnkun" } },
  { key: "heartRate", href: "/coach/heart-rate-intelligence", label: { EN: "Heart Rate", IS: "Púls" } },
  { key: "ima", href: "/coach/ima-intelligence", label: { EN: "IMA", IS: "IMA" } },
];

type Flags = { tier: "full" | "lite"; noGps: boolean; basketball: boolean };

function Hub() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const params = useSearchParams();
  const requested = params.get("tab");

  const [flags, setFlags] = React.useState<Flags | null>(null);
  const [active, setActive] = React.useState<TabKey | null>(null);

  // Resolve tier / no-GPS / sport exactly as CoachShell does, so the hub's visible
  // tabs match the sidebar's old per-link visibility. Conservative defaults on failure
  // (lite tier is the under-promise default; never hide by guessing no-GPS).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      let tier: "full" | "lite" = "lite";
      let noGps = false;
      let basketball = false;
      try {
        const sb = getSupabaseClient();
        const { data: auth } = await sb.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) { if (alive) setFlags({ tier, noGps, basketball }); return; }
        const { data: prof } = await sb.from("profiles").select("team_id").eq("id", userId).maybeSingle();
        const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        if (!teamId) { if (alive) setFlags({ tier, noGps, basketball }); return; }

        try {
          const { data: tierData } = await sb.rpc("get_catapult_data_tier", { p_team_id: teamId });
          tier = String(tierData ?? "").toLowerCase() === "full" ? "full" : "lite";
        } catch { tier = "lite"; }

        try {
          const sport = await resolveTeamSport(sb, teamId);
          basketball = sport === "basketball";
          const { data: settings } = await sb
            .from("team_settings").select("indoor_mode").eq("team_id", teamId).maybeSingle();
          const indoorIntent =
            sport === "basketball" ||
            (settings as { indoor_mode?: boolean | null } | null)?.indoor_mode === true;
          if (indoorIntent) {
            const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
            const { count } = await sb
              .from("player_external_load_daily")
              .select("player_id", { count: "exact", head: true })
              .eq("team_id", teamId)
              .gte("date", since)
              .gt("total_distance", 0);
            noGps = (count ?? 0) === 0;
          }
        } catch { /* leave noGps/basketball as resolved so far */ }
      } finally {
        if (alive) setFlags({ tier, noGps, basketball });
      }
    })();
    return () => { alive = false; };
  }, []);

  // Tier/sport-filtered tab set — mirrors CoachSidebar.filterForTier for these hrefs.
  const tabs = React.useMemo<TabKey[]>(() => {
    if (!flags) return [];
    const { tier, noGps, basketball } = flags;
    const isLite = tier !== "full";
    return TABS.filter((t) => {
      if (isLite) {
        if (LITE_HIDDEN_HREFS.has(t.href) && !(basketball && BASKETBALL_KEEP_LITE_HREFS.has(t.href))) return false;
      } else if (FULL_HIDDEN_HREFS.has(t.href)) {
        return false;
      }
      if (noGps && NO_GPS_HIDDEN_HREFS.has(t.href) && !(basketball && BASKETBALL_KEEP_HREFS.has(t.href))) return false;
      if (BASKETBALL_ONLY_HREFS.has(t.href) && !basketball) return false;
      return true;
    }).map((t) => t.key);
  }, [flags]);

  // Once the tab set is known, pick the initial tab: the requested one if valid, else first.
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
    // max-w-6xl matches the sibling load pages (decel / hsr / quadrant / indoor / heart-rate)
    // so the hub chrome and every mounted tab render at one consistent width.
    <div className="mx-auto w-full max-w-6xl">
      <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
          {isEN ? "Load Intelligence" : "Álagsgreining"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isEN
            ? "Every load, decel, HSR, heart-rate and IMA read for the squad — one hub. Descriptive context; it never changes the readiness verdict."
            : "Allar álags-, hraðaminnkunar-, HSR-, púls- og IMA-greiningar liðsins — einn staður. Lýsandi; breytir aldrei readiness-dómnum."}
        </p>

        {/* Tab bar */}
        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label={isEN ? "Load Intelligence tabs" : "Álagsgreining flipar"}>
          {tabs.map((t) => {
            const meta = TABS.find((x) => x.key === t)!;
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
                {isEN ? meta.label.EN : meta.label.IS}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab body — only the active one is mounted (lazy). */}
      <div className="min-h-[40vh]">
        {flags === null || active === null ? <TabLoading /> : ActiveBody ? <ActiveBody /> : null}
      </div>
    </div>
  );
}

export default function LoadIntelligenceHubPage() {
  return (
    <Suspense fallback={<TabLoading />}>
      <Hub />
    </Suspense>
  );
}
