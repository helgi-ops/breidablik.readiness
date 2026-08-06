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
import PagePurpose from "@/components/coach/PagePurpose";
import { downloadScoutReportPdf } from "@/components/coach/ScoutReportPdf";
import type { OpponentReport, Cited, Bi } from "@/lib/micropulse/scouting/opponentReport";

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
  positionalAttacks: { EN: "Positional attacks", IS: "Staðsóknir" }, counterattacks: { EN: "Counterattacks", IS: "Skyndisóknir" },
  finishing: { EN: "Finishing (goals − xG)", IS: "Klárun (mörk − xG)" }, gf: { EN: "Goals / match", IS: "Mörk / leik" },
  ga: { EN: "Goals against / match", IS: "Mörk á móti / leik" },
};
const mlabel = (k: string, lang: Lang) => (METRIC[k] ? METRIC[k][lang] : k);

const T = {
  EN: {
    title: "Opponent Scouting", purpose: "A plain-language pre-match plan built from the opponent's own Wyscout season — how they play, where they hurt you, how to hurt them. Benchmarked against the league and your team. Descriptive context — it never changes the readiness verdict.",
    pick: "Opponent", season: "Season", noReport: "No scouting for that opponent/season yet — scout one below.",
    scout: "Scout an opponent", scoutHint: "Opponent + season, then drop their Wyscout Team → Stats export(s) (General required; Indexes/Defending/Passing/Attacking optional) and, optionally, an Advanced Search player export.",
    oppName: "Opponent name", files: "Team → Stats export(s)", playersFile: "Player export (optional)",
    preview: "Preview", import: "Import", clear: "Clear", reading: "Reading…", importing: "Saving…",
    identity: "Style", attack: "How they attack", defend: "How they defend — where to hurt them", setpieces: "Set pieces",
    players: "Key players — who to stop", matchup: "Them vs you", form: "Form",
    details: "Show details", hide: "Hide", vsLeague: "league", vsYou: "you", them: "Them", you: "You", delta: "Δ",
    howToHurt: "How to hurt them", signal: "signal", pdf: "Report (PDF)", generating: "Generating…",
    matches: "matches", notSignedIn: "Not signed in.", need: "Enter an opponent, a season and the General export.",
    trendRising: "rising", trendFalling: "falling", trendSteady: "steady",
  },
  IS: {
    title: "Andstæðinga-njósn", purpose: "Fyrir-leiks áætlun á mannamáli úr Wyscout-tímabili andstæðingsins — hvernig þeir spila, hvar þeir meiða þig, hvernig á að meiða þá. Borið saman við deildina og þitt lið. Lýsandi samhengi — breytir aldrei readiness-dómnum.",
    pick: "Andstæðingur", season: "Tímabil", noReport: "Engin njósn fyrir þennan andstæðing/tímabil enn — njósnaðu um einn að neðan.",
    scout: "Njósnaðu um andstæðing", scoutHint: "Andstæðingur + tímabil, svo Wyscout Team → Stats útflutning(ar) (General nauðsynlegt; Indexes/Defending/Passing/Attacking valfrjálst) og, valfrjálst, Advanced Search leikmanna-skrá.",
    oppName: "Nafn andstæðings", files: "Team → Stats skrá(r)", playersFile: "Leikmanna-skrá (valfrjálst)",
    preview: "Forskoða", import: "Flytja inn", clear: "Hreinsa", reading: "Les…", importing: "Vista…",
    identity: "Stíll", attack: "Hvernig þeir sækja", defend: "Hvernig þeir verjast — hvar á að meiða þá", setpieces: "Fastaleikir",
    players: "Lykilmenn — hvern á að stöðva", matchup: "Þeir vs þú", form: "Form",
    details: "Sýna nánar", hide: "Fela", vsLeague: "deild", vsYou: "þú", them: "Þeir", you: "Þú", delta: "Δ",
    howToHurt: "Hvernig á að meiða þá", signal: "merki", pdf: "Skýrsla (PDF)", generating: "Bý til…",
    matches: "leikir", notSignedIn: "Ekki innskráð(ur).", need: "Sláðu inn andstæðing, tímabil og General-skrána.",
    trendRising: "á uppleið", trendFalling: "á niðurleið", trendSteady: "stöðugt",
  },
} as const;

const fmt = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d));

function Fact({ c, lang }: { c: Cited; lang: Lang }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 text-[13px] last:border-0">
      <span className="text-slate-700">{mlabel(c.metric, lang)}</span>
      <span className="flex items-baseline gap-2 tabular-nums text-[12px]">
        <span className="font-semibold text-slate-800">{fmt(c.value)}</span>
        {c.league != null ? <span className="text-slate-400">{T[lang].vsLeague} {fmt(c.league)}</span> : null}
        {c.own != null ? <span className="text-blue-600/70">{T[lang].vsYou} {fmt(c.own)}</span> : null}
      </span>
    </div>
  );
}

function Block({ title, verdict, facts, lang, children }: { title: string; verdict?: Bi; facts?: Cited[]; lang: Lang; children?: React.ReactNode }) {
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
          {open ? <div className="mt-1">{facts.map((c) => <Fact key={c.metric} c={c} lang={lang} />)}</div> : (
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
  const [opponents, setOpponents] = React.useState<Array<{ opponent_name: string; season: string; matches: number }>>([]);
  const [sel, setSel] = React.useState<{ opponent: string; season: string } | null>(null);
  const [report, setReport] = React.useState<OpponentReport | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // upload
  const [oppName, setOppName] = React.useState("");
  const [season, setSeason] = React.useState("2026");
  const [files, setFiles] = React.useState<File[]>([]);
  const [playerFile, setPlayerFile] = React.useState<File | null>(null);
  const [upBusy, setUpBusy] = React.useState<"" | "preview" | "commit">("");
  const [preview, setPreview] = React.useState<{ opponent: string; matches: number; detected: Record<string, boolean>; players: number } | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);

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
    if (!report) return;
    setPdfBusy(true);
    try { await downloadScoutReportPdf(report, lang, (k) => mlabel(k, lang)); } finally { setPdfBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        {report ? <button onClick={makePdf} disabled={pdfBusy} className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">{pdfBusy ? t.generating : t.pdf}</button> : null}
      </div>
      <PagePurpose en={T.EN.purpose} is={T.IS.purpose} />

      {/* Picker */}
      {opponents.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {opponents.map((o) => (
            <button key={`${o.opponent_name}|${o.season}`} onClick={() => setSel({ opponent: o.opponent_name, season: o.season })}
              className={`rounded-full px-3 py-1 text-[13px] ${sel?.opponent === o.opponent_name && sel?.season === o.season ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {o.opponent_name} · {o.season} <span className="opacity-60">({o.matches})</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Scout-an-opponent upload */}
      <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-800"><span className="transition-transform group-open:rotate-90">▸</span>{t.scout}</summary>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{t.scoutHint}</p>
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
            <div className="font-semibold text-slate-800">{preview.opponent} · {preview.matches} {t.matches}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Detected: General ✓{preview.detected.passing ? " · Passing ✓" : ""}{preview.detected.attacking ? " · Attacking ✓" : ""}{preview.detected.indexes ? " · PPDA ✓" : ""}{preview.detected.defending ? " · Def ✓" : ""}{preview.players ? ` · ${preview.players} players` : ""}</div>
          </div>
        ) : null}
      </details>

      {err ? <p className="text-[13px] font-medium text-red-700">{err}</p> : null}
      {busy ? <p className="text-sm text-slate-400">…</p> : null}

      {!report && !busy ? <p className="text-[13px] text-slate-500">{t.noReport}</p> : null}

      {report ? (
        <div className="space-y-3">
          <Block title={t.identity} verdict={report.identity.verdict} facts={report.identity.facts} lang={lang} />
          <Block title={t.attack} verdict={report.attack.verdict} facts={report.attack.facts} lang={lang} />
          <Block title={t.defend} verdict={report.defend.verdict} facts={report.defend.facts} lang={lang}>
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
          <Block title={t.setpieces} verdict={report.setPieces.verdict} facts={report.setPieces.facts} lang={lang} />
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
          <Block title={t.form} verdict={report.form.verdict} lang={lang}>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
              {report.form.last.map((m) => (
                <span key={m.date} className={`rounded px-1.5 py-0.5 font-semibold ${m.result === "W" ? "bg-emerald-100 text-emerald-700" : m.result === "L" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  {m.date.slice(5)} {m.result ?? "—"} <span className="font-normal">{fmt(m.xg)}–{fmt(m.xgAgainst)}</span>
                </span>
              ))}
            </div>
          </Block>
        </div>
      ) : null}
    </div>
  );
}
