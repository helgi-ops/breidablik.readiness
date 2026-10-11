"use client";

/**
 * The whole Coaching Library (Drills · Videos · Meetings) as ONE reusable component, mounted
 * both at the standalone route `/coach/library` AND inside the coach Today dashboard's Library
 * tab. One source of truth — a drill/video/session added in one place appears in the other,
 * because it IS the same component.
 *
 * Embedding note: the inner tab is URL-synced under a CONFIGURABLE param (`syncParam`). The
 * standalone route uses the bare `?tab=`; the Today embed passes a distinct key (e.g. `libtab`)
 * so it never clobbers the dashboard's own `?tab=` (which drives the outer dashboard tab).
 *
 * Content/knowledge surface — nothing here reads or writes the readiness verdict, the load
 * target, or the daily decision.
 */

import * as React from "react";
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

export default function CoachingLibrary({
  teamId: teamIdProp,
  teamSport: teamSportProp,
  syncParam = "tab",
  showHeader = true,
}: {
  /** When provided (incl. null), the parent owns team context; otherwise the component self-resolves. */
  teamId?: string | null;
  teamSport?: string | null;
  /** URL param the inner Drills/Videos/Meetings tab syncs to. Pass a distinct key when embedded; null = no URL sync. */
  syncParam?: string | null;
  /** The big title block (standalone shows it; the Today embed hides it — the tab already titles it). */
  showHeader?: boolean;
}) {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const params = useSearchParams();
  const requested = (syncParam ? params.get(syncParam) : null) as TabKey | null;

  // Self-resolve team context only when the parent didn't hand it in.
  const provided = teamIdProp !== undefined;
  const [teamId, setTeamId] = React.useState<string | null>(teamIdProp ?? null);
  const [teamSport, setTeamSport] = React.useState<string | null>(teamSportProp ?? null);
  const [ready, setReady] = React.useState<boolean>(provided);
  const [active, setActive] = React.useState<TabKey>(requested && TABS.includes(requested) ? requested : "drills");

  React.useEffect(() => {
    if (provided) { setTeamId(teamIdProp ?? null); setTeamSport(teamSportProp ?? null); setReady(true); return; }
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
  }, [provided, teamIdProp, teamSportProp]);

  const pick = (t: TabKey) => {
    setActive(t);
    if (!syncParam) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(syncParam, t);
      window.history.replaceState(null, "", url.toString());
    } catch { /* URL sync is best-effort */ }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
        {showHeader && (
          <>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
              {isEN ? "Coaching Library" : "Þjálfarasafn"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isEN ? "Drills, videos and meetings — your whole knowledge base in one place." : "Drillur, myndbönd og fundir — allt á einum stað."}
            </p>
          </>
        )}
        <div className={`flex gap-1 ${showHeader ? "mt-3" : ""}`}>
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
