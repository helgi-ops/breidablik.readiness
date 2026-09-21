"use client";

/**
 * Coach view — Coaching Library hub.
 *
 * One destination for the coach's whole knowledge base: Drills (the existing drill
 * library + session builder), Videos (clips/images/docs, add-by-link or upload), and
 * Meetings (agenda/minutes with drills & videos attached — Phase 2). Consistent with
 * the consolidation direction: one place, not scattered pages.
 *
 * Content/knowledge surface — nothing here reads or writes the readiness verdict, the
 * load target, or the daily decision.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang";
import { getSupabaseClient } from "@/lib/supabaseClient";
import CoachDrillsTab from "@/components/coach/CoachDrillsTab";
import CoachMediaLibrary from "@/components/coach/CoachMediaLibrary";
import CoachMeetings from "@/components/coach/CoachMeetings";

type TabKey = "drills" | "videos" | "meetings";

const TAB_LABEL: Record<TabKey, { EN: string; IS: string }> = {
  drills: { EN: "Drills", IS: "Drillur" },
  videos: { EN: "Videos", IS: "Myndbönd" },
  meetings: { EN: "Meetings", IS: "Fundir" },
};
const TABS: TabKey[] = ["drills", "videos", "meetings"];

export default function CoachLibraryPage() {
  // useSearchParams must sit inside a Suspense boundary (Next CSR-bailout on prerender).
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
      <LibraryHub />
    </Suspense>
  );
}

function LibraryHub() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const params = useSearchParams();
  const requested = params.get("tab") as TabKey | null;

  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [teamSport, setTeamSport] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [active, setActive] = React.useState<TabKey>(requested && TABS.includes(requested) ? requested : "drills");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: auth } = await sb.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) { if (alive) setReady(true); return; }
        const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
        const tid = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        if (tid) {
          const { data: team } = await sb.from("teams").select("sport").eq("id", tid).maybeSingle();
          if (alive) setTeamSport((team as { sport?: string | null } | null)?.sport ?? null);
        }
        if (alive) { setTeamId(tid); setReady(true); }
      } catch { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, []);

  const pick = (t: TabKey) => {
    setActive(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
          {isEN ? "Coaching Library" : "Þjálfarasafn"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isEN ? "Drills, videos and meetings — your whole knowledge base in one place." : "Drillur, myndbönd og fundir — allt á einum stað."}
        </p>
        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => pick(t)}
              className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${active === t ? "border-b-2 border-[#2740e6] text-[#2740e6]" : "text-slate-500 hover:text-slate-700"}`}>
              {TAB_LABEL[t][isEN ? "EN" : "IS"]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[60vh]">
        {!ready ? (
          <div className="p-8 text-sm text-slate-500">{isEN ? "Loading…" : "Hleð…"}</div>
        ) : !teamId ? (
          <div className="p-8 text-sm text-slate-500">{isEN ? "No team context." : "Ekkert lið valið."}</div>
        ) : active === "drills" ? (
          <CoachDrillsTab teamId={teamId} teamSport={teamSport} />
        ) : active === "videos" ? (
          <CoachMediaLibrary teamId={teamId} teamSport={teamSport} />
        ) : (
          <CoachMeetings teamId={teamId} />
        )}
      </div>
    </div>
  );
}
