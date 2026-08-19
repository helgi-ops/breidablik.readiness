"use client";

/**
 * /coach/opponent-scouting — pre-match opponent scouting from Wyscout Team → Stats.
 * Layered read per block: one-line verdict → 2–3 cited facts → "Show details".
 * Descriptive context only — never touches the readiness colour or the daily decision.
 * Any recommendation cites its signal and is coach-overridable (v1: shown, not auto-applied).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import BasketballOpponentAnalysis from "@/components/coach/BasketballOpponentAnalysis";
import PagePurpose from "@/components/coach/PagePurpose";
import { downloadScoutReportPdf } from "@/components/coach/ScoutReportPdf";
import OpponentPlayerAnalysis from "@/components/coach/OpponentPlayerAnalysis";
import type { OpponentReport, Cited, Bi, Metrics } from "@/lib/micropulse/scouting/opponentReport";
import { computeFormWindow, metricsFromScoutMatches } from "@/lib/micropulse/scouting/opponentReport";

type Lang = "EN" | "IS";

const METRIC: Record<string, { EN: string; IS: string }> = {
  possession: { EN: "Possession %", IS: "Boltahald %" }, ppda: { EN: "PPDA (press)", IS: "PPDA (pressa)" },
  passesFinalThird: { EN: "Passes to final third", IS: "Sendingar á lokaþriðjung" },
  xgf: { EN: "xG for", IS: "xG með" }, xga: { EN: "xG against", IS: "xG á móti" },
  shots: { EN: "Shots", IS: "Skot" }, shotsAgainst: { EN: "Shots against", IS: "Skot á móti" },
  crosses: { EN: "Crosses", IS: "Fyrirgjafir" }, crossAccPct: { EN: "Cross accuracy %", IS: "Fyrirgjafa-nákvæmni %" },
  defDuelsWonPct: { EN: "Defensive duels won %", IS: "Varnarnávígi unnin %" },
  offensiveDuelsWonPct: { EN: "Offensive duels won %", IS: "Sóknarnávígi unnin %" },
  smartPasses: { EN: "Line-breaking passes", IS: "Línubrjótandi sendingar" },
  progressivePasses: { EN: "Progressive passes", IS: "Framsæknar sendingar" }, forwardPasses: { EN: "Forward passes", IS: "Framsendingar" },
  positionalAttacks: { EN: "Positional attacks", IS: "Staðsóknir" }, counterattacks: { EN: "Counterattacks", IS: "Skyndisóknir" },
  finishing: { EN: "Finishing (goals − xG)", IS: "Klárun (mörk − xG)" }, gf: { EN: "Goals / match", IS: "Mörk / leik" },
  ga: { EN: "Goals against / match", IS: "Mörk á móti / leik" },
  setPieceXg: { EN: "Set-piece xG", IS: "Fastaleikja-xG" }, setPieceXgAgainst: { EN: "Set-piece xG against", IS: "Fastaleikja-xG á móti" },
  setPieceShotsAgainst: { EN: "Set-piece shots against", IS: "Fastaleikja-skot á móti" },
  obv: { EN: "On-Ball Value (OBV)", IS: "On-Ball Value (OBV)" }, obvAgainst: { EN: "OBV against", IS: "OBV á móti" },
  clearShots: { EN: "Clear shots", IS: "Klár færi" }, clearShotsAgainst: { EN: "Clear shots against", IS: "Klár færi á móti" },
  cornerXg: { EN: "Corner xG", IS: "Horna-xG" }, throwInXg: { EN: "Throw-in xG", IS: "Innkasta-xG" },
};
const mlabel = (k: string, lang: Lang) => (METRIC[k] ? METRIC[k][lang] : k);

// Rich per-match metrics to average over the recent-form window, in coach-reading order.
const WINDOW_METRIC_ORDER: Array<keyof Metrics> = [
  "xgf", "xga", "possession", "ppda", "shots", "shotsAgainst", "passesFinalThird",
  "progressivePasses", "crosses", "positionalAttacks", "counterattacks", "defDuelsWonPct", "offensiveDuelsWonPct",
];

const T = {
  EN: {
    title: "Opponent Analysis", purpose: "A plain-language pre-match plan built from the opponent's own Wyscout season — how they play, where they hurt you, how to hurt them. Benchmarked against the league and your team. Descriptive context — it never changes the readiness verdict.",
    pick: "Opponent", season: "Season", noReport: "No scouting for that opponent/season yet — scout one below.",
    scout: "Scout an opponent", scoutHint: "Opponent + season, then drop their Wyscout Team → Stats export(s) (General required; Indexes/Defending/Passing/Attacking optional) and, optionally, an Advanced Search player export. StatsBomb IQ Team Stats CSVs (with the League Average row) work too — dropped in the same box, they give deeper numbers (OBV, real set-piece xG) where the league is covered.",
    dataLabel: "Data",
    scoutHintWy: "Wyscout: Team → Stats → export General (required) plus Indexes (PPDA) / Defending / Passing / Attacking (optional), with “Show opponents” ON. Optionally add an Advanced Search player export. Drop them in the box below — the source is auto-detected.",
    scoutHintSb: "StatsBomb IQ: the opponent’s Team Stats export — one CSV per category (summary / shooting / passing / defensive-pressing / obv / set-pieces) or the all-metrics file, each carrying the League Average row. Deeper than Wyscout (OBV, pressing, real set-piece xG) where the league is covered. Drop them in the box below — the source is auto-detected. For the Players tab (per-90 percentile analysis) and the key-players list, add the opponent's StatsBomb Squad CSV in the player-export field (a thin Player Stats CSV fills the list only).",
    builtFrom: "Built from", upgradeSb: "StatsBomb gives deeper numbers (OBV, pressing, real set-piece xG) where the league is covered — import the Team Stats export to upgrade this report.",
    oppName: "Opponent name", files: "Team → Stats export(s)", playersFile: "Player export (optional)",
    preview: "Preview", import: "Import", clear: "Clear", reading: "Reading…", importing: "Saving…",
    identity: "Style", attack: "How they attack", defend: "How they defend — where to hurt them", setpieces: "Set pieces",
    players: "Key players — who to stop", matchup: "Them vs you", form: "Form",
    details: "Show details", hide: "Hide", vsLeague: "league", vsYou: "you", them: "Them", you: "You", delta: "Δ",
    howToHurt: "How to hurt them", signal: "signal", pdf: "Report (PDF)", generating: "Generating…",
    matches: "matches", notSignedIn: "Not signed in.", need: "Enter an opponent, a season and the General export.",
    trendRising: "rising", trendFalling: "falling", trendSteady: "steady",
    tabTeam: "Team report", tabPlayers: "Players",
    formWindow: "Window", wAll: "All",
    formWindowNote: "These window averages are real per-match data (each number in brackets is the season average). The verdict / recommendation / matchup blocks above are still computed on the whole season. If this window shows only xG, re-import that opponent's Wyscout export once to backfill the per-match metrics.",
    seasonTotals: "whole season",
  },
  IS: {
    title: "Andstæðinga-greining", purpose: "Fyrir-leiks áætlun á mannamáli úr Wyscout-tímabili andstæðingsins — hvernig þeir spila, hvar þeir meiða þig, hvernig á að meiða þá. Borið saman við deildina og þitt lið. Lýsandi samhengi — breytir aldrei readiness-dómnum.",
    pick: "Andstæðingur", season: "Tímabil", noReport: "Engin njósn fyrir þennan andstæðing/tímabil enn — njósnaðu um einn að neðan.",
    scout: "Njósnaðu um andstæðing", scoutHint: "Andstæðingur + tímabil, svo Wyscout Team → Stats útflutning(ar) (General nauðsynlegt; Indexes/Defending/Passing/Attacking valfrjálst) og, valfrjálst, Advanced Search leikmanna-skrá. StatsBomb IQ Team Stats CSV-skrár (með League Average röðinni) virka líka — settar í sama reit gefa þær dýpri tölur (OBV, raunveruleg fastaleikja-xG) þar sem deildin er þakin.",
    dataLabel: "Gögn",
    scoutHintWy: "Wyscout: Team → Stats → flyttu út General (nauðsynlegt) auk Indexes (PPDA) / Defending / Passing / Attacking (valfrjálst), með „Show opponents“ á. Bættu valfrjálst við Advanced Search leikmanna-skrá. Slepptu í reitinn að neðan — uppruninn greinist sjálfkrafa.",
    scoutHintSb: "StatsBomb IQ: Team Stats útflutningur andstæðingsins — ein CSV per flokk (summary / shooting / passing / defensive-pressing / obv / set-pieces) eða all-metrics skráin, hver með League Average röðinni. Dýpri en Wyscout (OBV, pressa, raunveruleg fastaleikja-xG) þar sem deildin er þakin. Slepptu í reitinn að neðan — uppruninn greinist sjálfkrafa. Fyrir Leikmenn-flipann (per-90 percentíl-greining) og lykilmanna-listann, bættu við StatsBomb Squad CSV andstæðingsins í leikmanna-reitinn (þunn Player Stats CSV fyllir aðeins listann).",
    builtFrom: "Byggt á", upgradeSb: "StatsBomb gefur dýpri tölur (OBV, pressa, raunveruleg fastaleikja-xG) þar sem deildin er þakin — flyttu inn Team Stats útflutninginn til að uppfæra þessa skýrslu.",
    oppName: "Nafn andstæðings", files: "Team → Stats skrá(r)", playersFile: "Leikmanna-skrá (valfrjálst)",
    preview: "Forskoða", import: "Flytja inn", clear: "Hreinsa", reading: "Les…", importing: "Vista…",
    identity: "Stíll", attack: "Hvernig þeir sækja", defend: "Hvernig þeir verjast — hvar á að meiða þá", setpieces: "Fastaleikir",
    players: "Lykilmenn — hvern á að stöðva", matchup: "Þeir vs þú", form: "Form",
    details: "Sýna nánar", hide: "Fela", vsLeague: "deild", vsYou: "þú", them: "Þeir", you: "Þú", delta: "Δ",
    howToHurt: "Hvernig á að meiða þá", signal: "merki", pdf: "Skýrsla (PDF)", generating: "Bý til…",
    matches: "leikir", notSignedIn: "Ekki innskráð(ur).", need: "Sláðu inn andstæðing, tímabil og General-skrána.",
    trendRising: "á uppleið", trendFalling: "á niðurleið", trendSteady: "stöðugt",
    tabTeam: "Liðs-skýrsla", tabPlayers: "Leikmenn",
    formWindow: "Gluggi", wAll: "Allir",
    formWindowNote: "Þessi gluggameðaltöl eru ekta per-leiks gögn (talan í sviga er tímabils-meðaltalið). Dóms- / tillögu- / matchup-blokkirnar að ofan eru enn reiknaðar á öllu tímabilinu. Ef glugginn sýnir aðeins xG, endur-flyttu Wyscout-útflutning andstæðingsins einu sinni til að fylla inn per-leiks metríkurnar.",
    seasonTotals: "allt tímabilið",
  },
} as const;

const fmt = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d));

/** Tiny source tag for the merged Wyscout+StatsBomb view — only rendered when both are present. */
function SrcTag({ src }: { src?: "wyscout" | "statsbomb" }) {
  if (!src) return null;
  return (
    <span className={`ml-1 rounded px-1 text-[9px] font-semibold uppercase tracking-wide ${src === "statsbomb" ? "bg-[#2740e6]/10 text-[#2740e6]" : "bg-slate-200 text-slate-500"}`}
      title={src === "statsbomb" ? "StatsBomb" : "Wyscout"}>
      {src === "statsbomb" ? "SB" : "WY"}
    </span>
  );
}

function Fact({ c, lang, src }: { c: Cited; lang: Lang; src?: "wyscout" | "statsbomb" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 text-[13px] last:border-0">
      <span className="text-slate-700">{mlabel(c.metric, lang)}<SrcTag src={src} /></span>
      <span className="flex items-baseline gap-2 tabular-nums text-[12px]">
        <span className="font-semibold text-slate-800">{fmt(c.value)}</span>
        {c.league != null ? <span className="text-slate-400">{T[lang].vsLeague} {fmt(c.league)}</span> : null}
        {c.own != null ? <span className="text-blue-600/70">{T[lang].vsYou} {fmt(c.own)}</span> : null}
      </span>
    </div>
  );
}

function Block({ title, verdict, facts, lang, children, metricSource }: { title: string; verdict?: Bi; facts?: Cited[]; lang: Lang; children?: React.ReactNode; metricSource?: Record<string, "wyscout" | "statsbomb"> }) {
  const [open, setOpen] = React.useState(false);
  const t = T[lang];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {verdict ? <p className="mt-1 text-[15px] font-semibold text-slate-900">{verdict[lang.toLowerCase() as "en" | "is"]}</p> : null}
      {children}
      {facts && facts.length ? (
        <>
          <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[12px] font-medium text-blue-700">▸ {open ? t.hide : t.details}</button>
          {open ? <div className="mt-1">{facts.map((c) => <Fact key={c.metric} c={c} lang={lang} src={metricSource?.[c.metric]} />)}</div> : (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-500">
              {facts.slice(0, 3).map((c) => <span key={c.metric}>{mlabel(c.metric, lang)} <span className="font-semibold text-slate-700">{fmt(c.value)}</span></span>)}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function OpponentScoutingPage() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  // Basketball teams scout from the free KKÍ box-score feed (not Wyscout uploads).
  const [sport, setSport] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) return;
      const r = await fetch("/api/coach/player-stats/config", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const j = await r.json().catch(() => ({})); setSport(j.sport); }
    })();
  }, []);
  const isBasketball = String(sport ?? "").toLowerCase() === "basketball";
  const [opponents, setOpponents] = React.useState<Array<{ opponent_name: string; season: string; matches: number; sources?: string[] }>>([]);
  const [sel, setSel] = React.useState<{ opponent: string; season: string } | null>(null);
  const [tab, setTab] = React.useState<"team" | "players">("team");
  // Recent-form window (5 / 10 / all). Re-scopes ONLY the form block — the only part
  // backed by real per-match data — client-side, no refetch. The rich blocks stay whole-season.
  const [formWindow, setFormWindow] = React.useState<5 | 10 | "all">(5);
  // Layer 2: the window-averages grid is collapsed by default so the form verdict + match chips lead.
  const [showWindowStats, setShowWindowStats] = React.useState(false);
  const [report, setReport] = React.useState<OpponentReport | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // upload
  const [oppName, setOppName] = React.useState("");
  const [season, setSeason] = React.useState("2026");
  const [impProvider, setImpProvider] = React.useState<"wyscout" | "statsbomb">("wyscout"); // guides the import instructions; the route still auto-detects the actual source
  const [files, setFiles] = React.useState<File[]>([]);
  const [playerFile, setPlayerFile] = React.useState<File | null>(null);
  const [upBusy, setUpBusy] = React.useState<"" | "preview" | "commit">("");
  // Preview shape differs by provider: Wyscout has detected/matches/players; StatsBomb
  // Team Stats has source/categories/metricsPreview (no per-match "detected").
  const [preview, setPreview] = React.useState<{ opponent: string; source?: string; matches?: number; detected?: Record<string, boolean>; players?: number; squadPlayers?: number; categories?: number } | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  // StatsBomb multi-file player import (the category "Player Stats" exports, merged by Name).
  const [sbPlayerFiles, setSbPlayerFiles] = React.useState<File[]>([]);
  const [sbPlayersMsg, setSbPlayersMsg] = React.useState<string | null>(null);
  const [sbPlayersBusy, setSbPlayersBusy] = React.useState(false);

  async function importSbPlayers() {
    if (!sbPlayerFiles.length) return;
    setSbPlayersBusy(true); setSbPlayersMsg(null);
    try {
      const tok = await token(); if (!tok) { setSbPlayersMsg("Not signed in"); return; }
      const fd = new FormData();
      for (const f of sbPlayerFiles) fd.append("files", f);
      if (oppName.trim()) fd.set("opponent", oppName.trim());
      const res = await fetch("/api/coach/scouting/players-import", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setSbPlayersMsg(j.error ?? "Error"); return; }
      setSbPlayersMsg(lang === "IS"
        ? `${j.players} leikmenn vistaðir fyrir ${j.opponent} (${j.filesUsed} skrár sameinaðar${j.skipped?.length ? `, ${j.skipped.length} sleppt` : ""}).`
        : `${j.players} players saved for ${j.opponent} (${j.filesUsed} files merged${j.skipped?.length ? `, ${j.skipped.length} skipped` : ""}).`);
      setSbPlayerFiles([]);
    } finally { setSbPlayersBusy(false); }
  }

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const loadList = React.useCallback(async () => {
    const tok = await token(); if (!tok) return;
    const res = await fetch("/api/coach/scouting/opponent?list=1", { headers: { Authorization: `Bearer ${tok}` } });
    const j = await res.json(); if (j.ok) setOpponents(j.opponents ?? []);
  }, [token]);
  React.useEffect(() => { loadList(); }, [loadList]);

  React.useEffect(() => {
    if (!sel) { setReport(null); return; }
    (async () => {
      setBusy(true); setErr(null);
      try {
        const tok = await token(); if (!tok) { setErr(t.notSignedIn); return; }
        const res = await fetch(`/api/coach/scouting/opponent?opponent=${encodeURIComponent(sel.opponent)}&season=${encodeURIComponent(sel.season)}`, { headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json();
        if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); setReport(null); return; }
        setReport(j.report);
      } finally { setBusy(false); }
    })();
  }, [sel, token, t.notSignedIn]);

  async function send(phase: "preview" | "commit") {
    if (!oppName.trim() || !season.trim() || files.length === 0) { setErr(t.need); return; }
    setUpBusy(phase); setErr(null);
    try {
      const tok = await token(); if (!tok) { setErr(t.notSignedIn); return; }
      const fd = new FormData();
      fd.set("phase", phase); fd.set("opponent", oppName.trim()); fd.set("season", season.trim());
      for (const f of files) fd.append("files", f);
      if (playerFile) fd.set("players", playerFile);
      const res = await fetch("/api/coach/scouting/upload", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      if (phase === "preview") setPreview(j);
      else { setPreview(null); await loadList(); setSel({ opponent: j.opponent, season: j.season }); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setUpBusy(""); }
  }

  async function makePdf() {
    if (!report || !sel) return;
    setPdfBusy(true);
    try {
      // Fetch the AI prose on demand (labelled) so the printed report reads like an
      // article; the on-screen rule-based cards stay instant. Falls back to the
      // rule-composed text if the AI call is unavailable.
      let prose = null;
      const tok = await token();
      if (tok) {
        const res = await fetch(`/api/coach/scouting/opponent?opponent=${encodeURIComponent(sel.opponent)}&season=${encodeURIComponent(sel.season)}&prose=1&lang=${lang}`, { headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json();
        if (res.ok && j.ok) prose = j.prose ?? null;
      }
      await downloadScoutReportPdf(report, lang, (k) => mlabel(k, lang), prose);
    } finally { setPdfBusy(false); }
  }

  // Re-window the form block from the full per-match list, client-side (no refetch).
  const windowedForm = React.useMemo(
    () => (report ? computeFormWindow(report.allMatches ?? [], formWindow === "all" ? Infinity : formWindow) : null),
    [report, formWindow],
  );
  const totalMatches = report?.allMatches?.filter((m) => m.date).length ?? 0;
  // Season profile from the SAME per-match rows → the honest benchmark for the window averages.
  const seasonProfile: Metrics | null = React.useMemo(
    () => (report ? metricsFromScoutMatches(report.allMatches ?? []) : null),
    [report],
  );

  // Basketball: detailed opponent scouting from the free KKÍ box-score feed.
  if (isBasketball) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
          <PagePurpose
            en="Scout a league opponent — team scoring, shooting and rebounding, their key players and threats, and how to defend them. Two sources: their whole season pulled free from the public KKÍ feed, or your head-to-head InStat Game Reports (scoring & shooting). Descriptive scouting; it never changes the readiness verdict."
            is="Skannaðu andstæðing — skorun, skotnýting og fráköst liðsins, lykilmenn og ógnir, og hvernig á að verjast þeim. Tveir grunnar: allt tímabilið þeirra sótt frítt úr opinbera KKÍ straumnum, eða InStat leikskýrslurnar úr ykkar innbyrðis leikjum (skorun & skot). Lýsandi skönnun; breytir aldrei readiness-dómnum."
          />
        </div>
        <BasketballOpponentAnalysis />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        {report && tab === "team" ? <button onClick={makePdf} disabled={pdfBusy} className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">{pdfBusy ? t.generating : t.pdf}</button> : null}
      </div>
      <PagePurpose en={T.EN.purpose} is={T.IS.purpose} />

      {/* Picker */}
      {opponents.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {opponents.map((o) => (
            <button key={`${o.opponent_name}|${o.season}`} onClick={() => setSel({ opponent: o.opponent_name, season: o.season })}
              className={`rounded-full px-3 py-1 text-[13px] ${sel?.opponent === o.opponent_name && sel?.season === o.season ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {o.opponent_name} · {o.season} <span className="opacity-60">({o.matches})</span>
              {(o.sources?.length ?? 0) > 1 ? <span className="ml-1 opacity-70" title="Wyscout + StatsBomb">·  WY+SB</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Team report / Players tabs — only once an opponent is selected */}
      {sel ? (
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[13px]">
          {(["team", "players"] as const).map((tk) => (
            <button key={tk} type="button" onClick={() => setTab(tk)}
              className={`rounded-md px-3 py-1 font-semibold ${tab === tk ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {tk === "team" ? t.tabTeam : t.tabPlayers}
            </button>
          ))}
        </div>
      ) : null}

      {/* Scout-an-opponent upload */}
      <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-800"><span className="transition-transform group-open:rotate-90">▸</span>{t.scout}</summary>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.dataLabel}</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px]">
            {(["wyscout", "statsbomb"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setImpProvider(p)}
                className={`rounded-md px-2.5 py-0.5 font-semibold ${impProvider === p ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {p === "statsbomb" ? "StatsBomb" : "Wyscout"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{impProvider === "statsbomb" ? t.scoutHintSb : t.scoutHintWy}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-[12px] font-medium text-slate-700">{t.oppName}
            <input value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder="Stjarnan" className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-[12px] font-medium text-slate-700">{t.season}
            <input value={season} onChange={(e) => setSeason(e.target.value)} className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-[12px] font-medium text-slate-700">{t.files}
            <input type="file" multiple accept=".xlsx,.xls,.csv" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setPreview(null); }} className="mt-1 block text-[12px]" />
          </label>
          <label className="text-[12px] font-medium text-slate-700">{t.playersFile}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setPlayerFile(e.target.files?.[0] ?? null)} className="mt-1 block text-[12px]" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => send("preview")} disabled={upBusy !== ""} className="rounded-lg bg-slate-800 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">{upBusy === "preview" ? t.reading : t.preview}</button>
          <button onClick={() => send("commit")} disabled={!preview || upBusy !== ""} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">{upBusy === "commit" ? t.importing : t.import}</button>
        </div>
        {preview ? (
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
            <div className="font-semibold text-slate-800">{preview.opponent}{preview.matches != null ? ` · ${preview.matches} ${t.matches}` : ""}</div>
            {preview.source === "statsbomb" ? (
              <div className="mt-0.5 text-[11px] text-slate-500">StatsBomb Team Stats{preview.categories != null ? ` · ${preview.categories} ${lang === "IS" ? "flokkar" : "categories"}` : ""} · {lang === "IS" ? "vs innbyggð League Average" : "vs built-in League Average"}{preview.squadPlayers ? ` · ${preview.squadPlayers} ${lang === "IS" ? "leikmenn með per-90 (Leikmenn-flipi)" : "players with per-90 (Players tab)"}` : ""}</div>
            ) : (
              <div className="mt-0.5 text-[11px] text-slate-500">Detected: General ✓{preview.detected?.passing ? " · Passing ✓" : ""}{preview.detected?.attacking ? " · Attacking ✓" : ""}{preview.detected?.indexes ? " · PPDA ✓" : ""}{preview.detected?.defending ? " · Def ✓" : ""}{preview.players ? ` · ${preview.players} players` : ""}</div>
            )}
          </div>
        ) : null}

        {/* StatsBomb per-player category exports — pick ALL of them at once; merged by Name into
            one rich per-90 bag → the Players tab. Uses the opponent name above (or the file's Team). */}
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <div className="text-[12px] font-semibold text-slate-700">{lang === "IS" ? "StatsBomb leikmanna-tölfræði → Leikmenn-flipi" : "StatsBomb player stats → Players tab"}</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            {lang === "IS"
              ? "Hladdu inn all-metrics tímabils-skránni (Player Stats með ÖLLUM mælingum) fyrir andstæðinginn — ein skrá dugar. Hún inniheldur alla per-90 prófílinn OG leikstöðuna (Primary Position), sem AI-lesturinn þarf. Þú getur líka valið margar flokka-skrár í einu ef þú vilt — þær sameinast eftir nafni — en aðeins all-metrics skráin ber leikstöðuna."
              : "Upload the opponent’s all-metrics season file (the Player Stats export with EVERY metric) — one file is enough. It carries the full per-90 profile AND the position (Primary Position) the AI read needs. You can still pick several category files at once if you prefer — they merge by name — but only the all-metrics file carries the position."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="file" multiple accept=".csv,.xlsx,.xls" onChange={(e) => { setSbPlayerFiles(Array.from(e.target.files ?? [])); setSbPlayersMsg(null); }} className="text-[12px]" />
            <button onClick={() => void importSbPlayers()} disabled={sbPlayersBusy || !sbPlayerFiles.length} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
              {sbPlayersBusy ? "…" : (lang === "IS" ? `Flytja inn (${sbPlayerFiles.length})` : `Import (${sbPlayerFiles.length})`)}
            </button>
            {sbPlayersMsg ? <span className="text-[11px] font-medium text-slate-700">{sbPlayersMsg}</span> : null}
          </div>
        </div>
      </details>

      {err ? <p className="text-[13px] font-medium text-red-700">{err}</p> : null}
      {busy ? <p className="text-sm text-slate-400">…</p> : null}

      {tab === "players" ? (
        <OpponentPlayerAnalysis opponent={sel?.opponent ?? null} season={sel?.season ?? null} lang={lang} />
      ) : null}

      {tab === "team" && !report && !busy ? <p className="text-[13px] text-slate-500">{t.noReport}</p> : null}

      {tab === "team" && report ? (() => {
        // Per-metric source tags only make sense in the merged (both-source) view.
        const mergedSrc = (report.sources?.length ?? 0) > 1 ? report.metricSource : undefined;
        return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(report.sources?.length ?? 0) > 1 ? (
              <span className="rounded-full bg-gradient-to-r from-slate-700 to-[#2740e6] px-2 py-0.5 text-[11px] font-semibold text-white">
                {t.builtFrom}: Wyscout + StatsBomb
              </span>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${report.source === "statsbomb" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"}`}>
                {t.builtFrom}: {report.source === "statsbomb" ? "StatsBomb" : "Wyscout"}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{t.seasonTotals}{totalMatches ? ` · ${totalMatches} ${t.matches}` : ""}</span>
            {(report.sources?.length ?? 0) > 1
              ? <span className="text-[11px] text-slate-500">{lang === "IS" ? "sameinuð sýn — hver tala merkt uppruna (SB/WY)" : "merged view — each number tagged by source (SB/WY)"}</span>
              : report.source === "statsbomb"
              ? <span className="text-[11px] text-slate-500">{lang === "IS" ? "dýpri en Wyscout — OBV, pressa, raunveruleg fastaleikja-xG" : "deeper than Wyscout — OBV, pressing, real set-piece xG"}</span>
              : <span className="text-[11px] text-slate-500">{t.upgradeSb}</span>}
          </div>
          {report.statsbomb ? (
            <Block title={lang === "IS" ? "StatsBomb-merki" : "StatsBomb signals"} lang={lang}>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-3">
                {([
                  ["obv", report.statsbomb.obv, report.statsbomb.obvLeague],
                  ["obvAgainst", report.statsbomb.obvAgainst, report.statsbomb.obvAgainstLeague],
                  ["clearShots", report.statsbomb.clearShots, report.statsbomb.clearShotsLeague],
                  ["clearShotsAgainst", report.statsbomb.clearShotsAgainst, report.statsbomb.clearShotsAgainstLeague],
                  ["setPieceXg", report.statsbomb.setPieceXg, report.statsbomb.setPieceXgLeague],
                  ["setPieceXgAgainst", report.statsbomb.setPieceXgAgainst, report.statsbomb.setPieceXgAgainstLeague],
                  ["cornerXg", report.statsbomb.cornerXg, report.statsbomb.cornerXgLeague],
                ] as Array<[string, number | null, number | null]>).filter(([, v]) => v != null).map(([k, them, lg]) => (
                  <div key={k} className="flex justify-between border-b border-slate-100 py-0.5">
                    <span className="text-slate-600">{mlabel(k, lang)}</span>
                    <span className="tabular-nums text-slate-800">{fmt(them)}{lg != null ? <span className="ml-1 text-[11px] text-slate-400">({lang === "IS" ? "deild" : "lg"} {fmt(lg)})</span> : null}</span>
                  </div>
                ))}
              </div>
            </Block>
          ) : null}
          <Block title={t.identity} verdict={report.identity.verdict} facts={report.identity.facts} lang={lang} metricSource={mergedSrc} />
          <Block title={t.attack} verdict={report.attack.verdict} facts={report.attack.facts} lang={lang} metricSource={mergedSrc} />
          <Block title={t.defend} verdict={report.defend.verdict} facts={report.defend.facts} lang={lang} metricSource={mergedSrc}>
            <div className="mt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.howToHurt}</div>
              <ul className="mt-1 space-y-1.5">
                {report.defend.recommendations.map((r) => (
                  <li key={r.id} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[13px] text-slate-800">
                    {r.text[lang.toLowerCase() as "en" | "is"]}
                    <span className="ml-1 text-[11px] text-slate-500">({t.signal}: {mlabel(r.signal.metric, lang)} {fmt(r.signal.value)})</span>
                  </li>
                ))}
              </ul>
            </div>
          </Block>
          <Block title={t.setpieces} verdict={report.setPieces.verdict} facts={report.setPieces.facts} lang={lang} metricSource={mergedSrc} />
          <Block title={t.players} verdict={report.keyPlayers.verdict} lang={lang}>
            {report.keyPlayers.available ? (
              <div className="mt-2 text-[13px]">
                {report.keyPlayers.topScorers.map((p) => (
                  <div key={p.name} className="flex justify-between border-b border-slate-100 py-0.5">
                    <span className="text-slate-700">{p.name}{p.position ? <span className="ml-1 text-[11px] text-slate-400">{p.position}</span> : null}</span>
                    <span className="tabular-nums text-slate-600">{fmt(p.goals, 0)} G · {fmt(p.assists, 0)} A · {fmt(p.xg)} xG</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Block>
          <Block title={t.matchup} verdict={report.matchup.verdict} lang={lang}>
            <div className="mt-2 text-[13px]">
              <div className="flex justify-between border-b border-slate-200 pb-1 text-[11px] font-semibold uppercase text-slate-400"><span> </span><span className="flex gap-4"><span className="w-14 text-right">{t.them}</span><span className="w-14 text-right">{t.you}</span><span className="w-12 text-right">{t.delta}</span></span></div>
              {report.matchup.rows.map((r) => (
                <div key={r.metric} className="flex justify-between border-b border-slate-100 py-0.5">
                  <span className="text-slate-700">{mlabel(r.metric, lang)}</span>
                  <span className="flex gap-4 tabular-nums"><span className="w-14 text-right">{fmt(r.them)}</span><span className="w-14 text-right text-blue-700">{fmt(r.you)}</span><span className={`w-12 text-right font-semibold ${r.theyBetter ? "text-red-600" : "text-emerald-700"}`}>{r.delta == null ? "—" : (r.delta >= 0 ? "+" : "") + fmt(r.delta)}</span></span>
                </div>
              ))}
            </div>
          </Block>
          <Block title={t.form} verdict={(windowedForm ?? report.form).verdict} lang={lang}>
            {/* Match-window control — 5 / 10 / all. Real per-match data, so this re-scopes honestly. */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.formWindow}</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px]">
                {([5, 10, "all"] as const).map((w) => {
                  const disabled = w !== "all" && totalMatches > 0 && totalMatches < (w as number);
                  return (
                    <button key={String(w)} type="button" disabled={disabled} onClick={() => setFormWindow(w)}
                      className={`rounded-md px-2.5 py-0.5 font-semibold ${formWindow === w ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"} disabled:opacity-30`}>
                      {w === "all" ? `${t.wAll}${totalMatches ? ` (${totalMatches})` : ""}` : w}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
              {(windowedForm ?? report.form).last.map((m) => (
                <span key={m.date} className={`rounded px-1.5 py-0.5 font-semibold ${m.result === "W" ? "bg-emerald-100 text-emerald-700" : m.result === "L" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  {m.date.slice(5)} {m.result ?? "—"} <span className="font-normal">{fmt(m.xg)}–{fmt(m.xgAgainst)}</span>
                </span>
              ))}
            </div>
            {/* Window averages of the rich per-match metrics (real data → honest), each vs the season.
                Layer 2 — collapsed behind a toggle so the form verdict + match chips lead. */}
            {(() => {
              const wm = windowedForm?.windowMetrics;
              if (!wm) return null;
              const rows = WINDOW_METRIC_ORDER
                .map((k) => ({ k, val: wm[k] as number | null, season: (seasonProfile?.[k] ?? null) as number | null }))
                .filter((r) => r.val != null);
              if (!rows.length) return null;
              const n = windowedForm?.n ?? 0;
              return (
                <div className="mt-3">
                  <button type="button" onClick={() => setShowWindowStats((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-100">
                    <span className={`transition-transform ${showWindowStats ? "rotate-90" : ""}`}>▸</span>
                    {showWindowStats
                      ? (lang === "IS" ? "Fela gluggameðaltöl" : "Hide window averages")
                      : (lang === "IS" ? `Sýna meðaltal síðustu ${n} (${rows.length} breytur, vs tímabil)` : `Show average of last ${n} (${rows.length} metrics, vs season)`)}
                  </button>
                  {showWindowStats ? (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-3">
                      {rows.map(({ k, val, season }) => (
                        <div key={k} className="flex items-baseline justify-between border-b border-slate-100 py-0.5">
                          <span className="text-slate-600">{mlabel(k, lang)}</span>
                          <span className="tabular-nums text-slate-800">{fmt(val)}{season != null ? <span className="ml-1 text-[11px] text-slate-400">({fmt(season)})</span> : null}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })()}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{t.formWindowNote}</p>
          </Block>
        </div>
        );
      })() : null}
    </div>
  );
}
