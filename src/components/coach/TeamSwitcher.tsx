"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { sportLabel, genderLabel } from "@/lib/teamLabels";

export interface CoachTeam {
  id: string;
  name: string;
  sport: string;
  teamType: "club_team" | "personal_trainer";
  gender: string | null;
  isPrimary: boolean;
}

interface TeamSwitcherProps {
  currentTeamId: string | null;
  onSwitch: (team: CoachTeam) => void;
  /** "compact" renders a square team-initial trigger for the narrow icon rail. */
  variant?: "default" | "compact";
}

const LABELS = {
  IS: {
    switchTeam: "Skipta um lið",
    personalTrainer: "Einkaþjálfun",
    clubTeam: "Lið",
  },
  EN: {
    switchTeam: "Switch team",
    personalTrainer: "Personal training",
    clubTeam: "Team",
  },
};

export default function TeamSwitcher({ currentTeamId, onSwitch, variant = "default" }: TeamSwitcherProps) {
  const [lang] = useLang();
  const ct = LABELS[lang as keyof typeof LABELS] ?? LABELS.IS;

  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");

  const fetchTeams = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      // Direct query: get coach_teams rows
      const { data: ctRows, error: ctErr } = await supabase
        .from("coach_teams")
        .select("team_id, is_primary")
        .eq("coach_id", user.id);

      if (ctErr || !ctRows || ctRows.length === 0) return;

      const teamIds = ctRows.map((r: { team_id: string }) => r.team_id);

      // Fetch team details in BATCHES. A single .in() with 100+ ids builds a
      // query URL long enough to be truncated by the API gateway, silently
      // dropping ids near the END of the list — a staff coach on 100+ teams lost
      // every team past ~position 50 (e.g. HK at physical position 79 vanished
      // from the switcher while Keflavík at 17 showed). Small batches keep each
      // URL short so every team comes back regardless of how many there are.
      const CHUNK = 40;
      const teamRows: Array<{ id: string; name: string; sport: string; team_type: string; gender: string | null }> = [];
      for (let i = 0; i < teamIds.length; i += CHUNK) {
        const { data: batch, error: batchErr } = await supabase
          .from("teams")
          .select("id, name, sport, team_type, gender")
          .in("id", teamIds.slice(i, i + CHUNK));
        if (batchErr) return;
        if (batch) teamRows.push(...batch);
      }
      if (teamRows.length === 0) return;

      // Build lookup
      const primaryMap = new Map<string, boolean>();
      ctRows.forEach((r: { team_id: string; is_primary: boolean }) => primaryMap.set(r.team_id, r.is_primary));

      // Assemble and sort (primary first)
      const result: CoachTeam[] = teamRows
        .map((t: { id: string; name: string; sport: string; team_type: string; gender: string | null }) => ({
          id: t.id,
          name: t.name ?? "—",
          sport: t.sport ?? "football",
          teamType: (t.team_type ?? "club_team") as "club_team" | "personal_trainer",
          gender: t.gender ?? null,
          isPrimary: primaryMap.get(t.id) ?? false,
        }))
        .sort((a: CoachTeam, b: CoachTeam) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.name.localeCompare(b.name));

      setTeams(result);
    } catch (err) {
      console.error("TeamSwitcher fetch error:", err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Don't show switcher if only one team
  if (!loaded || teams.length <= 1) return null;

  const current = teams.find((t) => t.id === currentTeamId);

  return (
    <div className="relative">
      {variant === "compact" ? (
        <button
          onClick={() => setOpen(!open)}
          title={current?.name ?? "—"}
          aria-label={ct.switchTeam}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-100"
        >
          {(current?.name ?? "?").trim().slice(0, 1).toUpperCase()}
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          <span>{current?.teamType === "personal_trainer" ? "👤" : "🏟"}</span>
          <span className="font-medium max-w-[160px] truncate">{current?.name ?? "—"}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQuery(""); }} />

          {/* Dropdown — searchable + scroll-capped. A coach can belong to many
              teams (100+ for staff); without a search box and a height cap the
              list runs off-screen and buries teams (a coach reported not seeing
              a team they had access to). */}
          <div className="absolute top-full left-0 mt-1 z-50 flex max-h-[75vh] w-[280px] flex-col overflow-hidden rounded-lg border bg-white shadow-lg">
            <div className="border-b p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lang === "EN" ? "Search teams…" : "Leita að liði…"}
                className="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="overflow-y-auto py-1">
              {(() => {
                const q = query.trim().toLowerCase();
                const matches = (t: CoachTeam) =>
                  !q || t.name.toLowerCase().includes(q) || (t.sport ?? "").toLowerCase().includes(q);
                const pt = teams.filter((t) => t.teamType === "personal_trainer" && matches(t));
                const club = teams.filter((t) => t.teamType === "club_team" && matches(t));

                if (pt.length === 0 && club.length === 0) {
                  return (
                    <div className="px-3 py-3 text-sm text-gray-400">
                      {lang === "EN" ? "No teams match." : "Ekkert lið passar."}
                    </div>
                  );
                }

                return (
                  <>
                    {pt.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                          {ct.personalTrainer}
                        </div>
                        {pt.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => { onSwitch(t); setOpen(false); setQuery(""); }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                              t.id === currentTeamId ? "bg-gray-100 font-medium" : ""
                            }`}
                          >
                            <span>👤</span>
                            <span className="truncate">{t.name}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {club.length > 0 && (
                      <>
                        <div className="mt-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                          {ct.clubTeam}
                        </div>
                        {club.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => { onSwitch(t); setOpen(false); setQuery(""); }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                              t.id === currentTeamId ? "bg-gray-100 font-medium" : ""
                            }`}
                          >
                            <span>🏟</span>
                            <span className="truncate">{t.name}</span>
                            <span className="ml-auto text-xs text-gray-400">
                              {[sportLabel(t.sport, lang === "EN" ? "EN" : "IS"), genderLabel(t.gender, lang === "EN" ? "EN" : "IS")].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
