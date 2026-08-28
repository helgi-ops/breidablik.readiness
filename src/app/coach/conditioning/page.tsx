"use client";

/**
 * Coach view — Conditioning (Þrek): the energy-system / aerobic profile, gathered on one page.
 *
 *   - CriticalSpeedCard: CS + D′ (critical-power running model) + ASR + the anaerobic "tank" +
 *     MAS conditioning zones + the 3-min all-out test entry.
 *   - FitnessTestCard: standardized endurance tests (Yo-Yo, 30-15 IFT, beep, VAMEVAL, 4-min run,
 *     line drill, sprint) → MAS / VIFT / VO₂max, feeding CS and the load targets.
 *
 * Pulled out of Power Curve Intelligence (which is the ADI *movement* layer) so conditioning lives
 * in one place. NOT GPS-gated — the fitness tests serve every team including basketball. Descriptive
 * — none of it ever touches the readiness verdict or the daily plan.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import CriticalSpeedCard from "@/components/coach/CriticalSpeedCard";
import FitnessTestCard from "@/components/coach/FitnessTestCard";
import HrExCard from "@/components/coach/HrExCard";

type PlayerLite = { id: string; name: string };

export default function ConditioningPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [players, setPlayers] = React.useState<PlayerLite[]>([]);
  const [selectedId, setSelectedId] = React.useState(""); // one player picker shared by both cards
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (!selectedId && players.length) setSelectedId(players[0].id); }, [players, selectedId]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) { if (alive) { setError(is ? "Ekki innskráður" : "Not signed in"); setLoading(false); } return; }
        const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", userId).maybeSingle();
        const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        if (!teamId) { if (alive) { setError(is ? "Ekkert lið tengt við aðganginn" : "No team linked to this account"); setLoading(false); } return; }
        const { data: playerData } = await supabase
          .from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).order("full_name");
        if (!alive) return;
        setPlayers(((playerData ?? []) as Array<{ id: string; full_name?: string }>).map((p) => ({ id: String(p.id), name: String(p.full_name ?? "") })));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase, is]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{is ? "Þrek" : "Conditioning"}</h1>
        <PagePurpose
          en="each player's aerobic / energy-system profile — critical speed, MAS, anaerobic reserve, and his standardized fitness-test results"
          is="orkukerfa-prófíll hvers leikmanns — critical speed, MAS, loftfirrtur forði, og stöðluð þolpróf hans"
          tutorial="conditioning"
        />
        <p className="mt-1 text-sm text-slate-600">
          {is
            ? "Þrek-lagið: Critical Speed / D′ / ASR + MAS-svæði og þolpróf (Yo-Yo, 30-15 IFT, bíp, VAMEVAL, 4-mín / 3-mín all-out). Fitness testin fæða MAS og álagsmörkin. Lýsandi — snertir aldrei readiness-dóminn."
            : "The conditioning layer: Critical Speed / D′ / ASR + MAS zones and fitness tests (Yo-Yo, 30-15 IFT, beep, VAMEVAL, 4-min / 3-min all-out). The tests feed MAS and the load targets. Descriptive — it never touches the readiness verdict."}
        </p>
      </div>

      {error && <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
      {loading && !error && <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">{is ? "Hleður…" : "Loading…"}</div>}

      {!loading && !error && players.length === 0 && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {is ? "Engir virkir leikmenn fundust fyrir liðið." : "No active players found for this team."}
        </div>
      )}

      {!loading && !error && players.length > 0 && (
        <div className="space-y-4">
          {/* One player picker shared by both cards. */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">{is ? "Leikmaður" : "Player"}</span>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[14px]">
              {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <CriticalSpeedCard players={players} playerId={selectedId} />
          <FitnessTestCard players={players} playerId={selectedId} />
          <HrExCard players={players} playerId={selectedId} />
        </div>
      )}
    </div>
  );
}
