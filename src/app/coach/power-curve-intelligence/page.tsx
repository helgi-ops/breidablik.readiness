"use client";

/**
 * Coach view — Power Curve Intelligence (the ADI peak-period layer).
 *
 * Pulled off the Load Intelligence page (which had grown dense) so the three
 * peak-period reads live together on their own focused page:
 *
 *   - PeakPeriodCurveCard: the power curve (peak per-minute intensity vs 1/3/5-min
 *     window) from the Catapult MII peak-period feed, with the Explosive/Engine
 *     shape chip. Auto-synced; no manual export needed.
 *   - PeakCapacityCard: "% of peak capacity" per drill — each drill vs the player's
 *     own duration-matched peak (proxy from drill history).
 *   - SessionBuilderCard: proactive planning — predict a planned session's load per player.
 *
 * All three are GPS/Catapult-based → the page hides for no-GPS teams (NO_GPS_HIDDEN).
 * Descriptive load context — none of it ever touches the readiness verdict or the daily plan.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import PagePurpose from "@/components/coach/PagePurpose";
import PeakPeriodCurveCard from "@/components/coach/PeakPeriodCurveCard";
import MovementSignatureCard from "@/components/coach/MovementSignatureCard";
import MovementStyleCard from "@/components/coach/MovementStyleCard";
import RoleDemandFitCard from "@/components/coach/RoleDemandFitCard";
import WyscoutFusionUpload from "@/components/coach/WyscoutFusionUpload";
import SeasonTrendsCard from "@/components/coach/SeasonTrendsCard";
import ImaSeasonCard from "@/components/coach/ImaSeasonCard";
import PhysicalStoryCard from "@/components/coach/PhysicalStoryCard";

type PlayerLite = { id: string; name: string };

export default function PowerCurveIntelligencePage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [players, setPlayers] = React.useState<PlayerLite[]>([]);
  const [selectedId, setSelectedId] = React.useState(""); // one player picker shared by every card
  const [view, setView] = React.useState<"player" | "team">("player"); // per-player reads vs squad fusion
  const [isBasketball, setIsBasketball] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // Does this club produce IMA-clock data at all? Core/Lite (Vector Core: GPS but
  // no IMA) clubs don't, so the IMA-clock cards would sit empty. Gate on ACTUAL IMA
  // presence (player_external_load_daily.ima_clock_gen2), NOT catapultTier — that's
  // the B2-3 efforts axis and Core↔Pro are complementary (efforts XOR IMA). null = probing.
  const [hasIma, setHasIma] = React.useState<boolean | null>(null);

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

        const sport = await resolveTeamSport(supabase, teamId);
        if (alive) setIsBasketball(sport === "basketball");

        // IMA-presence probe via a SERVER route (admin). This table is read server-side
        // everywhere; a client count under RLS is unreliable (false-returned 0 for a Pro
        // club with 1000+ IMA rows), so the check must go through the API.
        try {
          const { data: sess } = await supabase.auth.getSession();
          const tok = sess?.session?.access_token;
          const res = await fetch("/api/coach/team/ima-presence", { headers: { Authorization: `Bearer ${tok ?? ""}` } });
          const j = await res.json().catch(() => ({}));
          if (alive) setHasIma(res.ok ? !!(j as { hasIma?: boolean }).hasIma : true); // on error, show (don't wrongly hide)
        } catch { if (alive) setHasIma(true); }

        const { data: playerData } = await supabase
          .from("players")
          .select("id, full_name")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");
        if (!alive) return;
        setPlayers(((playerData ?? []) as Array<{ id: string; full_name?: string }>).map((p) => ({ id: String(p.id), name: String(p.full_name ?? "") })));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase, is]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {is ? "Afl-kúrfu greining" : "Power Curve Intelligence"}
        </h1>
        <PagePurpose
          en="see each player's peak-period power curve and his movement signature and style"
          is="sjá afl-kúrfu hvers leikmanns og hreyfi-fingrafar og -stíl"
          tutorial="power-curve-intelligence"
        />
        <p className="mt-1 text-sm text-slate-600">
          {is
            ? "ADI hreyfi-lagið: afl-kúrfan (per-mínútu ákefð yfir 1/3/5-mín glugga úr Catapult MII) og hreyfi-fingrafarið og -stíllinn (IMA-klukka — okkar Vector Distribution). Þrek (Critical Speed, þolpróf) er á sér-síðunni „Þrek\". Lýsandi — snertir aldrei readiness-dóminn."
            : "The ADI movement layer: the power curve (per-minute intensity over 1/3/5-min windows from the Catapult MII feed) and the movement signature & style (IMA clock — our take on the Vector Distribution). Conditioning (Critical Speed, fitness tests) lives on the \"Conditioning\" page. Descriptive — it never touches the readiness verdict."}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
      )}

      {loading && !error && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">{is ? "Hleður…" : "Loading…"}</div>
      )}

      {!loading && !error && isBasketball && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          {is
            ? "Körfubolti: engin GPS/peak-period gögn innandyra — afl-kúrfan á ekki við hér."
            : "Basketball: no indoor GPS / peak-period data — the power curve doesn't apply here."}
        </div>
      )}

      {!loading && !error && !isBasketball && players.length === 0 && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {is
            ? "Engir virkir leikmenn fundust fyrir liðið."
            : "No active players found for this team."}
        </div>
      )}

      {!loading && !error && !isBasketball && players.length > 0 && (
        <div className="space-y-4">
          {/* Player / Team view toggle — the page was one long scroll; split the per-player reads
              from the squad-wide fusion so each view is short and focused. */}
          <div className="flex gap-5 border-b border-slate-200">
            {(["player", "team"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${view === v ? "border-[#2740e6] text-[#2740e6]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {v === "player" ? (is ? "Leikmaður" : "Player") : (is ? "Lið" : "Team")}
              </button>
            ))}
          </div>

          {view === "player" && (
            <div className="space-y-4">
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                {is
                  ? "Yfir tímabilið — hvernig HSR- og IMA-álag leikmannsins þróast og hans hreyfi-karakter. Session-heildir/meðaltöl, ekki einn leikur. (Einn leikur í smáatriðum → „Lið“ flipinn.)"
                  : "Over the season — how this player's HSR and IMA load are trending, and his movement character. Session totals/averages, not a single match. (One match in detail → the “Team” tab.)"}
              </p>
              {/* One player picker shared by every per-player card below. */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">{is ? "Leikmaður" : "Player"}</span>
                <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[14px]">
                  {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {/* Physical story — the whole-page synthesis (reads the cards below, tells one story
                  before the coach drills in). Anchors below let its facts scroll to each card. */}
              <PhysicalStoryCard playerId={selectedId} />
              {/* Role-Demand Fit — the fusion read: engine × role demand × driver × output. */}
              <div id="pc-role" className="rounded-xl transition-shadow"><RoleDemandFitCard players={players} playerId={selectedId} /></div>
              <div id="pc-curve" className="rounded-xl transition-shadow"><PeakPeriodCurveCard players={players} playerId={selectedId} /></div>
              {/* Season HSR + IMA trends — surfacing the auto-synced load (session/match totals,
                  not a peak window). GPS-based; shows for every tier. */}
              <div id="pc-season" className="rounded-xl transition-shadow"><SeasonTrendsCard playerId={selectedId} /></div>
              {/* Season IMA graph — accel/decel density line + movement shape stacked-area. */}
              <ImaSeasonCard playerId={selectedId} />
              {/* Movement Signature + Style are IMA-clock reads — hidden (not shown empty) for
                  Core/Lite clubs whose Catapult tier sends no IMA. */}
              {hasIma !== false && (
                <>
                  <div id="pc-movement" className="rounded-xl transition-shadow"><MovementSignatureCard players={players} playerId={selectedId} /></div>
                  <div id="pc-style" className="rounded-xl transition-shadow"><MovementStyleCard players={players} playerId={selectedId} /></div>
                </>
              )}
              {hasIma === false && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {is
                    ? "Hreyfi-fingrafar og -stíll nota IMA-klukkuna (Vector Pro/S7 skynjara). Catapult-þrep þessa liðs sendir ekki IMA, svo kortin tvö eru falin frekar en tóm. Afl-kúrfan að ofan er GPS-byggð."
                    : "Movement signature & style use the IMA clock (Vector Pro/S7 sensors). This club's Catapult tier doesn't send IMA, so those two cards are hidden rather than shown empty. The power curve above is GPS-based."}
                </div>
              )}
            </div>
          )}

          {view === "team" && (
            <div className="space-y-4">
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                {is
                  ? "Einn leikur — hvað gerðist í hörðustu mínútum hvers leikmanns (peak-gluggar × taktík). Sömu HSR/IMA gögn og „Leikmaður“ flipinn, en fyrir einn leik. Þarf Wyscout SportsCode XML."
                  : "One match — what happened in each player's hardest minutes (peak windows × tactics). Same HSR/IMA data as the “Player” tab, but for a single match. Needs a Wyscout SportsCode XML."}
              </p>
              {/* Peak-context fusion (physical × tactical) — squad overview (all players side by
                  side) + per-player Ju bars for a saved/uploaded match. This is the team read. */}
              <WyscoutFusionUpload defaultOpen />
            </div>
          )}
          {/* Critical Speed + Fitness tests moved to /coach/conditioning (the energy-system layer). */}
        </div>
      )}
    </div>
  );
}
