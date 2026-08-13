"use client";

/**
 * Basketball Season Match Analysis — the box-score season read for a basketball team
 * (the counterpart of the football GPS/xG Season Match Analysis).
 *
 * Layered read: a one-line verdict (record + scoring) → a few plain facts (home/away,
 * leaders) → "Show details" (per-game trend, per-opponent, win/loss splits) + the
 * score-entry editor. Own-team box scores come from the KKÍ / Instat feed; final scores
 * are coach-entered here, which unlocks win/loss and margin. Descriptive context — it
 * never touches the readiness colour, load, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { BasketballSeason, Split, PerGame } from "@/lib/micropulse/basketballSeason";

type Lang = "EN" | "IS";
type Leader = { name: string; games: number; ppg: number; rpg: number; apg: number } | null;
type Leaders = { scorer: Leader; rebounder: Leader; playmaker: Leader } | null;
type FactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number };
type FourFactors = { own: FactorAvg; opp: FactorAvg } | null;

const T = {
  EN: {
    none: "No basketball game data yet — it arrives from the KKÍ / Instat (Hudl) feed.",
    games: "games", record: "record", ppg: "PPG", oppPpg: "opp PPG", margin: "avg margin",
    noResults: "No final scores entered yet — add opponent points below to unlock win/loss and margin.",
    home: "Home", away: "Away", leaders: "Season leaders", scorer: "Scorer", rebounder: "Rebounder", playmaker: "Playmaker",
    showDetails: "Show details", hideDetails: "Hide details",
    averages: "Season averages", perGame: "Game by game", byOpponent: "By opponent", winLoss: "Wins vs losses",
    enterResults: "Enter final scores", enterHint: "Your points come from the box score; type the opponent's final score. Saved per game.",
    us: "Us", them: "Them", opp: "Opponent", result: "Result", save: "Save", saved: "Saved", saving: "…",
    fg: "FG%", tp: "3P%", ft: "FT%", reb: "REB", ast: "AST", tov: "TOV", stl: "STL", blk: "BLK",
    perfNote: "Descriptive box-score context — never the readiness colour, load, or the daily decision.",
    win: "In wins", loss: "In losses", w: "W", l: "L",
    ff: "Four Factors", ffTag: "InStat", ffYou: "You", ffOpp: "Opp", ffGames: "games",
    ffHint: "Dean Oliver's “what wins games”, from the InStat feed. Descriptive — cites source: instat.",
    efg: "eFG%", toRate: "TO%", orebRate: "OREB%", ftf: "FTF", ppp: "PPP",
    efgTip: "Effective FG% — field-goal % that credits the extra point a three is worth.",
    toTip: "Turnover rate — turnovers per possession (lower is better).",
    orebTip: "Offensive-rebound % — share of your missed shots you rebound.",
    ftfTip: "Free-throw factor — free throws made relative to shots taken (getting to the line).",
    pppTip: "Points per possession — scoring efficiency.",
  },
  IS: {
    none: "Engin körfubolta-leikgögn enn — þau berast úr KKÍ / Instat (Hudl) straumnum.",
    games: "leikir", record: "staða", ppg: "stig/leik", oppPpg: "andst. stig/leik", margin: "meðalmunur",
    noResults: "Engin lokastaða skráð enn — skráðu stig andstæðinga hér að neðan til að fá sigra/töp og mun.",
    home: "Heima", away: "Úti", leaders: "Efstir á tímabilinu", scorer: "Stigahæstur", rebounder: "Fráköst", playmaker: "Stoðsendingar",
    showDetails: "Sýna nánar", hideDetails: "Fela nánar",
    averages: "Meðaltöl tímabils", perGame: "Leik fyrir leik", byOpponent: "Eftir andstæðingi", winLoss: "Sigrar vs töp",
    enterResults: "Skrá lokastöður", enterHint: "Þín stig koma úr leikskýrslunni; sláðu inn lokastig andstæðingsins. Vistast per leik.",
    us: "Við", them: "Þeir", opp: "Andstæðingur", result: "Úrslit", save: "Vista", saved: "Vistað", saving: "…",
    fg: "Vallarsk.%", tp: "3ja%", ft: "Víti%", reb: "Fráköst", ast: "Stoðs.", tov: "Tapaðir", stl: "Stolnir", blk: "Varin",
    perfNote: "Lýsandi leikskýrslu-samhengi — aldrei readiness-liturinn, álag né daglega ákvörðunin.",
    win: "Í sigrum", loss: "Í töpum", w: "S", l: "T",
    ff: "Four Factors", ffTag: "InStat", ffYou: "Þið", ffOpp: "Andst.", ffGames: "leikir",
    ffHint: "„Það sem vinnur leiki“ (Dean Oliver), úr InStat straumnum. Lýsandi — vísar í source: instat.",
    efg: "eFG%", toRate: "TO%", orebRate: "OREB%", ftf: "FTF", ppp: "PPP",
    efgTip: "Effective FG% — vallarskotanýting sem tekur tillit til aukastigsins í þristum.",
    toTip: "Tapaðir boltar á sókn (lægra er betra).",
    orebTip: "Sóknarfráköst — hlutfall eigin skotmissa sem þið náið fráköstum á.",
    ftfTip: "Vítaþáttur — vítaskot hitt m.v. fjölda skota (að komast á línuna).",
    pppTip: "Stig á sókn — skilvirkni í sókn.",
  },
} as const;

const d1 = (v: number | null | undefined): string => (v == null ? "—" : v.toFixed(1));
const pctS = (v: number | null | undefined): string => (v == null ? "—" : `${v.toFixed(1)}%`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#eceae2] bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-[Archivo,sans-serif] text-lg font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function SplitRow({ label, s }: { label: string; s: Split }) {
  return (
    <tr className="border-t border-[#eceae2]">
      <td className="py-1 pr-3 font-medium text-slate-800">{label}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{s.games}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{d1(s.pts)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{pctS(s.fgPct)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{pctS(s.tpPct)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{d1(s.reb)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{d1(s.ast)}</td>
      <td className="py-1 pr-1 text-right tabular-nums">{d1(s.tov)}</td>
    </tr>
  );
}

/** Points-per-game sparkline (own points), win/loss-coloured when results exist. */
function PointsSpark({ perGame }: { perGame: PerGame[] }) {
  const vals = perGame.map((p) => p.pointsFor ?? p.pts);
  if (vals.length < 2) return null;
  const max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const w = 100, h = 28, step = w / (vals.length - 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full">
      <polyline fill="none" stroke="#2740e6" strokeWidth={1.2}
        points={vals.map((v, i) => `${i * step},${h - ((v - min) / span) * (h - 4) - 2}`).join(" ")} />
      {perGame.map((p, i) => {
        const v = p.pointsFor ?? p.pts;
        const c = p.result === "W" ? "#1c7a4a" : p.result === "L" ? "#a83e28" : "#9aa3af";
        return <circle key={i} cx={i * step} cy={h - ((v - min) / span) * (h - 4) - 2} r={1.4} fill={c} />;
      })}
    </svg>
  );
}

export default function BasketballSeasonMatchAnalysis() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [season, setSeason] = React.useState<BasketballSeason | null>(null);
  const [leaders, setLeaders] = React.useState<Leaders>(null);
  const [fourFactors, setFourFactors] = React.useState<FourFactors>(null);
  const [hasData, setHasData] = React.useState<boolean | null>(null);
  const [details, setDetails] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const load = React.useCallback(async () => {
    const tok = await token(); if (!tok) return;
    const res = await fetch("/api/coach/basketball-season-insights", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
    const j = await res.json();
    if (j.ok) { setHasData(!!j.hasData); setSeason(j.season ?? null); setLeaders(j.leaders ?? null); setFourFactors(j.fourFactors ?? null); }
  }, [token]);

  React.useEffect(() => { void load(); }, [load]);

  const saveResult = async (g: PerGame) => {
    const raw = drafts[g.gameId]; if (raw == null || raw === "") return;
    setSavingId(g.gameId);
    try {
      const tok = await token(); if (!tok) return;
      await fetch("/api/coach/basketball-season-insights", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ gameId: g.gameId, gameDate: g.date, opponent: g.opponent, pointsFor: g.pointsFor, pointsAgainst: Number(raw) }),
      });
      await load();
    } finally { setSavingId(null); }
  };

  if (hasData === false) return <p className="text-[13px] text-slate-500">{t.none}</p>;
  if (!season) return <p className="text-sm text-slate-400">…</p>;

  const a = season.averages;
  const rec = season.record;
  const avgMargin = season.marginSeries.length ? Math.round((season.marginSeries.reduce((s, m) => s + m.margin, 0) / season.marginSeries.length) * 10) / 10 : null;

  return (
    <div className="space-y-3">
      {/* Layer 0 — one-line verdict */}
      <div className="rounded-xl border border-[#e3e1d9] bg-white p-4">
        <p className="text-[15px] font-bold text-slate-900">
          {rec ? `${rec.wins}–${rec.losses}${rec.ties ? `–${rec.ties}` : ""} · ` : `${season.gamesPlayed} ${t.games} · `}
          {d1(a.pts)} {t.ppg}
          {avgMargin != null ? ` · ${avgMargin > 0 ? "+" : ""}${avgMargin} ${t.margin}` : ""}
          {pctS(a.fgPct) !== "—" ? ` · ${pctS(a.fgPct)} ${t.fg}` : ""}
        </p>
        {/* Layer 1 — a few plain facts */}
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={`${t.home} ${t.ppg}`} value={d1(season.homeAway.home.pts)} />
          <Stat label={`${t.away} ${t.ppg}`} value={d1(season.homeAway.away.pts)} />
          <Stat label={t.fg} value={pctS(a.fgPct)} />
          <Stat label={t.tp} value={pctS(a.tpPct)} />
        </div>
        {!rec ? <p className="mt-2 text-[12px] text-amber-700">{t.noResults}</p> : null}
        {leaders ? (
          <p className="mt-2 text-[12px] text-slate-600">
            <span className="font-semibold">{t.leaders}:</span>{" "}
            {leaders.scorer ? `${t.scorer} ${leaders.scorer.name} (${d1(leaders.scorer.ppg)})` : ""}
            {leaders.rebounder ? ` · ${t.rebounder} ${leaders.rebounder.name} (${d1(leaders.rebounder.rpg)})` : ""}
            {leaders.playmaker ? ` · ${t.playmaker} ${leaders.playmaker.name} (${d1(leaders.playmaker.apg)})` : ""}
          </p>
        ) : null}
      </div>

      {/* Four Factors (InStat) — the "what wins games" read, own vs opponent. Only
          shown once InStat team data has been imported. Descriptive, cited. */}
      {fourFactors && (fourFactors.own.games > 0 || fourFactors.opp.games > 0) ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{t.ff}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t.ffTag}</span>
            <span className="text-[11px] text-slate-500">· {fourFactors.own.games} {t.ffGames}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
            {([
              ["efg", t.efg, t.efgTip, fourFactors.own.efgPct, fourFactors.opp.efgPct, "pct"],
              ["to", t.toRate, t.toTip, fourFactors.own.toPct, fourFactors.opp.toPct, "pct"],
              ["oreb", t.orebRate, t.orebTip, fourFactors.own.orebPct, fourFactors.opp.orebPct, "pct"],
              ["ftf", t.ftf, t.ftfTip, fourFactors.own.ftf, fourFactors.opp.ftf, "pct"],
              ["ppp", t.ppp, t.pppTip, fourFactors.own.ppp, fourFactors.opp.ppp, "num"],
            ] as const).map(([key, label, tip, own, opp, kind]) => (
              <div key={key} className="min-w-0">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500" title={tip}>
                  <span className="truncate">{label}</span>
                  <span className="cursor-help text-slate-300">ⓘ</span>
                </div>
                <div className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">{kind === "pct" ? pctS(own) : d1(own)}</div>
                <div className="text-[11px] tabular-nums text-slate-400">{t.ffOpp} {kind === "pct" ? pctS(opp) : d1(opp)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-slate-500">{t.ffHint}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setDetails((v) => !v)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50">
          {details ? t.hideDetails : t.showDetails}
        </button>
        <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">
          {t.enterResults}
        </button>
      </div>

      {/* Score-entry editor */}
      {editing ? (
        <div className="rounded-xl border border-[#f0e2c8] bg-[#fdf8ee] p-3">
          <p className="mb-2 text-[12px] text-slate-600">{t.enterHint}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-3 font-semibold">{t.opp}</th>
                  <th className="py-1 pr-3 text-right font-semibold">{t.us}</th>
                  <th className="py-1 pr-3 text-right font-semibold">{t.them}</th>
                  <th className="py-1 pr-1 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {season.perGame.map((g) => (
                  <tr key={g.gameId} className="border-t border-[#eceae2]">
                    <td className="py-1 pr-3 text-slate-700">{g.date ?? ""} {g.opponent ?? "—"}{g.homeAway ? ` (${g.homeAway === "home" ? t.home[0] : t.away[0]})` : ""}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{g.pointsFor ?? "—"}</td>
                    <td className="py-1 pr-3 text-right">
                      <input type="number" min={0} defaultValue={g.pointsAgainst ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [g.gameId]: e.target.value }))}
                        className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right tabular-nums" />
                    </td>
                    <td className="py-1 pr-1">
                      <button onClick={() => saveResult(g)} disabled={savingId === g.gameId}
                        className="rounded border border-[#2740e6] px-1.5 py-0.5 text-[11px] font-semibold text-[#2740e6] hover:bg-[#eef0fb] disabled:opacity-50">
                        {savingId === g.gameId ? t.saving : g.result ? `${g.result} · ${t.save}` : t.save}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Layer 2 — details */}
      {details ? (
        <div className="space-y-4">
          {/* Home/away split table */}
          <div>
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.averages}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-semibold" />
                    <th className="py-1 pr-3 text-right font-semibold">{t.games}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.ppg}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.fg}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.tp}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.reb}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.ast}</th>
                    <th className="py-1 pr-1 text-right font-semibold">{t.tov}</th>
                  </tr>
                </thead>
                <tbody>
                  <SplitRow label="Total" s={a} />
                  <SplitRow label={t.home} s={season.homeAway.home} />
                  <SplitRow label={t.away} s={season.homeAway.away} />
                  {season.winLoss ? <SplitRow label={t.win} s={season.winLoss.win} /> : null}
                  {season.winLoss ? <SplitRow label={t.loss} s={season.winLoss.loss} /> : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-game trend */}
          <div>
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.perGame}</div>
            <PointsSpark perGame={season.perGame} />
            <div className="mt-1 max-h-52 overflow-y-auto overflow-x-auto">
              <table className="w-full text-[12px]">
                <tbody>
                  {season.perGame.slice().reverse().map((g) => (
                    <tr key={g.gameId} className="border-t border-[#eceae2]">
                      <td className="py-1 pr-3 text-slate-500">{g.date ?? ""}</td>
                      <td className="py-1 pr-3 text-slate-700">{g.opponent ?? "—"}{g.homeAway ? ` (${g.homeAway === "home" ? t.home[0] : t.away[0]})` : ""}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{g.pointsFor ?? g.pts}{g.pointsAgainst != null ? `–${g.pointsAgainst}` : ""}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-slate-500">{pctS(g.fgPct)}</td>
                      <td className="py-1 pr-1 text-right font-semibold" style={{ color: g.result === "W" ? "#1c7a4a" : g.result === "L" ? "#a83e28" : "#9aa3af" }}>
                        {g.result === "W" ? t.w : g.result === "L" ? t.l : ""}{g.margin != null ? ` ${g.margin > 0 ? "+" : ""}${g.margin}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per opponent */}
          <div>
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.byOpponent}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-semibold">{t.opp}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.games}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.us}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t.them}</th>
                    <th className="py-1 pr-1 text-right font-semibold">{t.record}</th>
                  </tr>
                </thead>
                <tbody>
                  {season.byOpponent.map((o) => (
                    <tr key={o.opponent} className="border-t border-[#eceae2]">
                      <td className="py-1 pr-3 font-medium text-slate-800">{o.opponent}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{o.games}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{d1(o.ptsFor)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{d1(o.ptsAgainst)}</td>
                      <td className="py-1 pr-1 text-right tabular-nums">{o.wins + o.losses > 0 ? `${o.wins}–${o.losses}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-slate-400">{t.perfNote}</p>
    </div>
  );
}
