"use client";

/**
 * Coach view — Robustness & Signals.
 *
 * The readiness/injury EXPLAINABILITY surface, pulled off Load Intelligence (which
 * is about the internal:external load-coupling story). Two related reads live here:
 *
 *   - Robustness watch (#5): the labelled injury EARLY-WARNING per player —
 *     steady / watch / elevated, ranked cited contributors, each with a
 *     counterfactual. Sits beside the readiness colour, never becomes it.
 *   - Signal check (Explainable Signal Pack): the per-player "why" contributors
 *     across the squad (ACWR, monotony, injury recency, sleep, CMJ).
 *
 * Both are personal-norm, cited, confidence-rated and descriptive — they never
 * touch the readiness colour, the load target, or the daily decision.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import SignalPackCard from "@/components/coach/SignalPackCard";
import RobustnessWatchCard from "@/components/coach/RobustnessWatchCard";
import PagePurpose from "@/components/coach/PagePurpose";
import { useLang } from "@/lib/lang";

export default function ReadinessSignalsPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [players, setPlayers] = React.useState<Array<{ id: string; name: string }>>([]);
  const [watchPlayerId, setWatchPlayerId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Default the robustness-watch player to the first in the squad (coach can change).
  React.useEffect(() => {
    if (!watchPlayerId && players.length) setWatchPlayerId(players[0].id);
  }, [players, watchPlayerId]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) { if (alive) { setError(is ? "Ekki innskráður" : "Not signed in"); setLoading(false); } return; }
        const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", userId).maybeSingle();
        const tid = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        if (!alive) return;
        if (!tid) { setError(is ? "Ekkert lið tengt við aðganginn" : "No team linked to this account"); setLoading(false); return; }
        setTeamId(tid);
        const { data: playerData } = await supabase
          .from("players").select("id, full_name").eq("team_id", tid).eq("is_active", true).order("full_name");
        if (!alive) return;
        setPlayers(((playerData ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => ({ id: String(p.id), name: String(p.full_name ?? "") })));
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
          {is ? "Álagsþol & merki" : "Robustness & Signals"}
        </h1>
        <PagePurpose
          en="catch who is trending toward a niggle before it happens — the labelled early-warning read beside the readiness colour, plus the cited 'why' signals per player"
          is="grípa hverjir stefna í tognun áður en hún gerist — merkta snemmbúna eftirlitið við hlið áreiðanleika-litarins, ásamt tilvitnuðu 'af hverju' merkjunum per leikmann"
        />
        <p className="mt-1 text-xs text-slate-500">Gabbett 2017 · Majumdar 2022 · McBurnie 2022 · Hader 2019 · Haller 2023</p>
        <p className="mt-1 text-[13px] text-slate-500">
          {is
            ? "Lýsandi, eigin-viðmið, tilvitnað og með áreiðanleika — engin ein meiðsla-áhættutala. Situr við hlið litarins og breytir honum aldrei."
            : "Descriptive, personal-norm, cited and confidence-rated — no single injury-risk number. Sits beside the colour and never changes it."}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
      )}
      {loading && !error && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">{is ? "Hleður…" : "Loading…"}</div>
      )}

      {!loading && !error && teamId && (
        <>
          {/* Robustness watch (#5) — labelled injury early-warning per player. */}
          {players.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {is ? "Leikmaður" : "Player"}
                </span>
                <select
                  value={watchPlayerId}
                  onChange={(e) => setWatchPlayerId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-700"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <RobustnessWatchCard selectedPlayerId={watchPlayerId} date={today} />
            </div>
          )}

          {/* Signal check — the explainable per-player "why" across the squad. */}
          <SignalPackCard teamId={teamId} />
        </>
      )}
    </div>
  );
}
