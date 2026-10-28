"use client";

/**
 * BasketballMatchHub — the UNIFIED basketball single-match view. One shared list of the team's games this
 * season (from every source, matched by date+opponent), each badged with the data layers it has
 * (Box / Shot chart / Advanced). Selecting a game shows a MERGED detail: box for both teams, Four Factors
 * (InStat if imported, else computed from the box), leaders, and a shot chart when coords exist. Adding the
 * same game from another source (KKÍ link, InStat upload) adds its layer. The rich per-source FIBA tools
 * (interactive shot charts, run trends) stay available in a drawer. Descriptive — never the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import KkiMatchView from "@/components/coach/KkiMatchView";
import InstatBasketballUpload from "@/components/coach/InstatBasketballUpload";
import FibaShotCharts from "@/components/coach/FibaShotCharts";
import BasketballSingleMatchAnalysis from "@/components/coach/BasketballSingleMatchAnalysis";
import { groupStats, labelFor } from "@/lib/micropulse/basketballStats/instatStatGroups";

type Layers = { box: boolean; shots: boolean; instat: boolean };
type ListGame = { key: string; date: string | null; opponent: string; own: string; ownPts: number; oppPts: number; competition: string | null; layers: Layers };
type BoxP = { name: string; min: string | null; pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; pm: number | null };
type FF = { efg: number | null; tovPct: number | null; orebPct: number | null; ftRate: number | null; tp3: number | null };
type Leader = { labelEn: string; labelIs: string; name: string; team: string; value: number };
type Shot = { x: number | null; y: number | null; made: boolean; isThree: boolean };
type PlayerStat = { name: string; stats: Record<string, unknown> };
type Detail = {
  ok: boolean; key: string; date: string | null; ownName: string; oppName: string; ownPts: number; oppPts: number; competition: string | null;
  own: { box: BoxP[]; totals: Record<string, number> }; opp: { box: BoxP[]; totals: Record<string, number> };
  fourFactors: { own: FF; opp: FF; source: "instat" | "computed" } | null; shots: Shot[] | null; leaders: Leader[]; layers: Layers; sources: string[];
  allStats?: { own: PlayerStat[]; opp: PlayerStat[] } | null; error?: string;
};

/** Per-player drawer surfacing every stored InStat variable, grouped (behind a toggle). */
function AllStatsSection({ allStats, ownName, oppName, is }: { allStats: { own: PlayerStat[]; opp: PlayerStat[] }; ownName: string; oppName: string; is: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState<string | null>(null);
  const players = [...allStats.own.map((p) => ({ ...p, team: ownName })), ...allStats.opp.map((p) => ({ ...p, team: oppName }))];
  if (!players.length) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-[13px] font-bold text-slate-900">
        <span>{open ? "▾" : "▸"}</span>{is ? "Sýna allar breytur (InStat)" : "Show all stats (InStat)"}
        <span className="text-[11px] font-medium text-slate-400">· {players.length} {is ? "leikmenn" : "players"} · {is ? "allar ~128 breytur" : "all ~128 variables"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {players.map((p) => {
            const key = `${p.team}|${p.name}`;
            const isSel = sel === key;
            const groups = isSel ? groupStats(p.stats) : [];
            return (
              <div key={key} className="rounded-lg border border-slate-100">
                <button type="button" onClick={() => setSel(isSel ? null : key)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-[13px]">
                  <span className="font-semibold text-slate-800">{p.name} <span className="font-normal text-slate-400">· {p.team}</span></span>
                  <span className="text-slate-400">{isSel ? "▾" : "▸"}</span>
                </button>
                {isSel && (
                  <div className="space-y-2.5 border-t border-slate-100 px-2.5 py-2">
                    {groups.map((g) => (
                      <div key={g.group}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[#2740e6]">{is ? g.title.is : g.title.en}</div>
                        <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                          {g.rows.map((r) => (
                            <div key={r.key} className="flex items-baseline justify-between gap-2 border-b border-slate-50 py-0.5 text-[11.5px]">
                              <span className="truncate text-slate-500">{labelFor(r.key, is ? "IS" : "EN")}</span>
                              <span className="shrink-0 tabular-nums font-semibold text-slate-800">{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const compLabel = (c: string | null): string => {
  switch ((c ?? "").toLowerCase()) {
    case "urvalsdeild-kvenna": case "urvalsdeild-karla": return "Úrvalsdeild";
    case "bonus-deild-karla": case "bonus-deild-kvenna": return "Bónus deild";
    case "1deild-kvenna": case "1deild-karla": return "1. deild";
    default: return c ?? "";
  }
};
const fr = (m: number, a: number) => `${m}-${a}${a > 0 ? ` · ${Math.round((m / a) * 100)}%` : ""}`;
const fmtDate = (iso: string | null, is: boolean) => { if (!iso) return ""; try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };

/** Compact half-court shot chart. FIBA coords are 0-100 over the full court; fold every shot to one end. */
function ShotChart({ shots, is }: { shots: Shot[]; is: boolean }) {
  const W = 150, H = 140;
  const pts = shots.filter((s) => s.x != null && s.y != null).map((s) => {
    let x = s.x as number, y = s.y as number;
    if (x > 50) { x = 100 - x; y = 100 - y; } // fold to the left basket
    return { cx: (x / 50) * W, cy: (y / 100) * H, made: s.made };
  });
  const made = shots.filter((s) => s.made).length;
  return (
    <div>
      <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="w-full max-w-[380px] rounded-lg border border-slate-200 bg-[#f6efe2]">
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="#c9b48a" strokeWidth={1} />
        <circle cx={6} cy={H / 2} r={3} fill="none" stroke="#c9b48a" />
        {pts.map((p, i) => p.made
          ? <circle key={i} cx={p.cx} cy={p.cy} r={2.6} fill="#1c7a4a" fillOpacity={0.8} />
          : <path key={i} d={`M ${p.cx - 2.3} ${p.cy - 2.3} L ${p.cx + 2.3} ${p.cy + 2.3} M ${p.cx + 2.3} ${p.cy - 2.3} L ${p.cx - 2.3} ${p.cy + 2.3}`} stroke="#a83e28" strokeWidth={1.1} />)}
      </svg>
      <p className="mt-1 text-[11px] text-slate-400">{is ? `${made}/${shots.length} skot hittu · grænt = hitt, rautt = brennt` : `${made}/${shots.length} shots made · green = make, red = miss`}</p>
    </div>
  );
}

export default function BasketballMatchHub() {
  const [lang] = useLang();
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const tok = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const [list, setList] = React.useState<ListGame[]>([]);
  const [season, setSeason] = React.useState<string | null>(null);
  const [listState, setListState] = React.useState<"loading" | "ready" | "empty" | "error">("loading");
  const [selKey, setSelKey] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [advOpen, setAdvOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [gameAi, setGameAi] = React.useState<string | null>(null);
  const [gameAiBusy, setGameAiBusy] = React.useState(false);

  async function fetchGameAi(dt: Detail) {
    setGameAiBusy(true);
    try {
      const token = await tok(); if (!token) return;
      // Compact per-player line so the model can read who did well / struggled without noise.
      const line = (p: BoxP) => ({
        name: p.name, min: p.min, pts: p.pts, reb: p.reb, oreb: p.oreb, dreb: p.dreb, ast: p.ast,
        stl: p.stl, blk: p.blk, tov: p.tov, fg: `${p.fgm}/${p.fga}`, tp: `${p.tpm}/${p.tpa}`, ft: `${p.ftm}/${p.fta}`, pm: p.pm,
      });
      const facts = {
        own: dt.ownName, opp: dt.oppName, score: `${dt.ownPts}-${dt.oppPts}`, date: dt.date, competition: dt.competition,
        fourFactors: dt.fourFactors, leaders: dt.leaders,
        ownTotals: dt.own.totals, oppTotals: dt.opp.totals,
        ownPlayers: dt.own.box.map(line), oppPlayers: dt.opp.box.map(line),
      };
      const res = await fetch("/api/coach/basketball-game-summary", { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ facts, lang }) });
      const j = await res.json();
      if (j.ok && j.summary) setGameAi(j.summary);
    } finally { setGameAiBusy(false); }
  }

  const loadList = React.useCallback(async () => {
    setListState("loading"); setErr(null);
    try {
      const token = await tok(); if (!token) { setErr(t("Not signed in.", "Ekki innskráð(ur).")); setListState("error"); return; }
      const res = await fetch("/api/coach/basketball-games?list=1", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; season?: string | null; games?: ListGame[]; error?: string };
      if (!res.ok || !j.ok) { setErr(j.error ?? t("Load failed.", "Hleðsla mistókst.")); setListState("error"); return; }
      setList(j.games ?? []); setSeason(j.season ?? null); setListState((j.games ?? []).length ? "ready" : "empty");
    } catch (e) { setErr(e instanceof Error ? e.message : t("Network error", "Netvilla")); setListState("error"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tok, is]);
  React.useEffect(() => { void loadList(); }, [loadList]);

  const openGame = React.useCallback(async (key: string) => {
    setSelKey(key); setDetail(null); setDetailBusy(true); setGameAi(null);
    try {
      const token = await tok(); if (!token) return;
      const res = await fetch(`/api/coach/basketball-games?key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const j = (await res.json()) as Detail;
      if (res.ok && j.ok) setDetail(j);
    } catch { /* ignore */ } finally { setDetailBusy(false); }
  }, [tok]);

  const Badge = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${on ? "bg-[#2740e6]/10 text-[#2740e6]" : "bg-slate-100 text-slate-300"}`}>{children}</span>
  );

  const BoxTable = ({ name, box }: { name: string; box: BoxP[] }) => (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="text-[13px] font-bold text-slate-900">{name}</h4>
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[9px] uppercase tracking-wide text-slate-400">
            <th className="py-1 pr-2 font-medium">{t("Player", "Leikmaður")}</th>
            <th className="px-1 py-1 text-right font-medium">{t("Min", "Mín")}</th><th className="px-1 py-1 text-right font-medium">{t("Pts", "Stig")}</th>
            <th className="px-1 py-1 text-right font-medium">FG</th><th className="px-1 py-1 text-right font-medium">3P</th><th className="px-1 py-1 text-right font-medium">FT</th>
            <th className="px-1 py-1 text-right font-medium">{t("Reb", "Frák")}</th><th className="px-1 py-1 text-right font-medium">{t("Ast", "Stoð")}</th>
          </tr></thead>
          <tbody>
            {box.map((p) => (
              <tr key={p.name} className="border-t border-slate-100">
                <td className="py-1 pr-2 font-medium text-slate-800">{p.name}</td>
                <td className="px-1 py-1 text-right tabular-nums text-slate-500">{p.min ?? "–"}</td>
                <td className="px-1 py-1 text-right tabular-nums font-semibold">{p.pts}</td>
                <td className="px-1 py-1 text-right tabular-nums text-slate-600">{fr(p.fgm, p.fga)}</td>
                <td className="px-1 py-1 text-right tabular-nums text-slate-600">{fr(p.tpm, p.tpa)}</td>
                <td className="px-1 py-1 text-right tabular-nums text-slate-600">{fr(p.ftm, p.fta)}</td>
                <td className="px-1 py-1 text-right tabular-nums">{p.reb}</td>
                <td className="px-1 py-1 text-right tabular-nums">{p.ast}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {/* UNIFIED GAME LIST */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[15px] font-bold text-slate-900">{t("Your games", "Leikirnir þínir")}{season ? <span className="ml-1.5 text-[12px] font-medium text-slate-400">· {season}</span> : null}</h3>
          <span className="text-[11px] text-slate-400">{t("every source · one game per row", "allar heimildir · einn leikur í röð")}</span>
        </div>
        {listState === "loading" && <p className="mt-3 text-[13px] text-slate-500">{t("Loading…", "Hleð…")}</p>}
        {listState === "error" && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
        {listState === "empty" && <p className="mt-3 text-[13px] text-slate-600">{t("No games this season yet. Add one below (KKÍ.is link or InStat upload).", "Engir leikir á tímabilinu enn. Bættu við hér fyrir neðan (KKÍ.is hlekkur eða InStat upphleðsla).")}</p>}
        {listState === "ready" && (
          <div className="mt-2 max-h-[280px] space-y-1 overflow-y-auto pr-1">
            {list.map((g) => (
              <button key={g.key} type="button" onClick={() => void openGame(g.key)}
                className={`flex w-full items-center gap-x-2.5 rounded-lg border px-2.5 py-1.5 text-left transition ${selKey === g.key ? "border-[#2740e6] bg-[#2740e6]/5" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <span className="w-[52px] shrink-0 text-[12px] font-bold tabular-nums text-slate-900">{g.ownPts || g.oppPts ? `${g.ownPts}–${g.oppPts}` : "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-700">{t("vs", "gegn")} {g.opponent} <span className="font-normal text-slate-400">{fmtDate(g.date, is)}</span></span>
                <span className="flex shrink-0 items-center gap-1">
                  {g.competition ? <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline">{compLabel(g.competition)}</span> : null}
                  <Badge on={g.layers.box}>{t("Box", "Box")}</Badge>
                  <Badge on={g.layers.shots}>{t("Shots", "Skot")}</Badge>
                  <Badge on={g.layers.instat}>{t("Adv", "Ítarl")}</Badge>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MERGED DETAIL */}
      {selKey && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {detailBusy && <p className="text-[13px] text-slate-500">{t("Loading game…", "Hleð leik…")}</p>}
          {!detailBusy && detail && detail.ok && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[18px] font-bold tabular-nums text-slate-900">{detail.ownPts}<span className="text-slate-400">–</span>{detail.oppPts}</span>
                <span className="text-[14px] font-semibold text-slate-700">{detail.ownName} {t("vs", "gegn")} {detail.oppName}</span>
                <span className="text-[12px] text-slate-400">{fmtDate(detail.date, is)}{detail.competition ? ` · ${compLabel(detail.competition)}` : ""}</span>
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {detail.sources.map((s) => <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{s}</span>)}
                  {!gameAi ? <button type="button" onClick={() => detail && void fetchGameAi(detail)} disabled={gameAiBusy} className="rounded-lg border border-[#2740e6] px-2 py-0.5 text-[11px] font-semibold text-[#2740e6] hover:bg-[#eef0fb] disabled:opacity-50">{gameAiBusy ? (is ? "AI skrifar…" : "AI writing…") : (is ? "✨ AI-greining" : "✨ AI analysis")}</button> : null}
                </span>
              </div>

              {/* AI GAME SUMMARY — labelled; a detailed what-went-well / what-to-improve read of the box */}
              {gameAi ? (
                <div className="rounded-xl border border-[#c4cbf5] bg-[#f6f7fe] p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">AI</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{t("reads the box — decides nothing", "les boxið — ákveður ekkert")}</span>
                    <button type="button" onClick={() => detail && void fetchGameAi(detail)} disabled={gameAiBusy} className="ml-auto rounded-lg border border-[#2740e6] px-2 py-0.5 text-[10px] font-semibold text-[#2740e6] hover:bg-[#eef0fb] disabled:opacity-50">{gameAiBusy ? (is ? "AI skrifar…" : "AI writing…") : (is ? "↻ Uppfæra" : "↻ Regenerate")}</button>
                  </div>
                  <div className="space-y-2">
                    {gameAi.split(/\n{2,}/).map((para, i) => (
                      <p key={i} className="text-[13px] leading-relaxed text-slate-700">
                        {para.split(/\*\*(.+?)\*\*/).map((seg, j) => (j % 2 === 1 ? <strong key={j} className="font-semibold text-slate-900">{seg}</strong> : seg))}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* FOUR FACTORS */}
              {detail.fourFactors && (
                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <h4 className="text-[13px] font-bold text-slate-900">{t("Four Factors", "Fjórir þættir")} <span className="text-[10px] font-medium text-slate-400">· {detail.fourFactors.source === "instat" ? "InStat" : t("computed from the box", "reiknað úr box")}</span></h4>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="py-1 pr-2 font-medium">{t("Factor", "Þáttur")}</th><th className="py-1 px-2 text-right font-medium">{detail.ownName}</th><th className="py-1 px-2 text-right font-medium">{detail.oppName}</th>
                      </tr></thead>
                      <tbody>
                        {([["efg", "eFG%", true], ["tp3", "3P%", true], ["tovPct", t("Turnover %", "Tapaðir %"), false], ["orebPct", t("Off. reb %", "Sóknarfrák. %"), true], ["ftRate", "FT rate", true]] as const).map(([k, label, hib]) => {
                          const o = detail.fourFactors!.own[k], p = detail.fourFactors!.opp[k];
                          if (o == null && p == null) return null;
                          const best = hib ? Math.max(o ?? -1, p ?? -1) : Math.min(o ?? 1e9, p ?? 1e9);
                          return (
                            <tr key={k} className="border-t border-slate-100">
                              <td className="py-1.5 pr-2 text-slate-600">{label}</td>
                              <td className={`py-1.5 px-2 text-right tabular-nums ${o === best ? "font-bold text-[#1c7a4a]" : "text-slate-800"}`}>{o == null ? "–" : `${o}%`}</td>
                              <td className={`py-1.5 px-2 text-right tabular-nums ${p === best ? "font-bold text-[#1c7a4a]" : "text-slate-800"}`}>{p == null ? "–" : `${p}%`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* LEADERS */}
              {detail.leaders.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {detail.leaders.map((l) => (
                    <span key={l.labelEn} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px]"><span className="text-slate-400">{is ? l.labelIs : l.labelEn}: </span><b className="tabular-nums">{l.value}</b> {l.name}</span>
                  ))}
                </div>
              )}

              {/* SHOT CHART (when coords exist) */}
              {detail.shots && detail.shots.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white p-3">
                  <h4 className="text-[13px] font-bold text-slate-900">{t("Shot chart", "Skotakort")} <span className="text-[10px] font-medium text-slate-400">· {detail.ownName}</span></h4>
                  <div className="mt-2"><ShotChart shots={detail.shots} is={is} /></div>
                </section>
              )}

              {/* BOX — both teams */}
              <div className="grid gap-3 md:grid-cols-2">
                <BoxTable name={detail.ownName} box={detail.own.box} />
                <BoxTable name={detail.oppName} box={detail.opp.box} />
              </div>

              {/* ALL INSTAT VARIABLES — grouped, per player, behind a toggle */}
              {detail.allStats && (detail.allStats.own.length || detail.allStats.opp.length) ? (
                <AllStatsSection allStats={detail.allStats} ownName={detail.ownName} oppName={detail.oppName} is={is} />
              ) : null}
            </div>
          )}
          {!detailBusy && (!detail || !detail.ok) && <p className="text-[13px] text-slate-500">{detail?.error ?? t("Could not open the game.", "Gat ekki opnað leikinn.")}</p>}
        </div>
      )}

      {/* ADD / UPDATE A GAME — adds a layer from any source */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <button type="button" onClick={() => setAddOpen((v) => !v)} className="text-[13px] font-semibold text-slate-800">
          {addOpen ? "▾" : "▸"} {t("Add / update a game", "Bæta við / uppfæra leik")}
        </button>
        {addOpen && (
          <div className="mt-3 space-y-4">
            <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Paste a KKÍ.is game link", "Límdu KKÍ.is leikhlekk")}</div><KkiMatchView /></div>
            <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Or upload this game from InStat (per-player box or Game Report PDF)", "Eða hlaðið þessum leik upp úr InStat (per-leikmann box eða leikskýrsla PDF)")}</div><InstatBasketballUpload surface="single" onImported={() => void loadList()} /></div>
          </div>
        )}
      </div>

      {/* ADVANCED — the rich per-source FIBA tools (interactive shot charts, run trends) for deeper reads */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <button type="button" onClick={() => setAdvOpen((v) => !v)} className="text-[13px] font-semibold text-slate-800">
          {advOpen ? "▾" : "▸"} {t("Advanced: KKÍ shot charts & deep stats", "Ítarlegt: KKÍ skotakort & ítarleg tölfræði")}
        </button>
        {advOpen && <div className="mt-3 space-y-4"><FibaShotCharts focus="own" /><BasketballSingleMatchAnalysis /></div>}
      </div>
    </div>
  );
}
