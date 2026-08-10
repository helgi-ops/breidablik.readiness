"use client";

/**
 * /coach/player-analysis — own-squad player read from StatsBomb per-90 stats.
 * Pick a player → role + AI summary (labelled) + strengths/weaknesses + percentile
 * bars vs the squad, grouped attacking / possession / defending. Descriptive only.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import StatsbombPlayerUploads from "@/components/coach/StatsbombPlayerUploads";
import SmartStatsImport from "@/components/coach/SmartStatsImport";
import { downloadPlayerRoleReportPdf } from "@/components/coach/PlayerStatsPdf";

type Lang = "EN" | "IS";
type Category = "attacking" | "possession" | "defending";
type MetricRow = { key: string; label: string; category: Category; value: number | null; percentile: number | null };
type Analysis = {
  player: string; minutes: number | null; goals: number | null; assists: number | null; poolSize: number;
  metrics: MetricRow[]; strengths: MetricRow[]; weaknesses: MetricRow[];
  byCategory: { attacking: number | null; possession: number | null; defending: number | null }; role: Category | null;
  goalkeeper: boolean;
};
type Prose = { summary?: string; strengths?: string; development?: string } | null;
type GkAnalysis = {
  player: string;
  analysis: {
    matches: number; minutes: number;
    shotStopping: { shotsFaced: number; saves: number; savePct: number | null; psxgFaced: number; goalsConceded: number; gsaa: number; perMatchGsaa: number | null };
    distribution: { passes: number; passCompletionPct: number | null; passesToFinalThird: number; avgPassLength: number | null; longGoalKicks: number; shortGoalKicks: number; longBallPct: number | null };
  };
  prose: { summary?: string; shotStopping?: string; distribution?: string } | null;
};

const T = {
  EN: {
    title: "Player Season Analysis", purpose: "Read one of your own players from their StatsBomb per-90 season stats — role, strengths and development areas, ranked as percentiles vs your squad. Descriptive context; it never changes the readiness verdict.",
    pick: "Player", minutes: "min", role: "Role", of: "vs squad", pool: "players",
    roles: { attacking: "Attacking", possession: "Ball progression", defending: "Defending" } as Record<string, string>,
    aiTag: "AI · written from the numbers, decides nothing", summary: "Summary", strengths: "Strengths", development: "Development areas",
    cats: { attacking: "Attacking", possession: "Possession & progression", defending: "Defending" } as Record<string, string>,
    pctile: "percentile vs squad", none: "No StatsBomb squad imported yet — import the StatsBomb Squad CSV on Player Season Analysis.", lowMin: "Low minutes — read as a small sample.",
    notSignedIn: "Not signed in.", gkTag: "GK",
    gkNote: "Goalkeeper — the outfield per-90 metrics don't describe a keeper. Import his StatsBomb player Match Stats CSV on Player Season Analysis to see his shot-stopping and distribution here.",
    gkShotStopping: "Shot-stopping", gkDistribution: "Distribution",
    gkStats: { matches: "Matches", gsaa: "Goals prevented (GSAA)", savePct: "Save %", psxg: "Post-shot xG faced", conceded: "Goals conceded", shots: "Shots faced", passPct: "Pass completion", f3: "Passes to final third", longPct: "Goal kicks long", passLen: "Avg pass length" } as Record<string, string>,
    gkFoot: "Goalkeeper season read from his StatsBomb per-match stats. GSAA > 0 = saved more than an average keeper. Descriptive — never touches readiness.",
  },
  IS: {
    title: "Leikmanna-tímabilsgreining", purpose: "Lestu einn af þínum leikmönnum úr StatsBomb per-90 tímabils-tölum — hlutverk, styrkleikar og þróunar-svæði, raðað sem percentíl vs liðið þitt. Lýsandi samhengi; breytir aldrei readiness-dómnum.",
    pick: "Leikmaður", minutes: "mín", role: "Hlutverk", of: "vs lið", pool: "leikmenn",
    roles: { attacking: "Sókn", possession: "Boltaframrás", defending: "Vörn" } as Record<string, string>,
    aiTag: "AI · skrifað úr tölunum, ákveður ekkert", summary: "Samantekt", strengths: "Styrkleikar", development: "Þróunar-svæði",
    cats: { attacking: "Sókn", possession: "Boltahald & framrás", defending: "Vörn" } as Record<string, string>,
    pctile: "percentíl vs lið", none: "Enginn StatsBomb squad fluttur inn — flyttu StatsBomb Squad CSV á Leikmanna-tímabilsgreiningu.", lowMin: "Fáar mínútur — lítið úrtak.",
    notSignedIn: "Ekki innskráð(ur).", gkTag: "MV",
    gkNote: "Markmaður — útspila-mælarnir lýsa ekki markmanni. Flyttu inn StatsBomb leikmanns-leikjaskrá hans á Leikmanna-tímabilsgreiningu til að sjá markvörslu og útspil hér.",
    gkShotStopping: "Markvarsla", gkDistribution: "Útspil",
    gkStats: { matches: "Leikir", gsaa: "Mörk varin (GSAA)", savePct: "Vörsluhlutfall %", psxg: "Post-shot xG á markið", conceded: "Mörk á sig", shots: "Skot á markið", passPct: "Sendinga-nákvæmni", f3: "Sendingar á lokaþriðjung", longPct: "Útspörk langt", passLen: "Meðal sendingalengd" } as Record<string, string>,
    gkFoot: "Markmanns-lestur úr StatsBomb per-leik tölum. GSAA > 0 = varði meira en meðal-markmaður. Lýsandi — snertir ekki readiness.",
  },
} as const;

const fmtV = (v: number | null): string => (v == null ? "—" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));
const barColor = (p: number | null): string => (p == null ? "#c7cdd6" : p >= 75 ? "#1c7a4a" : p <= 25 ? "#a83e28" : "#2740e6");

export default function PlayerAnalysisStatsbombView() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [players, setPlayers] = React.useState<Array<{ name: string; minutes: number | null; isGoalkeeper?: boolean }>>([]);
  const [sel, setSel] = React.useState<string>("");
  const [a, setA] = React.useState<Analysis | null>(null);
  const [prose, setProse] = React.useState<Prose>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [gk, setGk] = React.useState<GkAnalysis | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  React.useEffect(() => {
    (async () => {
      const tok = await token(); if (!tok) return;
      const res = await fetch("/api/coach/player-analysis", { headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json();
      if (j.ok) { setPlayers(j.players ?? []); if (j.players?.[0]) setSel(j.players[0].name); }
    })();
  }, [token]);

  React.useEffect(() => {
    if (!sel) return;
    (async () => {
      setBusy(true); setErr(null); setProse(null); setGk(null);
      try {
        const tok = await token(); if (!tok) { setErr(t.notSignedIn); return; }
        const res = await fetch("/api/coach/player-analysis", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ player: sel, prose: true, lang }) });
        const j = await res.json();
        if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); setA(null); return; }
        setA(j.analysis); setProse(j.prose ?? null);
        // Goalkeeper → fetch his GK-specific season read from per-match data (if any).
        if (j.analysis?.goalkeeper) {
          const gres = await fetch("/api/coach/goalkeeper-analysis", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ name: sel, prose: true, lang }) });
          const gj = await gres.json();
          if (gres.ok && gj.ok) setGk(gj);
        }
      } finally { setBusy(false); }
    })();
  }, [sel, lang, token, t.notSignedIn]);

  const cats: Category[] = ["attacking", "possession", "defending"];

  return (
    <div className="space-y-4">
      <PagePurpose en={T.EN.purpose} is={T.IS.purpose} />
      <SmartStatsImport onImported={() => window.location.reload()} />
      <StatsbombPlayerUploads />

      {players.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t.none}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.pick}</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
            {players.map((p, i) => <option key={`${p.name}-${i}`} value={p.name}>{p.name}{p.isGoalkeeper ? ` · ${t.gkTag}` : ""}{p.minutes != null ? ` · ${Math.round(p.minutes)} ${t.minutes}` : ""}</option>)}
          </select>
        </div>
      )}

      {busy ? <p className="text-sm text-slate-400">…</p> : null}
      {err ? <p className="text-[13px] font-medium text-red-700">{err}</p> : null}

      {a && !busy ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">{a.player}</h2>
            {a.goalkeeper ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{t.gkTag}</span> : null}
            {a.role ? <span className="rounded-full bg-[#eef0fb] px-2 py-0.5 text-[11px] font-semibold text-[#2740e6]">{t.role}: {t.roles[a.role]}</span> : null}
            <span className="text-[12px] text-slate-500">{a.minutes != null ? `${Math.round(a.minutes)} ${t.minutes}` : ""}{a.goalkeeper ? "" : ` · ${a.poolSize} ${t.pool} ${t.of}`}</span>
            {!a.goalkeeper && (a.minutes ?? 0) < 450 ? <span className="text-[11px] text-amber-700">⚠ {t.lowMin}</span> : null}
            <button
              onClick={() => downloadPlayerRoleReportPdf({
                playerName: a.player, role: a.role ? t.roles[a.role] : null, minutes: a.minutes, poolSize: a.poolSize, goalkeeper: a.goalkeeper,
                aiGenerated: !!prose, prose,
                strengths: a.strengths.map((m) => ({ label: m.label, percentile: m.percentile })),
                weaknesses: a.weaknesses.map((m) => ({ label: m.label, percentile: m.percentile })),
                metrics: a.metrics.map((m) => ({ label: m.label, category: t.cats[m.category] ?? m.category, value: m.value, percentile: m.percentile })),
                gkNote: a.goalkeeper ? t.gkNote : null,
              }, lang)}
              className="ml-auto rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#eef0fb]">
              ↓ {lang === "IS" ? "Sækja PDF" : "Download PDF"}
            </button>
          </div>

          {a.goalkeeper ? (
            gk && gk.analysis.matches > 0 ? (
              <div className="space-y-3">
                {gk.prose ? (
                  <div className="rounded-2xl border border-[#2740e6]/20 bg-[#eef0fb] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{t.aiTag}</div>
                    {gk.prose.summary ? <p className="mt-1 text-[14px] font-semibold text-slate-900">{gk.prose.summary}</p> : null}
                    {gk.prose.shotStopping ? <p className="mt-2 text-[13px] text-slate-700"><span className="font-semibold">{t.gkShotStopping}. </span>{gk.prose.shotStopping}</p> : null}
                    {gk.prose.distribution ? <p className="mt-1 text-[13px] text-slate-700"><span className="font-semibold">{t.gkDistribution}. </span>{gk.prose.distribution}</p> : null}
                  </div>
                ) : null}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-800">{t.gkShotStopping}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      [t.gkStats.gsaa, (gk.analysis.shotStopping.gsaa >= 0 ? "+" : "") + gk.analysis.shotStopping.gsaa.toFixed(2), gk.analysis.shotStopping.gsaa >= 0 ? "#1c7a4a" : "#a83e28"],
                      [t.gkStats.savePct, gk.analysis.shotStopping.savePct != null ? `${gk.analysis.shotStopping.savePct}%` : "—", "#14181c"],
                      [t.gkStats.psxg, gk.analysis.shotStopping.psxgFaced.toFixed(2), "#14181c"],
                      [t.gkStats.conceded, String(gk.analysis.shotStopping.goalsConceded), "#14181c"],
                      [t.gkStats.shots, String(gk.analysis.shotStopping.shotsFaced), "#14181c"],
                      [t.gkStats.matches, `${gk.analysis.matches} · ${gk.analysis.minutes} ${t.minutes}`, "#5c6570"],
                    ].map(([k, v, c]) => (
                      <div key={k} className="rounded-lg bg-slate-50 px-2.5 py-1.5"><div className="text-[10px] uppercase tracking-wide text-slate-400">{k}</div><div className="text-[15px] font-bold tabular-nums" style={{ color: c }}>{v}</div></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-800">{t.gkDistribution}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [t.gkStats.passPct, gk.analysis.distribution.passCompletionPct != null ? `${gk.analysis.distribution.passCompletionPct}%` : "—"],
                      [t.gkStats.longPct, gk.analysis.distribution.longBallPct != null ? `${gk.analysis.distribution.longBallPct}%` : "—"],
                      [t.gkStats.f3, String(gk.analysis.distribution.passesToFinalThird)],
                      [t.gkStats.passLen, gk.analysis.distribution.avgPassLength != null ? `${gk.analysis.distribution.avgPassLength}m` : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-slate-50 px-2.5 py-1.5"><div className="text-[10px] uppercase tracking-wide text-slate-400">{k}</div><div className="text-[15px] font-bold tabular-nums text-slate-900">{v}</div></div>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">{t.gkFoot}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600">{t.gkNote}</div>
            )
          ) : prose ? (
            <div className="rounded-2xl border border-[#2740e6]/20 bg-[#eef0fb] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{t.aiTag}</div>
              {prose.summary ? <p className="mt-1 text-[14px] font-semibold text-slate-900">{prose.summary}</p> : null}
              {prose.strengths ? <p className="mt-2 text-[13px] text-slate-700"><span className="font-semibold">{t.strengths}. </span>{prose.strengths}</p> : null}
              {prose.development ? <p className="mt-1 text-[13px] text-slate-700"><span className="font-semibold">{t.development}. </span>{prose.development}</p> : null}
            </div>
          ) : null}

          {!a.goalkeeper && cats.map((c) => (
            <div key={c} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-semibold text-slate-800">{t.cats[c]}</div>
                <div className="text-[11px] text-slate-400">{a.byCategory[c] != null ? `${a.byCategory[c]} ${t.pctile}` : ""}</div>
              </div>
              <div className="mt-2 space-y-1.5">
                {a.metrics.filter((m) => m.category === c).map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <div className="w-28 shrink-0 text-[12px] text-slate-600">{m.label}</div>
                    <div className="relative h-3.5 flex-1 rounded bg-slate-100">
                      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${m.percentile ?? 0}%`, backgroundColor: barColor(m.percentile) }} />
                    </div>
                    <div className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">{m.percentile ?? "—"}</div>
                    <div className="w-12 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{fmtV(m.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!a.goalkeeper ? <p className="text-[11px] text-slate-400">{t.pctile} · {lang === "IS" ? "grænt = topp 25%, rautt = neðstu 25%. StatsBomb per-90. Lýsandi — snertir ekki readiness." : "green = top 25%, red = bottom 25%. StatsBomb per-90. Descriptive — never touches readiness."}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
