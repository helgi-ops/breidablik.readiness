"use client";

import { useEffect, useMemo, useState, type FC } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { buildWeeklyNarrative, type WeeklyNarrativeInput } from "@/lib/micropulse/weeklyNarrative";
import { EXCLUDE_PREV_CLUB_OR } from "@/lib/micropulse/load/previousClub";

/**
 * WeeklyNarrativeCard — strategic 7-day overview at the top of the
 * coach dashboard. Aggregates training-load data + verdict history
 * across the squad and emits a one-line story + supporting facts +
 * forward-looking recommendation. Fully deterministic (no LLM).
 *
 * Renders nothing while loading or when there is no data yet. This way
 * it stays out of the way for fresh teams that don't have history.
 */
export const WeeklyNarrativeCard: FC<{ teamId?: string | null }> = ({ teamId }) => {
  const [lang] = useLang();
  const [input, setInput] = useState<WeeklyNarrativeInput | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        // Resolve team: use the prop, else the logged-in coach's profile team —
        // so this card can mount on surfaces that don't thread a teamId
        // (e.g. the Reporting Center).
        let tid = teamId ?? null;
        if (!tid) {
          const { data: authRes } = await sb.auth.getUser();
          const uid = authRes?.user?.id;
          if (uid) {
            const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
            tid = (prof as { team_id?: string } | null)?.team_id ?? null;
          }
        }
        if (!tid) {
          if (alive) setInput(null);
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const start7 = (() => {
          const d = new Date(`${today}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() - 6);
          return d.toISOString().slice(0, 10);
        })();
        const start28 = (() => {
          const d = new Date(`${today}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() - 27);
          return d.toISOString().slice(0, 10);
        })();

        // Players on team
        const { data: pl } = await sb
          .from("players")
          .select("id, full_name")
          .eq("team_id", tid)
          .eq("is_active", true);
        if (!alive) return;
        const players = ((pl ?? []) as Array<{ id: string; full_name: string | null }>);
        const playerIds = players.map((p) => p.id);
        const nameById = new Map(players.map((p) => [p.id, p.full_name ?? "—"]));
        if (playerIds.length === 0) {
          setInput(null);
          return;
        }

        // 28d Player Load (for chronic mean) + 7d window for acute / high-load days
        const { data: extLoad } = await sb
          .from("player_external_load_daily")
          .select("player_id, date, total_player_load")
          .in("player_id", playerIds)
          .or(EXCLUDE_PREV_CLUB_OR) // team chronic/acute rolls players by date — exclude pre-transfer rows
          .gte("date", start28)
          .lte("date", today);
        if (!alive) return;
        const ext = ((extLoad ?? []) as Array<{ player_id: string; date: string; total_player_load: number | null }>);

        // Team-mean PL per day
        const dayBuckets = new Map<string, number[]>();
        for (const r of ext) {
          if (r.total_player_load == null || r.total_player_load <= 0) continue;
          const arr = dayBuckets.get(r.date) ?? [];
          arr.push(Number(r.total_player_load));
          dayBuckets.set(r.date, arr);
        }
        const dayMean = new Map<string, number>();
        for (const [d, arr] of dayBuckets) {
          if (arr.length === 0) continue;
          dayMean.set(d, arr.reduce((s, x) => s + x, 0) / arr.length);
        }
        const acute = Array.from(dayMean.entries())
          .filter(([d]) => d >= start7)
          .map(([, v]) => v);
        const chronic = Array.from(dayMean.values());
        const acuteMeanPl = acute.length > 0 ? acute.reduce((s, x) => s + x, 0) / acute.length : null;
        const chronicMeanPl = chronic.length > 0 ? chronic.reduce((s, x) => s + x, 0) / chronic.length : null;
        const highLoadDays = (() => {
          if (chronicMeanPl == null || chronicMeanPl <= 0) return 0;
          const threshold = chronicMeanPl * 1.15;
          return Array.from(dayMean.entries()).filter(([d, v]) => d >= start7 && v >= threshold).length;
        })();

        // Match days in 7d window — any player with ≥60 min in match_player_minutes
        let matchDays = 0;
        try {
          const { data: mm } = await sb
            .from("match_player_minutes")
            .select("match_date, minutes_played")
            .in("player_id", playerIds)
            .gte("match_date", start7)
            .lte("match_date", today)
            .gte("minutes_played", 60);
          if (alive && mm) {
            const dates = new Set<string>();
            for (const r of mm as Array<{ match_date: string; minutes_played: number | null }>) {
              if (r.match_date) dates.add(r.match_date);
            }
            matchDays = dates.size;
          }
        } catch { /* table may not exist on Lite */ }

        // Verdict counts in 7d — REDUCED + RECOVERY vs FULL
        let reducedRecoveryCount = 0;
        let fullCount = 0;
        try {
          const { data: dh } = await sb
            .from("athlete_decision_history")
            .select("training_action, decision_date")
            .in("player_id", playerIds)
            .gte("decision_date", start7)
            .lte("decision_date", today);
          if (alive && dh) {
            for (const r of dh as Array<{ training_action: string | null }>) {
              const a = (r.training_action ?? "").toUpperCase();
              if (a === "REDUCED" || a === "RECOVERY" || a === "MODIFIED" || a === "HOLD") reducedRecoveryCount++;
              else if (a === "FULL") fullCount++;
            }
          }
        } catch { /* best-effort */ }

        // Declining players — those whose 7d mean STEN is ≥ 1 band below
        // their prior 14-day mean. Z-scores live in athlete_decision_history.
        const decliningPlayers: string[] = [];
        try {
          const { data: zh } = await sb
            .from("athlete_decision_history")
            .select("player_id, z_today, decision_date")
            .in("player_id", playerIds)
            .gte("decision_date", start28)
            .lte("decision_date", today);
          if (alive && zh) {
            const byPlayer = new Map<string, Array<{ d: string; z: number }>>();
            for (const r of zh as Array<{ player_id: string; z_today: number | null; decision_date: string }>) {
              if (r.z_today == null || !Number.isFinite(r.z_today)) continue;
              const arr = byPlayer.get(r.player_id) ?? [];
              arr.push({ d: r.decision_date, z: Number(r.z_today) });
              byPlayer.set(r.player_id, arr);
            }
            for (const [pid, arr] of byPlayer) {
              const recent = arr.filter((x) => x.d >= start7).map((x) => x.z);
              const prior = arr.filter((x) => x.d < start7).map((x) => x.z);
              if (recent.length < 3 || prior.length < 5) continue;
              const meanRecent = recent.reduce((s, x) => s + x, 0) / recent.length;
              const meanPrior = prior.reduce((s, x) => s + x, 0) / prior.length;
              if (meanPrior - meanRecent >= 0.5) {
                decliningPlayers.push(nameById.get(pid) ?? "—");
              }
            }
          }
        } catch { /* best-effort */ }

        // Active injuries
        const injuredPlayers: string[] = [];
        try {
          const { data: inj } = await sb
            .from("player_injuries")
            .select("player_id, status")
            .in("player_id", playerIds)
            .in("status", ["injured", "rehabilitation", "rtp_training"]);
          if (alive && inj) {
            const seen = new Set<string>();
            for (const r of inj as Array<{ player_id: string }>) {
              if (seen.has(r.player_id)) continue;
              seen.add(r.player_id);
              injuredPlayers.push(nameById.get(r.player_id) ?? "—");
            }
          }
        } catch { /* best-effort */ }

        if (!alive) return;
        setInput({
          highLoadDays,
          matchDays,
          reducedRecoveryCount,
          fullCount,
          acuteMeanPl,
          chronicMeanPl,
          decliningPlayers,
          injuredPlayers,
        });
      } catch {
        if (alive) setInput(null);
      }
    })();
    return () => { alive = false; };
  }, [teamId]);

  const narrative = useMemo(() => {
    if (!input) return null;
    return buildWeeklyNarrative(input, lang);
  }, [input, lang]);

  if (!narrative || !input) return null;

  // Hide entirely on completely fresh/empty teams (no load data, no verdicts).
  if (
    input.acuteMeanPl == null &&
    input.chronicMeanPl == null &&
    input.reducedRecoveryCount === 0 &&
    input.fullCount === 0 &&
    input.matchDays === 0
  ) {
    return null;
  }

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
              {lang === "IS" ? "Vikan til þessa" : "This week so far"}
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs text-slate-500">
              {lang === "IS" ? "Síðustu 7 dagar miðað við 4-vikna meðaltal" : "Last 7 days vs the 4-week average"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-base font-semibold text-slate-900 leading-snug">
          {narrative.headline}
        </div>
        {narrative.facts.length > 0 && (
          <ul className="space-y-1 text-sm text-slate-700">
            {narrative.facts.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 shrink-0 text-slate-400">·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        {narrative.recommendation && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            <span className="font-semibold">
              {lang === "IS" ? "Tillaga: " : "Recommendation: "}
            </span>
            {narrative.recommendation}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeeklyNarrativeCard;
