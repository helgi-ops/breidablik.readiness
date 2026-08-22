"use client";

/**
 * WinFactorsCard — "How this league is won" (explainability-first).
 *
 * Layered read: (0) one-sentence verdict, boldest; (1) 2-3 plain supporting facts, no
 * click; (2) the full ranked correlation tables + net rating + jargon behind "Show
 * details". Confidence (n) renders next to every ranked list. Sourced from the league's
 * FIBA LiveStats team boxes (basketball_fiba_games). Descriptive — never touches readiness.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type FactorR = { key: string; label: Bi; tip?: Bi; r: number; higherIsBetter: boolean; significant: boolean };
type NetRow = { team: string; wins: number; losses: number; gp: number; pf: number; pa: number; net: number };
type Read = {
  games: number; teamGames: number; teams: number; gameCritical: number; teamCritical: number;
  gameReliable: boolean; teamReliable: boolean; eFGDiffR: number;
  gameLevel: FactorR[]; teamLevel: FactorR[]; netRating: NetRow[]; verdict: Bi; facts: Bi[]; confidence: Bi;
};
type League = { competition: string; season: string; stage: string; games: number };
type BeatItem = { key: string; label: Bi; r: number; oppValue: number; leagueAvg: number; higherIsBetter: boolean; note: Bi };
type BeatPlan = { team: string; games: number; exploit: BeatItem[]; neutralize: BeatItem[]; note: Bi };
type FormGame = { gameId: string; opponent: string; win: boolean; pts: number; oppPts: number; margin: number; eFG: number; oppEFG: number };
type TeamForm = { team: string; games: number; wins: number; losses: number; avg: { pf: number; pa: number; net: number; eFG: number; oppEFG: number }; log: FormGame[]; trend: { note: Bi } | null; verdict: Bi; facts: Bi[]; confidence: Bi };
type FormSeason = { key: string; competition: string; season: string; games: number };

const T = {
  EN: { title: "How this league is won", details: "Show details", hide: "Hide details",
    why: "The read", teamTbl: "What correlates with winning — full season (per team)", gameTbl: "…and game to game (per team-game)",
    net: "Net rating table", factor: "Factor", corr: "r", wl: "W-L", pf: "For", pa: "Against", netc: "Net", team: "Team",
    sig: "significant", note: "r = correlation with winning; * = statistically significant at p<.05. Four Factors: Oliver, Dean (2004). Descriptive — never touches readiness.",
    empty: "No league loaded yet — ingest a season's FIBA games (batch by gameid range) to see what wins here.",
    efgDiff: "eFG% differential (own − opponent)",
    beat: "To beat a team, win these factors", pick: "Pick a team…", exploit: "Attack (they're weak here)", neutralize: "Neutralize (their strength)", advisory: "Advisory",
    yourForm: "Your team — how the games are going", log: "Game log", showLog: "Show game log", hideLog: "Hide game log", res: "Result", eFGh: "eFG% ± ", noForm: "Pull your team's games (paste FIBA game URLs on Single Match Analysis) to see how the season is developing." },
  IS: { title: "Hvað vinnur leiki í þessari deild", details: "Sýna details", hide: "Fela details",
    why: "Lesningin", teamTbl: "Hvað fylgir sigrum — heilt tímabil (per lið)", gameTbl: "…og leik fyrir leik (per liða-leik)",
    net: "Nettó-stiga tafla", factor: "Þáttur", corr: "r", wl: "S-T", pf: "Skorað", pa: "Fengin", netc: "Nettó", team: "Lið",
    sig: "marktækt", note: "r = fylgni við sigur; * = tölfræðilega marktækt við p<.05. Four Factors: Oliver, Dean (2004). Lýsandi — snertir aldrei readiness.",
    empty: "Engin deild hlaðin enn — sæktu FIBA-leiki heils tímabils (í gegnum gameid-svið) til að sjá hvað vinnur hér.",
    efgDiff: "eFG% munur (eigin − andstæðingur)",
    beat: "Til að vinna lið, vinnið þessa þætti", pick: "Veldu lið…", exploit: "Sækið (þeir eru veikir hér)", neutralize: "Takið frá þeim (styrkur þeirra)", advisory: "Ráðgefandi",
    yourForm: "Þitt lið — hvernig leikirnir ganga", log: "Leikjaskrá", showLog: "Sýna leikjaskrá", hideLog: "Fela leikjaskrá", res: "Úrslit", eFGh: "eFG% ± ", noForm: "Sæktu leiki liðsins (límdu FIBA-slóðir á Stakur leikur) til að sjá hvernig tímabilið þróast." },
} as const;

const rTxt = (r: number) => `${r > 0 ? "+" : ""}${r.toFixed(2)}`;

function FactorTable({ rows, is, title }: { rows: FactorR[]; is: boolean; title: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map((f) => (
            <tr key={f.key} className="border-b border-slate-100 last:border-0">
              <td className="py-1 pr-2 text-slate-700" title={f.tip ? (is ? f.tip.is : f.tip.en) : undefined}>
                {is ? f.label.is : f.label.en}{f.tip ? <span className="ml-1 cursor-help text-slate-300">ⓘ</span> : null}
              </td>
              <td className={`py-1 text-right tabular-nums font-semibold ${Math.abs(f.r) < 0.001 ? "text-slate-400" : f.r > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {rTxt(f.r)}{f.significant ? <span className="text-slate-400">*</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamFormBlock({ form, is, showLog, onToggleLog }: { form: TeamForm; is: boolean; showLog: boolean; onToggleLog: () => void }) {
  const t = is ? T.IS : T.EN;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{t.yourForm}</div>
      <p className="mt-1 text-[15px] font-bold leading-snug text-slate-900">{is ? form.verdict.is : form.verdict.en}</p>
      <ul className="mt-1 space-y-0.5 text-[12.5px] text-slate-700">
        {form.facts.map((f, i) => <li key={i} className="flex gap-2"><span className="text-slate-400">•</span><span>{is ? f.is : f.en}</span></li>)}
      </ul>
      <button onClick={onToggleLog} className="mt-1.5 text-[12px] font-medium text-[#2740e6] hover:underline">{showLog ? t.hideLog : `${t.showLog} (${form.games})`}</button>
      {showLog && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[340px] text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-2">{t.team}</th><th className="py-1 pr-2 text-center">{t.res}</th>
                <th className="py-1 pr-2 text-right">{t.netc}</th><th className="py-1 text-right" title="eFG% own − opponent">{t.eFGh}</th>
              </tr>
            </thead>
            <tbody>
              {form.log.map((g) => (
                <tr key={g.gameId} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-2 text-slate-700">{g.opponent}</td>
                  <td className={`py-1 pr-2 text-center font-semibold ${g.win ? "text-emerald-600" : "text-red-500"}`}>{g.win ? (is ? "S" : "W") : (is ? "T" : "L")} {g.pts}-{g.oppPts}</td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${g.margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>{g.margin >= 0 ? "+" : ""}{g.margin}</td>
                  <td className={`py-1 text-right tabular-nums ${g.eFG - g.oppEFG >= 0 ? "text-slate-700" : "text-slate-500"}`}>{g.eFG}/{g.oppEFG}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-slate-400">{is ? form.confidence.is : form.confidence.en}</p>
    </div>
  );
}

export default function WinFactorsCard() {
  const [langRaw] = useLang();
  const is = langRaw === "IS";
  const t = is ? T.IS : T.EN;
  const [leagues, setLeagues] = React.useState<League[]>([]);
  const [selKey, setSelKey] = React.useState<string>("");
  const [read, setRead] = React.useState<Read | null>(null);
  const [teamForm, setTeamForm] = React.useState<TeamForm | null>(null);
  const [formSeasons, setFormSeasons] = React.useState<FormSeason[]>([]);
  const [formKey, setFormKey] = React.useState<string>("");
  const [showLog, setShowLog] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [details, setDetails] = React.useState(false);
  const [opponent, setOpponent] = React.useState("");
  const [beat, setBeat] = React.useState<BeatPlan | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  const keyOf = (l: League) => `${l.competition}|${l.season}|${l.stage}`;

  React.useEffect(() => {
    (async () => {
      const tok = await token(); if (!tok) { setLoaded(true); return; }
      const r = await fetch("/api/coach/basketball-win-factors?list=1", { headers: { Authorization: `Bearer ${tok}` } }).then((x) => x.json()).catch(() => null);
      const ls: League[] = r?.leagues ?? [];
      setLeagues(ls);
      setTeamForm((r?.teamForm as TeamForm) ?? null);
      setFormSeasons((r?.teamFormSeasons as FormSeason[]) ?? []);
      setFormKey((r?.teamFormKey as string) ?? "");
      if (ls[0]) setSelKey(keyOf(ls[0])); else setLoaded(true);
    })();
  }, [token]);

  React.useEffect(() => {
    if (!selKey) return;
    (async () => {
      setLoaded(false); setDetails(false);
      const [competition, season, stage] = selKey.split("|");
      const tok = await token(); if (!tok) { setLoaded(true); return; }
      const r = await fetch(`/api/coach/basketball-win-factors?competition=${encodeURIComponent(competition)}&season=${encodeURIComponent(season)}&stage=${encodeURIComponent(stage)}`, { headers: { Authorization: `Bearer ${tok}` } }).then((x) => x.json()).catch(() => null);
      setRead(r?.hasData ? (r.read as Read) : null); setLoaded(true);
    })();
  }, [selKey, token]);

  React.useEffect(() => { setOpponent(""); setBeat(null); }, [selKey]);
  React.useEffect(() => {
    if (!selKey || !opponent) { setBeat(null); return; }
    (async () => {
      const [competition, season, stage] = selKey.split("|");
      const tok = await token(); if (!tok) return;
      const r = await fetch(`/api/coach/basketball-win-factors?competition=${encodeURIComponent(competition)}&season=${encodeURIComponent(season)}&stage=${encodeURIComponent(stage)}&opponent=${encodeURIComponent(opponent)}`, { headers: { Authorization: `Bearer ${tok}` } }).then((x) => x.json()).catch(() => null);
      setBeat((r?.beatPlan as BeatPlan) ?? null);
    })();
  }, [selKey, opponent, token]);

  const loadForm = React.useCallback(async (key: string) => {
    setShowLog(false);
    const tok = await token(); if (!tok) return;
    const r = await fetch(`/api/coach/basketball-win-factors?list=1&formSeason=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${tok}` } }).then((x) => x.json()).catch(() => null);
    setTeamForm((r?.teamForm as TeamForm) ?? null); setFormKey(key);
  }, [token]);

  const prettyLeague = (l: League) => `${l.competition} ${l.season}${l.stage !== "regular" ? ` · ${l.stage}` : ""}`;
  const prettyForm = (f: FormSeason) => f.competition === "untagged" ? `${is ? "Ómerktir leikir" : "Untagged games"} (${f.games})` : `${f.competition} ${f.season} (${f.games})`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-slate-900">{t.title}</div>
        {leagues.length > 1 ? (
          <select value={selKey} onChange={(e) => setSelKey(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-[12px]">
            {leagues.map((l) => <option key={keyOf(l)} value={keyOf(l)}>{prettyLeague(l)}</option>)}
          </select>
        ) : leagues[0] ? <span className="text-[11px] text-slate-400">{prettyLeague(leagues[0])}</span> : null}
      </div>

      {/* Team form — the single-team read; shows even without a full league loaded */}
      {teamForm ? (
        <div className="mt-3">
          {formSeasons.length > 1 ? (
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Tímabil" : "Season"}</span>
              <select value={formKey} onChange={(e) => loadForm(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[12px]">
                {formSeasons.map((f) => <option key={f.key} value={f.key}>{prettyForm(f)}</option>)}
              </select>
            </div>
          ) : null}
          <TeamFormBlock form={teamForm} is={is} showLog={showLog} onToggleLog={() => setShowLog((v) => !v)} />
        </div>
      ) : null}

      {!loaded ? (teamForm ? null : <p className="mt-3 text-sm text-slate-400">…</p>) : !read ? (
        <p className="mt-3 text-[13px] text-slate-500">{teamForm ? t.empty : (leagues.length ? t.empty : t.noForm)}</p>
      ) : (
        <>
          {/* (0) verdict — boldest */}
          <p className="mt-3 text-[19px] font-bold leading-snug text-slate-900">{is ? read.verdict.is : read.verdict.en}</p>

          {/* (1) plain supporting facts — no click */}
          <div className="mt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{t.why}</div>
            <ul className="mt-1 space-y-1 text-[13.5px] text-slate-700">
              {read.facts.map((f, i) => <li key={i} className="flex gap-2"><span className="text-[#2740e6]">•</span><span>{is ? f.is : f.en}</span></li>)}
            </ul>
          </div>

          {/* confidence — always visible, next to the ranked read */}
          <p className="mt-2 text-[11px] text-slate-400">{is ? read.confidence.is : read.confidence.en}</p>

          {/* (2) details — jargon + full tables behind a toggle */}
          <button onClick={() => setDetails((v) => !v)} className="mt-2 text-[12px] font-medium text-[#2740e6] hover:underline">
            {details ? t.hide : t.details}
          </button>
          {details && (
            <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <FactorTable rows={read.teamLevel} is={is} title={`${t.teamTbl} · n=${read.teams} ${read.teamReliable ? `(* ≥ ${read.teamCritical})` : (is ? "(úrtak of lítið)" : "(sample too small)")}`} />
                <FactorTable rows={read.gameLevel} is={is} title={`${t.gameTbl} · n=${read.teamGames} (* ≥ ${read.gameCritical})`} />
              </div>
              <p className="text-[12px] text-slate-600">{t.efgDiff}: <b className="tabular-nums text-slate-800">{rTxt(read.eFGDiffR)}</b></p>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.net}</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[360px] text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="py-1 pr-2">{t.team}</th><th className="py-1 pr-2 text-right">{t.wl}</th>
                        <th className="py-1 pr-2 text-right">{t.pf}</th><th className="py-1 pr-2 text-right">{t.pa}</th><th className="py-1 text-right">{t.netc}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {read.netRating.map((r) => (
                        <tr key={r.team} className="border-b border-slate-100 last:border-0">
                          <td className="py-1 pr-2 text-slate-700">{r.team}</td>
                          <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{r.wins}-{r.losses}</td>
                          <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{r.pf}</td>
                          <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{r.pa}</td>
                          <td className={`py-1 text-right tabular-nums font-semibold ${r.net >= 0 ? "text-emerald-600" : "text-red-500"}`}>{r.net >= 0 ? "+" : ""}{r.net}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">{t.note}</p>
            </div>
          )}

          {/* Per-opponent tie-in — the league's win-factors filtered to this team */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.beat}</span>
              <select value={opponent} onChange={(e) => setOpponent(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[12px]">
                <option value="">{t.pick}</option>
                {read.netRating.map((r) => <option key={r.team} value={r.team}>{r.team}</option>)}
              </select>
            </div>
            {beat && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-red-100 bg-red-50/40 p-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#a83e28]">{t.exploit}</div>
                  {beat.exploit.length ? <ul className="space-y-1 text-[12px] text-slate-700">{beat.exploit.map((i) => <li key={i.key}>• {is ? i.note.is : i.note.en}</li>)}</ul> : <p className="text-[11px] text-slate-400">—</p>}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.neutralize}</div>
                  {beat.neutralize.length ? <ul className="space-y-1 text-[12px] text-slate-700">{beat.neutralize.map((i) => <li key={i.key}>• {is ? i.note.is : i.note.en}</li>)}</ul> : <p className="text-[11px] text-slate-400">—</p>}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
