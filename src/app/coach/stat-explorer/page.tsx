"use client";

export const dynamic = "force-dynamic";

/**
 * Stat Explorer — pick a window (last 5 / 10 / all) + context (home/away, win/loss, opponent), a
 * side of the game and a metric, and see which players produce the best numbers. Two views: a
 * ranked Leaderboard, and a full all-metrics × all-players Table (sort by any column). Layered read:
 * verdict → bars → details. Reads /api/coach/stat-explorer + ranks client-side with the shared pure
 * engine. Descriptive football context — never touches the readiness colour. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import {
  GROUP_LABEL, GROUP_ORDER, rankLeaderboard, metricValueForMode,
  type PlayerAgg, type GroupKey, type Mode, type Line, type Bi, type MetricSpec,
} from "@/lib/micropulse/statExplorer";

type CatalogEntry = { key: string; label: Bi; group: GroupKey; agg: "sum" | "mean"; per90: boolean; higherIsBetter: boolean; tip: Bi | null };
type Resp = { ok: boolean; hasData?: boolean; window?: number | "all"; matchCount?: number; opponents?: string[]; matchDates?: string[]; players?: PlayerAgg[]; catalog?: CatalogEntry[]; error?: string };

const LINES: { key: Line | "ALL"; en: string; is: string }[] = [
  { key: "ALL", en: "All", is: "Allir" }, { key: "GK", en: "GK", is: "MV" }, { key: "DEF", en: "Defenders", is: "Varnarmenn" },
  { key: "MID", en: "Midfield", is: "Miðja" }, { key: "FWD", en: "Forwards", is: "Sókn" },
];
const toSpec = (c: CatalogEntry): MetricSpec => ({ ...c, aliases: [], tip: c.tip ?? undefined });
const fmt = (v: number | null, agg: "sum" | "mean"): string =>
  v == null ? "–" : agg === "mean" ? `${v.toFixed(0)}%` : Number.isInteger(v) ? String(v) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

export default function StatExplorerPage() {
  const [lang] = useLang();
  const is: boolean = lang === "IS";
  const L = <T,>(o: { en: T; is: T }) => (is ? o.is : o.en);

  const [win, setWin] = React.useState<"5" | "10" | "all">("5");
  const [home, setHome] = React.useState<"all" | "home" | "away">("all");
  const [result, setResult] = React.useState<"all" | "win" | "draw" | "loss">("all");
  const [opponent, setOpponent] = React.useState("");
  const [group, setGroup] = React.useState<GroupKey>("attacking");
  const [metricKey, setMetricKey] = React.useState<string>("goals");
  const [mode, setMode] = React.useState<Mode>("perGame");
  const [line, setLine] = React.useState<Line | "ALL">("ALL");
  const [minGames, setMinGames] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<"board" | "table">("board");
  const [showAllCols, setShowAllCols] = React.useState(false);
  const [sort, setSort] = React.useState<{ key: string; dir: "desc" | "asc" }>({ key: "goals", dir: "desc" });
  const [showDetails, setShowDetails] = React.useState(false);

  const [data, setData] = React.useState<Resp | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "empty" | "error">("loading");
  const [err, setErr] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  React.useEffect(() => {
    let live = true;
    (async () => {
      setState("loading"); setErr(null);
      const t = await token(); if (!t) { setState("error"); setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      try {
        const qs = new URLSearchParams({ window: win, home, result, opponent });
        const res = await fetch(`/api/coach/stat-explorer?${qs}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
        const j = (await res.json()) as Resp;
        if (!live) return;
        if (!res.ok || !j.ok) { setState("error"); setErr(j.error ?? "Error"); return; }
        setData(j); setState(j.hasData ? "ready" : "empty");
      } catch (e) { if (live) { setState("error"); setErr(e instanceof Error ? e.message : "Error"); } }
    })();
    return () => { live = false; };
  }, [win, home, result, opponent, token, is]);

  const catalog = React.useMemo(() => data?.catalog ?? [], [data]);
  const specByKey = React.useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);
  const groupMetrics = React.useMemo(() => catalog.filter((m) => m.group === group), [catalog, group]);
  const searchHits = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? catalog.filter((m) => m.label.en.toLowerCase().includes(q) || m.label.is.toLowerCase().includes(q)) : [];
  }, [search, catalog]);

  // Keep the selected metric valid inside the chosen group.
  React.useEffect(() => {
    if (catalog.length && !groupMetrics.some((m) => m.key === metricKey)) setMetricKey(groupMetrics[0]?.key ?? "goals");
  }, [group, groupMetrics, metricKey, catalog.length]);

  const spec = specByKey.get(metricKey);
  const effMode: Mode = spec?.agg === "mean" ? "perGame" : mode;
  const modeLabel: Record<Mode, Bi> = { perGame: { en: "per game", is: "á leik" }, total: { en: "total", is: "samtals" }, per90: { en: "per 90", is: "á 90 mín" } };

  const board = React.useMemo(() => {
    if (!data?.players || !spec) return null;
    return rankLeaderboard(data.players, toSpec(spec), { mode: effMode, minGames, line: line === "ALL" ? null : line });
  }, [data, spec, effMode, minGames, line]);

  // Columns for the table: current group, or every metric when "show all".
  const tableCols = React.useMemo(() => (showAllCols ? catalog : groupMetrics), [showAllCols, catalog, groupMetrics]);
  const tableRows = React.useMemo(() => {
    if (!data?.players) return [];
    const sc = specByKey.get(sort.key);
    const rows = data.players
      .filter((a) => (line === "ALL" ? true : a.line === line))
      .filter((a) => a.games >= Math.max(1, minGames));
    if (!sc) return rows;
    const val = (a: PlayerAgg) => metricValueForMode(a, toSpec(sc), sc.agg === "mean" ? "perGame" : effMode).value;
    return [...rows].sort((x, y) => {
      const xv = val(x), yv = val(y);
      if (xv == null && yv == null) return 0; if (xv == null) return 1; if (yv == null) return -1;
      return sort.dir === "desc" ? yv - xv : xv - yv;
    });
  }, [data, specByKey, sort, line, minGames, effMode]);

  const top = board?.rows[0];
  const max = board?.rows.reduce((m, r) => Math.max(m, r.value ?? 0), 0) ?? 0;
  const windowLabel = win === "all" ? (is ? "allir leikir" : "all games") : (is ? `síðustu ${win} leikir` : `last ${win} games`);
  const ctxLabel = [home !== "all" ? (home === "home" ? (is ? "heima" : "home") : (is ? "úti" : "away")) : null,
    result !== "all" ? (result === "win" ? (is ? "sigrar" : "wins") : result === "loss" ? (is ? "töp" : "losses") : (is ? "jafntefli" : "draws")) : null,
    opponent ? `${is ? "gegn" : "vs"} ${opponent}` : null].filter(Boolean).join(" · ");
  const per90Low = effMode === "per90" && (board?.minutesCoverage ?? 0) < 0.5;
  const nMatches = data?.matchCount ?? 0;

  const setMetric = (k: string) => { setMetricKey(k); const g = specByKey.get(k)?.group; if (g) setGroup(g); setSearch(""); };
  const clickCol = (k: string) => setSort((s) => s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: "desc" });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="font-[family-name:var(--font-archivo,inherit)] text-2xl font-bold text-[#14181c]">{is ? "Sniðin tölfræði" : "Stat Explorer"}</h1>
      <PagePurpose en="pick a window and context, and see which players are producing the best numbers — leaderboard or a full all-metrics table." is="velja glugga og samhengi, og sjá hvaða leikmenn skila bestu tölunum — leiðtogatafla eða full tölfræðitafla." />

      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Gluggi" : "Window"}</span>
          {(["5", "10", "all"] as const).map((w) => (
            <button key={w} onClick={() => setWin(w)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${win === w ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {w === "all" ? (is ? "Allt" : "All") : (is ? `${w} leikir` : `Last ${w}`)}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {/* Context: home/away */}
          {([["all", is ? "Heima+úti" : "Home+away"], ["home", is ? "Heima" : "Home"], ["away", is ? "Úti" : "Away"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setHome(k)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${home === k ? "bg-[#14181c] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{lbl}</button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {/* Context: result */}
          {([["all", is ? "Öll úrslit" : "All results"], ["win", is ? "Sigrar" : "Wins"], ["draw", is ? "Jafntefli" : "Draws"], ["loss", is ? "Töp" : "Losses"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setResult(k)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${result === k ? "bg-[#14181c] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{lbl}</button>
          ))}
          {/* Context: opponent */}
          <select value={opponent} onChange={(e) => setOpponent(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-medium text-slate-800">
            <option value="">{is ? "Allir andstæðingar" : "All opponents"}</option>
            {(data?.opponents ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <span className="text-[11px] text-slate-400">{nMatches} {is ? "leikir í úrtaki" : "matches in sample"}</span>
        </div>

        {/* Group + metric + search */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Hlið" : "Side"}</span>
          {GROUP_ORDER.map((g) => (
            <button key={g} onClick={() => setGroup(g)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${group === g ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{L(GROUP_LABEL[g])}</button>
          ))}
          <div className="relative">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={is ? "leita að þætti…" : "search metric…"} className="w-44 rounded-lg border border-slate-300 px-2 py-1 text-[12px]" />
            {searchHits.length > 0 ? (
              <div className="absolute z-10 mt-1 max-h-60 w-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {searchHits.slice(0, 30).map((m) => (
                  <button key={m.key} onClick={() => setMetric(m.key)} className="block w-full px-3 py-1 text-left text-[12px] text-slate-700 hover:bg-slate-50">{L(m.label)} <span className="text-[10px] text-slate-400">· {L(GROUP_LABEL[m.group])}</span></button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Metric selector + mode + line + view */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Þáttur" : "Metric"}</span>
          <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-[13px] font-medium text-slate-800">
            {groupMetrics.map((m) => <option key={m.key} value={m.key}>{L(m.label)}</option>)}
          </select>
          {spec?.agg === "sum" ? (
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {(["perGame", "total", "per90"] as Mode[]).map((mo) => (
                <button key={mo} onClick={() => setMode(mo)} disabled={mo === "per90" && !spec.per90} className={`px-2.5 py-1 text-[12px] font-semibold ${mode === mo ? "bg-[#2740e6] text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-30`}>{L(modeLabel[mo])}</button>
              ))}
            </div>
          ) : spec ? <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-500">{is ? "vegið meðaltal" : "weighted avg"}</span> : null}
          <select value={line} onChange={(e) => setLine(e.target.value as Line | "ALL")} className="rounded-lg border border-slate-300 px-2 py-1 text-[13px] font-medium text-slate-800">
            {LINES.map((l) => <option key={l.key} value={l.key}>{is ? l.is : l.en}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-500">{is ? "lágm. leikir" : "min games"}
            <input type="number" min={1} max={20} value={minGames} onChange={(e) => setMinGames(Math.max(1, Number(e.target.value) || 1))} className="w-14 rounded border border-slate-300 px-1.5 py-1 text-[12px]" />
          </label>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {([["board", is ? "Leiðtogatafla" : "Leaderboard"], ["table", is ? "Full tafla" : "Full table"]] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 text-[12px] font-semibold ${view === v ? "bg-[#14181c] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── States ─────────────────────────────────────────────── */}
      {state === "loading" ? <p className="mt-6 text-sm text-slate-400">…</p> : null}
      {state === "error" ? <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
      {state === "empty" ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-[13px] leading-relaxed text-slate-600">
          {contextActiveHint(is, home, result, opponent)}
        </div>
      ) : null}

      {/* ── Leaderboard view ───────────────────────────────────── */}
      {state === "ready" && view === "board" && board && spec ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {windowLabel}{ctxLabel ? ` · ${ctxLabel}` : ""} · {L(spec.label)}{spec.agg === "sum" ? ` (${L(modeLabel[effMode])})` : ""}
            </div>
            {top ? (
              <p className="mt-1 font-[family-name:var(--font-archivo,inherit)] text-lg font-bold text-[#14181c]">
                {top.name} {is ? "skilar mestu" : "leads"} — <span className="text-[#2740e6]">{fmt(top.value, spec.agg)}</span>
                <span className="ml-1 text-[13px] font-medium text-slate-400">{spec.agg === "sum" ? L(modeLabel[effMode]) : ""}</span>
              </p>
            ) : <p className="mt-1 text-[13px] text-slate-500">{is ? "Enginn leikmaður uppfyllir síurnar." : "No players match the filters."}</p>}
            {board.rows.length >= 2 && top ? <p className="mt-0.5 text-[12.5px] text-slate-500">{is ? "Næstir: " : "Then: "}{board.rows.slice(1, 3).map((r) => `${r.name} (${fmt(r.value, spec.agg)})`).join(", ")}</p> : null}
            {spec.tip ? <p className="mt-1.5 text-[11px] text-slate-400">{L(spec.tip)}</p> : null}
            {per90Low ? <p className="mt-1.5 text-[11px] font-medium text-amber-700">⚠ {is ? "Fáir leikir eru með mínútur skráðar — per-90 er ónákvæmt. Notaðu „á leik“ á meðan." : "Few games have minutes recorded — per-90 is unreliable. Use “per game” for now."}</p> : null}
          </div>

          {board.rows.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="space-y-1.5">
                {board.rows.slice(0, 14).map((r, i) => (
                  <div key={r.playerId} className="flex items-center gap-2">
                    <span className="w-5 text-right text-[11px] tabular-nums text-slate-400">{i + 1}</span>
                    <span className="w-40 shrink-0 truncate text-[13px] text-slate-700" title={r.position ?? undefined}>{r.name}</span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-[#2740e6]/85" style={{ width: `${max > 0 && r.value != null ? Math.max(2, (r.value / max) * 100) : 0}%` }} /></div>
                    <span className="w-14 text-right text-[13px] font-bold tabular-nums text-slate-900">{fmt(r.value, spec.agg)}</span>
                    <span className="hidden w-16 text-right text-[11px] tabular-nums text-slate-400 sm:inline">{r.games} {is ? "leikir" : "gm"}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowDetails((v) => !v)} className="mt-3 text-[12px] font-medium text-[#2740e6] hover:underline">{showDetails ? (is ? "Fela nánar" : "Hide details") : (is ? "Sýna nánar (heild, á leik, mínútur)" : "Show details (total, per-game, minutes)")}</button>
              {showDetails ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-slate-400"><th className="py-1 pr-3 font-medium">{is ? "Leikmaður" : "Player"}</th><th className="pr-3 font-medium">{is ? "Staða" : "Pos"}</th><th className="pr-3 text-right font-medium">{is ? "Leikir" : "Games"}</th><th className="pr-3 text-right font-medium">{is ? "Mínútur" : "Minutes"}</th><th className="pr-3 text-right font-medium">{is ? "Samtals" : "Total"}</th><th className="pr-3 text-right font-medium">{is ? "Á leik" : "Per game"}</th></tr></thead>
                    <tbody>
                      {board.rows.map((r) => (
                        <tr key={r.playerId} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-700">{r.name}</td><td className="pr-3 text-slate-500">{r.position ?? "–"}</td>
                          <td className="pr-3 text-right tabular-nums text-slate-600">{r.games}</td><td className="pr-3 text-right tabular-nums text-slate-500">{r.minutes > 0 ? Math.round(r.minutes) : "–"}</td>
                          <td className="pr-3 text-right tabular-nums text-slate-700">{fmt(r.total, spec.agg)}</td><td className="pr-3 text-right tabular-nums font-semibold text-slate-900">{fmt(r.perGame, spec.agg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Full table view ────────────────────────────────────── */}
      {state === "ready" && view === "table" ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{windowLabel}{ctxLabel ? ` · ${ctxLabel}` : ""} · {showAllCols ? (is ? "allir þættir" : "all metrics") : L(GROUP_LABEL[group])} · {is ? "smelltu á dálk til að raða" : "click a column to sort"}</div>
            <label className="flex items-center gap-1.5 text-[12px] text-slate-500"><input type="checkbox" checked={showAllCols} onChange={(e) => setShowAllCols(e.target.checked)} />{is ? "sýna alla þætti" : "show all metrics"}</label>
          </div>
          <div className="overflow-x-auto">
            <table className="text-[12px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-left font-semibold">{is ? "Leikmaður" : "Player"}</th>
                  <th className="px-2 text-right font-medium">{is ? "L" : "G"}</th>
                  {tableCols.map((c) => (
                    <th key={c.key} onClick={() => clickCol(c.key)} className={`cursor-pointer whitespace-nowrap px-2 text-right font-medium hover:text-[#2740e6] ${sort.key === c.key ? "text-[#2740e6]" : ""}`} title={c.tip ? L(c.tip) : L(c.label)}>
                      {L(c.label)}{sort.key === c.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((a) => (
                  <tr key={a.playerId} className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1.5 pr-3 text-slate-700">{a.name}</td>
                    <td className="px-2 text-right tabular-nums text-slate-400">{a.games}</td>
                    {tableCols.map((c) => {
                      const v = metricValueForMode(a, toSpec(c), c.agg === "mean" ? "perGame" : effMode).value;
                      return <td key={c.key} className={`px-2 text-right tabular-nums ${sort.key === c.key ? "font-semibold text-slate-900" : "text-slate-600"}`}>{fmt(v, c.agg)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{is ? "Lýsandi tölfræði úr StatsBomb per-leik gögnum — snertir aldrei readiness-litinn. Gildi eru „á leik“ nema þú veljir „samtals“/„á 90“; % eru vegið meðaltal." : "Descriptive stats from StatsBomb per-match data — never touches the readiness colour. Values are per-game unless you pick total/per-90; %s are weighted means."}</p>
        </div>
      ) : null}
    </div>
  );
}

function contextActiveHint(is: boolean, home: string, result: string, opponent: string): string {
  const anyCtx = home !== "all" || result !== "all" || opponent !== "";
  if (anyCtx) return is ? "Engir leikir passa við þetta samhengi. Prófaðu að rýmka síuna (heima/úti, úrslit eða andstæðing)." : "No matches fit this context. Try widening the filter (home/away, result or opponent).";
  return is
    ? "Engir per-leik tölfræði enn. Fluttu inn leiki á Single Match Analysis (StatsBomb „Match Stats“ eða Squad-skrá síaða á leik) — þá birtast leikmenn hér."
    : "No per-match stats yet. Import matches on Single Match Analysis (StatsBomb “Match Stats” or a Squad export filtered to the match) — players will appear here.";
}
