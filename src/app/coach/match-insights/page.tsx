"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { dimByKey } from "@/lib/micropulse/matchMovement/types";

type Lang = "EN" | "IS";

// ── Response shapes (loose) ───────────────────────────────────────────────────
type Compare = { key: string; latest: number | null; priorMean: number | null; z: number | null; deltaPct: number | null; nPrior: number };
type FirstHalfTeam = { latestDate: string | null; matches: Array<{ sessionDate: string }>; compares: Compare[] };
type HalvesResp = { firstHalfTeam?: FirstHalfTeam };

type GroupStat = { n: number; mean: number | null; sd: number | null };
type MetricWL = { metric: string; win: GroupStat; loss: GroupStat; cohenD: number | null; deltaPct: number | null };
type WinLoss = { nWin: number; nDraw: number; nLoss: number; confident: boolean; metrics: MetricWL[] };
type Corr = { key: string; r: number; n: number; strength: string; direction: string };
type InsightsResp = {
  variant: "ima" | "gps";
  counts: { matchesWithLoad: number; gradedMatches: number; playersWithXg: number };
  winLoss: WinLoss;
  resultCorrelations: Corr[];
  seasonXg: { available: boolean; correlations: Corr[] };
  perMatchXg: { available: boolean; reason: string };
};

const FIRST_HALF_LABELS: Record<string, { EN: string; IS: string }> = {
  high: { EN: "High-intensity IMA / min", IS: "Háákefðar IMA / mín" },
  total: { EN: "Total IMA / min", IS: "Heildar IMA / mín" },
  hir: { EN: "High-intensity running / min", IS: "Háákefðar hlaup / mín" },
  pl: { EN: "PlayerLoad / min", IS: "PlayerLoad / mín" },
};
function metricLabel(key: string, lang: Lang): string {
  const fh = FIRST_HALF_LABELS[key];
  if (fh) return fh[lang];
  const d = dimByKey(key);
  return d ? (lang === "IS" ? d.is : d.en) : key;
}

const T = {
  EN: {
    title: "Match Insights",
    purpose: "Read GPS/IMA movement against results and advanced stats: how the last match's first half compared to others, whether movement differs in wins vs losses, and which movement metrics track the result or season xG. Descriptive context — associations, not causation, and it never changes the readiness verdict.",
    fhTitle: "First half — last match vs the others",
    fhEmpty: "No first-half match data yet. It appears once matches with both halves are synced.",
    fhLatest: "Last match",
    vsPrior: "vs prior matches",
    wlTitle: "Wins vs losses — movement",
    wlLow: "Not enough graded matches yet — enter scores on Fixtures (need ≥3 wins and ≥3 losses for a confident read).",
    wlNone: "No graded matches yet. Enter match scores on the Fixtures page to unlock this.",
    higherInWins: "higher in wins", higherInLosses: "higher in losses",
    corrTitle: "What tracks the result?",
    corrCaveat: "Association, not causation or prediction — a link here is context to explore, not a lever to pull.",
    resultCorr: "Movement ↔ result (W/D/L)",
    xgCorr: "Movement ↔ season xG (per player)",
    perMatchXg: "Per-match xG × movement",
    noCorr: "Not enough graded matches for a correlation yet.",
    noXg: "No season xG loaded yet.",
    matches: "matches", players: "players", win: "W", loss: "L",
  },
  IS: {
    title: "Leik-innsýn",
    purpose: "Lestu GPS/IMA hreyfingu á móti úrslitum og ítarlegri tölfræði: hvernig fyrri hálfleikur síðasta leiks var miðað við aðra, hvort hreyfing er önnur í sigrum vs töpum, og hvaða hreyfi-mælikvarðar fylgja úrslitum eða season-xG. Lýsandi samhengi — fylgni, ekki orsök, og það breytir aldrei readiness-dómnum.",
    fhTitle: "Fyrri hálfleikur — síðasti leikur vs hinir",
    fhEmpty: "Engin fyrri-hálfleiks gögn enn. Þau birtast þegar leikir með báðum hálfleikjum eru samstilltir.",
    fhLatest: "Síðasti leikur",
    vsPrior: "vs fyrri leikir",
    wlTitle: "Sigrar vs töp — hreyfing",
    wlLow: "Ekki nógu margir metnir leikir — skráðu úrslit á Leikjadagatali (þarf ≥3 sigra og ≥3 töp fyrir öruggan lestur).",
    wlNone: "Engir metnir leikir enn. Skráðu úrslit á Leikjadagatals-síðunni til að opna þetta.",
    higherInWins: "hærra í sigrum", higherInLosses: "hærra í töpum",
    corrTitle: "Hvað fylgir úrslitunum?",
    corrCaveat: "Fylgni, ekki orsök eða spá — tengsl hér eru samhengi til að skoða, ekki stýring til að toga í.",
    resultCorr: "Hreyfing ↔ úrslit (S/J/T)",
    xgCorr: "Hreyfing ↔ season-xG (per leikmann)",
    perMatchXg: "Per-leik xG × hreyfing",
    noCorr: "Ekki nógu margir metnir leikir fyrir fylgni enn.",
    noXg: "Engin season-xG hlaðin enn.",
    matches: "leikir", players: "leikmenn", win: "S", loss: "T",
  },
} as const;

function fmt(n: number | null, d = 1): string { return n == null ? "—" : n.toFixed(d); }
function signPct(n: number | null): string { return n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`; }

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>;
}

export default function MatchInsightsPage() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [halves, setHalves] = React.useState<HalvesResp | null>(null);
  const [ins, setIns] = React.useState<InsightsResp | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) { setLoading(false); return; }
        const h = { Authorization: `Bearer ${token}` };
        const [a, b] = await Promise.all([
          fetch("/api/coach/team/match-intensity-halves?days=365", { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/coach/match-insights", { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        setHalves(a); setIns(b);
      } finally { setLoading(false); }
    })();
  }, []);

  const fh = halves?.firstHalfTeam;
  const wl = ins?.winLoss;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <PagePurpose en={T.EN.purpose} is={T.IS.purpose} />
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">…</div>
      ) : (
        <>
          {/* ── Panel 1: First half vs other matches ── */}
          <Card>
            <div className="text-sm font-semibold text-slate-800">{t.fhTitle}</div>
            {!fh || !fh.latestDate || fh.compares.every((c) => c.latest == null) ? (
              <p className="mt-2 text-[13px] text-slate-500">{t.fhEmpty}</p>
            ) : (
              <>
                <div className="mt-0.5 text-[11px] text-slate-500">{t.fhLatest}: {fh.latestDate} · {fh.matches.length - 1} {t.vsPrior}</div>
                <div className="mt-3 space-y-2">
                  {fh.compares.filter((c) => c.latest != null).map((c) => {
                    const up = (c.deltaPct ?? 0) >= 0;
                    return (
                      <div key={c.key} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
                        <span className="text-slate-700">{metricLabel(c.key, lang)}</span>
                        <span className="flex items-baseline gap-2 tabular-nums">
                          <span className="font-semibold text-slate-800">{fmt(c.latest, 2)}</span>
                          {c.priorMean != null && c.nPrior > 0 ? (
                            <>
                              <span className="text-[11px] text-slate-400">({fmt(c.priorMean, 2)} {t.vsPrior})</span>
                              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${up ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{signPct(c.deltaPct)}</span>
                            </>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          {/* ── Panel 2: Wins vs losses ── */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">{t.wlTitle}</div>
              {wl ? <div className="text-[11px] text-slate-500">{wl.nWin} {t.win} · {wl.nLoss} {t.loss}</div> : null}
            </div>
            {!wl || (wl.nWin + wl.nLoss) === 0 ? (
              <p className="mt-2 text-[13px] text-slate-500">{t.wlNone}</p>
            ) : (
              <>
                {!wl.confident ? <p className="mt-1 text-[12px] text-amber-700">{t.wlLow}</p> : null}
                <div className="mt-3 space-y-2">
                  {wl.metrics.filter((m) => m.cohenD != null).slice(0, 6).map((m) => {
                    const higherWins = (m.cohenD ?? 0) >= 0;
                    return (
                      <div key={m.metric} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
                        <span className="text-slate-700">{metricLabel(m.metric, lang)}</span>
                        <span className="flex items-baseline gap-2 tabular-nums text-[12px]">
                          <span className="text-emerald-700">{t.win} {fmt(m.win.mean, 1)}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-red-700">{t.loss} {fmt(m.loss.mean, 1)}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${higherWins ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            d={fmt(m.cohenD, 2)} · {higherWins ? t.higherInWins : t.higherInLosses}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          {/* ── Panel 3: Correlations ── */}
          <Card>
            <div className="text-sm font-semibold text-slate-800">{t.corrTitle}</div>
            <p className="mt-1 text-[11px] text-slate-500">{t.corrCaveat}</p>

            <div className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{t.resultCorr}</div>
            {ins && ins.resultCorrelations.length > 0 ? (
              <div className="mt-1.5 space-y-1.5">
                {ins.resultCorrelations.map((c) => <CorrRow key={c.key} c={c} lang={lang} />)}
              </div>
            ) : <p className="mt-1 text-[12px] text-slate-500">{t.noCorr}</p>}

            <div className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{t.xgCorr}</div>
            {ins && ins.seasonXg.available ? (
              <div className="mt-1.5 space-y-1.5">
                {ins.seasonXg.correlations.map((c) => <CorrRow key={c.key} c={c} lang={lang} />)}
              </div>
            ) : <p className="mt-1 text-[12px] text-slate-500">{t.noXg}</p>}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[12px] font-semibold text-slate-600">{t.perMatchXg}</div>
              <p className="mt-0.5 text-[11px] text-slate-500">{ins?.perMatchXg.reason ?? "—"}</p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function CorrRow({ c, lang }: { c: Corr; lang: Lang }) {
  const strong = Math.abs(c.r) >= 0.4;
  const tone = c.direction === "positive" ? "text-emerald-700" : "text-red-700";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
      <span className="text-slate-700">{metricLabel(c.key, lang)}</span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className={`font-semibold ${tone}`}>r = {c.r.toFixed(2)}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${strong ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>{c.strength}</span>
        <span className="text-[10px] text-slate-400">n={c.n}</span>
      </span>
    </div>
  );
}
