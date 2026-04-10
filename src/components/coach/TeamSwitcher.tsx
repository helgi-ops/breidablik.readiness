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

export default function TeamSwitcher({ currentTeamId, onSwitch }: TeamSwitcherProps) {
  const [lang] = useLang();
  const ct = LABELS[lang as keyof typeof LABELS] ?? LABELS.IS;

  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

      // Fetch team details
      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id, name, sport, team_type, gender")
        .in("id", teamIds);

      if (teamErr || !teamRows) return;

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
        .sort((a: CoachTeam, b: CoachTeam) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

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

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border rounded-lg shadow-lg py-1 min-w-[220px]">
            {/* Group: Personal trainer */}
            {teams.some((t) => t.teamType === "personal_trainer") && (
              <>
                <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {ct.personalTrainer}
                </div>
                {teams
                  .filter((t) => t.teamType === "personal_trainer")
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { onSwitch(t); setOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${
                        t.id === currentTeamId ? "bg-gray-100 font-medium" : ""
                      }`}
                    >
                      <span>👤</span>
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
              </>
            )}

            {/* Group: Club teams */}
            {teams.some((t) => t.teamType === "club_team") && (
              <>
                <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide mt-1">
                  {ct.clubTeam}
                </div>
                {teams
                  .filter((t) => t.teamType === "club_team")
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { onSwitch(t); setOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${
                        t.id === currentTeamId ? "bg-gray-100 font-medium" : ""
                      }`}
                    >
                      <span>🏟</span>
                      <span className="truncate">{t.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {[sportLabel(t.sport, lang === "EN" ? "EN" : "IS"), genderLabel(t.gender, lang === "EN" ? "EN" : "IS")].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
