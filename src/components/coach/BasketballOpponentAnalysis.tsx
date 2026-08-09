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

type Lang = "EN" | "IS";
type Strings = (typeof T)["EN"] | (typeof T)["IS"];
type OppItem = { name: string; scouted: boolean; games: number | null; syncedAt: string | null };

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
    perfNote: "Descriptive scouting from the opponent's public KKÍ box scores — never a readiness or medical judgement.",
    err: "Couldn't pull that opponent from KKÍ. Check the team name matches KKÍ exactly, or try again.",
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
    perfNote: "Lýsandi skönnun úr opinberum KKÍ leikskýrslum andstæðingsins — aldrei readiness- eða læknismat.",
    err: "Náði ekki í andstæðinginn úr KKÍ. Athugaðu að liðsnafnið passi nákvæmlega við KKÍ, eða reyndu aftur.",
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

function PlayerCard({ p, t }: { p: OppPlayer; t: Strings }) {
  return (
    <div className="rounded-xl border border-[#eceae2] bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-900">{p.name}</span>
        <span className="font-[Archivo,sans-serif] text-lg font-bold tabular-nums text-[#a83e28]">{d1(p.ppg)}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500">
        {p.games} {t.games} · {t.reb} {d1(p.rpg)} · {t.ast} {d1(p.apg)} · {t.tp} {pctS(p.tpPct)} ({d1(p.tpaPg)}/g)
      </div>
      {p.tags.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {p.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#f3eefa] px-2 py-0.5 text-[10px] font-semibold text-[#7a5cc4]">{t.tags[tag] ?? tag}</span>
          ))}
        </div>
      ) : null}
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
  const [scouted, setScouted] = React.useState<boolean>(false);
  const [busy, setBusy] = React.useState(false);
  const [pulling, setPulling] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

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
      const res = await fetch(`/api/coach/basketball-opponent-scout?opponent=${encodeURIComponent(opponent)}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json();
      if (j.ok) { setScouted(!!j.scouted); setReport(j.report ?? null); }
    } finally { setBusy(false); }
  }, [token]);

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

  if (items && items.length === 0) return <p className="text-[13px] text-slate-500">{t.none}</p>;

  const team = report?.team;

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
      </div>

      {err ? <p className="text-[13px] font-medium text-red-700">{err}</p> : null}
      {busy && !report ? <p className="text-sm text-slate-400">…</p> : null}
      {!busy && !scouted && !report ? <p className="text-[13px] text-amber-700">{t.notScouted}</p> : null}

      {report && team ? (
        <div className="space-y-3">
          {/* Layer 0 + 1 — profile line + stat grid */}
          <div className="rounded-xl border border-[#e3e1d9] bg-white p-4">
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
                {report.keyPlayers.map((p) => <PlayerCard key={p.ref} p={p} t={t} />)}
              </div>
            </div>
          ) : null}

          {/* Full roster (details) */}
          <div>
            <button onClick={() => setShowAll((v) => !v)} className="text-[12px] font-semibold text-[#2740e6] hover:underline">
              {showAll ? t.hideAll : t.showAll}
            </button>
            {showAll ? (
              <div className="mt-2 overflow-x-auto rounded-xl border border-[#eceae2] p-2">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-3 font-semibold">{t.pick}</th>
                      <th className="py-1 pr-3 text-right font-semibold">{t.games}</th>
                      <th className="py-1 pr-3 text-right font-semibold">{t.mpg}</th>
                      <th className="py-1 pr-3 text-right font-semibold">{t.ppg}</th>
                      <th className="py-1 pr-3 text-right font-semibold">{t.reb}</th>
                      <th className="py-1 pr-3 text-right font-semibold">{t.ast}</th>
                      <th className="py-1 pr-3 text-right font-semibold">{t.fg}</th>
                      <th className="py-1 pr-3 text-right font-semibold">{t.tp}</th>
                      <th className="py-1 pr-1 text-left font-semibold">{t.threat}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.players.map((p) => (
                      <tr key={p.ref} className="border-t border-[#eceae2]">
                        <td className="py-1 pr-3 font-medium text-slate-800">{p.name}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{p.games}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{d1(p.mpg)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums font-semibold">{d1(p.ppg)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{d1(p.rpg)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{d1(p.apg)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{pctS(p.fgPct)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{pctS(p.tpPct)}</td>
                        <td className="py-1 pr-1 text-slate-500">{p.tags.map((tag) => t.tags[tag] ?? tag).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <p className="text-[11px] text-slate-400">{t.perfNote}</p>
        </div>
      ) : null}
    </div>
  );
}
