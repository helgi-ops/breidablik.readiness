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

type PlayerLite = { id: string; name: string };

export default function PowerCurveIntelligencePage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [players, setPlayers] = React.useState<PlayerLite[]>([]);
  const [isBasketball, setIsBasketball] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {is ? "Afl-kúrfu greining" : "Power Curve Intelligence"}
        </h1>
        <PagePurpose
          en="see each player's peak-period power curve and his movement signature and style"
          is="sjá afl-kúrfu hvers leikmanns og hreyfi-fingrafar og -stíl"
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
          <PeakPeriodCurveCard players={players} />
          {/* Movement Signature — IMA-clock analogue of ADI's Vector Distribution (Pillar 1). */}
          <MovementSignatureCard players={players} />
          {/* Movement Style — IMA clock + free-running → linear↔multidirectional, squad-relative. */}
          <MovementStyleCard players={players} />
          {/* Critical Speed + Fitness tests moved to /coach/conditioning (the energy-system layer).
              % of peak capacity per drill + Session Builder parked — this page is the ADI movement read. */}
        </div>
      )}
    </div>
  );
}
