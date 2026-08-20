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
import InstatBasketballUpload from "@/components/coach/InstatBasketballUpload";
import type { BasketballSeason, Split, PerGame } from "@/lib/micropulse/basketballSeason";
import { shotLabel, zoneLabel } from "@/lib/micropulse/basketballStats/shotLabels";
import type { LineupRead, LineupTier, TaggedUnit } from "@/lib/micropulse/basketballLineups";

type Lang = "EN" | "IS";
type Leader = { name: string; games: number; ppg: number; rpg: number; apg: number } | null;
type Leaders = { scorer: Leader; rebounder: Leader; playmaker: Leader } | null;
type FactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number };
type FourFactors = { own: FactorAvg; opp: FactorAvg } | null;
type Quarters = { own: (number | null)[]; opp: (number | null)[]; games: number } | null;
type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null; sharePct: number | null };
type TacticalShots = { playtypes: ShotTypeAgg[]; efficiency: ShotTypeAgg[]; games: number } | null;
type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
type PlayerZones = { name: string; totalMade: number; totalAtt: number; zones: ZoneAgg[] };
type ShotZones = { team: ZoneAgg[]; players: PlayerZones[]; games: number } | null;

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
    byQuarter: "By quarter", net: "Net", q: ["Q1", "Q2", "Q3", "Q4"],
    quarterHint: "Average points for vs against in each quarter — where you build or lose games. From the InStat feed.",
    importInstat: "Import InStat data (Game Report PDF / table)",
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
    byQuarter: "Eftir leikhluta", net: "Munur", q: ["1. leikhl.", "2. leikhl.", "3. leikhl.", "4. leikhl."],
    quarterHint: "Meðalstig með vs á móti í hverjum leikhluta — hvar þið byggið upp eða tapið leikjum. Úr InStat straumnum.",
    importInstat: "Flytja inn InStat gögn (leikskýrsla PDF / tafla)",
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

/** One tactical shot-type row: label, a share-of-volume bar, made-att and shooting%. */
// Bar width = attempts relative to the busiest category in the group (volume
// ranking), NOT a share of a total — InStat's playtype/zone categories overlap
// (they sum past 100%), so a "share" would overstate. The made-att · shooting% is
// the exact figure from the report.
function ShotTypeRow({ label, row, barPct }: { label: string; row: ShotTypeAgg; barPct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0 truncate text-[12px] text-slate-700" title={label}>{label}</div>
      <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-orange-100/60">
        <div className="absolute inset-y-0 left-0 rounded bg-orange-500/70" style={{ width: `${Math.min(100, barPct)}%` }} />
      </div>
      <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
        {row.made}-{row.att}{row.pct != null ? ` · ${row.pct}%` : ""}
      </div>
    </div>
  );
}

const TIER_CHIP: Record<LineupTier, string> = {
  anchor: "border-emerald-300 bg-emerald-50 text-emerald-700",
  spark: "border-blue-300 bg-blue-50 text-blue-700",
  leak: "border-red-300 bg-red-50 text-red-700",
  thin: "border-slate-300 bg-slate-50 text-slate-500",
};
const tierWord = (t: LineupTier, is: boolean): string =>
  ({ anchor: is ? "kjölfesta" : "anchor", spark: is ? "neisti" : "spark", leak: is ? "leki" : "leak", thin: is ? "of lítið" : "thin" }[t]);
const confWord = (c: string, is: boolean) => (c === "high" ? (is ? "há vissa" : "high confidence") : c === "moderate" ? (is ? "miðlungs vissa" : "moderate confidence") : (is ? "lág vissa" : "low confidence"));
const signed1 = (v: number | null): string => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`);

/**
 * Lineup Intelligence — which 5-man units actually win, from the InStat "Lineups" export.
 * Layered read: verdict → 2–3 facts → "Show units" table, gated by an honest possession
 * floor. Descriptive — never the readiness colour, load, or the daily decision.
 */
function LineupIntelligence({ reloadKey, is }: { reloadKey: number; is: boolean }) {
  const [read, setRead] = React.useState<LineupRead | null>(null);
  const [season, setSeason] = React.useState<string | null>(null);
  const [hasData, setHasData] = React.useState<boolean | null>(null);
  const [details, setDetails] = React.useState(false);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  React.useEffect(() => { (async () => {
    const tok = await token(); if (!tok) return;
    const res = await fetch("/api/coach/basketball-lineups", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
    const j = await res.json();
    if (j.ok) { setHasData(!!j.hasData); setRead(j.read ?? null); setSeason(j.season ?? null); }
  })(); }, [token, reloadKey]);

  if (hasData === false || !read) return null; // nothing to show until a Lineups export is imported

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">{is ? "Fimmunda-greining" : "Lineup Intelligence"}</span>
        <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
        {season ? <span className="text-[11px] text-slate-500">· {season}</span> : null}
        <span className="text-[11px] text-slate-400">· {confWord(read.confidence, is)}</span>
      </div>

      {/* Layer 0 — verdict */}
      <p className="mt-2 text-[14px] font-bold text-slate-900">{is ? read.headline.is : read.headline.en}</p>
      {/* Layer 1 — facts */}
      <ul className="mt-1.5 space-y-1">
        {read.facts.map((f, i) => <li key={i} className="text-[12.5px] text-slate-700">• {is ? f.is : f.en}</li>)}
      </ul>

      {/* Layer 2 — the units table */}
      {read.units.length > 0 ? (
        <>
          <button type="button" onClick={() => setDetails((d) => !d)} className="mt-2 text-[12px] font-semibold text-[#2740e6] hover:underline">
            {details ? (is ? "Fela fimmundir" : "Hide units") : (is ? `Sýna fimmundir (${read.units.length})` : `Show units (${read.units.length})`)}
          </button>
          {details ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[600px] text-[12px]">
                <thead>
                  <tr className="border-b border-orange-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2">{is ? "Fimmund" : "Unit"}</th>
                    <th className="py-1 pr-2 text-right">{is ? "Mín" : "Min"}</th>
                    <th className="py-1 pr-2 text-right">{is ? "Sóknir" : "Poss"}</th>
                    <th className="py-1 pr-2 text-right">Off/100</th>
                    <th className="py-1 pr-2 text-right">Net/100</th>
                    <th className="py-1 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {read.units.map((u: TaggedUnit) => (
                    <tr key={u.lineupHash} className="border-b border-orange-50">
                      <td className="py-1 pr-2 text-slate-700">{u.label}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{u.minutes != null ? u.minutes.toFixed(1) : "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{u.possessions != null ? u.possessions.toFixed(1) : "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{u.offPer100 != null ? u.offPer100.toFixed(1) : "—"}</td>
                      <td className={`py-1 pr-2 text-right tabular-nums font-semibold ${u.netPer100 == null ? "text-slate-400" : u.netPer100 > 0 ? "text-emerald-600" : u.netPer100 < 0 ? "text-red-600" : "text-slate-500"}`}>{signed1(u.netPer100)}</td>
                      <td className="py-1 pl-2"><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TIER_CHIP[u.tier]}`}>{tierWord(u.tier, is)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      {/* In-panel explainer (Layer-2 detail, behind a toggle) */}
      <details className="group mt-2.5 rounded-lg border border-orange-100 bg-white/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold text-slate-700">
          <span>{is ? "Hvað er ég að skoða? Net/100 og fjórðu flokkarnir" : "What am I looking at? Net/100 and the four tiers"}</span>
          <span className="shrink-0 text-[#2740e6] transition-transform group-open:rotate-90">→</span>
        </summary>
        <div className="space-y-3 border-t border-orange-100 px-3 py-3 text-[12px] leading-relaxed text-slate-600">
          <p>{is
            ? "Fimmunda-greiningin svarar spurningu sem box-score getur ekki: hvaða fimm saman á vellinum vinna í raun? Við berum saman nettó-mun hverrar fimmundar á 100 sóknir (hraða-leiðrétt) og röðum þeim — en dæmum aðeins fimmund sem hefur nógu margar sóknir. Lýsandi linsa; snertir aldrei readiness-dóminn."
            : "Lineup Intelligence answers what a box score can't: which five together actually win? We compare each unit's net margin per 100 possessions (pace-adjusted) and rank them — but only judge a unit once it clears a possession floor. A descriptive lens; it never touches the readiness verdict."}</p>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Orðin" : "The words"}</div>
            <ul className="mt-1 space-y-1">
              <li><b>Net/100</b> — {is ? "nettó-mun á 100 sóknir meðan fimmundin er inni (+/−). Hraða-leiðrétt svo hraðar og hægar fimmundir séu sambærilegar." : "net margin per 100 possessions while the unit is on the floor (+/−). Pace-adjusted so fast and slow units compare fairly."}</li>
              <li><b>Off/100</b> — {is ? "stig fimmundarinnar á 100 sóknir (sóknar-skilvirkni)." : "the unit's points per 100 possessions (offensive efficiency)."}</li>
              <li><b>{is ? "Sóknir" : "Poss"}</b> — {is ? "sóknir/leik sem fimmundin deildi vellinum. Undir þröskuldi = of lítið úrtak til að dæma." : "possessions/game the unit shared the floor. Below the floor = too small a sample to judge."}</li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Flokkarnir fjórir" : "The four tiers"}</div>
            <ul className="mt-1 space-y-1.5">
              <li><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TIER_CHIP.anchor}`}>{tierWord("anchor", is)}</span> — {is ? "nógar sóknir OG sterkt net → treystu á hana." : "enough possessions AND strong net → lean on it."}</li>
              <li><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TIER_CHIP.spark}`}>{tierWord("spark", is)}</span> — {is ? "jákvætt net en ekki staðfest (lítið úrtak) → verðskuldar fleiri mínútur, með fyrirvara." : "positive net but not confirmed (small sample) → worth more minutes, with a caveat."}</li>
              <li><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TIER_CHIP.leak}`}>{tierWord("leak", is)}</span> — {is ? "nógar sóknir OG neikvætt net → endurskoðaðu hana." : "enough possessions AND negative net → reconsider it."}</li>
              <li><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TIER_CHIP.thin}`}>{tierWord("thin", is)}</span> — {is ? "of lítið úrtak til að segja neitt → sýnd, aldrei dæmd." : "too small a sample to say anything → shown, never judged."}</li>
            </ul>
          </div>
          <p className="text-[11px] text-slate-400">{is ? "Reglur reikna — ekki AI. Oliver 2004 (Basketball on Paper) · Kubatko o.fl. 2007. Þröskuldur og heiðarleg úrtaks-hlið eru kjarninn — körfubolta-fimmundagögn eru hávær." : "Rules compute — not AI. Oliver 2004 (Basketball on Paper) · Kubatko et al. 2007. The possession floor and honest small-sample gating are the point — basketball lineup data is noisy."}</p>
        </div>
      </details>
    </div>
  );
}

export default function BasketballSeasonMatchAnalysis() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [season, setSeason] = React.useState<BasketballSeason | null>(null);
  const [leaders, setLeaders] = React.useState<Leaders>(null);
  const [fourFactors, setFourFactors] = React.useState<FourFactors>(null);
  const [quarters, setQuarters] = React.useState<Quarters>(null);
  const [tacticalShots, setTacticalShots] = React.useState<TacticalShots>(null);
  const [shotZones, setShotZones] = React.useState<ShotZones>(null);
  const [zonesPlayer, setZonesPlayer] = React.useState<string | null>(null);
  const [hasData, setHasData] = React.useState<boolean | null>(null);
  const [details, setDetails] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const load = React.useCallback(async () => {
    const tok = await token(); if (!tok) return;
    const res = await fetch("/api/coach/basketball-season-insights", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
    const j = await res.json();
    if (j.ok) { setHasData(!!j.hasData); setSeason(j.season ?? null); setLeaders(j.leaders ?? null); setFourFactors(j.fourFactors ?? null); setQuarters(j.quarters ?? null); setTacticalShots(j.tacticalShots ?? null); setShotZones(j.shotZones ?? null); }
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

  // InStat import lives on the analysis page itself (like the football uploads).
  // Available even before any data exists, so the coach can seed it here.
  const importer = (
    <details className="rounded-xl border border-orange-200 bg-orange-50/40 px-4 py-2.5">
      <summary className="cursor-pointer text-[12px] font-semibold text-orange-800">{t.importInstat}</summary>
      <div className="mt-3"><InstatBasketballUpload onImported={() => { void load(); setReloadKey((k) => k + 1); }} /></div>
    </details>
  );

  if (hasData === false) return <div className="space-y-3">{importer}<LineupIntelligence reloadKey={reloadKey} is={lang === "IS"} /><p className="text-[13px] text-slate-500">{t.none}</p></div>;
  if (!season) return <div className="space-y-3">{importer}<p className="text-sm text-slate-400">…</p></div>;

  const a = season.averages;
  const rec = season.record;
  const avgMargin = season.marginSeries.length ? Math.round((season.marginSeries.reduce((s, m) => s + m.margin, 0) / season.marginSeries.length) * 10) / 10 : null;

  return (
    <div className="space-y-3">
      {importer}
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

      {/* Lineup Intelligence (InStat "Lineups" export) — which 5-man units win. Self-hides
          until a Lineups export is imported. Descriptive, never a signal. */}
      <LineupIntelligence reloadKey={reloadKey} is={lang === "IS"} />

      {/* Per-quarter scoring (InStat) — average points for vs against per quarter,
          with net margin. Where the team builds or loses games. Descriptive. */}
      {quarters && quarters.games > 0 ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{t.byQuarter}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t.ffTag}</span>
            <span className="text-[11px] text-slate-500">· {quarters.games} {t.ffGames}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => {
              const own = quarters.own[i];
              const opp = quarters.opp[i];
              const net = own != null && opp != null ? Math.round((own - opp) * 10) / 10 : null;
              return (
                <div key={i} className="rounded-lg border border-orange-100 bg-white px-2 py-2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.q[i]}</div>
                  <div className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">{d1(own)}</div>
                  <div className="text-[11px] tabular-nums text-slate-400">{t.ffOpp} {d1(opp)}</div>
                  <div className={`mt-0.5 text-[12px] font-semibold tabular-nums ${net == null ? "text-slate-300" : net > 0 ? "text-emerald-600" : net < 0 ? "text-red-600" : "text-slate-400"}`}>
                    {net == null ? "—" : `${net > 0 ? "+" : ""}${net}`}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 text-[11px] text-slate-500">{t.quarterHint}</p>
        </div>
      ) : null}

      {/* How we score — FG playtypes + efficiency shot types (InStat advanced).
          Ranked by share of shot volume; each row shows shooting%. The plain
          "how we generate offence" read. Descriptive, never a signal. */}
      {tacticalShots && (tacticalShots.playtypes.length > 0 || tacticalShots.efficiency.length > 0) ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{lang === "IS" ? "Hvernig við skorum" : "How we score"}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
            <span className="text-[11px] text-slate-500">· {tacticalShots.games} {t.ffGames}</span>
          </div>

          {tacticalShots.playtypes.length > 0 ? (() => {
            const rows = tacticalShots.playtypes.slice(0, 8);
            const maxAtt = Math.max(1, ...rows.map((r) => r.att));
            return (
              <div className="mt-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{lang === "IS" ? "Sóknartegundir (FG playtypes)" : "FG playtypes"}</div>
                <div className="mt-1.5 space-y-1.5">
                  {rows.map((r) => (
                    <ShotTypeRow key={r.key} label={shotLabel(r.key, lang)} row={r} barPct={(r.att / maxAtt) * 100} />
                  ))}
                </div>
              </div>
            );
          })() : null}

          {tacticalShots.efficiency.length > 0 ? (() => {
            const maxAtt = Math.max(1, ...tacticalShots.efficiency.map((r) => r.att));
            return (
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{lang === "IS" ? "Sóknargerð (efficiency)" : "Offensive-efficiency types"}</div>
                <div className="mt-1.5 space-y-1.5">
                  {tacticalShots.efficiency.map((r) => (
                    <ShotTypeRow key={r.key} label={shotLabel(r.key, lang)} row={r} barPct={(r.att / maxAtt) * 100} />
                  ))}
                </div>
              </div>
            );
          })() : null}

          <p className="mt-2.5 text-[11px] text-slate-500">
            {lang === "IS"
              ? "Súlan = hlutfallslegt magn (lengst = flest skot); „m-t · %“ = hittni þeirrar tegundar. InStat-flokkar skarast, svo þeir leggjast ekki í 100%. Lýsandi — snertir ekki readiness."
              : "Bar = relative volume (longest = most shots); \"m-a · %\" = shooting on that type. InStat categories overlap, so they don't sum to 100%. Descriptive — never touches readiness."}
          </p>
        </div>
      ) : null}

      {/* Shot zones (InStat per-player distance bands) — the "shot chart" as zone
          efficiency. Team-wide by default; pick a player to see his profile.
          Descriptive, never a signal. */}
      {shotZones && shotZones.team.length > 0 ? (() => {
        const active = zonesPlayer ? shotZones.players.find((p) => p.name === zonesPlayer) : null;
        const zones = active ? active.zones : shotZones.team;
        const maxAtt = Math.max(1, ...zones.map((z) => z.att));
        return (
          <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-slate-800">{lang === "IS" ? "Skotsvæði" : "Shot zones"}</span>
              <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
              <span className="text-[11px] text-slate-500">· {shotZones.games} {t.ffGames}</span>
              {shotZones.players.length > 0 ? (
                <select
                  value={zonesPlayer ?? ""}
                  onChange={(e) => setZonesPlayer(e.target.value || null)}
                  className="ml-auto rounded border border-orange-200 bg-white px-2 py-1 text-[12px] text-slate-700"
                >
                  <option value="">{lang === "IS" ? "Allt liðið" : "Whole team"}</option>
                  {shotZones.players.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="mt-2.5 space-y-1.5">
              {zones.map((z) => (
                <div key={z.key} className="flex items-center gap-2">
                  <div className="w-32 shrink-0 truncate text-[12px] text-slate-700" title={zoneLabel(z.key, lang)}>{zoneLabel(z.key, lang)}</div>
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-orange-100/60">
                    <div className="absolute inset-y-0 left-0 rounded bg-orange-500/70" style={{ width: `${Math.min(100, (z.att / maxAtt) * 100)}%` }} />
                  </div>
                  <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{z.made}-{z.att}{z.pct != null ? ` · ${z.pct}%` : ""}</div>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] text-slate-500">
              {lang === "IS"
                ? "Hlutfall = hluti af skottilraunum eftir svæði; % = skotnýting á svæðinu. Úr InStat leikmanna-gögnum."
                : "Share = portion of attempts by zone; % = shooting on that zone. From the InStat per-player feed."}
            </p>
          </div>
        );
      })() : null}

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
