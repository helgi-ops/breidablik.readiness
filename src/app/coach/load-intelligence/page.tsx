"use client";

/**
 * Coach view — Load Intelligence (combined external + internal load).
 *
 * Pulled out of the GPS Data tab where it was crammed alongside the
 * raw daily numbers and the squad load 7d/28d table. This page tells
 * the Internal:External coupling story:
 *
 *   - GpsLoadIntelligence: per-player external signals computed from
 *     Catapult (NBS, decel burden, A:D ratio, HID%, residual decel,
 *     PL spike).
 *   - MechanicalLoadIndexCard: team-wide MLI (mechanical load index,
 *     internal-load proxy from accel/decel + heart-rate work).
 *   - TeamMetabolicSummary: team-wide metabolic load (di Prampero
 *     metabolic-power-derived volume).
 *
 * GPS Data tab still owns the raw daily table + Squad Load 7d/28d so
 * coaches can see what each player did in absolute terms — this page
 * is the *interpretation* layer over the same data.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import LoadVerdictCard from "@/components/coach/LoadVerdictCard";
import GpsLoadIntelligence from "@/components/coach/GpsLoadIntelligence";
import MechanicalLoadIndexCard from "@/components/coach/MechanicalLoadIndexCard";
import TeamMetabolicSummary from "@/components/micropulse/coach/TeamMetabolicSummary";
import FosterMonotonyStrainCard from "@/components/coach/FosterMonotonyStrainCard";
import MdHsrComparisonCard from "@/components/coach/MdHsrComparisonCard";
import { useLang } from "@/lib/lang";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import PagePurpose from "@/components/coach/PagePurpose";

type GpsPlayerInput = {
  id: string;
  name: string;
  position: string;
  history: Array<Record<string, unknown>>;
};

export default function LoadIntelligencePage() {
  const [lang] = useLang();
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [isBasketball, setIsBasketball] = React.useState(false);
  const [players, setPlayers] = React.useState<GpsPlayerInput[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── Resolve coach's team from profiles ─────────────────────────────
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) {
        if (alive) { setError(lang === "EN" ? "Not signed in" : "Ekki innskráður"); setLoading(false); }
        return;
      }
      const { data: prof } = await supabase
        .from("profiles").select("team_id").eq("id", userId).maybeSingle();
      if (!alive) return;
      const tid = (prof as { team_id?: string | null } | null)?.team_id ?? null;
      if (!tid) {
        setError(lang === "EN" ? "No team linked to this account" : "Ekkert lið tengt við aðganginn");
        setLoading(false);
        return;
      }
      setTeamId(tid);
      const s = await resolveTeamSport(supabase, tid);
      if (alive) setIsBasketball(s === "basketball");
    })();
    return () => { alive = false; };
  }, [supabase, lang]);

  // ── Fetch player history once we know the team ─────────────────────
  // Mirrors the dashboard's GPS-tab fetch (35-day window so the 28-day
  // chronic baseline has a full lookback) but team-scoped instead of
  // pulling every active player in the database.
  React.useEffect(() => {
    if (!teamId) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const startDate = (() => {
          const d = new Date(`${today}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() - 35);
          return d.toISOString().slice(0, 10);
        })();

        const { data: playerData } = await supabase
          .from("players")
          .select("id, full_name, position")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");

        if (!alive) return;
        if (!playerData?.length) {
          setPlayers([]);
          setLoading(false);
          return;
        }
        const playerIds = (playerData as Array<{ id: string }>).map((p) => String(p.id));

        const { data: loadData } = await supabase
          .from("player_external_load_daily")
          .select("player_id, date, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, tot_as, decel_b2_3_tot_effs_gen2, tot_ds, total_player_load, player_load_per_minute, max_vel, ima_accel, ima_decel, ima_cod, avg_heart_rate, max_heart_rate")
          .in("source", ["catapult", "manual"])
          .in("player_id", playerIds)
          .gte("date", startDate)
          .lte("date", today)
          .order("date");

        if (!alive) return;

        const byPlayer = new Map<string, Array<Record<string, unknown>>>();
        for (const row of (loadData ?? []) as Array<Record<string, unknown>>) {
          const pid = String(row.player_id);
          const list = byPlayer.get(pid) ?? [];
          list.push(row);
          byPlayer.set(pid, list);
        }

        const result = (playerData as Array<{ id: string; full_name?: string; position?: string }>)
          .filter((p) => (byPlayer.get(String(p.id)) ?? []).length > 0)
          .map((p) => ({
            id: String(p.id),
            name: String(p.full_name ?? ""),
            position: String(p.position ?? "—"),
            history: byPlayer.get(String(p.id)) ?? [],
          }));

        if (alive) setPlayers(result);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase, teamId, today]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {lang === "EN" ? "Load Intelligence" : "Álagsgreining"}
        </h1>
        <PagePurpose
          en="see the squad's overall training load and who is trending up or down"
          is="sjá heildar-álag liðsins og hverjir eru að stíga upp eða niður"
          tutorial="load-intelligence"
        />
        <p className="mt-1 text-sm text-slate-600">
          {lang === "EN"
            ? "External GPS signals + internal load (MLI / MLS) on one page — the Internal:External coupling story. Raw daily numbers and the squad load 7d/28d table still live on the GPS Data tab."
            : "Ytri GPS-merki + innra álag (MLI / MLS) á einum stað — Internal:External coupling sagan. Hráar daglegar tölur og squad-load 7d/28d taflan eru áfram á GPS Data tabbinum."}
        </p>
        {/* Basketball caveat — one line, verdict first. Indoors there are no GPS
            signals, so read this squad on sRPE (Foster monotony/strain, ACWR),
            and the week on game count, not MD-days. Football teams never see it. */}
        {isBasketball && (
          <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
            <span className="font-semibold">
              {lang === "EN"
                ? "Basketball: read this on internal load, not GPS."
                : "Körfubolti: lestu þetta á innra álagi, ekki GPS."}
            </span>{" "}
            {lang === "EN"
              ? "Indoors there are no GPS velocity signals — Foster monotony/strain and ACWR from sRPE carry the load story, and the week is defined by its game count (0–3), not MD-days."
              : "Innandyra eru engin GPS-hraðamerki — Foster monotony/strain og ACWR úr sRPE bera álagssöguna, og vikan ræðst af fjölda leikja (0–3), ekki MD-dögum."}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {lang === "EN" ? "Loading…" : "Hleður…"}
        </div>
      )}

      {/* GPS empty state — NOT for basketball: an indoor team has no GPS by
          design, and its load story lives in the sRPE cards below, not here. */}
      {!loading && !error && players.length === 0 && !isBasketball && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {lang === "EN"
            ? "No Catapult GPS data available for this team yet. Sync Catapult or upload a CSV to start."
            : "Engin Catapult GPS gögn fundust fyrir liðið ennþá. Tengdu Catapult eða hladdu upp CSV."}
        </div>
      )}

      {/* Basketball with no GPS: the load story IS the sRPE monotony/strain +
          readiness verdict, which the GPS-gated player list above would hide.
          Render them directly so the page isn't a misleading "no data" wall. */}
      {!loading && !error && teamId && isBasketball && players.length === 0 && (
        <div className="space-y-6">
          <LoadVerdictCard date={today} lang={lang === "EN" ? "EN" : "IS"} />
          <FosterMonotonyStrainCard teamId={teamId} refDate={today} lang={lang === "EN" ? "EN" : "IS"} />
        </div>
      )}

      {/* ── Explainability layer: one plain-language verdict on top ── */}
      {!loading && !error && teamId && players.length > 0 && (
        <LoadVerdictCard date={today} lang={lang === "EN" ? "EN" : "IS"} />
      )}

      {/* ── The five dense S&C cards — unchanged, collapsed by default ── */}
      {!loading && !error && teamId && players.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700">
            {lang === "EN" ? "Show S&C details" : "Sýna S&C smáatriði"}
            <span className="ml-1.5 text-xs font-normal text-slate-400">
              {lang === "EN" ? "(GPS signals · MLI · metabolic · monotony · MD HSR)" : "(GPS-merki · MLI · efnaskipti · einhæfni · MD HSR)"}
            </span>
          </summary>
          <div className="space-y-6 border-t border-slate-100 p-4">
            <GpsLoadIntelligence players={players} date={today} lang={lang === "EN" ? "EN" : "IS"} />
            {teamId && <FosterMonotonyStrainCard teamId={teamId} refDate={today} lang={lang === "EN" ? "EN" : "IS"} />}
            {teamId && <MdHsrComparisonCard teamId={teamId} refDate={today} lang={lang === "EN" ? "EN" : "IS"} />}
            {teamId && <MechanicalLoadIndexCard teamId={teamId} lang={lang === "EN" ? "EN" : "IS"} />}
            {teamId && <TeamMetabolicSummary teamId={teamId} />}
          </div>
        </details>
      )}
    </div>
  );
}
