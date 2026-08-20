"use client";

/**
 * Basketball Opponent Analysis — detailed scouting of a league opponent from their OWN
 * whole-season box scores, pulled free from the public KKÍ widget (or uploaded from
 * Instat later). Layered read: a one-line profile → a few plain facts (scoring, shooting,
 * key man) → "how to defend them" flags + the full player breakdown. Descriptive scouting
 * only — it never touches the readiness colour, load, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { BasketballOpponentReport, OppPlayer } from "@/lib/micropulse/basketballOpponentReport";
import BasketballCourtMap from "@/components/coach/BasketballCourtMap";
import InstatBasketballUpload from "@/components/coach/InstatBasketballUpload";
import FibaShotCharts from "@/components/coach/FibaShotCharts";
import { shotLabel } from "@/lib/micropulse/basketballStats/shotLabels";

type OppShotType = { key: string; made: number; att: number; pct: number | null };
type OppAi = {
  headline?: string; summary?: string;
  strengths?: string[]; weaknesses?: string[];
  keyPlayers?: { name: string; note: string }[];
  howToDefend?: string[]; howToAttack?: string[];
};

type Lang = "EN" | "IS";
type Strings = (typeof T)["EN"] | (typeof T)["IS"];
type OppItem = { name: string; scouted: boolean; games: number | null; syncedAt: string | null };
type OppFourFactors = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number } | null;

const T = {
  EN: {
    pick: "Opponent", scout: "Scout this opponent (free · KKÍ)", scouting: "Pulling season…", rescout: "Refresh from KKÍ",
    none: "No opponents to scout yet — they appear once you have games against them.",
    notScouted: "Not scouted yet. Pull their season from the free KKÍ feed to build the report.",
    games: "games", ppg: "PPG", fg: "FG%", tp: "3P%", tpaPg: "3PA/g", reb: "REB", ast: "AST", tov: "TOV",
    home: "Home", away: "Away", defend: "How to defend them", keyPlayers: "Key players", allPlayers: "Full roster",
    showAll: "Show full roster", hideAll: "Hide roster", synced: "Scouted", tags: {
      primary_scorer: "scorer", three_point_threat: "3pt threat", playmaker: "playmaker", glass: "glass",
    } as Record<string, string>,
    mpg: "MPG", spg: "STL", threat: "Threat",
    moreInfo: "Details", shooting: "Shooting profile", two: "2P", three: "3P", ft: "FT",
    ptsTrend: "Points / game", noShotChart: "Make/attempt splits — the KKÍ feed has no shot locations, so no court chart.",
    lastGames: "Last {n} games", opp: "Opponent",
    perfNote: "Descriptive scouting from the opponent's public KKÍ box scores — never a readiness or medical judgement.",
    err: "Couldn't pull that opponent from KKÍ. Check the team name matches KKÍ exactly, or try again.",
    ffTitle: "How they played you", ffTag: "InStat",
    ffHint: "Their Four Factors in your head-to-head games, from imported InStat Game Reports. Descriptive.",
    instatUpload: "Import InStat Game Report (head-to-head)",
    instatUploadHint: "Upload the InStat game report of a match you played this opponent — it fills the “How they played you” Four Factors (for both teams). Descriptive; never a readiness judgement.",
    seasonSrc: "Whole season from", srcKki: "KKÍ", srcInstat: "InStat", noData: "no data",
    instatSeasonEmpty: "No InStat season for this opponent yet — upload their InStat season export (parser coming). KKÍ already covers the whole season for now.",
    efg: "eFG%", toRate: "TO%", orebRate: "OREB%", ftf: "FTF", ppp: "PPP",
    efgTip: "Effective FG% — shooting that credits the extra point of a three.",
    toTip: "Turnover rate — turnovers per possession (lower is better).",
    orebTip: "Offensive-rebound % — share of their misses they rebound.",
    ftfTip: "Free-throw factor — free throws made relative to shots taken.",
    pppTip: "Points per possession — scoring efficiency.",
  },
  IS: {
    pick: "Andstæðingur", scout: "Skanna andstæðing (frítt · KKÍ)", scouting: "Sæki tímabil…", rescout: "Uppfæra frá KKÍ",
    none: "Engir andstæðingar til að skanna enn — þeir birtast þegar þú hefur spilað gegn þeim.",
    notScouted: "Ekki skannað enn. Sæktu tímabilið þeirra frítt úr KKÍ til að byggja skýrsluna.",
    games: "leikir", ppg: "stig/leik", fg: "vallarsk.%", tp: "3ja%", tpaPg: "3ja tilr./leik", reb: "fráköst", ast: "stoðs.", tov: "tapaðir",
    home: "Heima", away: "Úti", defend: "Hvernig á að verjast þeim", keyPlayers: "Lykilmenn", allPlayers: "Allur hópurinn",
    showAll: "Sýna allan hóp", hideAll: "Fela hóp", synced: "Skannað", tags: {
      primary_scorer: "skorari", three_point_threat: "3ja skytta", playmaker: "stjórnandi", glass: "fráköst",
    } as Record<string, string>,
    mpg: "mín/leik", spg: "stolnir", threat: "Ógn",
    moreInfo: "Nánar", shooting: "Skot-prófíll", two: "2ja", three: "3ja", ft: "Vítask.",
    ptsTrend: "Stig / leik", noShotChart: "Skil hittinga/tilrauna — KKÍ straumurinn hefur engar skot-staðsetningar, svo ekkert vallar-kort.",
    lastGames: "Síðustu {n} leikir", opp: "Andstæðingur",
    perfNote: "Lýsandi skönnun úr opinberum KKÍ leikskýrslum andstæðingsins — aldrei readiness- eða læknismat.",
    err: "Náði ekki í andstæðinginn úr KKÍ. Athugaðu að liðsnafnið passi nákvæmlega við KKÍ, eða reyndu aftur.",
    ffTitle: "Hvernig þeir spiluðu ykkur", ffTag: "InStat",
    ffHint: "Four Factors þeirra í innbyrðis leikjum ykkar, úr innfluttum InStat leikskýrslum. Lýsandi.",
    instatUpload: "Flytja inn InStat leikskýrslu (innbyrðis)",
    instatUploadHint: "Hladdu inn InStat leikskýrslu úr leik sem þið spiluðuð þennan andstæðing — hún fyllir „Hvernig þeir spiluðu ykkur“ Four Factors (fyrir bæði lið). Lýsandi; aldrei readiness-mat.",
    seasonSrc: "Allt tímabilið úr", srcKki: "KKÍ", srcInstat: "InStat", noData: "engin gögn",
    instatSeasonEmpty: "Ekkert InStat-tímabil fyrir þennan andstæðing enn — hladdu inn InStat season export þeirra (parser á leiðinni). KKÍ nær nú þegar öllu tímabilinu í bili.",
    efg: "eFG%", toRate: "TO%", orebRate: "OREB%", ftf: "FTF", ppp: "PPP",
    efgTip: "Effective FG% — vallarskotanýting sem tekur tillit til aukastigsins í þristum.",
    toTip: "Tapaðir boltar á sókn (lægra er betra).",
    orebTip: "Sóknarfráköst — hlutfall eigin skotmissa sem þeir ná fráköstum á.",
    ftfTip: "Vítaþáttur — vítaskot hitt m.v. fjölda skota.",
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

/** A shot-type bar (relative volume, not a false share — InStat categories overlap). */
function OppBar({ label, r, rows }: { label: string; r: OppShotType; rows: OppShotType[] }) {
  const maxAtt = Math.max(1, ...rows.map((x) => x.att));
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0 truncate text-[12px] text-slate-700" title={label}>{label}</div>
      <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-orange-100/60">
        <div className="absolute inset-y-0 left-0 rounded bg-orange-500/70" style={{ width: `${Math.min(100, (r.att / maxAtt) * 100)}%` }} />
      </div>
      <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{r.made}-{r.att}{r.pct != null ? ` · ${r.pct}%` : ""}</div>
    </div>
  );
}

function PlayerCard({ p, t, lang, onOpen }: { p: OppPlayer; t: Strings; lang: Lang; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-xl border border-[#eceae2] bg-white p-3 text-left transition hover:border-[#a83e28]/40 hover:shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-900">{p.name}</span>
        <span className="font-[Archivo,sans-serif] text-lg font-bold tabular-nums text-[#a83e28]">{d1(p.ppg)}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500">
        {p.games} {t.games} · {t.reb} {d1(p.rpg)} · {t.ast} {d1(p.apg)} · {t.tp} {pctS(p.tpPct)} ({d1(p.tpaPg)}/g)
      </div>
      {p.descriptor ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-700">{lang === "IS" ? p.descriptor.is : p.descriptor.en}</p>
      ) : null}
      {p.tags.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {p.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#f3eefa] px-2 py-0.5 text-[10px] font-semibold text-[#7a5cc4]">{t.tags[tag] ?? tag}</span>
          ))}
          <span className="ml-auto text-[10px] font-semibold text-[#2740e6]">{t.moreInfo} →</span>
        </div>
      ) : (
        <div className="mt-1.5 text-right text-[10px] font-semibold text-[#2740e6]">{t.moreInfo} →</div>
      )}
    </button>
  );
}

/** Tiny inline SVG sparkline of a player's per-game points (chronological). */
function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const w = 132, h = 30, max = Math.max(...series, 1);
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - (v / max) * (h - 3) - 1}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="#a83e28" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A make/attempt/percentage bar (no shot locations exist in the KKÍ feed). */
function ShotBar({ label, pct, paPg }: { label: string; pct: number | null; paPg: number | null }) {
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]"><span className="font-semibold text-slate-600">{label}</span><span className="tabular-nums text-slate-500">{pct == null ? "—" : `${pct}%`}{paPg != null ? ` · ${d1(paPg)}/g` : ""}</span></div>
      <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#a83e28]" style={{ width: `${w}%` }} /></div>
    </div>
  );
}

function PlayerModal({ p, t, lang, onClose }: { p: OppPlayer; t: Strings; lang: Lang; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-slate-900">{p.name}</div>
            <div className="mt-0.5 text-[12px] text-slate-500">{p.games} {t.games} · {t.mpg} {d1(p.mpg)} · {t.ppg} {d1(p.ppg)} · {t.reb} {d1(p.rpg)} · {t.ast} {d1(p.apg)}</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {p.descriptor ? <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{lang === "IS" ? p.descriptor.is : p.descriptor.en}</p> : null}

        {/* Shooting profile */}
        <div className="mt-4 rounded-xl border border-[#eceae2] p-3">
          <div className="flex items-baseline justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.shooting}</div>
            {p.shooting.ptsSeries.length >= 2 ? <div className="text-[10px] text-slate-400">{t.ptsTrend}</div> : null}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <ShotBar label={t.two} pct={p.shooting.twoPct} paPg={p.shooting.twoPaPg} />
              <ShotBar label={t.three} pct={p.shooting.threePct} paPg={p.shooting.threePaPg} />
              <ShotBar label={t.ft} pct={p.shooting.ftPct} paPg={p.shooting.ftaPg} />
            </div>
            <div className="flex items-end justify-center"><Sparkline series={p.shooting.ptsSeries} /></div>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">{t.noShotChart}</p>
        </div>

        {/* Last games */}
        {p.recentGames.length ? (
          <div className="mt-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.lastGames.replace("{n}", String(p.recentGames.length))}</div>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-slate-400">
                  <th className="py-1 pr-2 font-semibold">{t.opp}</th>
                  <th className="pr-2 text-right font-semibold">{t.mpg}</th><th className="pr-2 text-right font-semibold">{t.ppg}</th>
                  <th className="pr-2 text-right font-semibold">{t.reb}</th><th className="pr-2 text-right font-semibold">{t.ast}</th>
                  <th className="pr-2 text-right font-semibold">FG</th><th className="text-right font-semibold">3P</th>
                </tr></thead>
                <tbody>
                  {p.recentGames.map((g, i) => (
                    <tr key={i} className="border-t border-[#eceae2]">
                      <td className="py-1 pr-2 text-slate-700">{g.date ? g.date.slice(5) : "—"} {g.opponent ? <span className="text-slate-400">{g.homeAway === "away" ? "@" : "v"} {g.opponent}</span> : null}</td>
                      <td className="pr-2 text-right tabular-nums text-slate-500">{d1(g.min)}</td>
                      <td className="pr-2 text-right tabular-nums font-semibold text-slate-900">{g.pts ?? "—"}</td>
                      <td className="pr-2 text-right tabular-nums text-slate-500">{g.reb ?? "—"}</td>
                      <td className="pr-2 text-right tabular-nums text-slate-500">{g.ast ?? "—"}</td>
                      <td className="pr-2 text-right tabular-nums text-slate-500">{g.fgm ?? "—"}/{g.fga ?? "—"}</td>
                      <td className="text-right tabular-nums text-slate-500">{g.tpm ?? "—"}/{g.tpa ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BasketballOpponentAnalysis() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [items, setItems] = React.useState<OppItem[] | null>(null);
  const [sel, setSel] = React.useState<string>("");
  const [report, setReport] = React.useState<BasketballOpponentReport | null>(null);
  const [oppFF, setOppFF] = React.useState<OppFourFactors>(null);
  const [scouted, setScouted] = React.useState<boolean>(false);
  const [reportSource, setReportSource] = React.useState<"kki" | "instat" | null>(null);
  const [seasonSource, setSeasonSource] = React.useState<"kki" | "instat">("kki"); // which full-season source drives the report
  const [availableSources, setAvailableSources] = React.useState<{ kki: boolean; instat: boolean }>({ kki: false, instat: false });
  const [instatGames, setInstatGames] = React.useState<number | null>(null);
  const [oppCourt, setOppCourt] = React.useState<{ key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null }[] | null>(null);
  const [oppPlay, setOppPlay] = React.useState<OppShotType[] | null>(null);
  const [oppEff, setOppEff] = React.useState<OppShotType[] | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [ai, setAi] = React.useState<OppAi | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiErr, setAiErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pulling, setPulling] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [openPlayer, setOpenPlayer] = React.useState<OppPlayer | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const loadList = React.useCallback(async () => {
    const tok = await token(); if (!tok) return;
    const res = await fetch("/api/coach/basketball-opponent-scout?list=1", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
    const j = await res.json();
    if (j.ok) { setItems(j.opponents ?? []); if (!sel && j.opponents?.[0]) setSel(j.opponents[0].name); }
  }, [token, sel]);

  React.useEffect(() => { void loadList(); }, [loadList]);

  const loadReport = React.useCallback(async (opponent: string) => {
    if (!opponent) return;
    setBusy(true); setErr(null); setShowAll(false);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/basketball-opponent-scout?opponent=${encodeURIComponent(opponent)}&source=${seasonSource}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json();
      if (j.ok) { setScouted(!!j.scouted); setReport(j.report ?? null); setOppFF(j.oppFourFactors ?? null); setReportSource(j.reportSource ?? null); setInstatGames(j.instatGames ?? null); setOppCourt(j.oppCourtRegions ?? null); setOppPlay(j.oppPlaytypes ?? null); setOppEff(j.oppEfficiency ?? null); setAi((j.aiSummary as OppAi | null) ?? null); setAiErr(null); setAvailableSources(j.availableSources ?? { kki: false, instat: false }); }
    } finally { setBusy(false); }
  }, [token, seasonSource]);

  React.useEffect(() => { if (sel) void loadReport(sel); }, [sel, loadReport]);

  const scout = async () => {
    if (!sel) return;
    setPulling(true); setErr(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch("/api/coach/basketball-opponent-scout", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent: sel }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? t.err); return; }
      await loadList();
      await loadReport(sel);
    } finally { setPulling(false); }
  };

  const generateAi = async () => {
    if (!sel) return;
    setAiBusy(true); setAiErr(null);
    try {
      const tok = await token(); if (!tok) { setAiErr(lang === "IS" ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/basketball-opponent-scout", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent: sel, ai: true, lang }),
      });
      const j = await res.json();
      if (j.ok) setAi((j.aiSummary as OppAi | null) ?? null); else setAiErr(j.error ?? "Error");
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Error"); }
    finally { setAiBusy(false); }
  };

  const downloadPdf = async () => {
    if (!report) return;
    setPdfBusy(true);
    try {
      const { downloadBasketballOpponentPdf } = await import("@/components/coach/BasketballOpponentPdf");
      await downloadBasketballOpponentPdf({
        opponentName: report.opponentName,
        source: reportSource,
        games: report.games,
        team: report.team,
        fourFactors: oppFF,
        courtRegions: oppCourt,
        playtypes: oppPlay,
        efficiency: oppEff,
        howToDefend: report.howToDefend,
        keyPlayers: report.keyPlayers,
        ai,
      }, lang);
    } finally { setPdfBusy(false); }
  };

  // Shot charts from the free public FIBA LiveStats feed — own team + any opponent. Shown
  // even with no scouted opponents yet (it's a pull tool, not opponent-dependent).
  const fibaCharts = (
    <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="transition-transform group-open:rotate-90">▸</span>{lang === "IS" ? "Shot charts (FIBA LiveStats — frítt)" : "Shot charts (FIBA LiveStats — free)"}
      </summary>
      <div className="mt-2"><FibaShotCharts /></div>
    </details>
  );

  if (items && items.length === 0) return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-500">{t.none}</p>
      {fibaCharts}
    </div>
  );

  const team = report?.team;
  // Coach explicitly picked InStat season but none is uploaded yet → show the empty state,
  // not the KKÍ fallback the API returns, so the toggle stays honest.
  const instatEmpty = seasonSource === "instat" && !availableSources.instat;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.pick}</span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {(items ?? []).map((o) => (
            <option key={o.name} value={o.name}>{o.name}{o.scouted ? ` · ${t.synced}` : ""}</option>
          ))}
        </select>
        <button onClick={scout} disabled={pulling}
          className="rounded-lg border border-[#2740e6] px-2.5 py-1 text-[13px] font-semibold text-[#2740e6] hover:bg-[#eef0fb] disabled:opacity-50">
          {pulling ? t.scouting : scouted ? t.rescout : t.scout}
        </button>
        {report && !instatEmpty ? (
          <button onClick={() => void downloadPdf()} disabled={pdfBusy}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {pdfBusy ? "…" : (lang === "IS" ? "Sækja PDF" : "Download PDF")}
          </button>
        ) : null}
      </div>

      {err ? <p className="text-[13px] font-medium text-red-700">{err}</p> : null}

      {/* Whole-season source toggle: KKÍ pull vs an uploaded InStat season export. The
          head-to-head "How they played you" box below is independent of this choice. */}
      {sel ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.seasonSrc}</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[13px] shadow-sm">
            {(["kki", "instat"] as const).map((src) => {
              const has = src === "kki" ? availableSources.kki : availableSources.instat;
              return (
                <button key={src} onClick={() => setSeasonSource(src)}
                  className={`rounded-md px-3 py-1 font-semibold ${seasonSource === src ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  {src === "kki" ? t.srcKki : t.srcInstat}
                  {!has ? <span className={`ml-1 text-[10px] font-normal ${seasonSource === src ? "text-blue-100" : "text-slate-400"}`}>· {t.noData}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Import an InStat Game Report right here — it feeds the "How they played you"
          Four Factors below. Reloads the report on success so the box updates. */}
      <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="transition-transform group-open:rotate-90">▸</span>{t.instatUpload}
        </summary>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{t.instatUploadHint}</p>
        <div className="mt-2">
          <InstatBasketballUpload onImported={() => { void loadList(); if (sel) void loadReport(sel); }} />
        </div>
      </details>

      {fibaCharts}

      {/* How this opponent played AGAINST US — Four Factors from imported InStat
          Game Reports of our head-to-heads. Independent of the KKÍ scout pull. */}
      {oppFF && oppFF.games > 0 ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-800">{t.ffTitle}</span>
            <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t.ffTag}</span>
            <span className="text-[11px] text-slate-500">· {oppFF.games} {t.games}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
            {([
              [t.efg, t.efgTip, oppFF.efgPct, "pct"],
              [t.toRate, t.toTip, oppFF.toPct, "pct"],
              [t.orebRate, t.orebTip, oppFF.orebPct, "pct"],
              [t.ftf, t.ftfTip, oppFF.ftf, "pct"],
              [t.ppp, t.pppTip, oppFF.ppp, "num"],
            ] as const).map(([label, tip, val, kind]) => (
              <div key={label} className="min-w-0">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500" title={tip}>
                  <span className="truncate">{label}</span><span className="cursor-help text-slate-300">ⓘ</span>
                </div>
                <div className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">{val == null ? "—" : kind === "pct" ? `${val.toFixed(1)}%` : val.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-slate-500">{t.ffHint}</p>
        </div>
      ) : null}

      {busy && !report ? <p className="text-sm text-slate-400">…</p> : null}
      {!busy && !scouted && !report ? <p className="text-[13px] text-amber-700">{t.notScouted}</p> : null}

      {instatEmpty ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50/50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">{t.instatSeasonEmpty}</p>
      ) : null}

      {report && team && !instatEmpty ? (
        <div className="space-y-3">
          {/* AI scouting summary — from the numbers. Labelled as AI; decides nothing. */}
          <div className="rounded-xl border border-[#c9d2f7] bg-[#eef1fc] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-[#2740e6]">{lang === "IS" ? "AI andstæðinga-samantekt" : "AI opponent summary"}</span>
              <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{lang === "IS" ? "AI · les tölur, ákveður ekkert" : "AI · reads the numbers, decides nothing"}</span>
              <button onClick={() => void generateAi()} disabled={aiBusy}
                className="ml-auto rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                {aiBusy ? (lang === "IS" ? "Skrifa…" : "Writing…") : ai ? (lang === "IS" ? "Endurgera" : "Regenerate") : (lang === "IS" ? "Búa til samantekt" : "Generate summary")}
              </button>
            </div>
            {aiErr ? <p className="mt-2 text-[12px] text-red-600">{aiErr}</p> : null}
            {!ai && !aiBusy ? (
              <p className="mt-2 text-[12px] text-slate-500">
                {lang === "IS" ? "Búðu til ítarlega andstæðinga-greiningu úr tölunum — hvernig þeir spila, styrkleikar/veikleikar, hvernig á að verjast og sækja." : "Generate a detailed opponent read from the numbers — how they play, strengths/weaknesses, how to defend and attack."}
              </p>
            ) : null}
            {ai ? (
              <div className="mt-3 space-y-3">
                {ai.headline ? <p className="text-[15px] font-bold leading-snug text-slate-900">{ai.headline}</p> : null}
                {ai.summary ? <p className="text-[13px] leading-relaxed text-slate-700">{ai.summary}</p> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {ai.strengths?.length ? (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{lang === "IS" ? "Styrkleikar" : "Strengths"}</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">{ai.strengths.map((x, i) => <li key={i} className="text-[12px] text-slate-700">{x}</li>)}</ul>
                    </div>
                  ) : null}
                  {ai.weaknesses?.length ? (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{lang === "IS" ? "Veikleikar" : "Weaknesses"}</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">{ai.weaknesses.map((x, i) => <li key={i} className="text-[12px] text-slate-700">{x}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
                {ai.keyPlayers?.length ? (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{lang === "IS" ? "Hættulegastir" : "Key players"}</div>
                    <ul className="mt-1 space-y-0.5">{ai.keyPlayers.map((p, i) => <li key={i} className="text-[12px] text-slate-700"><span className="font-semibold">{p.name}</span> — {p.note}</li>)}</ul>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {ai.howToDefend?.length ? (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#a86a12]">{lang === "IS" ? "Hvernig á að verjast" : "How to defend"}</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">{ai.howToDefend.map((x, i) => <li key={i} className="text-[12px] text-slate-700">{x}</li>)}</ul>
                    </div>
                  ) : null}
                  {ai.howToAttack?.length ? (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{lang === "IS" ? "Hvar á að sækja" : "Where to attack"}</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">{ai.howToAttack.map((x, i) => <li key={i} className="text-[12px] text-slate-700">{x}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Layer 0 + 1 — profile line + stat grid */}
          <div className="rounded-xl border border-[#e3e1d9] bg-white p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${reportSource === "instat" ? "bg-orange-600" : "bg-[#2740e6]"}`}>
                {reportSource === "instat" ? "InStat" : "KKÍ"}
              </span>
              <span className="text-[11px] text-slate-500">
                {reportSource === "instat"
                  ? (lang === "IS"
                      ? `Byggt á ${instatGames ?? report.games} InStat leik/leikjum sem þið spiluðuð þá — skoring & skot. Sæktu KKÍ-tímabil fyrir fráköst/stoðsendingar + allt tímabilið.`
                      : `From ${instatGames ?? report.games} InStat head-to-head game(s) — scoring & shooting. Pull the KKÍ season for rebounds/assists + the whole season.`)
                  : (lang === "IS" ? "Úr KKÍ-tímabili andstæðingsins." : "From the opponent's KKÍ season.")}
              </span>
            </div>
            <p className="text-[15px] font-bold text-slate-900">
              {report.opponentName} · {report.games} {t.games} · {d1(team.ppg)} {t.ppg} · {pctS(team.fgPct)} {t.fg}
              {report.keyPlayers[0] ? ` · ${report.keyPlayers[0].name} ${d1(report.keyPlayers[0].ppg)}` : ""}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t.tp} value={`${pctS(team.tpPct)}`} />
              <Stat label={t.tpaPg} value={d1(team.tpaPg)} />
              <Stat label={t.reb} value={d1(team.reb)} />
              <Stat label={t.tov} value={d1(team.tov)} />
              <Stat label={`${t.home} ${t.ppg}`} value={d1(team.homePpg)} />
              <Stat label={`${t.away} ${t.ppg}`} value={d1(team.awayPpg)} />
              <Stat label={t.ast} value={d1(team.ast)} />
              <Stat label={t.fg} value={pctS(team.fgPct)} />
            </div>
          </div>

          {/* Opponent shot map (InStat head-to-head) — where they shoot + how it falls */}
          {oppCourt && oppCourt.length ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-slate-800">{lang === "IS" ? "Skotkort andstæðings" : "Opponent shot map"}</span>
                <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
              </div>
              <div className="mt-2 flex justify-center">
                <BasketballCourtMap regions={oppCourt} lang={lang} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {lang === "IS"
                  ? "Hvar þeir skjóta og hvernig fellur — úr ykkar innbyrðis InStat-leikjum. Litur = hittni (grænt gott, rautt kalt)."
                  : "Where they shoot and how it falls — from your head-to-head InStat games. Colour = shooting (green good, red cold)."}
              </p>
            </div>
          ) : null}

          {/* How they score — opponent FG playtypes + efficiency (InStat head-to-head) */}
          {(oppPlay && oppPlay.length) || (oppEff && oppEff.length) ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-slate-800">{lang === "IS" ? "Hvernig þeir skora" : "How they score"}</span>
                <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
              </div>
              {oppPlay && oppPlay.length ? (
                <div className="mt-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{lang === "IS" ? "Sóknartegundir (FG playtypes)" : "FG playtypes"}</div>
                  <div className="mt-1.5 space-y-1.5">
                    {oppPlay.slice(0, 8).map((r) => <OppBar key={r.key} label={shotLabel(r.key, lang)} r={r} rows={oppPlay.slice(0, 8)} />)}
                  </div>
                </div>
              ) : null}
              {oppEff && oppEff.length ? (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{lang === "IS" ? "Sóknargerð (efficiency)" : "Offensive-efficiency types"}</div>
                  <div className="mt-1.5 space-y-1.5">
                    {oppEff.map((r) => <OppBar key={r.key} label={shotLabel(r.key, lang)} r={r} rows={oppEff} />)}
                  </div>
                </div>
              ) : null}
              <p className="mt-2.5 text-[11px] text-slate-500">
                {lang === "IS" ? "Súlan = hlutfallslegt magn; m-t · % = hittni. Úr ykkar innbyrðis InStat-leikjum." : "Bar = relative volume; m-a · % = shooting. From your head-to-head InStat games."}
              </p>
            </div>
          ) : null}

          {/* How to defend — rule-based flags */}
          {report.howToDefend.length ? (
            <div className="rounded-xl border border-[#f0e2c8] bg-[#fdf8ee] p-3">
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#a86a12" }}>⛨ {t.defend}</div>
              <ul className="space-y-2">
                {report.howToDefend.map((f) => (
                  <li key={f.id} className="text-[13px] text-slate-800">
                    <span className="font-medium">{lang === "IS" ? f.is : f.en}</span>
                    <span className="ml-1 text-slate-500">— {f.evidence}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Key players */}
          {report.keyPlayers.length ? (
            <div>
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.keyPlayers}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {report.keyPlayers.map((p) => <PlayerCard key={p.ref} p={p} t={t} lang={lang} onOpen={() => setOpenPlayer(p)} />)}
              </div>
            </div>
          ) : null}

          {/* Full roster (details) */}
          <div>
            <button onClick={() => setShowAll((v) => !v)} className="text-[12px] font-semibold text-[#2740e6] hover:underline">
              {showAll ? t.hideAll : t.showAll}
            </button>
            {showAll ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {report.players.map((p) => <PlayerCard key={p.ref} p={p} t={t} lang={lang} onOpen={() => setOpenPlayer(p)} />)}
              </div>
            ) : null}
          </div>

          <p className="text-[11px] text-slate-400">{t.perfNote}</p>
        </div>
      ) : null}

      {/* AI film-clip analysis panel removed from the page (user request 2026-08-15). The
          feature is intact — component BasketballFilmClip, route /api/coach/basketball-film-clip,
          util extractFilmFrames, table basketball_film_clip_notes — re-add
          `{sel ? <BasketballFilmClip opponent={sel} /> : null}` (and its import) to re-enable. */}

      {openPlayer ? <PlayerModal p={openPlayer} t={t} lang={lang} onClose={() => setOpenPlayer(null)} /> : null}
    </div>
  );
}
