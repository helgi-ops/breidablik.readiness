"use client";

/**
 * BasketballStatExplorer — the basketball counterpart to the football Stat Explorer. Pick a window
 * (last 5 / 10 / all of the current season), a context (win/loss, opponent) and a metric, and see who
 * is producing the best numbers: a ranked leaderboard, or a full all-metrics table (sort by any column).
 * Reads /api/coach/basketball-stat-explorer (box-score sums) and computes per-game / total / per-36 /
 * shooting-% client-side. Descriptive — never the readiness colour. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type PlayerAgg = {
  key: string; name: string; playerId: string | null; gp: number; min: number;
  pts: number; oreb: number; dreb: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
};
type CompetitionOption = { code: string | null; label: string; games: number };
type Resp = { ok: boolean; isBasketball?: boolean; hasData?: boolean; season?: string | null; matchCount?: number; opponents?: string[]; players?: PlayerAgg[]; competitions?: CompetitionOption[]; competition?: string | null; error?: string };

type Group = "scoring" | "rebounding" | "playmaking" | "defense" | "minutes";
type Kind = "count" | "pct" | "ratio";
type Metric = { key: string; en: string; is: string; group: Group; kind: Kind; higherBetter: boolean };

const METRICS: Metric[] = [
  { key: "pts", en: "Points", is: "Stig", group: "scoring", kind: "count", higherBetter: true },
  { key: "fgPct", en: "FG%", is: "Skot%", group: "scoring", kind: "pct", higherBetter: true },
  { key: "tpPct", en: "3P%", is: "3ja%", group: "scoring", kind: "pct", higherBetter: true },
  { key: "ftPct", en: "FT%", is: "Víti%", group: "scoring", kind: "pct", higherBetter: true },
  { key: "tpm", en: "3-pointers made", is: "3ja skorað", group: "scoring", kind: "count", higherBetter: true },
  { key: "reb", en: "Rebounds", is: "Fráköst", group: "rebounding", kind: "count", higherBetter: true },
  { key: "oreb", en: "Off. rebounds", is: "Sóknarfráköst", group: "rebounding", kind: "count", higherBetter: true },
  { key: "dreb", en: "Def. rebounds", is: "Varnarfráköst", group: "rebounding", kind: "count", higherBetter: true },
  { key: "ast", en: "Assists", is: "Stoðsendingar", group: "playmaking", kind: "count", higherBetter: true },
  { key: "astTo", en: "Assist/TO", is: "Stoð/tap", group: "playmaking", kind: "ratio", higherBetter: true },
  { key: "tov", en: "Turnovers", is: "Tapaðir boltar", group: "playmaking", kind: "count", higherBetter: false },
  { key: "stl", en: "Steals", is: "Stolnir boltar", group: "defense", kind: "count", higherBetter: true },
  { key: "blk", en: "Blocks", is: "Varin skot", group: "defense", kind: "count", higherBetter: true },
  { key: "min", en: "Minutes", is: "Mínútur", group: "minutes", kind: "count", higherBetter: true },
];
const GROUP_LABEL: Record<Group, { en: string; is: string }> = {
  scoring: { en: "Scoring", is: "Skorun" }, rebounding: { en: "Rebounding", is: "Fráköst" },
  playmaking: { en: "Playmaking", is: "Spilastjórn" }, defense: { en: "Defense", is: "Vörn" }, minutes: { en: "Minutes", is: "Mínútur" },
};
type Mode = "perGame" | "total" | "per36";

const pct = (m: number, a: number): number | null => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);

/** The numeric value of a metric for a player in the chosen mode (null = not applicable / no attempts). */
function metricValue(p: PlayerAgg, m: Metric, mode: Mode): number | null {
  if (m.kind === "pct") {
    if (m.key === "fgPct") return pct(p.fgm, p.fga);
    if (m.key === "tpPct") return pct(p.tpm, p.tpa);
    if (m.key === "ftPct") return pct(p.ftm, p.fta);
    return null;
  }
  if (m.kind === "ratio") return p.tov > 0 ? Math.round((p.ast / p.tov) * 100) / 100 : (p.ast > 0 ? p.ast : 0);
  const sum = (p as unknown as Record<string, number>)[m.key] ?? 0;
  if (m.key === "min") return mode === "total" ? Math.round(sum * 10) / 10 : (p.gp ? Math.round((sum / p.gp) * 10) / 10 : 0);
  if (mode === "total") return sum;
  if (mode === "per36") return p.min > 0 ? Math.round((sum / p.min) * 36 * 10) / 10 : null;
  return p.gp ? Math.round((sum / p.gp) * 10) / 10 : 0; // per game
}
const fmt = (v: number | null, kind: Kind): string => (v == null ? "–" : kind === "pct" ? `${v}%` : kind === "ratio" ? v.toFixed(2) : Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function BasketballStatExplorer() {
  const [lang] = useLang();
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);

  const [win, setWin] = React.useState<"5" | "10" | "all">("5");
  const [result, setResult] = React.useState<"all" | "win" | "loss">("all");
  const [opponent, setOpponent] = React.useState("");
  const [selectedComp, setSelectedComp] = React.useState<string | null>(null);
  const [metricKey, setMetricKey] = React.useState("pts");
  const [mode, setMode] = React.useState<Mode>("perGame");
  const [minGames, setMinGames] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<"board" | "table">("board");
  const [sort, setSort] = React.useState<{ key: string; dir: "desc" | "asc" }>({ key: "pts", dir: "desc" });

  const [data, setData] = React.useState<Resp | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "empty" | "error">("loading");
  const [err, setErr] = React.useState<string | null>(null);
  const tok = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  React.useEffect(() => {
    let live = true;
    (async () => {
      setState("loading"); setErr(null);
      try {
        const token = await tok();
        if (!token) { if (live) { setErr(t("Not signed in.", "Ekki innskráð(ur).")); setState("error"); } return; }
        const qs = new URLSearchParams({ window: win, result, ...(opponent ? { opponent } : {}), ...(selectedComp ? { competition: selectedComp } : {}) });
        const res = await fetch(`/api/coach/basketball-stat-explorer?${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = (await res.json()) as Resp;
        if (!live) return;
        if (!res.ok || !j.ok) { setErr(j.error ?? t("Load failed.", "Hleðsla mistókst.")); setState("error"); return; }
        setData(j); setState(j.hasData ? "ready" : "empty");
      } catch (e) { if (live) { setErr(e instanceof Error ? e.message : t("Network error", "Netvilla")); setState("error"); } }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, result, opponent, selectedComp, is]);

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const players = React.useMemo(() => (data?.players ?? []).filter((p) => p.gp >= minGames), [data, minGames]);
  const searched = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;
  }, [players, search]);

  const board = React.useMemo(() => {
    const rows = searched.map((p) => ({ p, v: metricValue(p, metric, mode) })).filter((r) => r.v != null) as Array<{ p: PlayerAgg; v: number }>;
    rows.sort((a, b) => (metric.higherBetter ? b.v - a.v : a.v - b.v));
    return rows;
  }, [searched, metric, mode]);
  const boardMax = board.length ? Math.max(...board.map((r) => Math.abs(r.v))) : 0;

  const sortMetric = METRICS.find((m) => m.key === sort.key) ?? metric;
  const tableRows = React.useMemo(() => {
    const rows = [...searched];
    rows.sort((a, b) => {
      const va = metricValue(a, sortMetric, mode), vb = metricValue(b, sortMetric, mode);
      const na = va == null ? -Infinity : va, nb = vb == null ? -Infinity : vb;
      return sort.dir === "desc" ? nb - na : na - nb;
    });
    return rows;
  }, [searched, sortMetric, mode, sort.dir]);

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}
      className={`h-8 rounded-full px-3 text-[12.5px] font-semibold transition ${active ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{children}</button>
  );

  return (
    <div className="space-y-4">
      {/* FILTER BAR */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {(data?.competitions ?? []).length > 1 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="w-16 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Team", "Lið")}</span>
            {(data?.competitions ?? []).map((c) => (
              <Chip key={c.code ?? "none"} active={(data?.competition ?? null) === (c.code ?? null)} onClick={() => setSelectedComp(c.code)}>{c.label} <span className="font-normal opacity-70">({c.games})</span></Chip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Window", "Gluggi")}</span>
          <Chip active={win === "5"} onClick={() => setWin("5")}>{t("Last 5", "Síðustu 5")}</Chip>
          <Chip active={win === "10"} onClick={() => setWin("10")}>{t("Last 10", "Síðustu 10")}</Chip>
          <Chip active={win === "all"} onClick={() => setWin("all")}>{t("All", "Allt")}</Chip>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <Chip active={result === "all"} onClick={() => setResult("all")}>{t("All results", "Öll úrslit")}</Chip>
          <Chip active={result === "win"} onClick={() => setResult("win")}>{t("Wins", "Sigrar")}</Chip>
          <Chip active={result === "loss"} onClick={() => setResult("loss")}>{t("Losses", "Töp")}</Chip>
          <select value={opponent} onChange={(e) => setOpponent(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]">
            <option value="">{t("All opponents", "Allir andstæðingar")}</option>
            {(data?.opponents ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <span className="text-[12px] text-slate-400">{t(`${data?.matchCount ?? 0} games in sample`, `${data?.matchCount ?? 0} leikir í úrtaki`)}{data?.season ? ` · ${data.season}` : ""}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="w-16 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Metric", "Tölfræði")}</span>
          <select value={metricKey} onChange={(e) => { setMetricKey(e.target.value); setSort({ key: e.target.value, dir: "desc" }); }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]">
            {(["scoring", "rebounding", "playmaking", "defense", "minutes"] as Group[]).map((g) => (
              <optgroup key={g} label={is ? GROUP_LABEL[g].is : GROUP_LABEL[g].en}>
                {METRICS.filter((m) => m.group === g).map((m) => <option key={m.key} value={m.key}>{is ? m.is : m.en}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(["perGame", "total", "per36"] as Mode[]).map((md) => (
              <button key={md} type="button" onClick={() => setMode(md)} disabled={metric.kind !== "count" && md !== "perGame"}
                className={`h-9 px-3 text-[12px] font-semibold ${mode === md ? "bg-[#2740e6] text-white" : "bg-white text-slate-600"} disabled:opacity-40`}>
                {md === "perGame" ? t("per game", "á leik") : md === "total" ? t("total", "samtals") : t("per 36", "á 36")}
              </button>
            ))}
          </div>
          <label className="ml-1 flex items-center gap-1 text-[12px] text-slate-500">{t("min games", "lágm. leikir")}
            <input type="number" min={1} value={minGames} onChange={(e) => setMinGames(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-14 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]" />
          </label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search player…", "leita að leikmanni…")}
            className="h-9 min-w-[150px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-[12.5px]" />
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button type="button" onClick={() => setView("board")} className={`h-9 px-3 text-[12px] font-semibold ${view === "board" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>{t("Leaderboard", "Leiðtogaborð")}</button>
            <button type="button" onClick={() => setView("table")} className={`h-9 px-3 text-[12px] font-semibold ${view === "table" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>{t("Full table", "Heildartafla")}</button>
          </div>
        </div>
      </div>

      {state === "loading" && <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-[13px] text-slate-500">{t("Loading…", "Hleð…")}</div>}
      {state === "error" && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{err}</div>}
      {state === "empty" && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-[13px] text-slate-600">
          {t("No basketball games saved for the current season yet. Save games on Single Match Analysis → KKÍ.is (Save game), and they'll appear here.", "Engir körfubolta-leikir vistaðir fyrir yfirstandandi tímabil enn. Vistaðu leiki á Single Match Analysis → KKÍ.is (Vista leik), þá birtast þeir hér.")}
        </div>
      )}

      {/* LEADERBOARD */}
      {state === "ready" && view === "board" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-bold text-slate-900">{is ? metric.is : metric.en} <span className="text-[12px] font-medium text-slate-400">· {mode === "perGame" ? t("per game", "á leik") : mode === "total" ? t("total", "samtals") : t("per 36 min", "á 36 mín")}</span></h3>
            <span className="text-[11px] text-slate-400">{t(`${board.length} players`, `${board.length} leikmenn`)}</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {board.map((r, i) => (
              <div key={r.p.key} className="flex items-center gap-3">
                <span className="w-5 text-right text-[12px] font-semibold tabular-nums text-slate-400">{i + 1}</span>
                <span className="w-44 shrink-0 truncate text-[13px] font-semibold text-slate-800" title={r.p.name}>{r.p.name}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className="absolute inset-y-0 left-0 rounded bg-[#2740e6]/85" style={{ width: `${boardMax > 0 ? Math.max(3, (Math.abs(r.v) / boardMax) * 100) : 0}%` }} />
                </div>
                <span className="w-16 text-right text-[13px] font-bold tabular-nums text-slate-900">{fmt(r.v, metric.kind)}</span>
                <span className="w-10 text-right text-[11px] tabular-nums text-slate-400">{r.p.gp}{t("g", "l")}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">{t("Descriptive box-score leaders from KKÍ — never a readiness score. Shooting % uses made/attempted over the whole window.", "Lýsandi box-score leiðtogar frá KKÍ — aldrei readiness-stig. Skotprósentur reiknast af skoti/tilraunum yfir allan gluggann.")}</p>
        </div>
      )}

      {/* FULL TABLE */}
      {state === "ready" && view === "table" && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[9px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 font-medium">{t("Player", "Leikmaður")}</th>
                <th className="px-1.5 py-2 text-right font-medium">{t("G", "L")}</th>
                {METRICS.map((m) => (
                  <th key={m.key} className="px-1.5 py-2 text-right font-medium">
                    <button type="button" onClick={() => setSort((s) => ({ key: m.key, dir: s.key === m.key && s.dir === "desc" ? "asc" : "desc" }))}
                      className={`hover:text-slate-700 ${sort.key === m.key ? "text-slate-900" : ""}`} title={is ? m.is : m.en}>
                      {is ? m.is : m.en}{sort.key === m.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr key={p.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 font-semibold text-slate-800">{p.name}</td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-500">{p.gp}</td>
                  {METRICS.map((m) => {
                    const v = metricValue(p, m, mode);
                    return <td key={m.key} className={`px-1.5 py-1.5 text-right tabular-nums ${sort.key === m.key ? "font-bold text-slate-900" : "text-slate-700"}`}>{fmt(v, m.kind)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-slate-400">{t("Counting stats shown in the chosen mode (per game / total / per 36); shooting % is made/attempted over the window. Descriptive — never the readiness colour.", "Talningar birtast í völdum ham (á leik / samtals / á 36); skotprósenta er skot/tilraunir yfir gluggann. Lýsandi — aldrei readiness-liturinn.")}</p>
        </div>
      )}
    </div>
  );
}
