"use client";

/**
 * Basketball SINGLE-match InStat read — the per-game counterpart of the season
 * analysis. Pick an imported InStat game and see just that game: team box (own vs
 * opponent), Four Factors, per-quarter scoring, FG-playtype + efficiency mix, and
 * shot zones (team + per player). Reads /api/coach/basketball-match-insights.
 * Descriptive — never the readiness colour, load, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { shotLabel, zoneLabel, type Lang } from "@/lib/micropulse/basketballStats/shotLabels";

type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null; sharePct: number | null };
type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
type PlayerZones = { name: string; totalMade: number; totalAtt: number; zones: ZoneAgg[] };
type FactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number };
type GameListItem = { matchRef: string; date: string | null; opponent: string | null; ownPoints: number | null; oppPoints: number | null };
type MA = { m: number | null; a: number | null };
type OppPlayer = { name: string; jersey: number | null; minutes: number | null; points: number | null; fg: MA; twoPt: MA; threePt: MA };
type Lineup = { players: string[]; minutes: number | null; plusMinus: number | null; pointsFor: number | null; pointsAgainst: number | null };
type MatchData = {
  match: { matchRef: string; date: string | null; opponent: string | null; ownPoints: number | null; oppPoints: number | null };
  fourFactors: { own: FactorAvg; opp: FactorAvg } | null;
  quarters: { own: (number | null)[]; opp: (number | null)[]; games: number } | null;
  tacticalShots: { playtypes: ShotTypeAgg[]; efficiency: ShotTypeAgg[]; games: number } | null;
  shotZones: { team: ZoneAgg[]; players: PlayerZones[]; games: number } | null;
  lineups: Lineup[] | null;
  oppPlayers: { team: string | null; players: OppPlayer[] } | null;
};

const ma = (c: MA): string => (c.m == null && c.a == null ? "—" : `${c.m ?? 0}-${c.a ?? 0}`);

const d1 = (v: number | null | undefined): string => (v == null ? "—" : v.toFixed(1));
const pctS = (v: number | null | undefined): string => (v == null ? "—" : `${v.toFixed(1)}%`);

function BarRow({ label, share, made, att, pct }: { label: string; share: number; made: number; att: number; pct: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0 truncate text-[12px] text-slate-700" title={label}>{label}</div>
      <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-orange-100/60">
        <div className="absolute inset-y-0 left-0 rounded bg-orange-500/70" style={{ width: `${Math.min(100, share)}%` }} />
      </div>
      <div className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-600">{share}%</div>
      <div className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{made}-{att}{pct != null ? ` · ${pct}%` : ""}</div>
    </div>
  );
}

export default function BasketballSingleMatchAnalysis({ reloadKey }: { reloadKey?: number }) {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const IS = lang === "IS";
  const [games, setGames] = React.useState<GameListItem[] | null>(null);
  const [selected, setSelected] = React.useState<string>("");
  const [data, setData] = React.useState<MatchData | null>(null);
  const [zonesPlayer, setZonesPlayer] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const loadGames = React.useCallback(async () => {
    const tok = await token(); if (!tok) return;
    const res = await fetch("/api/coach/basketball-match-insights", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
    const j = await res.json();
    if (j.ok) { setGames(j.games ?? []); if (!selected && j.games?.[0]) setSelected(j.games[0].matchRef); }
  }, [token, selected]);

  React.useEffect(() => { void loadGames(); }, [loadGames, reloadKey]);

  React.useEffect(() => {
    if (!selected) { setData(null); return; }
    let live = true;
    (async () => {
      const tok = await token(); if (!tok) return;
      setErr(null); setZonesPlayer(null);
      const res = await fetch(`/api/coach/basketball-match-insights?gameId=${encodeURIComponent(selected)}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json();
      if (!live) return;
      if (j.ok) setData(j as MatchData); else { setErr(j.error ?? "Error"); setData(null); }
    })();
    return () => { live = false; };
  }, [selected, token]);

  if (games && games.length === 0) return null; // nothing imported yet — the uploader above covers this
  if (!games) return null;

  const ff = data?.fourFactors;
  const q = data?.quarters;
  const ts = data?.tacticalShots;
  const sz = data?.shotZones;
  const activePlayer = zonesPlayer && sz ? sz.players.find((p) => p.name === zonesPlayer) : null;
  const zones = activePlayer ? activePlayer.zones : sz?.team ?? [];
  const zoneTotalAtt = zones.reduce((s, z) => s + z.att, 0);

  return (
    <div className="space-y-3">
      {/* Game picker + score */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e1d9] bg-white p-3">
        <span className="text-[13px] font-bold text-slate-800">{IS ? "Stakur leikur (InStat)" : "Single game (InStat)"}</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700">
          {games.map((g) => (
            <option key={g.matchRef} value={g.matchRef}>
              {(g.date ? `${g.date} · ` : "") + (g.opponent ?? "—") + (g.ownPoints != null && g.oppPoints != null ? ` (${g.ownPoints}–${g.oppPoints})` : "")}
            </option>
          ))}
        </select>
        {data?.match ? (
          <span className="ml-auto text-[13px] font-bold tabular-nums text-slate-900">
            {data.match.ownPoints ?? "—"} : {data.match.oppPoints ?? "—"}
            <span className="ml-1 text-[11px] font-normal text-slate-400">{IS ? "vs" : "vs"} {data.match.opponent ?? "—"}</span>
          </span>
        ) : null}
      </div>

      {err ? <p className="text-[12px] text-red-600">{err}</p> : null}

      {/* Four Factors (this game) */}
      {ff && (ff.own.games > 0 || ff.opp.games > 0) ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">Four Factors</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
            <span className="text-[11px] text-slate-500">· {IS ? "þessi leikur" : "this game"}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
            {([
              ["eFG%", ff.own.efgPct, ff.opp.efgPct, "pct"],
              ["TO%", ff.own.toPct, ff.opp.toPct, "pct"],
              ["OREB%", ff.own.orebPct, ff.opp.orebPct, "pct"],
              ["FTF", ff.own.ftf, ff.opp.ftf, "pct"],
              ["PPP", ff.own.ppp, ff.opp.ppp, "num"],
            ] as const).map(([label, own, opp, kind]) => (
              <div key={label} className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">{kind === "pct" ? pctS(own) : d1(own)}</div>
                <div className="text-[11px] tabular-nums text-slate-400">{IS ? "Andst." : "Opp"} {kind === "pct" ? pctS(opp) : d1(opp)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Per-quarter (this game) */}
      {q ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{IS ? "Eftir leikhluta" : "By quarter"}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
          </div>
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => {
              const own = q.own[i], opp = q.opp[i];
              const net = own != null && opp != null ? Math.round((own - opp) * 10) / 10 : null;
              return (
                <div key={i} className="rounded-lg border border-orange-100 bg-white px-2 py-2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{IS ? `${i + 1}. lh.` : `Q${i + 1}`}</div>
                  <div className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">{d1(own)}</div>
                  <div className="text-[11px] tabular-nums text-slate-400">{IS ? "Andst." : "Opp"} {d1(opp)}</div>
                  <div className={`mt-0.5 text-[12px] font-semibold tabular-nums ${net == null ? "text-slate-300" : net > 0 ? "text-emerald-600" : net < 0 ? "text-red-600" : "text-slate-400"}`}>
                    {net == null ? "—" : `${net > 0 ? "+" : ""}${net}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* How we scored (this game) */}
      {ts && (ts.playtypes.length > 0 || ts.efficiency.length > 0) ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{IS ? "Hvernig við skoruðum" : "How we scored"}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
          </div>
          {ts.playtypes.length > 0 ? (
            <div className="mt-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{IS ? "Sóknartegundir (FG playtypes)" : "FG playtypes"}</div>
              <div className="mt-1.5 space-y-1.5">
                {ts.playtypes.slice(0, 8).map((r) => <BarRow key={r.key} label={shotLabel(r.key, lang)} share={r.sharePct ?? 0} made={r.made} att={r.att} pct={r.pct} />)}
              </div>
            </div>
          ) : null}
          {ts.efficiency.length > 0 ? (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{IS ? "Sóknargerð (efficiency)" : "Offensive-efficiency types"}</div>
              <div className="mt-1.5 space-y-1.5">
                {ts.efficiency.map((r) => <BarRow key={r.key} label={shotLabel(r.key, lang)} share={r.sharePct ?? 0} made={r.made} att={r.att} pct={r.pct} />)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Shot zones (this game) */}
      {sz && sz.team.length > 0 ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{IS ? "Skotsvæði" : "Shot zones"}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
            {sz.players.length > 0 ? (
              <select value={zonesPlayer ?? ""} onChange={(e) => setZonesPlayer(e.target.value || null)} className="ml-auto rounded border border-orange-200 bg-white px-2 py-1 text-[12px] text-slate-700">
                <option value="">{IS ? "Allt liðið" : "Whole team"}</option>
                {sz.players.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            ) : null}
          </div>
          <div className="mt-2.5 space-y-1.5">
            {zones.map((z) => {
              const share = zoneTotalAtt > 0 ? Math.round((z.att / zoneTotalAtt) * 1000) / 10 : 0;
              return <BarRow key={z.key} label={zoneLabel(z.key, lang)} share={share} made={z.made} att={z.att} pct={z.pct} />;
            })}
          </div>
        </div>
      ) : null}

      {/* Opponent players (this game) — the opponent's per-player shooting from the
          InStat FG table. Scouting read for one game; the season KKÍ scout is separate. */}
      {data?.oppPlayers && data.oppPlayers.players.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{IS ? "Andstæðingur — leikmenn" : "Opponent players"}</span>
            <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
            {data.oppPlayers.team ? <span className="text-[11px] text-slate-500">· {data.oppPlayers.team}</span> : null}
          </div>
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 pr-3 font-semibold">{IS ? "Leikmaður" : "Player"}</th>
                  <th className="py-1 pr-3 text-right font-semibold">{IS ? "Mín" : "Min"}</th>
                  <th className="py-1 pr-3 text-right font-semibold">{IS ? "Stig" : "Pts"}</th>
                  <th className="py-1 pr-3 text-right font-semibold">FG</th>
                  <th className="py-1 pr-1 text-right font-semibold">3PT</th>
                </tr>
              </thead>
              <tbody>
                {[...data.oppPlayers.players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).map((p, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 pr-3 font-medium text-slate-800">{p.name}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-slate-500">{p.minutes != null ? p.minutes.toFixed(1) : "—"}</td>
                    <td className="py-1 pr-3 text-right font-semibold tabular-nums text-slate-800">{p.points ?? "—"}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-slate-500">{ma(p.fg)}</td>
                    <td className="py-1 pr-1 text-right tabular-nums text-slate-500">{ma(p.threePt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {IS ? "Skotlínur andstæðings-leikmanna í þessum leik. Fyrir heilt tímabil, notaðu Andstæðinga-greiningu (KKÍ)." : "Opponent players' shooting lines for this game. For a full season, use Opponent Analysis (KKÍ)."}
          </p>
        </div>
      ) : null}

      {/* Lineups (this game) — 5-man units, minutes and net +/-. The fragile
          per-lineup stat box is not parsed; unit + minutes + net are reliable. */}
      {data?.lineups && data.lineups.length > 0 ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{IS ? "Fimmundir (lineups)" : "Lineups"}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
            <span className="text-[11px] text-slate-500">· {IS ? "raðað eftir mínútum" : "by minutes"}</span>
          </div>
          <div className="mt-2.5 space-y-1.5">
            {[...data.lineups].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0)).slice(0, 10).map((l, i) => {
              const pm = l.plusMinus;
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-orange-100 bg-white px-2.5 py-1.5">
                  <div className="min-w-0 flex-1 truncate text-[12px] text-slate-700" title={l.players.join(", ")}>{l.players.join(", ")}</div>
                  <div className="shrink-0 text-[11px] tabular-nums text-slate-500">{l.minutes != null ? `${l.minutes.toFixed(1)}′` : "—"}</div>
                  <div className="w-16 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{l.pointsFor ?? "—"}–{l.pointsAgainst ?? "—"}</div>
                  <div className={`w-9 shrink-0 text-right text-[12px] font-bold tabular-nums ${pm == null ? "text-slate-300" : pm > 0 ? "text-emerald-600" : pm < 0 ? "text-red-600" : "text-slate-400"}`}>
                    {pm == null ? "—" : `${pm > 0 ? "+" : ""}${pm}`}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {IS ? "Fimmundir með flestar mínútur og net +/− þeirra. Nákvæmi box-tölfræði hverrar fimmundar er ekki lesin (of brotakennd). Lýsandi." : "The most-used 5-man units and their net +/-. The detailed per-lineup box isn't parsed (too fragmented). Descriptive."}
          </p>
        </div>
      ) : null}

      <p className="text-[11px] text-slate-500">
        {IS ? "Lýsandi InStat-lestur á þessum eina leik — season-samantekt er á Season Match Analysis. Snertir ekki readiness." : "Descriptive InStat read of this one game — the season roll-up is on Season Match Analysis. Never touches readiness."}
      </p>
    </div>
  );
}
