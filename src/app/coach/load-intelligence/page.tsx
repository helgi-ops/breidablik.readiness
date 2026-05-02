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
import GpsLoadIntelligence from "@/components/coach/GpsLoadIntelligence";
import MechanicalLoadIndexCard from "@/components/coach/MechanicalLoadIndexCard";
import TeamMetabolicSummary from "@/components/micropulse/coach/TeamMetabolicSummary";
import FosterMonotonyStrainCard from "@/components/coach/FosterMonotonyStrainCard";
import { useLang } from "@/lib/lang";

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
        <p className="mt-1 text-sm text-slate-600">
          {lang === "EN"
            ? "External GPS signals + internal load (MLI / MLS) on one page — the Internal:External coupling story. Raw daily numbers and the squad load 7d/28d table still live on the GPS Data tab."
            : "Ytri GPS-merki + innra álag (MLI / MLS) á einum stað — Internal:External coupling sagan. Hráar daglegar tölur og squad-load 7d/28d taflan eru áfram á GPS Data tabbinum."}
        </p>
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

      {!loading && !error && players.length === 0 && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {lang === "EN"
            ? "No Catapult GPS data available for this team yet. Sync Catapult or upload a CSV to start."
            : "Engin Catapult GPS gögn fundust fyrir liðið ennþá. Tengdu Catapult eða hladdu upp CSV."}
        </div>
      )}

      {!loading && !error && players.length > 0 && (
        <GpsLoadIntelligence
          players={players}
          date={today}
          lang={lang === "EN" ? "EN" : "IS"}
        />
      )}

      {!loading && !error && teamId && (
        <FosterMonotonyStrainCard teamId={teamId} refDate={today} lang={lang === "EN" ? "EN" : "IS"} />
      )}

      {!loading && !error && teamId && <MechanicalLoadIndexCard teamId={teamId} />}

      {!loading && !error && teamId && <TeamMetabolicSummary teamId={teamId} />}
    </div>
  );
}
