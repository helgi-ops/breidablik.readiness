"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Lang } from "@/lib/lang";
import type { VbtExercisePB, VbtTodayVsPB, VbtPlayerSummary, VbtLoadBreakdown } from "@/lib/micropulse/vbtReadiness/personalBest";

// ─── Types ───────────────────────────────────────────────────────────────────

type Props = {
  teamId: string | null;
  date: string;
  lang: Lang;
};

type ApiResponse = {
  date: string;
  players: VbtPlayerSummary[];
};

// ─── Copy ────────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    title: "Styrkur / VBT — Liðsyfirlit",
    loading: "Hleð VBT gögnum...",
    noData: "Engin VBT gögn fundust fyrir liðið.",
    noTeam: "Ekkert lið valið.",
    exercise: "Æfing",
    bestLoad: "Hæsta þyngd",
    bestVelocity: "Hæsti hraði",
    bestPower: "Hæsti kraftur",
    est1rm: "Áætlað 1RM",
    sessions: "Lotur",
    todayVsPb: "Í dag vs PB",
    todayVelocity: "Hraði í dag",
    pbVelocity: "PB hraði",
    diff: "Munur",
    newPb: "NÝTT PB!",
    load: "Þyngd",
    noExercises: "Engar æfingar skráðar.",
    noTodayData: "Engin gögn í dag.",
    playerHasToday: "Leikmenn með gögn í dag",
    playerNoToday: "Aðrir leikmenn",
  },
  EN: {
    title: "Strength / VBT — Team Overview",
    loading: "Loading VBT data...",
    noData: "No VBT data found for this team.",
    noTeam: "No team selected.",
    exercise: "Exercise",
    bestLoad: "Best Load",
    bestVelocity: "Best Velocity",
    bestPower: "Best Power",
    est1rm: "Est. 1RM",
    sessions: "Sessions",
    todayVsPb: "Today vs PB",
    todayVelocity: "Today Velocity",
    pbVelocity: "PB Velocity",
    diff: "Diff",
    newPb: "NEW PB!",
    load: "Load",
    noExercises: "No exercises recorded.",
    noTodayData: "No data today.",
    playerHasToday: "Players with data today",
    playerNoToday: "Other players",
  },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtVelocity(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2)} m/s`;
}

function fmtLoad(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)} kg`;
}

function fmtPower(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v)} W`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function pctColor(v: number | null): string {
  if (v == null) return "text-zinc-400";
  if (v > 2) return "text-emerald-600 font-semibold";
  if (v > -5) return "text-zinc-600";
  if (v > -15) return "text-amber-600 font-semibold";
  return "text-red-600 font-bold";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CoachStrengthVbtTab({ teamId, date, lang }: Props) {
  const t = COPY[lang];
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchData = React.useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/coach/player-load/vbt?teamId=${teamId}&date=${date}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message ?? "Fetch failed");
        setLoading(false);
      });
  }, [teamId, date]);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [teamId, date, fetchData]);

  const triggerSync = async () => {
    if (!teamId || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/integrations/gymaware/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSyncResult(`Villa: ${json.error ?? "Sync failed"}`);
      } else {
        const r = json.result;
        setSyncResult(
          lang === "IS"
            ? `Samstilling lokið: ${r.setsFetched} sett sótt, ${r.setsStored} vistuð, ${r.athletesMatched} leikmenn tengdir`
            : `Sync complete: ${r.setsFetched} sets fetched, ${r.setsStored} stored, ${r.athletesMatched} athletes matched`
        );
        // Reload data after sync
        fetchData();
      }
    } catch (err) {
      setSyncResult(`Villa: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!teamId) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6 text-sm text-zinc-500">{t.noTeam}</CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6 text-sm text-zinc-500">{t.loading}</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm border-red-200">
        <CardContent className="p-6 text-sm text-red-600">{error}</CardContent>
      </Card>
    );
  }

  // Check if any player actually has exercise data
  const hasAnyData = data?.players?.some((p) => p.exercises.length > 0);

  if (!hasAnyData) {
    return (
      <div className="space-y-4">
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-zinc-500">{t.noData}</p>
            <p className="text-sm text-zinc-500">
              {lang === "IS"
                ? "GymAware tenging er virk en gögn hafa ekki verið sótt enn. Smelltu á hnappinn til að sækja gögn."
                : "GymAware is connected but no data has been synced yet. Click the button to fetch data."}
            </p>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing
                ? lang === "IS" ? "Sæki gögn frá GymAware..." : "Syncing GymAware data..."
                : lang === "IS" ? "Sækja GymAware gögn (90 dagar)" : "Sync GymAware data (90 days)"}
            </button>
            {syncResult && (
              <p className={`text-sm ${syncResult.startsWith("Villa") ? "text-red-600" : "text-emerald-600"}`}>
                {syncResult}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const players = data?.players ?? [];
  const withToday = players.filter((p) => p.todayComparisons.length > 0);
  const withoutToday = players.filter((p) => p.todayComparisons.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-800">{t.title}</h2>
        <div className="flex items-center gap-3">
          {syncResult && (
            <span className={`text-xs ${syncResult.startsWith("Villa") ? "text-red-500" : "text-emerald-600"}`}>
              {syncResult}
            </span>
          )}
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 text-xs font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing
              ? lang === "IS" ? "Samstilli..." : "Syncing..."
              : lang === "IS" ? "Samstilla GymAware" : "Sync GymAware"}
          </button>
        </div>
      </div>

      {/* Players WITH today data */}
      {withToday.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-600 uppercase tracking-wide">
            {t.playerHasToday} ({withToday.length})
          </h3>
          {withToday.map((player) => (
            <PlayerVbtCard key={player.playerId} player={player} t={t} lang={lang} showToday />
          ))}
        </div>
      )}

      {/* Players WITHOUT today data */}
      {withoutToday.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-600 uppercase tracking-wide">
            {t.playerNoToday} ({withoutToday.length})
          </h3>
          {withoutToday.map((player) => (
            <PlayerVbtCard key={player.playerId} player={player} t={t} lang={lang} showToday={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Player Card ─────────────────────────────────────────────────────────────

function PlayerVbtCard({
  player,
  t,
  lang,
  showToday,
}: {
  player: VbtPlayerSummary;
  t: (typeof COPY)["IS"] | (typeof COPY)["EN"];
  lang: Lang;
  showToday: boolean;
}) {
  const [expanded, setExpanded] = useState(showToday);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const hasNewPB = player.todayComparisons.some((c) => c.isNewPB);
  const IS = lang === "IS";
  const est1rmFor = (name: string) => player.exercises.find((e) => e.exerciseName === name)?.estimated1RM ?? null;

  return (
    <Card className="shadow-sm">
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-semibold">{player.playerName}</CardTitle>
            {hasNewPB && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {t.newPb}
              </span>
            )}
            {player.todayComparisons.length > 0 && (
              <span className="text-xs text-zinc-500">
                {player.todayComparisons.length} {lang === "IS" ? "æfingar í dag" : "exercises today"}
              </span>
            )}
          </div>
          <span className="text-zinc-400 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* Today vs PB section */}
          {player.todayComparisons.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-zinc-700 mb-2">{t.todayVsPb}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-zinc-500">
                      <th className="pb-1 pr-4 font-medium">{t.exercise}</th>
                      <th className="pb-1 pr-4 font-medium">{t.load}</th>
                      <th className="pb-1 pr-4 font-medium">{t.todayVelocity}</th>
                      <th className="pb-1 pr-4 font-medium">{t.pbVelocity}</th>
                      <th className="pb-1 pr-4 font-medium">{t.diff}</th>
                      <th className="pb-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.todayComparisons.map((c) => {
                      const open = openEx === c.exerciseName;
                      const pct = c.velocityVsPbPct;
                      const read = c.isNewPB
                        ? (IS ? "Nýtt PB — hraðar (eða þyngra) en hans fyrra besta á þessari þyngd." : "New PB — faster (or heavier) than his previous best at this load.")
                        : pct == null
                          ? (IS ? "Engin samsvarandi PB-þyngd enn til að bera hraða dagsins við." : "No matching PB load yet to compare today's velocity against.")
                          : pct >= 3
                            ? (IS ? "Hraðar en PB-hraði á þessari þyngd — hreyfist vel, lítur ferskur/sterkur út." : "Faster than his PB velocity at this load — moving well, looks fresh/strong.")
                            : pct <= -8
                              ? (IS ? "Skýrt hraðatap vs PB á þessari þyngd — þreyta eða erfiður dagur; bústu við minni afköstum." : "Clear velocity loss vs his PB at this load — fatigue or a hard day; expect reduced output.")
                              : pct <= -3
                                ? (IS ? "Örlítið undir PB-hraða á þessari þyngd — væg þreyta, fylgstu með." : "Slightly below his PB velocity at this load — mild fatigue, keep an eye.")
                                : (IS ? "Á pari við PB-hraða á þessari þyngd — eðlileg afköst." : "On par with his PB velocity at this load — normal output.");
                      const e1rm = est1rmFor(c.exerciseName);
                      return (
                        <React.Fragment key={c.exerciseName}>
                          <tr className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50/60" onClick={() => setOpenEx(open ? null : c.exerciseName)}>
                            <td className="py-2 pr-4 font-medium text-zinc-800">
                              {c.exerciseName}<span className="ml-1 text-[9px] text-indigo-500">{open ? "▴" : "▾"}</span>
                            </td>
                            <td className="py-2 pr-4 text-zinc-600">{fmtLoad(c.todayLoadKg)}</td>
                            <td className="py-2 pr-4 text-zinc-800">{fmtVelocity(c.todayMeanVelocity)}</td>
                            <td className="py-2 pr-4 text-zinc-500">{fmtVelocity(c.pbMeanVelocityAtLoad)}</td>
                            <td className={`py-2 pr-4 ${pctColor(pct)}`}>{fmtPct(pct)}</td>
                            <td className="py-2">
                              {c.isNewPB && (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                  {t.newPb}
                                </span>
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-b border-zinc-100 bg-zinc-50/50">
                              <td colSpan={6} className="px-1 py-2.5">
                                <div className="text-[12px] font-medium leading-snug text-zinc-700">{read}</div>
                                <div className="mt-1 text-[11px] text-zinc-500">
                                  {IS ? "Í dag" : "Today"} {fmtLoad(c.todayLoadKg)} {IS ? "á" : "at"} {fmtVelocity(c.todayMeanVelocity)} {IS ? "vs PB" : "vs PB"} {fmtVelocity(c.pbMeanVelocityAtLoad)} {IS ? "á sömu þyngd" : "at the same load"} = <span className={`font-semibold ${pctColor(pct)}`}>{fmtPct(pct)}</span>
                                  {e1rm != null ? <span className="text-zinc-400"> · {IS ? "áætl. 1RM" : "est. 1RM"} ~{e1rm} kg</span> : null}
                                </div>
                                <div className="mt-1.5 text-[9px] leading-snug text-zinc-400">
                                  {IS
                                    ? "Á fastri þyngd er hraði undir hans besta hraðataps-merki um dagsform (Sánchez-Medina & González-Badillo 2011); áætl. 1RM úr álags–hraða prófíl (González-Badillo 2010). Á eigin PB leikmannsins."
                                    : "At a fixed load, bar speed below his best is the velocity-loss readiness signal (Sánchez-Medina & González-Badillo 2011); est. 1RM from the load–velocity profile (González-Badillo 2010). Against the player's own PB."}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PB Records section */}
          {player.exercises.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold text-zinc-700 mb-2">
                {lang === "IS" ? "Met (PB) yfirlit" : "PB Records"}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-zinc-500">
                      <th className="pb-1 pr-4 font-medium">{t.exercise}</th>
                      <th className="pb-1 pr-4 font-medium">{t.bestLoad}</th>
                      <th className="pb-1 pr-4 font-medium">{t.bestVelocity}</th>
                      <th className="pb-1 pr-4 font-medium">{t.bestPower}</th>
                      <th className="pb-1 pr-4 font-medium">{t.est1rm}</th>
                      <th className="pb-1 font-medium">{t.sessions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.exercises.map((ex) => (
                      <tr key={ex.exerciseName} className="border-b border-zinc-100">
                        <td className="py-2 pr-4 font-medium text-zinc-800">{ex.exerciseName}</td>
                        <td className="py-2 pr-4 text-zinc-600">{fmtLoad(ex.bestLoadKg)}</td>
                        <td className="py-2 pr-4 text-zinc-600">{fmtVelocity(ex.bestMeanVelocity)}</td>
                        <td className="py-2 pr-4 text-zinc-600">{fmtPower(ex.bestPeakPower)}</td>
                        <td className="py-2 pr-4 text-zinc-700 font-semibold">
                          {ex.estimated1RM != null ? `${ex.estimated1RM} kg` : "—"}
                        </td>
                        <td className="py-2 text-zinc-500">{ex.totalSessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">{t.noExercises}</p>
          )}

          {/* Per-load breakdown per exercise */}
          {player.loadBreakdowns && Object.keys(player.loadBreakdowns).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-zinc-700 mb-2">
                {lang === "IS" ? "Þyngdasundurliðun" : "Load Breakdown"}
              </h4>
              {Object.entries(player.loadBreakdowns).map(([exerciseName, loads]) => (
                <div key={exerciseName} className="mb-3">
                  <p className="text-xs font-semibold text-zinc-600 mb-1">{exerciseName}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-zinc-400">
                          <th className="pb-1 pr-3 font-medium">{lang === "IS" ? "Þyngd" : "Load"}</th>
                          <th className="pb-1 pr-3 font-medium">{lang === "IS" ? "Besti hraði" : "Best Velocity"}</th>
                          <th className="pb-1 pr-3 font-medium">{lang === "IS" ? "Hámarkskraftur" : "Peak Power"}</th>
                          <th className="pb-1 pr-3 font-medium">{lang === "IS" ? "Dagsetning" : "Date"}</th>
                          <th className="pb-1 font-medium">{lang === "IS" ? "Sett" : "Sets"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(loads as VbtLoadBreakdown[]).map((lb) => (
                          <tr key={lb.loadKg} className="border-b border-zinc-50">
                            <td className="py-1.5 pr-3 font-medium text-zinc-700">{fmtLoad(lb.loadKg)}</td>
                            <td className="py-1.5 pr-3 text-zinc-600">{fmtVelocity(lb.bestMeanVelocity)}</td>
                            <td className="py-1.5 pr-3 text-zinc-600">{fmtPower(lb.bestPeakPower)}</td>
                            <td className="py-1.5 pr-3 text-zinc-400">{lb.bestDate}</td>
                            <td className="py-1.5 text-zinc-400">{lb.sets}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

