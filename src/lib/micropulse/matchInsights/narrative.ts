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

/** Last match's first-half → second-half comparison, per metric (deltaPct < 0 = a 2nd-half drop). */
export type NarrativeFirstHalf = {
  sessionDate: string | null;
  metrics: Array<{ key: string; h1: number | null; h2: number | null; deltaPct: number | null }>;
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
/** A second-half drop is only worth calling out beyond this |Δ%|. */
const FH_MIN_DROP_PCT = 10;
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

  // ── First half vs second half: did they drop off after the break? ──
  if (firstHalf?.sessionDate) {
    const withBoth = firstHalf.metrics.filter((m) => m.h1 != null && m.h2 != null && m.deltaPct != null);
    // The biggest second-half DROP (most negative Δ%) is the fade story.
    const drops = withBoth.filter((m) => (m.deltaPct ?? 0) <= -FH_MIN_DROP_PCT).sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
    if (withBoth.length === 0) {
      // no data → say nothing here
    } else if (drops.length === 0) {
      points.push({
        tone: "pos",
        text: is
          ? `Síðasti leikur (${firstHalf.sessionDate}): hélt fyrri-hálfleiks ákefð inn í seinni hálfleik — ekkert marktækt fall.`
          : `Last match (${firstHalf.sessionDate}): held first-half intensity into the second half — no notable drop-off.`,
      });
    } else {
      const c = drops[0];
      const dropAbs = Math.abs(c.deltaPct ?? 0);
      points.push({
        tone: "neg",
        text: is
          ? `Síðasti leikur (${firstHalf.sessionDate}): ${label(c.key)} féll um ${dropAbs.toFixed(1)}% í seinni hálfleik (${fmt(c.h1, 2)} → ${fmt(c.h2, 2)} á mín).`
          : `Last match (${firstHalf.sessionDate}): ${label(c.key)} fell ${dropAbs.toFixed(1)}% in the second half (${fmt(c.h1, 2)} → ${fmt(c.h2, 2)} per min).`,
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
