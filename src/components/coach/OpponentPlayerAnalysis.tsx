"use client";

/**
 * Opponent Scouting → "Players" tab. The opponent analog of /coach/player-analysis:
 * pick one of the OPPONENT's players → role + threat/how-to-stop AI read (labelled) +
 * percentile bars vs THEIR OWN squad, grouped attacking / possession / defending.
 * Reads scout_player.metrics (their StatsBomb Squad export). Descriptive scouting
 * context — it never touches the readiness verdict.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { downloadOpponentPlayersPdf } from "@/components/coach/OpponentPlayersPdf";

type Lang = "EN" | "IS";
type Category = "attacking" | "possession" | "defending";
type MetricRow = { key: string; label: string; category: Category; value: number | null; percentile: number | null };
type Analysis = {
  player: string; minutes: number | null; poolSize: number;
  metrics: MetricRow[]; strengths: MetricRow[]; weaknesses: MetricRow[];
  byCategory: { attacking: number | null; possession: number | null; defending: number | null }; role: Category | null;
};
type Prose = { summary?: string; threat?: string; howToStop?: string } | null;

const T = {
  EN: {
    pick: "Player", minutes: "min", role: "Role", of: "vs their squad", pool: "players",
    roles: { attacking: "Attacking", possession: "Ball progression", defending: "Defending" } as Record<string, string>,
    aiTag: "AI · written from the numbers, decides nothing", summary: "Profile", threat: "Threat", howToStop: "How to stop him",
    pdf: "Player Report (PDF)", generating: "Generating…",
    cats: { attacking: "Attacking", possession: "Possession & progression", defending: "Defending" } as Record<string, string>,
    pctile: "percentile vs their squad",
    none: "No StatsBomb Squad imported for this opponent yet. Add their StatsBomb Squad export in the player-export field when you scout them (Team tab) — it fills these bars.",
    noneNoOpp: "Scout an opponent first (Team tab), including their StatsBomb Squad export, to analyse their players.",
    lowMin: "Low minutes — read as a small sample.", notSignedIn: "Not signed in.",
    legend: "green = top 25% in their squad, red = bottom 25%. StatsBomb per-90. Descriptive — never touches readiness.",
  },
  IS: {
    pick: "Leikmaður", minutes: "mín", role: "Hlutverk", of: "vs þeirra lið", pool: "leikmenn",
    roles: { attacking: "Sókn", possession: "Boltaframrás", defending: "Vörn" } as Record<string, string>,
    aiTag: "AI · skrifað úr tölunum, ákveður ekkert", summary: "Prófíll", threat: "Ógn", howToStop: "Hvernig á að stöðva hann",
    pdf: "Leikmanna-skýrsla (PDF)", generating: "Bý til…",
    cats: { attacking: "Sókn", possession: "Boltahald & framrás", defending: "Vörn" } as Record<string, string>,
    pctile: "percentíl vs þeirra lið",
    none: "Enginn StatsBomb Squad fluttur inn fyrir þennan andstæðing enn. Bættu StatsBomb Squad útflutningi þeirra við í leikmanna-reitinn þegar þú njósnar (Lið-flipi) — hann fyllir þessar súlur.",
    noneNoOpp: "Njósnaðu fyrst um andstæðing (Lið-flipi), með StatsBomb Squad útflutningi þeirra, til að greina leikmenn þeirra.",
    lowMin: "Fáar mínútur — lítið úrtak.", notSignedIn: "Ekki innskráð(ur).",
    legend: "grænt = topp 25% í þeirra liði, rautt = neðstu 25%. StatsBomb per-90. Lýsandi — snertir ekki readiness.",
  },
} as const;

const fmtV = (v: number | null): string => (v == null ? "—" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));
const barColor = (p: number | null): string => (p == null ? "#c7cdd6" : p >= 75 ? "#1c7a4a" : p <= 25 ? "#a83e28" : "#2740e6");

export default function OpponentPlayerAnalysis({ opponent, season, lang }: { opponent: string | null; season: string | null; lang: Lang }) {
  const t = T[lang];
  const [players, setPlayers] = React.useState<Array<{ name: string; minutes: number | null }>>([]);
  const [sel, setSel] = React.useState<string>("");
  const [a, setA] = React.useState<Analysis | null>(null);
  const [prose, setProse] = React.useState<Prose>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  async function makePdf() {
    if (!opponent) return;
    setPdfBusy(true); setErr(null);
    try {
      const tok = await token(); if (!tok) { setErr(t.notSignedIn); return; }
      const res = await fetch("/api/coach/opponent-player-analysis", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ opponent, season, all: true }) });
      const j = await res.json();
      if (!res.ok || !j.ok || !(j.analyses?.length)) { setErr(j.error ?? "Error"); return; }
      await downloadOpponentPlayersPdf(opponent, season ?? "", j.analyses, lang);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setPdfBusy(false); }
  }

  const qs = React.useCallback(() => `opponent=${encodeURIComponent(opponent ?? "")}&season=${encodeURIComponent(season ?? "")}`, [opponent, season]);

  React.useEffect(() => {
    setPlayers([]); setSel(""); setA(null); setProse(null);
    if (!opponent) return;
    (async () => {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/opponent-player-analysis?${qs()}`, { headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json();
      if (j.ok) { setPlayers(j.players ?? []); if (j.players?.[0]) setSel(j.players[0].name); }
    })();
  }, [opponent, season, token, qs]);

  React.useEffect(() => {
    if (!sel || !opponent) return;
    (async () => {
      setBusy(true); setErr(null); setProse(null);
      try {
        const tok = await token(); if (!tok) { setErr(t.notSignedIn); return; }
        const res = await fetch("/api/coach/opponent-player-analysis", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ opponent, season, player: sel, prose: true, lang }) });
        const j = await res.json();
        if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); setA(null); return; }
        setA(j.analysis); setProse(j.prose ?? null);
      } finally { setBusy(false); }
    })();
  }, [sel, opponent, season, lang, token, t.notSignedIn]);

  const cats: Category[] = ["attacking", "possession", "defending"];

  if (!opponent) return <p className="text-[13px] text-slate-500">{t.noneNoOpp}</p>;
  if (players.length === 0 && !busy) return <p className="text-[13px] text-slate-500">{t.none}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.pick}</span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {players.map((p) => <option key={p.name} value={p.name}>{p.name}{p.minutes != null ? ` · ${Math.round(p.minutes)} ${t.minutes}` : ""}</option>)}
        </select>
        <button onClick={makePdf} disabled={pdfBusy} className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">{pdfBusy ? t.generating : t.pdf}</button>
      </div>

      {busy ? <p className="text-sm text-slate-400">…</p> : null}
      {err ? <p className="text-[13px] font-medium text-red-700">{err}</p> : null}

      {a && !busy ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">{a.player}</h2>
            {a.role ? <span className="rounded-full bg-[#eef0fb] px-2 py-0.5 text-[11px] font-semibold text-[#2740e6]">{t.role}: {t.roles[a.role]}</span> : null}
            <span className="text-[12px] text-slate-500">{a.minutes != null ? `${Math.round(a.minutes)} ${t.minutes}` : ""} · {a.poolSize} {t.pool} {t.of}</span>
            {(a.minutes ?? 0) < 450 ? <span className="text-[11px] text-amber-700">⚠ {t.lowMin}</span> : null}
          </div>

          {prose ? (
            <div className="rounded-2xl border border-[#a83e28]/25 bg-[#f9efec] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#a83e28]">{t.aiTag}</div>
              {prose.summary ? <p className="mt-1 text-[14px] font-semibold text-slate-900">{prose.summary}</p> : null}
              {prose.threat ? <p className="mt-2 text-[13px] text-slate-700"><span className="font-semibold">{t.threat}. </span>{prose.threat}</p> : null}
              {prose.howToStop ? <p className="mt-1 text-[13px] text-slate-700"><span className="font-semibold">{t.howToStop}. </span>{prose.howToStop}</p> : null}
            </div>
          ) : null}

          {cats.map((c) => (
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
          <p className="text-[11px] text-slate-400">{t.pctile} · {t.legend}</p>
        </div>
      ) : null}
    </div>
  );
}
