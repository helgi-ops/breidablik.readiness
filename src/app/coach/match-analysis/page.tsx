"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/match-analysis — the single-match recap for the coach: how the LAST match went, read from
 * the stats. One match at a time (default = most recent), past matches saved & clickable. Works from
 * StatsBomb (full read: OBV, set pieces, per-player facts) or Wyscout (thinner team-level read).
 * Team Match Insight is the season-wide view; this is one match. Descriptive — never touches the
 * readiness colour, load, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import FirstHalfFadePanel from "@/components/coach/FirstHalfFadePanel";
import StatsbombSingleMatchUpload from "@/components/coach/StatsbombSingleMatchUpload";
import MatchReportPdfReader from "@/components/coach/MatchReportPdfReader";
import SbTeamMatchReportPanel from "@/components/coach/SbTeamMatchReportPanel";
import InstatBasketballUpload from "@/components/coach/InstatBasketballUpload";
import BasketballSingleMatchAnalysis from "@/components/coach/BasketballSingleMatchAnalysis";

type Source = "wyscout" | "statsbomb";
type Named = { name: string; value: number };
type TeamNumbers = {
  goals: number | null; goalsAgainst: number | null; xg: number | null; xgAgainst: number | null; openPlayXg: number | null;
  shots: number | null; shotsAgainst: number | null; possessionPct: number | null; passingPct: number | null; boxTouches: number | null;
  obv: number | null; oppositionObv: number | null; setPieceXg: number | null; oppSetPieceGoals: number | null;
  gkPassLength: number | null; gkLongBallPct: number | null;
};
type NumbersRow = { key: string; label: string; labelIs?: string; own: number | null; opp: number | null; decimals: number };
type MatchAnalysisFacts = {
  header: { opponent: string | null; homeAway: string | null; competition: string | null; date: string; venue: string | null; score: string | null };
  team: TeamNumbers | null; hasTeamData: boolean;
  playerFacts: {
    threat: Named | null; creator: { name: string; value: number; metric: string } | null; buildup: Named | null;
    mostValuable: { name: string; value: number; isGoalkeeper: boolean } | null; defender: Named | null;
    overperformer: { name: string; goals: number; xg: number } | null; underperformer: { name: string; goals: number; xg: number } | null;
  };
  derived: { biggestChanceXg: number | null; xgMinusBiggestChance: number | null; xgPerShotExSetPiece: number | null; openPlayShare: number | null };
  seasonContext: { matches: number; setPieceGoalsConcededPerMatch: number | null; openPlayXgPerMatch: number | null } | null;
  gameInNumbers: NumbersRow[];
  confidence: { level: string; note: string };
};
type MatchAnalysisProse = { theRead?: string; theReadBody?: string; possession?: string; chanceQuality?: string; obv?: string; setPieces?: string; keepingFinishingPressing?: string; whatItTells?: string };
type MatchAnalysis = { date: string; source: Source; teamName: string; analysis: MatchAnalysisFacts; prose: MatchAnalysisProse | null; aiGenerated: boolean };
type MatchListItem = { date: string; opponent: string | null; homeAway: "home" | "away" | null; goalsFor: number | null; goalsAgainst: number | null; has: { wyscout: boolean; statsbomb: boolean } };
type MatchRow = {
  playerId: string; name: string; position: string | null; matchDate: string; opponent: string | null; homeAway: "home" | "away" | null;
  minutes: number | null; goals: number | null; assists: number | null; xg: number | null;
  physical: { distanceKm: number | null; topSpeed: number | null; playerLoad: number | null; matchMinutes: number | null };
};

const ROW_LABELS_IS: Record<string, string> = {
  goals: "Mörk", xg: "xG", openPlayXg: "xG úr opnum leik", shots: "Skot", possession: "Boltahald %",
  passing: "Sendingar %", obv: "OBV (virði aðgerða)", boxTouches: "Snertingar í teig", setPieceXg: "xG úr föstum leik", biggestChance: "Stærsta færi (xG)",
};
const LS_KEY = "match-analysis-source";
const fmt = (n: number | null | undefined, d = 0): string => (n == null ? "–" : n.toFixed(d));

export default function MatchAnalysisPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [providers, setProviders] = React.useState<{ wyscout: boolean; statsbomb: boolean } | null>(null);
  const [source, setSource] = React.useState<Source | null>(null);
  const [sport, setSport] = React.useState<string | undefined>(undefined);
  const [list, setList] = React.useState<MatchListItem[]>([]);
  const [sel, setSel] = React.useState<string>("");
  const [data, setData] = React.useState<MatchAnalysis | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [showFull, setShowFull] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [perMatch, setPerMatch] = React.useState<MatchRow[]>([]);
  const [showPlayers, setShowPlayers] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  // Detect the team's sport — basketball gets an InStat single-match view, not the
  // football StatsBomb/Wyscout xG flow (no xG/OBV indoors).
  React.useEffect(() => {
    (async () => {
      const t = await token(); if (!t) return;
      const res = await fetch("/api/coach/player-stats/config", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) { const j = await res.json().catch(() => ({})); setSport(j.sport); }
    })();
  }, [token]);
  const isBasketball = String(sport ?? "").toLowerCase() === "basketball";

  // For a given match, use the preferred source if it has data, else the other provider that does.
  const effectiveSource = React.useCallback((date: string, pref: Source): Source => {
    const m = list.find((x) => x.date === date);
    if (!m) return pref;
    if (m.has[pref]) return pref;
    return m.has.statsbomb ? "statsbomb" : m.has.wyscout ? "wyscout" : pref;
  }, [list]);

  const loadReview = React.useCallback(async (date: string, src: Source) => {
    setBusy(true); setData(null); setShowFull(false);
    try {
      const t = await token(); if (!t) return;
      const res = await fetch("/api/coach/match-review", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ date, prose: true, lang, mode: "analysis", source: src }) });
      const j = await res.json();
      if (res.ok && j.ok) setData({ date, source: j.source ?? src, teamName: j.teamName ?? "", analysis: j.analysis, prose: j.prose ?? null, aiGenerated: !!j.aiGenerated });
    } finally { setBusy(false); }
  }, [lang, token]);

  // Mount: match list + providers, then default source + last match, then per-player rows.
  React.useEffect(() => {
    (async () => {
      const t = await token(); if (!t) return;
      const [lr, pmr] = await Promise.all([
        fetch("/api/coach/match-review", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()).catch(() => null),
        fetch("/api/coach/player-stats/matches", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (pmr?.rows) setPerMatch(pmr.rows as MatchRow[]);
      if (!lr?.ok) return;
      const matches = (lr.matches ?? []) as MatchListItem[];
      const provs = lr.providers ?? { wyscout: false, statsbomb: false };
      setList(matches); setProviders(provs);
      const param = new URLSearchParams(window.location.search).get("source");
      const stored = (typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null);
      const valid = (s: string | null): s is Source => s === "wyscout" || s === "statsbomb";
      const pref: Source = valid(param) ? param : valid(stored) && provs[stored] ? stored : provs.statsbomb ? "statsbomb" : provs.wyscout ? "wyscout" : "statsbomb";
      setSource(pref);
      if (matches[0]) {
        const d = matches[0].date; setSel(d);
        const eff = matches[0].has[pref] ? pref : matches[0].has.statsbomb ? "statsbomb" : "wyscout";
        void loadReview(d, eff);
      }
    })();
  }, [token, loadReview]);

  const choose = (s: Source) => {
    setSource(s); try { window.localStorage.setItem(LS_KEY, s); } catch { /* ignore */ }
    if (sel) void loadReview(sel, effectiveSource(sel, s));
  };
  const pick = (date: string) => { setSel(date); void loadReview(date, effectiveSource(date, source ?? "statsbomb")); };

  const downloadPdf = React.useCallback(async () => {
    if (!data) return;
    setPdfBusy(true);
    try {
      const a = data.analysis;
      // The narrative match-analysis PDF (verdict + prose + game-in-numbers + per-player). The
      // exact team-metric sheet has its OWN dedicated "Team match stats" PDF, so it is not
      // duplicated as an appendix here — the two PDFs stay distinct (story vs. exact numbers).
      const { downloadMatchAnalysisPdf } = await import("@/components/coach/MatchAnalysisPdf");
      await downloadMatchAnalysisPdf({
        teamName: data.teamName || (is ? "Okkar lið" : "Our team"),
        opponent: a.header.opponent, homeAway: a.header.homeAway, competition: a.header.competition,
        date: a.header.date, venue: a.header.venue, score: a.header.score,
        ownGoals: a.team?.goals ?? null, oppGoals: a.team?.goalsAgainst ?? null,
        gameInNumbers: a.gameInNumbers, seasonContext: a.seasonContext, confidence: a.confidence,
        prose: data.prose, aiGenerated: data.aiGenerated,
      }, is ? "IS" : "EN");
    } finally { setPdfBusy(false); }
  }, [data, is]);

  const rowsForMatch = perMatch.filter((r) => r.matchDate === sel);

  // Basketball: the football xG/OBV match review doesn't apply indoors. Single-match
  // import IS the InStat Game Report (one game) + the per-player table — one file per
  // game, feeding the whole basketball vertical (Season / Player / Opponent).
  if (isBasketball) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">{is ? "Stakur leikur" : "Single Match Analysis"}</h1>
        <PagePurpose
          en="read one game from its InStat data — team box, Four Factors, per-quarter, how you scored (playtypes) and shot zones. Import the free Game Report PDF or the per-player table. Descriptive — never the readiness colour."
          is="lestu einn leik út frá InStat gögnum — liðs-tölur, Four Factors, leikhlutar, hvernig þið skoruðuð (playtypes) og skotsvæði. Flyttu inn fríu leikskýrsluna eða per-leikmann töfluna. Lýsandi — aldrei readiness-liturinn."
        />
        <details className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">
            {is ? "Flytja inn leik (InStat leikskýrsla / tafla)" : "Import a game (InStat Game Report / table)"}
          </summary>
          <div className="mt-3">
            <InstatBasketballUpload onImported={() => window.location.reload()} />
          </div>
        </details>

        {/* This game's InStat read — team box, Four Factors, per-quarter, playtypes, zones. */}
        <div className="mt-4">
          <BasketballSingleMatchAnalysis />
        </div>

        <p className="mt-4 text-[12px] text-slate-500">
          {is
            ? <>Tímabils-samantekt er á <a href="/coach/match-insights" className="font-semibold text-[#2740e6] hover:underline">Season Match Analysis</a>; per-leikmann tölurnar á <a href="/coach/player-analysis" className="font-semibold text-[#2740e6] hover:underline">Player Season Analysis</a>.</>
            : <>The season roll-up is on <a href="/coach/match-insights" className="font-semibold text-[#2740e6] hover:underline">Season Match Analysis</a>; per-player numbers on <a href="/coach/player-analysis" className="font-semibold text-[#2740e6] hover:underline">Player Season Analysis</a>.</>}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Stakur leikur" : "Single Match Analysis"}</h1>
      <PagePurpose
        en="read how your last match went, from the stats — one match at a time (StatsBomb or Wyscout). Season Match Analysis is the whole season; this is one game."
        is="lestu hvernig síðasti leikur fór, út frá tölfræðinni — einn leikur í einu (StatsBomb eða Wyscout). „Heilt tímabil“ er allt tímabilið; þetta er einn leikur."
      />

      {/* Source toggle */}
      {providers && (providers.wyscout || providers.statsbomb) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Gögn" : "Data"}</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[13px] shadow-sm">
            {(["statsbomb", "wyscout"] as const).map((p) => {
              const has = providers[p];
              return (
                <button key={p} onClick={() => choose(p)} className={`rounded-md px-3 py-1 font-semibold ${source === p ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  {p === "statsbomb" ? "StatsBomb" : "Wyscout"}
                  {!has ? <span className={`ml-1 text-[10px] font-normal ${source === p ? "text-blue-100" : "text-slate-400"}`}>{is ? "· engin gögn" : "· no data"}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Match selector — at the TOP so you pick the game first; everything below follows it. */}
      {list.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="match-select" className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikur" : "Match"}</label>
          <select id="match-select" value={sel ?? ""} onChange={(e) => pick(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-800 shadow-sm">
            {list.map((m) => {
              const score = m.goalsFor != null && m.goalsAgainst != null ? ` · ${m.goalsFor}–${m.goalsAgainst}` : "";
              return <option key={m.date} value={m.date}>{m.date}{m.opponent ? ` · ${m.opponent}` : ""}{score}</option>;
            })}
          </select>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500">{is ? "Engir leikir með tölfræði enn — flyttu inn StatsBomb eða Wyscout leikgögn." : "No matches with stats yet — import StatsBomb or Wyscout match data."}</p>
      )}

      {/* Group header — the boxes below are the three ways to bring in / read this one game,
          so they read as one set rather than three unrelated uploads. */}
      <div className="mt-4 border-t border-slate-200 pt-4">
        <h2 className="text-sm font-bold text-slate-700">{is ? "Þessi leikur: innflutningur & skýrslur" : "This match: import & reports"}</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
          {source === "wyscout"
            ? (is
                ? "Veldu leikinn að ofan — Wyscout-greiningin hans birtist að neðan. Wyscout hefur enga stakur-leiks skrá, svo þú hleður tímabils-skránni inn einu sinni á Season Match Analysis og hver leikur birtist svo hér. Þú getur líka lesið hvaða leikskýrslu-PDF sem er (AI). Allt lýsandi — snertir aldrei readiness."
                : "Pick the match above — its Wyscout analysis appears below. Wyscout has no per-match file, so you upload the season file once on Season Match Analysis and each match then appears here. You can also read any match-report PDF (AI). All descriptive — never touches readiness.")
            : (is
                ? "Þrjár leiðir að þessum leik: (1) flyttu leikinn inn í kerfið (knýr greininguna hér að neðan), (2) fáðu AI-frásögn úr leikskýrslu-PDF, (3) lestu nákvæmu liðstölurnar (xG, PPDA, possession…). Allt lýsandi — snertir aldrei readiness."
                : "Three ways into this game: (1) import the match into the system (powers the analysis below), (2) get an AI narrative from a match-report PDF, (3) read the exact team numbers (xG, PPDA, possession…). All descriptive — never touches readiness.")}
        </p>
      </div>

      {/* Single-match import — StatsBomb only. One file = one game; loads into the whole
          system. (Whole-season team file → Season Match Analysis; Squad → Player Season Analysis.) */}
      {source === "statsbomb" ? (
        <div className="mt-3">
          <StatsbombSingleMatchUpload onImported={() => window.location.reload()} />
        </div>
      ) : null}

      {/* Wyscout has no single-match export — its Team → Stats file is always the whole
          season. Point the coach at the season importer; this page then reads each match. */}
      {source === "wyscout" ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] leading-relaxed text-slate-600">
          {is ? (
            <>Wyscout hefur enga stakur-leiks skrá — „Team → Stats“ útflutningurinn er alltaf allt tímabilið (allir leikir í einu). Hladdu skránum (General + Indexes/Defending/Passing/Attacking) inn á <a href="/coach/match-insights" className="font-semibold text-[#2740e6] hover:underline">Season Match Analysis</a>; hver leikur birtist svo hér.</>
          ) : (
            <>Wyscout has no single-match export — its “Team → Stats” file is always the whole season (every fixture at once). Upload the files (General + Indexes/Defending/Passing/Attacking) on <a href="/coach/match-insights" className="font-semibold text-[#2740e6] hover:underline">Season Match Analysis</a>; each match then appears here.</>
          )}
        </div>
      ) : null}

      {/* Read any match-report PDF (Wyscout / StatsBomb / league) into a coach briefing — AI,
          descriptive. Saved against the selected match so a revisit needs no re-upload. */}
      <div className="mt-3">
        {source === "wyscout" ? (
          <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
            {is
              ? "Þessi kassi les hvaða leikskýrslu-PDF sem er — óháð Wyscout eða StatsBomb (líka deildarskýrslur). Hann virkar að fullu fyrir Wyscout-félög."
              : "This box reads any match-report PDF — independent of Wyscout or StatsBomb (league reports too). It works fully for Wyscout clubs."}
          </p>
        ) : null}
        <MatchReportPdfReader date={sel || undefined} />
      </div>

      {/* Team match stats — the readable StatsBomb team-stat report for the selected game (its own
          box, separate from the AI PDF briefing: these are exact numbers, rules compute them). */}
      {source === "statsbomb" && sel ? (
        <div className="mt-3">
          <SbTeamMatchReportPanel date={sel} />
        </div>
      ) : null}

      {busy && <p className="mt-4 text-sm text-slate-400">…</p>}

      {/* Recap card */}
      {data && !busy && (() => {
        const a = data.analysis; const pr = data.prose; const tm = a.team;
        const scoreLine = a.header.score
          ? (a.header.homeAway === "away"
              ? `${a.header.opponent ?? ""} ${tm?.goalsAgainst ?? ""}–${tm?.goals ?? ""} ${data.teamName}`
              : `${data.teamName} ${tm?.goals ?? ""}–${tm?.goalsAgainst ?? ""} ${a.header.opponent ?? ""}`)
          : null;
        const kpis: Array<[string, string]> = tm ? [
          [is ? "Liðs-xG" : "Team xG", `${(tm.xg ?? 0).toFixed(2)} – ${(tm.xgAgainst ?? 0).toFixed(2)}`],
          ["OBV", tm.obv != null ? `${tm.obv.toFixed(2)} – ${(tm.oppositionObv ?? 0).toFixed(2)}` : "—"],
          [is ? "Boltahald" : "Possession", tm.possessionPct != null ? `${Math.round(tm.possessionPct)}%` : "—"],
          [is ? "Fastir leikir xG" : "Set-piece xG", tm.setPieceXg != null ? tm.setPieceXg.toFixed(2) : "—"],
        ] : [];
        const sections: Array<[string, string | undefined]> = [
          [is ? "Boltahald & sendingar" : "Possession & passing", pr?.possession],
          [is ? "xG & gæði færa" : "xG & chance quality", pr?.chanceQuality],
          [is ? "OBV — virði aðgerða" : "OBV — the value of actions", pr?.obv],
          [is ? "Fastir leikir" : "Set pieces", pr?.setPieces],
          [is ? "Markvarsla, klárun & pressa" : "Keeping, finishing & pressing", pr?.keepingFinishingPressing],
          [is ? "Hvað segir þetta okkur" : "What it tells us", pr?.whatItTells],
        ];
        return (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {scoreLine ? <div className="text-[13px] font-semibold text-slate-500">{scoreLine}{a.header.competition ? ` · ${a.header.competition}` : ""}</div> : null}
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{data.source === "statsbomb" ? "StatsBomb" : "Wyscout"}</span>
            </div>

            {pr?.theRead ? (
              <div className="rounded-xl border border-[#2740e6]/20 bg-[#eef0fb] p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{is ? "AI · skrifað úr tölunum, ákveður ekkert" : "AI · written from the numbers, decides nothing"}</div>
                <p className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{pr.theRead}</p>
                {pr.theReadBody ? <p className="mt-2 text-[13px] text-slate-700">{pr.theReadBody}</p> : null}
              </div>
            ) : !a.hasTeamData ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
                {is ? "Engin liðs-tölfræði fyrir þennan leik í valinni uppsprettu. Fyrir fulla greiningu (OBV, fastir leikir) þarf StatsBomb „Match Stats“; Wyscout gefur grunntölur." : "No team stats for this match in the selected source. For the full read (OBV, set pieces) import StatsBomb “Match Stats”; Wyscout gives the base numbers."}
              </div>
            ) : null}

            {kpis.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {kpis.map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-2.5 py-1.5"><div className="text-[10px] uppercase tracking-wide text-slate-400">{k}</div><div className="text-[15px] font-bold tabular-nums text-slate-900">{v}</div></div>
                ))}
              </div>
            ) : null}

            {(a.playerFacts.threat || a.playerFacts.buildup || a.playerFacts.mostValuable || a.playerFacts.defender) ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
                {a.playerFacts.threat ? <span>{is ? "Stærsta færi" : "Biggest chance"}: <b>{a.playerFacts.threat.name}</b> ({a.playerFacts.threat.value.toFixed(2)} xG)</span> : null}
                {a.playerFacts.buildup ? <span>{is ? "Framrás" : "Build-up"}: <b>{a.playerFacts.buildup.name}</b> ({a.playerFacts.buildup.value.toFixed(2)} xGChain)</span> : null}
                {a.playerFacts.mostValuable ? <span>{is ? "Mest virði á bolta" : "Most valuable on the ball"}: <b>{a.playerFacts.mostValuable.name}</b> ({a.playerFacts.mostValuable.value.toFixed(2)} OBV{a.playerFacts.mostValuable.isGoalkeeper ? (is ? ", markv." : ", GK") : ""})</span> : null}
                {a.playerFacts.defender ? <span>{is ? "Vörn" : "Defence"}: <b>{a.playerFacts.defender.name}</b> ({a.playerFacts.defender.value} T+I)</span> : null}
              </div>
            ) : null}

            {(pr && sections.some(([, b]) => b)) || a.gameInNumbers.length ? (
              <div>
                <button onClick={() => setShowFull((v) => !v)} className="text-[12px] font-semibold text-[#2740e6] hover:underline">
                  {showFull ? (is ? "Fela ítarlega greiningu" : "Hide full analysis") : (is ? "Sýna ítarlega greiningu" : "Show full analysis")}
                </button>
                {showFull ? (
                  <div className="mt-3 space-y-3">
                    {sections.map(([title, body]) => body ? (
                      <div key={title}><div className="text-[12px] font-bold text-slate-900">{title}</div><p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{body}</p></div>
                    ) : null)}
                    {a.gameInNumbers.length ? (
                      <div className="overflow-x-auto">
                        <div className="text-[12px] font-bold text-slate-900">{is ? "Leikurinn í tölum" : "The game in numbers"}</div>
                        <table className="mt-1 w-full text-[12px]">
                          <thead><tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-1 text-left font-semibold">{is ? "Á leik" : "Per match"}</th>
                            <th className="py-1 text-right font-semibold">{data.teamName}</th>
                            <th className="py-1 text-right font-semibold">{a.header.opponent ?? (is ? "Andst." : "Opp")}</th>
                          </tr></thead>
                          <tbody>
                            {a.gameInNumbers.map((r) => (
                              <tr key={r.key} className="border-b border-slate-100">
                                <td className="py-1 text-slate-600">{is ? (r.labelIs ?? ROW_LABELS_IS[r.key] ?? r.label) : r.label}</td>
                                <td className="py-1 text-right font-semibold tabular-nums text-slate-900">{r.own == null ? "—" : r.own.toFixed(r.decimals)}</td>
                                <td className="py-1 text-right tabular-nums text-slate-600">{r.opp == null ? "—" : r.opp.toFixed(r.decimals)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    <p className="text-[11px] text-slate-500"><b>{is ? "Áreiðanleiki" : "Confidence"}:</b> {a.confidence.note}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => void downloadPdf()} disabled={pdfBusy} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {pdfBusy ? "…" : (is ? "Leikgreining (PDF)" : "Match analysis (PDF)")}
              </button>
              <p className="text-[11px] text-slate-400">{is ? "Lýsandi — snertir ekki readiness." : "Descriptive — never touches readiness."}</p>
            </div>
          </div>
        );
      })()}

      {/* Per-player breakdown for this match (collapsible) */}
      {rowsForMatch.length > 0 ? (
        <div className="mt-4">
          <button onClick={() => setShowPlayers((v) => !v)} className="text-[12px] font-semibold text-[#2740e6] hover:underline">
            {showPlayers ? (is ? "Fela leikmanna-sundurliðun" : "Hide per-player breakdown") : (is ? `Sýna leikmanna-sundurliðun (${rowsForMatch.length})` : `Show per-player breakdown (${rowsForMatch.length})`)}
          </button>
          {showPlayers ? (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-medium">{is ? "Leikmaður" : "Player"}</th>
                  <th className="px-2 py-2 text-right font-medium">Min</th><th className="px-2 py-2 text-right font-medium">G</th><th className="px-2 py-2 text-right font-medium">A</th><th className="px-2 py-2 text-right font-medium">xG</th>
                  <th className="px-2 py-2 text-center font-medium text-[#2740e6]">‖</th>
                  <th className="px-2 py-2 text-right font-medium">Dist</th><th className="px-2 py-2 text-right font-medium">Top</th><th className="px-2 py-2 text-right font-medium">Load</th><th className="px-2 py-2 text-right font-medium">MMin</th>
                </tr></thead>
                <tbody>
                  {rowsForMatch.map((m) => (
                    <tr key={m.playerId} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{m.name}{m.position ? <span className="ml-1 text-[10px] text-slate-400">{m.position}</span> : null}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.minutes)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">{fmt(m.goals)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.assists)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.xg, 1)}</td>
                      <td className="px-2 py-1.5 text-center text-slate-200">‖</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.distanceKm != null ? fmt(m.physical.distanceKm, 1) : "–"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.topSpeed != null ? fmt(m.physical.topSpeed, 1) : "–"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.playerLoad != null ? m.physical.playerLoad.toLocaleString() : "–"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.matchMinutes != null ? fmt(m.physical.matchMinutes) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* First half vs second half — follows the selected match (moved from Team Match Insight) */}
      <div className="mt-4">
        <FirstHalfFadePanel date={sel || undefined} />
      </div>
    </div>
  );
}
