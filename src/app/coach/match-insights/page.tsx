"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { dimByKey } from "@/lib/micropulse/matchMovement/types";
import { EXTENDED_METRIC_LABELS } from "@/lib/micropulse/matchInsights/extendedMetrics";
import { buildMatchNarrative, type NarrativeTone } from "@/lib/micropulse/matchInsights/narrative";

type Lang = "EN" | "IS";

// ── Response shapes (loose) ───────────────────────────────────────────────────
type HalfMetric = { key: string; h1: number | null; h2: number | null; deltaPct: number | null };
type PlayerHalf = { playerId: string; playerName: string; position: string | null; h1Minutes: number; h2Minutes: number; metrics: HalfMetric[] };
type FirstHalfFade = {
  sessionDate: string | null;
  nPlayers: number;
  confidence: "building" | "moderate" | "high";
  metrics: HalfMetric[];
  players: PlayerHalf[];
};
type HalvesResp = { firstHalfFade?: FirstHalfFade };

type GroupStat = { n: number; mean: number | null; sd: number | null };
type MetricWL = { metric: string; win: GroupStat; loss: GroupStat; cohenD: number | null; deltaPct: number | null };
type WinLoss = { nWin: number; nDraw: number; nLoss: number; confident: boolean; metrics: MetricWL[] };
type Corr = { key: string; r: number; n: number; strength: string; direction: string };
type MatchStatRow = {
  date: string;
  opponent: string | null;
  xgFor: number | null;
  xgAgainst: number | null;
  result: "W" | "D" | "L" | null;
  metrics: Record<string, number | null>;
};
type PerMatchXg = {
  available: boolean;
  reason?: string;
  matches: number;
  xgFor: Corr[];
  xgAgainst: Corr[];
  series: MatchStatRow[];
  seriesMetricKeys: string[];
  source: string;
  lastImport: string | null;
};
type InsightsResp = {
  variant: "ima" | "gps";
  counts: { matchesWithLoad: number; gradedMatches: number; playersWithXg: number };
  winLoss: WinLoss;
  resultCorrelations: Corr[];
  seasonXg: { available: boolean; correlations: Corr[] };
  perMatchXg: PerMatchXg;
};

const FIRST_HALF_LABELS: Record<string, { EN: string; IS: string }> = {
  high: { EN: "High-intensity IMA / min", IS: "Háákefðar IMA / mín" },
  total: { EN: "Total IMA / min", IS: "Heildar IMA / mín" },
  hir: { EN: "High-intensity running / min", IS: "Háákefðar hlaup / mín" },
  pl: { EN: "PlayerLoad / min", IS: "PlayerLoad / mín" },
  dist: { EN: "Total distance / min", IS: "Heildarvegalengd / mín" },
  hsr: { EN: "High-speed running / min", IS: "Háhraðahlaup / mín" },
  sprint: { EN: "Sprint distance / min", IS: "Sprett-vegalengd / mín" },
  maxvel: { EN: "Top speed (km/h)", IS: "Hámarkshraði (km/klst)" },
};
function metricLabel(key: string, lang: Lang): string {
  const fh = FIRST_HALF_LABELS[key];
  if (fh) return fh[lang];
  const ext = EXTENDED_METRIC_LABELS[key];
  if (ext) return lang === "IS" ? ext.is : ext.en;
  const d = dimByKey(key);
  return d ? (lang === "IS" ? d.is : d.en) : key;
}

const T = {
  EN: {
    title: "Match Insights",
    purpose: "Read GPS/IMA movement against results and advanced stats: how the last match's first half compared to others, whether movement differs in wins vs losses, and which movement metrics track the result or season xG. Descriptive context — associations, not causation, and it never changes the readiness verdict.",
    fhTitle: "First half vs second half — last match",
    fhEmpty: "No both-halves match data yet. It appears once a match with both halves is synced.",
    fhMatch: "Match",
    h1: "H1", h2: "H2",
    wlTitle: "Wins vs losses — movement",
    wlLow: "Not enough graded matches yet — enter scores on Fixtures (need ≥3 wins and ≥3 losses for a confident read).",
    wlNone: "No graded matches yet. Enter match scores on the Fixtures page to unlock this.",
    higherInWins: "higher in wins", higherInLosses: "higher in losses",
    corrTitle: "What tracks the result?",
    corrCaveat: "Association, not causation or prediction — a link here is context to explore, not a lever to pull.",
    resultCorr: "Movement ↔ result (W/D/L)",
    xgCorr: "Movement ↔ season xG (per player)",
    perMatchXg: "Per-match xG × movement",
    perMatchXgFor: "Per-match xG (for) × movement",
    perMatchXgAgainst: "Per-match xG-against × movement",
    thDate: "Date", thOpp: "Opponent", thXgA: "xGA", thRes: "Res",
    res: { W: "W", D: "D", L: "L" } as Record<string, string>,
    noCorr: "Not enough graded matches for a correlation yet.",
    noXg: "No season xG loaded yet.",
    lowSample: "Small sample — read any strong-looking link as tentative until more matches with data accrue.",
    lowN: "small n",
    matches: "matches", players: "players", win: "W", loss: "L",
    narrativeTitle: "The read",
    narrativeTag: "Auto-generated from your data",
    fhPlayers: "Per player",
    fhPlayersHide: "Hide players",
    fhNoPlayers: "No per-player data for this match yet.",
  },
  IS: {
    title: "Leik-innsýn",
    purpose: "Lestu GPS/IMA hreyfingu á móti úrslitum og ítarlegri tölfræði: hvernig fyrri hálfleikur síðasta leiks var miðað við aðra, hvort hreyfing er önnur í sigrum vs töpum, og hvaða hreyfi-mælikvarðar fylgja úrslitum eða season-xG. Lýsandi samhengi — fylgni, ekki orsök, og það breytir aldrei readiness-dómnum.",
    fhTitle: "Fyrri vs seinni hálfleikur — síðasti leikur",
    fhEmpty: "Engin gögn með báðum hálfleikjum enn. Þau birtast þegar leikur með báðum hálfleikjum er samstilltur.",
    fhMatch: "Leikur",
    h1: "1.h", h2: "2.h",
    wlTitle: "Sigrar vs töp — hreyfing",
    wlLow: "Ekki nógu margir metnir leikir — skráðu úrslit á Leikjadagatali (þarf ≥3 sigra og ≥3 töp fyrir öruggan lestur).",
    wlNone: "Engir metnir leikir enn. Skráðu úrslit á Leikjadagatals-síðunni til að opna þetta.",
    higherInWins: "hærra í sigrum", higherInLosses: "hærra í töpum",
    corrTitle: "Hvað fylgir úrslitunum?",
    corrCaveat: "Fylgni, ekki orsök eða spá — tengsl hér eru samhengi til að skoða, ekki stýring til að toga í.",
    resultCorr: "Hreyfing ↔ úrslit (S/J/T)",
    xgCorr: "Hreyfing ↔ season-xG (per leikmann)",
    perMatchXg: "Per-leik xG × hreyfing",
    perMatchXgFor: "Per-leik xG (með) × hreyfing",
    perMatchXgAgainst: "Per-leik xG á móti × hreyfing",
    thDate: "Dags", thOpp: "Andstæðingur", thXgA: "xGÁ", thRes: "Úrsl",
    res: { W: "S", D: "J", L: "T" } as Record<string, string>,
    noCorr: "Ekki nógu margir metnir leikir fyrir fylgni enn.",
    noXg: "Engin season-xG hlaðin enn.",
    lowSample: "Lítið úrtak — lestu sterk-útlítandi tengsl sem bráðabirgða þar til fleiri leikir með gögnum bætast við.",
    lowN: "fá sýni",
    matches: "leikir", players: "leikmenn", win: "S", loss: "T",
    narrativeTitle: "Lesturinn",
    narrativeTag: "Sjálfvirkt út frá þínum gögnum",
    fhPlayers: "Per leikmann",
    fhPlayersHide: "Fela leikmenn",
    fhNoPlayers: "Engin gögn per leikmann fyrir þennan leik enn.",
  },
} as const;

/** Below this many paired observations a correlation is not shown as confident:
 *  the "strong" badge is suppressed and a small-sample note is surfaced. */
const MIN_CONFIDENT_CORR_N = 10;

function fmt(n: number | null, d = 1): string { return n == null ? "—" : n.toFixed(d); }
function signPct(n: number | null): string { return n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`; }
function toneMark(tone: NarrativeTone): string {
  return tone === "pos" ? "▲" : tone === "neg" ? "▼" : tone === "caveat" ? "ⓘ" : "•";
}

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

  const fade = halves?.firstHalfFade;
  const fadePlayers = fade?.players ?? [];
  const wl = ins?.winLoss;
  const [showPlayers, setShowPlayers] = React.useState(false);

  // Deterministic plain-language read — rules produce the numbers, this only
  // explains them (manifesto). Recomputed when data or language changes.
  const narrative = React.useMemo(() => {
    if (!ins) return null;
    return buildMatchNarrative({
      lang,
      label: (k) => metricLabel(k, lang),
      winLoss: ins.winLoss,
      resultCorrelations: ins.resultCorrelations,
      seasonXg: ins.seasonXg,
      firstHalf: fade ? { sessionDate: fade.sessionDate, metrics: fade.metrics } : null,
    });
  }, [ins, fade, lang]);

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
          {/* ── Panel 0: The read (plain-language narrative) ── */}
          {narrative ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">{t.narrativeTitle}</div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 ring-1 ring-blue-200">{t.narrativeTag}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-medium text-slate-700">{narrative.headline}</p>
              <ul className="mt-2 space-y-1.5">
                {narrative.points.map((p, i) => (
                  <li key={i} className={`flex gap-2 text-[13px] ${p.tone === "caveat" ? "text-slate-400 italic" : "text-slate-700"}`}>
                    <span aria-hidden className="mt-[3px] text-[11px]">{toneMark(p.tone)}</span>
                    <span>{p.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* ── Panel 1: First half vs second half (last match) ── */}
          <Card>
            <div className="text-sm font-semibold text-slate-800">{t.fhTitle}</div>
            {!fade || !fade.sessionDate || fade.metrics.every((m) => m.h1 == null && m.h2 == null) ? (
              <p className="mt-2 text-[13px] text-slate-500">{t.fhEmpty}</p>
            ) : (
              <>
                <div className="mt-0.5 text-[11px] text-slate-500">{t.fhMatch}: {fade.sessionDate} · {fade.nPlayers} {t.players}</div>
                <div className="mt-3 space-y-2">
                  {fade.metrics.filter((m) => m.h1 != null || m.h2 != null).map((m) => {
                    const drop = (m.deltaPct ?? 0) < 0;
                    return (
                      <div key={m.key} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
                        <span className="text-slate-700">{metricLabel(m.key, lang)}</span>
                        <span className="flex items-baseline gap-2 tabular-nums text-[12px]">
                          <span className="text-slate-500">{t.h1}</span>
                          <span className="font-semibold text-slate-800">{fmt(m.h1, 2)}</span>
                          <span className="text-slate-300">→</span>
                          <span className="text-slate-500">{t.h2}</span>
                          <span className="font-semibold text-slate-800">{fmt(m.h2, 2)}</span>
                          {m.deltaPct != null ? (
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${drop ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{signPct(m.deltaPct)}</span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Per-player drill-down (S&C surface — behind a toggle). */}
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <button
                    onClick={() => setShowPlayers((v) => !v)}
                    className="text-[12px] font-medium text-blue-700 hover:underline"
                  >
                    {showPlayers ? t.fhPlayersHide : `${t.fhPlayers} (${fadePlayers.length})`} {showPlayers ? "▲" : "▶"}
                  </button>
                  {showPlayers ? (
                    fadePlayers.length === 0 ? (
                      <p className="mt-2 text-[12px] text-slate-500">{t.fhNoPlayers}</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {fadePlayers.map((p) => (
                          <PlayerHalfRow key={p.playerId} p={p} lang={lang} t={t} />
                        ))}
                      </div>
                    )
                  ) : null}
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
              <>
                {ins.resultCorrelations.some((c) => c.n < MIN_CONFIDENT_CORR_N) ? <p className="mt-0.5 text-[11px] text-amber-700">{t.lowSample}</p> : null}
                <div className="mt-1.5 space-y-1.5">
                  {ins.resultCorrelations.map((c) => <CorrRow key={c.key} c={c} lang={lang} t={t} />)}
                </div>
              </>
            ) : <p className="mt-1 text-[12px] text-slate-500">{t.noCorr}</p>}

            <div className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{t.xgCorr}</div>
            {ins && ins.seasonXg.available ? (
              <>
                {ins.seasonXg.correlations.some((c) => c.n < MIN_CONFIDENT_CORR_N) ? <p className="mt-0.5 text-[11px] text-amber-700">{t.lowSample}</p> : null}
                <div className="mt-1.5 space-y-1.5">
                  {ins.seasonXg.correlations.map((c) => <CorrRow key={c.key} c={c} lang={lang} t={t} />)}
                </div>
              </>
            ) : <p className="mt-1 text-[12px] text-slate-500">{t.noXg}</p>}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-slate-600">{t.perMatchXg}</div>
                {ins?.perMatchXg.available ? (
                  <span className="text-[10px] text-slate-400">
                    {ins.perMatchXg.source}{ins.perMatchXg.lastImport ? ` · ${ins.perMatchXg.lastImport.slice(0, 10)}` : ""}
                  </span>
                ) : null}
              </div>
              {ins && ins.perMatchXg.available ? (
                <>
                  {ins.perMatchXg.matches < MIN_CONFIDENT_CORR_N ? <p className="mt-1 text-[11px] text-amber-700">{t.lowSample}</p> : null}

                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.perMatchXgFor} · {ins.perMatchXg.matches} {t.matches}</div>
                  {ins.perMatchXg.xgFor.length > 0 ? (
                    <div className="mt-1.5 space-y-1.5">{ins.perMatchXg.xgFor.map((c) => <CorrRow key={`xf-${c.key}`} c={c} lang={lang} t={t} />)}</div>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{t.noCorr}</p>}

                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.perMatchXgAgainst}</div>
                  {ins.perMatchXg.xgAgainst.length > 0 ? (
                    <div className="mt-1.5 space-y-1.5">{ins.perMatchXg.xgAgainst.map((c) => <CorrRow key={`xa-${c.key}`} c={c} lang={lang} t={t} />)}</div>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{t.noCorr}</p>}

                  {ins.perMatchXg.series.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="py-1 text-left font-medium">{t.thDate}</th>
                            <th className="text-left font-medium">{t.thOpp}</th>
                            <th className="px-2 text-right font-medium">xG</th>
                            <th className="px-2 text-right font-medium">{t.thXgA}</th>
                            {ins.perMatchXg.seriesMetricKeys.map((k) => <th key={k} className="px-2 text-right font-medium">{metricLabel(k, lang)}</th>)}
                            <th className="text-right font-medium">{t.thRes}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ins.perMatchXg.series.map((s) => (
                            <tr key={s.date} className="border-t border-slate-100">
                              <td className="py-1 text-slate-600 tabular-nums">{s.date.slice(5)}</td>
                              <td className="text-slate-600">{s.opponent ?? "—"}</td>
                              <td className="px-2 text-right tabular-nums font-semibold text-slate-800">{fmt(s.xgFor, 2)}</td>
                              <td className="px-2 text-right tabular-nums text-slate-500">{fmt(s.xgAgainst, 2)}</td>
                              {ins.perMatchXg.seriesMetricKeys.map((k) => <td key={k} className="px-2 text-right tabular-nums text-slate-600">{fmt(s.metrics[k] ?? null, 1)}</td>)}
                              <td className="text-right font-semibold">
                                {s.result ? <span className={s.result === "W" ? "text-emerald-700" : s.result === "L" ? "text-red-700" : "text-slate-500"}>{t.res[s.result] ?? s.result}</span> : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">{ins?.perMatchXg.reason ?? "—"}</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function PlayerHalfRow({ p, lang }: { p: PlayerHalf; lang: Lang; t: (typeof T)[keyof typeof T] }) {
  // Metrics this player has for the last match, biggest 1st→2nd-half move first —
  // the layered read: name + minutes, then the per-metric drop chips.
  const rows = p.metrics
    .filter((m) => m.h1 != null || m.h2 != null)
    .sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0));
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-800">
          {p.playerName}
          {p.position ? <span className="ml-1 text-[11px] text-slate-400">{p.position}</span> : null}
        </span>
        <span className="text-[10px] text-slate-400">
          {Math.round(p.h1Minutes)}′ / {Math.round(p.h2Minutes)}′
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {rows.map((m) => {
          const drop = (m.deltaPct ?? 0) < 0;
          return (
            <span key={m.key} className="inline-flex items-baseline gap-1 text-[12px] tabular-nums">
              <span className="text-slate-600">{metricLabel(m.key, lang)}</span>
              {m.deltaPct != null ? (
                <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${drop ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{signPct(m.deltaPct)}</span>
              ) : (
                <span className="font-semibold text-slate-800">{fmt(m.h1, 2)}→{fmt(m.h2, 2)}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CorrRow({ c, lang, t }: { c: Corr; lang: Lang; t: (typeof T)[keyof typeof T] }) {
  // Below the confidence floor a correlation can't be trusted (one variable of
  // several will look "strong" by chance), so we suppress the strong badge and
  // flag the small sample instead — the r stays visible but de-emphasised.
  const lowN = c.n < MIN_CONFIDENT_CORR_N;
  const strong = !lowN && Math.abs(c.r) >= 0.4;
  const tone = lowN ? "text-slate-500" : c.direction === "positive" ? "text-emerald-700" : "text-red-700";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
      <span className="text-slate-700">{metricLabel(c.key, lang)}</span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className={`font-semibold ${tone}`}>r = {c.r.toFixed(2)}</span>
        {lowN ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{t.lowN} · n={c.n}</span>
        ) : (
          <>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${strong ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>{c.strength}</span>
            <span className="text-[10px] text-slate-400">n={c.n}</span>
          </>
        )}
      </span>
    </div>
  );
}
