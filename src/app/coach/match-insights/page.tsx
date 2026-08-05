"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { dimByKey } from "@/lib/micropulse/matchMovement/types";
import { EXTENDED_METRIC_LABELS, GPS_LOCOMOTOR_KEYS } from "@/lib/micropulse/matchInsights/extendedMetrics";
import { buildMatchNarrative, summarizeResultCorrelations, summarizeStatMovement, summarizeWinLoss, summarizeFirstHalfFade, type NarrativeTone } from "@/lib/micropulse/matchInsights/narrative";

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
  result: "W" | "D" | "L" | null;
  goals: number | null;
  xgFor: number | null;
  xgAgainst: number | null;
  shots: number | null;
  shotsOnTargetPct: number | null;
  possession: number | null;
  passAccuracyPct: number | null;
  duelsWonPct: number | null;
  recoveries: number | null;
  lossLow: number | null; lossMed: number | null; lossHigh: number | null;
  recLow: number | null; recMed: number | null; recHigh: number | null;
  metrics: Record<string, number | null>;
};
type StatCorr = { key: string; corr: Corr[] };
type PerMatchStats = {
  available: boolean;
  reason?: string;
  matches: number;
  stats: StatCorr[];
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
  perMatchStats: PerMatchStats;
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

// Per-match team-stat labels (from the Wyscout Team-Stats export).
const STAT_LABELS: Record<string, { EN: string; IS: string; short: { EN: string; IS: string } }> = {
  xgFor: { EN: "xG (for)", IS: "xG (með)", short: { EN: "xG", IS: "xG" } },
  xgAgainst: { EN: "xG against", IS: "xG á móti", short: { EN: "xGA", IS: "xGÁ" } },
  goals: { EN: "Goals", IS: "Mörk", short: { EN: "G", IS: "M" } },
  shots: { EN: "Shots", IS: "Skot", short: { EN: "Sh", IS: "Sk" } },
  shotsOnTargetPct: { EN: "Shots on target %", IS: "Skot á mark %", short: { EN: "SoT%", IS: "ÁM%" } },
  possession: { EN: "Possession %", IS: "Boltahald %", short: { EN: "Poss%", IS: "Bolti%" } },
  passAccuracyPct: { EN: "Pass accuracy %", IS: "Sendinákvæmni %", short: { EN: "Pass%", IS: "Send%" } },
  duelsWonPct: { EN: "Duels won %", IS: "Návígi unnin %", short: { EN: "Duel%", IS: "Náv%" } },
  recoveries: { EN: "Recoveries", IS: "Boltaendurheimtur", short: { EN: "Rec", IS: "End" } },
};
function statLabel(key: string, lang: Lang): string {
  return STAT_LABELS[key] ? STAT_LABELS[key][lang] : key;
}
function statShort(key: string, lang: Lang): string {
  return STAT_LABELS[key] ? STAT_LABELS[key].short[lang] : key;
}

// Per-panel plain-language explainability (deterministic — decodes the numbers,
// never an LLM). One always-visible line (what the panel answers) + detailed
// "how to read this" bullets behind a toggle. Bilingual.
type ExplainCopy = { summary: string; how: string[] };
const EXPLAINERS: Record<string, { EN: ExplainCopy; IS: ExplainCopy }> = {
  firstHalf: {
    EN: {
      summary: "How the last match's first half compared with its second half — did the team drop off after the break?",
      how: [
        "Each row is one movement metric, shown per minute so the two halves compare fairly.",
        "H1 → H2 is the first-half value, then the second-half value.",
        "The % is the change between them: amber = a second-half drop (a fade), green = held or rose.",
        "This is the single most recent match; “Per player” breaks the same match down by player.",
        "Context only — it never changes a readiness verdict.",
      ],
    },
    IS: {
      summary: "Hvernig fyrri hálfleikur síðasta leiks var borinn saman við seinni — datt liðið niður eftir hlé?",
      how: [
        "Hver lína er einn hreyfi-mælikvarði, sýndur á mínútu svo hálfleikirnir séu sambærilegir.",
        "H1 → H2 er gildið í fyrri hálfleik, svo í seinni hálfleik.",
        "%-talan er breytingin: gult = fall í seinni hálfleik, grænt = hélst eða jókst.",
        "Þetta er nýjasti leikurinn einn; „Per leikmann“ sundurliðar sama leik eftir leikmönnum.",
        "Aðeins samhengi — breytir aldrei readiness-dómnum.",
      ],
    },
  },
  winLoss: {
    EN: {
      summary: "Whether the team moves differently in wins than in losses.",
      how: [
        "“W” and “L” are the average per-minute value in wins vs in losses.",
        "d (Cohen's d) is how big the gap is: ~0.2 small, ~0.5 moderate, 0.8+ large.",
        "Green = higher in wins; red = higher in losses.",
        "The “W · L” count (top-right) is the sample; with fewer than ~3 of either it's flagged not-confident.",
        "GPS running metrics (distance, high-speed, sprint, top speed) are always kept in the list.",
        "An association — not proof that moving that way causes results.",
      ],
    },
    IS: {
      summary: "Hvort liðið hreyfir sig öðruvísi í sigrum en í töpum.",
      how: [
        "„S“ og „T“ eru meðalgildið á mínútu í sigrum vs í töpum.",
        "d (Cohen's d) er stærð munarins: ~0,2 lítill, ~0,5 miðlungs, 0,8+ stór.",
        "Grænt = hærra í sigrum; rautt = hærra í töpum.",
        "„S · T“ talan (efst til hægri) er úrtakið; með færri en ~3 af hvoru er það merkt óöruggt.",
        "GPS-hlaupatölur (vegalengd, háhraði, sprettur, hámarkshraði) eru alltaf hafðar með.",
        "Fylgni — ekki sönnun þess að hreyfingin valdi úrslitunum.",
      ],
    },
  },
  correlations: {
    EN: {
      summary: "Which movement metrics rise and fall together with the result, or with season xG.",
      how: [
        "r runs from −1 to +1 — how tightly two numbers track each other; the sign is the direction.",
        "Rough guide: |r| ~0.1 weak, ~0.3 moderate, 0.5+ strong.",
        "n is how many matches (or players, for season xG) sit behind the number.",
        "Below n=10 it shows “small n” — read it as a hint, not a finding.",
        "Association, never causation or prediction.",
      ],
    },
    IS: {
      summary: "Hvaða hreyfi-mælikvarðar hækka og lækka með úrslitunum, eða með season-xG.",
      how: [
        "r er frá −1 til +1 — hversu þétt tvær tölur fylgjast að; formerkið er áttin.",
        "Viðmið: |r| ~0,1 veikt, ~0,3 miðlungs, 0,5+ sterkt.",
        "n er hversu margir leikir (eða leikmenn, fyrir season-xG) liggja að baki.",
        "Undir n=10 birtist „fá sýni“ — lestu sem vísbendingu, ekki niðurstöðu.",
        "Fylgni, aldrei orsök eða spá.",
      ],
    },
  },
  perMatchStats: {
    EN: {
      summary: "Every match's team stats from Wyscout, plus how each tactical stat links to movement.",
      how: [
        "Top block: the strongest movement link for each stat (same r and n rules as above).",
        "Table: one row per match — goals (G), xG, xG-against (xGA), shots (Sh), on-target % (SoT%), possession % (Poss%), pass accuracy % (Pass%), duels won % (Duel%), recoveries (Rec).",
        "Losses / Recoveries L/M/H split the count by pitch zone — High = attacking third, Low = own third (high recoveries = winning the ball high up).",
        "Res is the result (W/D/L). The data source and last import date are shown top-right.",
      ],
    },
    IS: {
      summary: "Öll tölfræði hvers leiks úr Wyscout, ásamt því hvernig hver taktísk tala tengist hreyfingu.",
      how: [
        "Efri hluti: sterkasta hreyfi-tengsl hverrar tölu (sömu r- og n-reglur og að ofan).",
        "Tafla: ein lína per leik — mörk (M), xG, xG á móti (xGÁ), skot (Sk), á mark % (ÁM%), boltahald % (Bolti%), sendinákvæmni % (Send%), návígi unnin % (Náv%), endurheimtur (End).",
        "Töp / Endurh. L/M/H skipta talningunni eftir svæði — Hátt = sóknarþriðjungur, Lágt = eigin þriðjungur (háar endurheimtur = vinna boltann hátt uppi).",
        "Úrsl er úrslitin (S/J/T). Uppruni gagna og síðasti innflutningur eru efst til hægri.",
      ],
    },
  },
};

const T = {
  EN: {
    title: "Team Match Insights",
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
    perMatchXg: "Per-match team stats × movement",
    statMovement: "Strongest movement links per stat",
    perMatchTable: "Match-by-match",
    thDate: "Date", thOpp: "Opponent", thRes: "Res",
    thLossLmh: "Losses L/M/H", thRecLmh: "Recoveries L/M/H", lmhHint: "by pitch zone (low / medium / high)",
    res: { W: "W", D: "D", L: "L" } as Record<string, string>,
    noCorr: "Not enough graded matches for a correlation yet.",
    noXg: "No season xG loaded yet.",
    lowSample: "Small sample — read any strong-looking link as tentative until more matches with data accrue.",
    lowN: "small n",
    matches: "matches", players: "players", win: "W", loss: "L",
    variantGps: "GPS movement",
    variantIma: "IMA movement",
    variantGpsHint: "This team's Catapult data is GPS-only, so the movement metrics here are GPS-based (total distance, high-speed running, sprint distance, top speed) rather than IMA.",
    variantImaHint: "This team captures IMA, so the movement metrics here are IMA-driven, with GPS shown alongside.",
    narrativeTitle: "The read",
    narrativeTag: "Auto-generated from your data",
    fhPlayers: "Per player",
    fhPlayersHide: "Hide players",
    fhNoPlayers: "No per-player data for this match yet.",
  },
  IS: {
    title: "Liðs-leikgreining",
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
    perMatchXg: "Per-leik tölfræði × hreyfing",
    statMovement: "Sterkustu hreyfi-tengsl per tölfræði",
    perMatchTable: "Leik fyrir leik",
    thDate: "Dags", thOpp: "Andstæðingur", thRes: "Úrsl",
    thLossLmh: "Töp L/M/H", thRecLmh: "Endurh. L/M/H", lmhHint: "eftir svæði (lágt / miðlungs / hátt)",
    res: { W: "S", D: "J", L: "T" } as Record<string, string>,
    noCorr: "Ekki nógu margir metnir leikir fyrir fylgni enn.",
    noXg: "Engin season-xG hlaðin enn.",
    lowSample: "Lítið úrtak — lestu sterk-útlítandi tengsl sem bráðabirgða þar til fleiri leikir með gögnum bætast við.",
    lowN: "fá sýni",
    matches: "leikir", players: "leikmenn", win: "S", loss: "T",
    variantGps: "GPS-hreyfing",
    variantIma: "IMA-hreyfing",
    variantGpsHint: "Catapult-gögn þessa liðs eru GPS-eingöngu, svo hreyfi-mælikvarðarnir hér byggja á GPS (heildarvegalengd, háhraðahlaup, sprett-vegalengd, hámarkshraði) frekar en IMA.",
    variantImaHint: "Þetta lið safnar IMA, svo hreyfi-mælikvarðarnir hér eru IMA-drifnir, með GPS til hliðar.",
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
/** Compact "low/medium/high" cell, e.g. "34/43/47" (an en-dash for a missing part). */
function lmh(a: number | null, b: number | null, c: number | null): string {
  if (a == null && b == null && c == null) return "—";
  const p = (n: number | null) => (n == null ? "–" : String(n));
  return `${p(a)}/${p(b)}/${p(c)}`;
}
function signPct(n: number | null): string { return n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`; }
function toneMark(tone: NarrativeTone): string {
  return tone === "pos" ? "▲" : tone === "neg" ? "▼" : tone === "caveat" ? "ⓘ" : "•";
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>;
}

/** Computed one-paragraph summary that draws a dense panel together (deterministic,
 *  cited — from the panel's own numbers). Hidden when there's nothing to say. */
function SummaryBox({ text, lang }: { text: string; lang: Lang }) {
  if (!text) return null;
  // The coaching takeaway is marked with "→"; render it on its own emphasised line.
  const idx = text.indexOf("→");
  const main = idx >= 0 ? text.slice(0, idx).trim() : text;
  const coaching = idx >= 0 ? text.slice(idx).trim() : "";
  return (
    <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">{lang === "IS" ? "Samantekt" : "Summary"}</span>
      <p className="mt-0.5 text-[12px] leading-snug text-slate-700">{main}</p>
      {coaching ? <p className="mt-1 text-[12px] font-medium leading-snug text-blue-800">{coaching}</p> : null}
    </div>
  );
}

/** Per-panel plain-language explainer: one visible line + a "how to read this"
 *  toggle that decodes the numbers. Deterministic (static copy), bilingual. */
function PanelExplainer({ id, lang }: { id: string; lang: Lang }) {
  const [open, setOpen] = React.useState(false);
  const e = EXPLAINERS[id]?.[lang];
  if (!e) return null;
  return (
    <div className="mt-1">
      <p className="text-[12px] text-slate-500">{e.summary}</p>
      <button onClick={() => setOpen((v) => !v)} className="mt-0.5 text-[11px] font-medium text-blue-700 hover:underline">
        {open ? (lang === "IS" ? "Fela leiðbeiningar" : "Hide how to read") : (lang === "IS" ? "Hvernig á að lesa þetta" : "How to read this")} {open ? "▲" : "▶"}
      </button>
      {open ? (
        <ul className="mt-1 space-y-1 rounded-md bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-600">
          {e.how.map((h, i) => (
            <li key={i} className="flex gap-1.5"><span className="mt-[1px] text-slate-300">•</span><span>{h}</span></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
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
  // Wins-vs-losses metrics to show: top-6 by effect size, but always keep the GPS
  // locomotor read (distance / HSR / sprint / top speed) so a strong IMA set can't
  // hide the running comparison the coach expects. Sorted by |d|.
  const wlShown = React.useMemo(() => {
    const withD = (wl?.metrics ?? []).filter((m) => m.cohenD != null);
    const keep = new Map(withD.slice(0, 6).map((m) => [m.metric, m]));
    for (const m of withD) if (GPS_LOCOMOTOR_KEYS.includes(m.metric)) keep.set(m.metric, m);
    return [...keep.values()].sort((a, b) => Math.abs(b.cohenD ?? 0) - Math.abs(a.cohenD ?? 0));
  }, [wl]);
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

  // Deterministic per-panel summaries drawing together the dense correlation blocks.
  const resultSummary = React.useMemo(() => {
    if (!ins) return "";
    return summarizeResultCorrelations({
      lang, label: (k) => metricLabel(k, lang),
      matches: ins.counts.gradedMatches,
      result: ins.resultCorrelations,
      seasonXg: ins.seasonXg,
    });
  }, [ins, lang]);
  const statsSummary = React.useMemo(() => {
    if (!ins?.perMatchStats.available) return "";
    return summarizeStatMovement({
      lang, statLabel: (k) => statLabel(k, lang), moveLabel: (k) => metricLabel(k, lang),
      matches: ins.perMatchStats.matches, stats: ins.perMatchStats.stats,
    });
  }, [ins, lang]);
  const wlSummary = React.useMemo(() => summarizeWinLoss({ lang, label: (k) => metricLabel(k, lang), winLoss: wl }), [wl, lang]);
  const fadeSummary = React.useMemo(
    () => (fade ? summarizeFirstHalfFade({ lang, label: (k) => metricLabel(k, lang), sessionDate: fade.sessionDate, nPlayers: fade.nPlayers, metrics: fade.metrics }) : ""),
    [fade, lang],
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
          {ins ? (
            <span
              title={ins.variant === "gps" ? t.variantGpsHint : t.variantImaHint}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${ins.variant === "gps" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"}`}
            >
              {ins.variant === "gps" ? t.variantGps : t.variantIma}
            </span>
          ) : null}
        </div>
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
            <PanelExplainer id="firstHalf" lang={lang} />
            <SummaryBox text={fadeSummary} lang={lang} />
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
            <PanelExplainer id="winLoss" lang={lang} />
            <SummaryBox text={wlSummary} lang={lang} />
            {!wl || (wl.nWin + wl.nLoss) === 0 ? (
              <p className="mt-2 text-[13px] text-slate-500">{t.wlNone}</p>
            ) : (
              <>
                {!wl.confident ? <p className="mt-1 text-[12px] text-amber-700">{t.wlLow}</p> : null}
                <div className="mt-3 space-y-2">
                  {wlShown.map((m) => {
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
            <PanelExplainer id="correlations" lang={lang} />
            <SummaryBox text={resultSummary} lang={lang} />

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
                {ins?.perMatchStats.available ? (
                  <span className="text-[10px] text-slate-400">
                    {ins.perMatchStats.source}{ins.perMatchStats.lastImport ? ` · ${ins.perMatchStats.lastImport.slice(0, 10)}` : ""}
                  </span>
                ) : null}
              </div>
              <PanelExplainer id="perMatchStats" lang={lang} />
              {ins?.perMatchStats.available ? <SummaryBox text={statsSummary} lang={lang} /> : null}
              {ins && ins.perMatchStats.available ? (
                <>
                  {ins.perMatchStats.matches < MIN_CONFIDENT_CORR_N ? <p className="mt-1 text-[11px] text-amber-700">{t.lowSample}</p> : null}

                  {/* Strongest movement link per team stat. */}
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.statMovement} · {ins.perMatchStats.matches} {t.matches}</div>
                  <div className="mt-1.5 space-y-2.5">
                    {ins.perMatchStats.stats.map((s) => (
                      <div key={s.key}>
                        <div className="text-[11px] font-medium text-slate-500">{statLabel(s.key, lang)}</div>
                        {s.corr.length > 0 ? (
                          <div className="mt-0.5 space-y-1.5">{s.corr.map((c) => <CorrRow key={`${s.key}-${c.key}`} c={c} lang={lang} t={t} />)}</div>
                        ) : <p className="text-[12px] text-slate-400">{t.noCorr}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Full match-by-match team-stat line. */}
                  {ins.perMatchStats.series.length > 0 ? (
                    <>
                      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.perMatchTable}</div>
                      <div className="mt-1 overflow-x-auto">
                        <table className="w-full text-[11px] whitespace-nowrap">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="py-1 pr-2 text-left font-medium">{t.thDate}</th>
                              <th className="pr-2 text-left font-medium">{t.thOpp}</th>
                              {["goals", "xgFor", "xgAgainst", "shots", "shotsOnTargetPct", "possession", "passAccuracyPct", "duelsWonPct", "recoveries"].map((k) => (
                                <th key={k} className="px-2 text-right font-medium">{statShort(k, lang)}</th>
                              ))}
                              <th className="px-2 text-right font-medium" title={t.lmhHint}>{t.thLossLmh}</th>
                              <th className="px-2 text-right font-medium" title={t.lmhHint}>{t.thRecLmh}</th>
                              <th className="pl-2 text-right font-medium">{t.thRes}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ins.perMatchStats.series.map((s) => (
                              <tr key={s.date} className="border-t border-slate-100">
                                <td className="py-1 pr-2 text-slate-600 tabular-nums">{s.date.slice(5)}</td>
                                <td className="pr-2 text-slate-600">{s.opponent ?? "—"}</td>
                                <td className="px-2 text-right tabular-nums text-slate-700">{s.goals ?? "—"}</td>
                                <td className="px-2 text-right tabular-nums font-semibold text-slate-800">{fmt(s.xgFor, 2)}</td>
                                <td className="px-2 text-right tabular-nums text-slate-500">{fmt(s.xgAgainst, 2)}</td>
                                <td className="px-2 text-right tabular-nums text-slate-700">{s.shots ?? "—"}</td>
                                <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.shotsOnTargetPct, 0)}</td>
                                <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.possession, 0)}</td>
                                <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.passAccuracyPct, 0)}</td>
                                <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.duelsWonPct, 0)}</td>
                                <td className="px-2 text-right tabular-nums text-slate-700">{s.recoveries ?? "—"}</td>
                                <td className="px-2 text-right tabular-nums text-slate-500">{lmh(s.lossLow, s.lossMed, s.lossHigh)}</td>
                                <td className="px-2 text-right tabular-nums text-slate-500">{lmh(s.recLow, s.recMed, s.recHigh)}</td>
                                <td className="pl-2 text-right font-semibold">
                                  {s.result ? <span className={s.result === "W" ? "text-emerald-700" : s.result === "L" ? "text-red-700" : "text-slate-500"}>{t.res[s.result] ?? s.result}</span> : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">{ins?.perMatchStats.reason ?? "—"}</p>
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
