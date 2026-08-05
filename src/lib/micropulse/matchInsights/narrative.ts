/**
 * Match Insights — plain-language narrative ("what does this mean?").
 *
 * Pure, IO-free. Turns the computed win/loss effect sizes, result/xG correlations
 * and the last match's first-half comparison into a short, cited read a non-S&C
 * coach can act on. It is the explainability layer of Match Insights: RULES decide
 * the numbers, this only EXPLAINS them (manifesto §"Rules decide; AI explains").
 *
 * Every sentence is generated deterministically from the numbers and carries its
 * own evidence (Cohen's d, r, n, Δ%) — nothing is inferred beyond what the stats
 * say, and it is framed as association, never causation or prediction. It never
 * touches the readiness verdict.
 *
 * Bilingual via a `label(key)` callback (so it reuses the page's metric labels)
 * and an explicit `lang`. Effect-size wording follows Cohen (1988): |d| 0.2 small,
 * 0.5 medium, 0.8 large.
 */

export type Lang = "EN" | "IS";

/** The win/loss facts the narrative needs — a structural subset of WinLossResult
 *  (no `draw` on metrics), so the page's loose response shape satisfies it too. */
export type NarrativeWinLoss = {
  nWin: number;
  nDraw: number;
  nLoss: number;
  confident: boolean;
  metrics: Array<{
    metric: string;
    win: { mean: number | null };
    loss: { mean: number | null };
    cohenD: number | null;
    deltaPct: number | null;
  }>;
};

/** A single correlation as surfaced by the API (result or season-xG). */
export type NarrativeCorr = { key: string; r: number; n: number; strength: string; direction: string };

/** One first-half metric comparison (last match vs prior matches). */
export type NarrativeFirstHalf = {
  latestDate: string | null;
  compares: Array<{ key: string; latest: number | null; priorMean: number | null; z: number | null; deltaPct: number | null; nPrior: number }>;
};

export type NarrativeInput = {
  lang: Lang;
  /** Metric key → human label in the active language. */
  label: (key: string) => string;
  winLoss: NarrativeWinLoss | null | undefined;
  resultCorrelations: NarrativeCorr[];
  seasonXg: { available: boolean; correlations: NarrativeCorr[] };
  firstHalf: NarrativeFirstHalf | null | undefined;
};

export type NarrativeTone = "pos" | "neg" | "neutral" | "caveat";
export type NarrativePoint = { text: string; tone: NarrativeTone };
export type MatchNarrative = { headline: string; points: NarrativePoint[] };

/** Correlations below this n are treated as small-sample (kept in sync with the page). */
export const NARRATIVE_MIN_CORR_N = 10;
/** A first-half move is only worth calling out beyond this |Δ%| or |z|. */
const FH_MIN_DELTA_PCT = 8;
const FH_MIN_Z = 1;
/** Only win/loss gaps at least this size (Cohen's d) are called out. */
const WL_MIN_D = 0.5;

function magnitude(d: number, lang: Lang): string {
  const a = Math.abs(d);
  if (a >= 0.8) return lang === "IS" ? "stórt" : "large";
  if (a >= 0.5) return lang === "IS" ? "miðlungs" : "moderate";
  return lang === "IS" ? "lítið" : "small";
}
function fmt(n: number | null | undefined, d = 1): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);
}
function signPct(n: number | null): string {
  return n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/**
 * Build the narrative. Returns a headline + ordered, tone-tagged sentences.
 * Empty `points` with a headline is a valid honest state ("not enough graded
 * matches yet").
 */
export function buildMatchNarrative(input: NarrativeInput): MatchNarrative {
  const { lang, label, winLoss, resultCorrelations, seasonXg, firstHalf } = input;
  const is = lang === "IS";
  const points: NarrativePoint[] = [];

  const nWin = winLoss?.nWin ?? 0;
  const nLoss = winLoss?.nLoss ?? 0;
  const nDraw = winLoss?.nDraw ?? 0;
  const confident = winLoss?.confident ?? false;
  const graded = nWin + nDraw + nLoss;

  // ── Headline: the sample behind everything below. ──
  const headline = is
    ? graded === 0
      ? "Engir metnir leikir enn — skráðu úrslit til að fá lestur."
      : `Byggt á ${graded} metnum ${graded === 1 ? "leik" : "leikjum"} (${nWin} sigrar · ${nDraw} jafntefli · ${nLoss} töp)${confident ? "" : " — enn fá sýni, lestu sem vísbendingu"}.`
    : graded === 0
      ? "No graded matches yet — enter scores to get a read."
      : `Based on ${graded} graded ${graded === 1 ? "match" : "matches"} (${nWin} W · ${nDraw} D · ${nLoss} L)${confident ? "" : " — still a small sample, read as a hint"}.`;

  // ── First half: how did the last match's first half compare? ──
  if (firstHalf?.latestDate) {
    const candidates = firstHalf.compares
      .filter((c) => c.latest != null && c.priorMean != null && c.nPrior >= 2 && c.deltaPct != null)
      .filter((c) => Math.abs(c.deltaPct ?? 0) >= FH_MIN_DELTA_PCT || Math.abs(c.z ?? 0) >= FH_MIN_Z)
      .sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0));
    if (candidates.length === 0) {
      points.push({
        tone: "neutral",
        text: is
          ? `Síðasti leikur (${firstHalf.latestDate}): fyrri hálfleikur var í takti við fyrri leiki — engin stór frávik.`
          : `Last match (${firstHalf.latestDate}): the first half was in line with prior matches — no big swings.`,
      });
    } else {
      const c = candidates[0];
      const up = (c.deltaPct ?? 0) >= 0;
      const zTxt = c.z != null ? (is ? `, z=${fmt(c.z, 1)}` : `, z=${fmt(c.z, 1)}`) : "";
      points.push({
        tone: up ? "pos" : "neg",
        text: is
          ? `Síðasti leikur (${firstHalf.latestDate}): ${label(c.key)} í fyrri hálfleik var ${signPct(c.deltaPct)} ${up ? "yfir" : "undir"} venju fyrri leikja (${fmt(c.latest, 2)} vs ${fmt(c.priorMean, 2)}${zTxt}).`
          : `Last match (${firstHalf.latestDate}): first-half ${label(c.key)} was ${signPct(c.deltaPct)} ${up ? "above" : "below"} the prior-match norm (${fmt(c.latest, 2)} vs ${fmt(c.priorMean, 2)}${zTxt}).`,
      });
    }
  }

  // ── Wins vs losses: the metrics that separate them most. ──
  const wlTop = (winLoss?.metrics ?? [])
    .filter((m) => m.cohenD != null && Math.abs(m.cohenD) >= WL_MIN_D)
    .slice(0, 2);
  if (graded > 0) {
    if (wlTop.length === 0) {
      points.push({
        tone: "neutral",
        text: is
          ? "Enginn hreyfi-mælikvarði skilur enn skýrt á milli sigra og tapa."
          : "No movement metric clearly separates wins from losses yet.",
      });
    } else {
      for (const m of wlTop) {
        const higherWins = (m.cohenD ?? 0) >= 0;
        const mag = magnitude(m.cohenD ?? 0, lang);
        const tentative = !confident;
        points.push({
          tone: higherWins ? "pos" : "neg",
          text: is
            ? `${tentative ? "Vísbending: " : ""}${label(m.metric)} var ${higherWins ? "hærra í sigrum" : "hærra í töpum"} — S ${fmt(m.win.mean, 1)} vs T ${fmt(m.loss.mean, 1)} (${mag} munur, d=${fmt(m.cohenD, 2)}).`
            : `${tentative ? "Early signal: " : ""}${label(m.metric)} was ${higherWins ? "higher in wins" : "higher in losses"} — W ${fmt(m.win.mean, 1)} vs L ${fmt(m.loss.mean, 1)} (${mag} gap, d=${fmt(m.cohenD, 2)}).`,
        });
      }
    }
  }

  // ── Correlation: the strongest result link that clears the n floor. ──
  const topResultCorr = resultCorrelations
    .filter((c) => c.n >= NARRATIVE_MIN_CORR_N && Math.abs(c.r) >= 0.4)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  if (topResultCorr) {
    const pos = topResultCorr.direction === "positive";
    points.push({
      tone: pos ? "pos" : "neg",
      text: is
        ? `Yfir leikina fylgdi ${pos ? "meira" : "minna"} af ${label(topResultCorr.key)} betri úrslitum (r=${fmt(topResultCorr.r, 2)}, n=${topResultCorr.n}).`
        : `Across matches, ${pos ? "more" : "less"} ${label(topResultCorr.key)} went with better results (r=${fmt(topResultCorr.r, 2)}, n=${topResultCorr.n}).`,
    });
  } else if (resultCorrelations.length > 0) {
    points.push({
      tone: "neutral",
      text: is
        ? "Fylgni við úrslit er enn of fá-sýni til að treysta."
        : "Result correlations are still too small-sample to trust.",
    });
  }

  // ── Season xG: the strongest movement↔xG link that clears the n floor. ──
  const topXg = seasonXg.available
    ? seasonXg.correlations.filter((c) => c.n >= NARRATIVE_MIN_CORR_N && Math.abs(c.r) >= 0.4).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]
    : undefined;
  if (topXg) {
    const pos = topXg.direction === "positive";
    points.push({
      tone: "neutral",
      text: is
        ? `Leikmenn með ${pos ? "meira" : "minna"} af ${label(topXg.key)} höfðu að jafnaði ${pos ? "hærra" : "lægra"} season-xG (r=${fmt(topXg.r, 2)}, n=${topXg.n}).`
        : `Players with ${pos ? "more" : "less"} ${label(topXg.key)} tended to carry ${pos ? "higher" : "lower"} season xG (r=${fmt(topXg.r, 2)}, n=${topXg.n}).`,
    });
  }

  // ── Closing caveat: always present, so the read can't be over-claimed. ──
  points.push({
    tone: "caveat",
    text: is
      ? "Þetta les þín eigin gögn — fylgni, ekki orsök eða spá. Það breytir aldrei readiness-dómnum."
      : "This reads your own data — associations, not cause or prediction. It never changes a readiness verdict.",
  });

  return { headline, points };
}
