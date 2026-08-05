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

/** Only correlations at least this strong are called out in a panel summary. */
const SUMMARY_MIN_R = 0.3;

/** Strip rate/unit suffixes so labels read naturally in prose. */
function plainLabel(s: string): string {
  return s.replace(/\s*\/\s*(min|mín)\b/i, "").replace(/\s*\((?:km\/h|km\/klst)\)/i, "").trim();
}
/** Join a list with commas and a final "and"/"og". */
function joinList(items: string[], lang: Lang): string {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a[0] ?? "";
  const and = lang === "IS" ? " og " : " and ";
  return a.slice(0, -1).join(", ") + and + a[a.length - 1];
}
/** Plain-word strength for a correlation (no r shown to the coach). */
function strengthWord(r: number, lang: Lang): string {
  const a = Math.abs(r);
  if (a >= 0.5) return lang === "IS" ? "sterkt" : "strong";
  if (a >= 0.4) return lang === "IS" ? "nokkuð skýrt" : "fairly clear";
  return lang === "IS" ? "hóflegt" : "moderate";
}

/**
 * Coach-friendly summary of the "What tracks the result?" panel: what winning
 * TENDED to look like, in plain football language — no r values in the prose
 * (strength is put in words), grouped into "won when it did less / more of X",
 * plus the season-xG read, and an honest not-a-cause caveat. Deterministic.
 */
export function summarizeResultCorrelations(input: {
  lang: Lang;
  label: (k: string) => string;
  matches: number;
  result: NarrativeCorr[];
  seasonXg: { available: boolean; correlations: NarrativeCorr[] };
}): string {
  const { lang, label, matches, result, seasonXg } = input;
  const is = lang === "IS";
  const strong = result
    .filter((c) => c.n >= NARRATIVE_MIN_CORR_N && Math.abs(c.r) >= SUMMARY_MIN_R)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  if (!strong.length) {
    if (!result.length) return "";
    return is
      ? `Enn stendur ekkert hreyfimynstur skýrt upp úr á milli sigra og tapa — út frá ${matches} metnum leikjum er munurinn of lítill til að treysta honum. Þetta skerpist eftir því sem fleiri metnir leikir bætast við.`
      : `No running pattern clearly separates your wins from your losses yet — across ${matches} graded matches the difference is too small to trust. It will sharpen as more graded matches come in.`;
  }

  // Positive r = the team did MORE of it in wins; negative = LESS of it in wins.
  const more = strong.filter((c) => c.r > 0).slice(0, 2).map((c) => plainLabel(label(c.key)));
  const less = strong.filter((c) => c.r < 0).slice(0, 3).map((c) => plainLabel(label(c.key)));
  const clauses: string[] = [];
  if (less.length) clauses.push((is ? "minna af " : "less ") + joinList(less, lang));
  if (more.length) clauses.push((is ? "meira af " : "more ") + joinList(more, lang));
  const did = clauses.join(is ? ", og " : ", and ");
  const sw = strengthWord(strong[0].r, lang);

  const sentences: string[] = [];
  sentences.push(is
    ? `Yfir ${matches} metna leiki lítur sigur svona út (mynstur í tölunum, ekki orsök): liðið vann oftar þegar það gerði ${did}. Skýrasta tengslið er ${sw}.`
    : `Across your ${matches} graded matches, this is what winning tended to look like — a pattern in the numbers, not a cause: the team won more often when it did ${did}. The clearest of these is a ${sw} link.`);

  if (seasonXg.available) {
    const sx = seasonXg.correlations
      .filter((c) => c.n >= NARRATIVE_MIN_CORR_N && Math.abs(c.r) >= SUMMARY_MIN_R)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
    if (sx) {
      const pos = sx.r > 0;
      sentences.push(is
        ? `Yfir hópinn skapa leikmenn sem gera ${pos ? "meira" : "minna"} af ${plainLabel(label(sx.key))} að jafnaði ${pos ? "fleiri" : "færri"} færi yfir tímabilið.`
        : `Across the squad, players who do ${pos ? "more" : "less"} ${plainLabel(label(sx.key))} tend to create ${pos ? "more" : "fewer"} chances over the season.`);
    }
  }

  sentences.push(is
    ? `Lestu þetta sem eitthvað til að skoða á æfingum, ekki stýringu — með ${matches} leikjum eru þetta tilhneigingar, ekki sönnun.`
    : `Read this as something to explore in training, not a lever to pull — with ${matches} matches these are tendencies, not proof.`);
  return sentences.join(" ");
}

/**
 * Coach-friendly summary of the "Per-match team stats × movement" panel: how the
 * team's stats tended to line up with how it ran, in plain sentences (no r
 * values), the strongest link per stat, with an honest not-a-cause caveat.
 */
export function summarizeStatMovement(input: {
  lang: Lang;
  statLabel: (k: string) => string;
  moveLabel: (k: string) => string;
  matches: number;
  stats: Array<{ key: string; corr: NarrativeCorr[] }>;
}): string {
  const { lang, statLabel, moveLabel, matches, stats } = input;
  const is = lang === "IS";

  const flat = stats.flatMap((s) =>
    s.corr
      .filter((c) => c.n >= NARRATIVE_MIN_CORR_N && Math.abs(c.r) >= SUMMARY_MIN_R)
      .map((c) => ({ stat: s.key, c })),
  );
  flat.sort((a, b) => Math.abs(b.c.r) - Math.abs(a.c.r));
  // One link per stat, so we describe different parts of the game.
  const seen = new Set<string>();
  const picks: typeof flat = [];
  for (const f of flat) {
    if (seen.has(f.stat)) continue;
    seen.add(f.stat);
    picks.push(f);
    if (picks.length >= 3) break;
  }

  if (!picks.length) {
    return is
      ? `Yfir ${matches} leiki tengist engin tölfræði því hvernig liðið hleypur nógu sterkt til að draga fram enn. Skýrari tengsl gætu komið fram eftir því sem fleiri leikir með gögnum bætast við.`
      : `Across your ${matches} matches, none of the team stats line up strongly enough with how the team ran to call out yet. Clearer links may appear as more matches with data build up.`;
  }

  const clauses = picks.map(({ stat, c }) => {
    const pos = c.r > 0;
    return is
      ? `þegar liðið gerði meira af ${plainLabel(moveLabel(c.key))} hafði það yfirleitt ${pos ? "hærri" : "lægri"} ${plainLabel(statLabel(stat))}`
      : `when the team did more ${plainLabel(moveLabel(c.key))}, it usually had ${pos ? "higher" : "lower"} ${plainLabel(statLabel(stat))}`;
  });
  const lead = is
    ? `Yfir ${matches} leiki tengist hreyfing liðsins tölfræðinni svona: `
    : `Across your ${matches} matches, how the team ran tended to line up with its stats like this: `;
  const caveat = is
    ? " Þetta eru tilhneigingar, ekki orsakir — þess virði að skoða, ekki regla."
    : " These are tendencies, not causes — worth a look, not a rule.";
  return lead + joinList(clauses, lang) + "." + caveat;
}

/**
 * Coach-friendly summary of the "Wins vs losses — movement" panel: what the
 * team's movement looked like in wins vs losses, in plain sentences (effect size
 * in words, no d shown), with the sample honesty and a not-a-recipe caveat.
 */
export function summarizeWinLoss(input: {
  lang: Lang;
  label: (k: string) => string;
  winLoss: {
    nWin: number; nDraw: number; nLoss: number; confident: boolean;
    metrics: Array<{ metric: string; win: { mean: number | null }; loss: { mean: number | null }; cohenD: number | null }>;
  } | null | undefined;
}): string {
  const { lang, label, winLoss } = input;
  const is = lang === "IS";
  if (!winLoss || winLoss.nWin + winLoss.nLoss === 0) return "";
  const { nWin, nLoss } = winLoss;

  const withD = winLoss.metrics
    .filter((m) => m.cohenD != null)
    .sort((a, b) => Math.abs(b.cohenD ?? 0) - Math.abs(a.cohenD ?? 0));
  const meaningful = withD.filter((m) => Math.abs(m.cohenD ?? 0) >= 0.5);

  if (!meaningful.length) {
    return is
      ? `Þegar bornir eru saman ${nWin} sigrar og ${nLoss} töp lítur hreyfing liðsins nokkuð svipað út — ekkert skilur skýrt á milli enn. Mynstur gæti komið fram þegar fleiri leikir bætast við.`
      : `Comparing your ${nWin} wins with your ${nLoss} losses, the team's movement looks broadly similar — nothing separates them clearly yet. A pattern may emerge as more matches come in.`;
  }

  const higherWins = meaningful.filter((m) => (m.cohenD ?? 0) > 0).slice(0, 3).map((m) => plainLabel(label(m.metric)));
  const higherLoss = meaningful.filter((m) => (m.cohenD ?? 0) < 0).slice(0, 3).map((m) => plainLabel(label(m.metric)));
  const clauses: string[] = [];
  if (higherWins.length) clauses.push((is ? "í sigrum gerði liðið meira af " : "in wins the team did more ") + joinList(higherWins, lang));
  if (higherLoss.length) clauses.push((is ? "í töpum meira af " : "in losses, more ") + joinList(higherLoss, lang));

  const top = meaningful[0];
  const mag = magnitude(top.cohenD ?? 0, lang);
  const higherInWins = (top.cohenD ?? 0) > 0;

  const sentences: string[] = [];
  sentences.push(is
    ? `Þegar bornir eru saman ${nWin} sigrar og ${nLoss} töp: ${joinList(clauses, lang)}.`
    : `Comparing your ${nWin} wins with your ${nLoss} losses: ${joinList(clauses, lang)}.`);
  sentences.push(is
    ? `Mesti munurinn er ${plainLabel(label(top.metric))} — ${mag} munur, hærra í ${higherInWins ? "sigrum" : "töpum"}.`
    : `The biggest difference is ${plainLabel(label(top.metric))} — a ${mag} gap, higher in ${higherInWins ? "wins" : "losses"}.`);
  if (!winLoss.confident) {
    sentences.push(is
      ? `Með aðeins ${nLoss} ${nLoss === 1 ? "tap" : "töp"} er þetta snemmbúinn lestur sem skerpist með fleiri leikjum.`
      : `With only ${nLoss} ${nLoss === 1 ? "loss" : "losses"} this is an early read that should firm up with more matches.`);
  }
  sentences.push(is
    ? "Þetta lýsir því hvernig sigrar og töp litu út — ekki uppskrift að sigri."
    : "This describes what your wins and losses looked like — not a recipe for winning.");
  return sentences.join(" ");
}

/**
 * Coach-friendly summary of the "First half vs second half" panel: did the team
 * fade after the break, and in what — plain sentences, % drops named, one-match
 * snapshot caveat. Deterministic.
 */
export function summarizeFirstHalfFade(input: {
  lang: Lang;
  label: (k: string) => string;
  sessionDate: string | null;
  nPlayers: number;
  metrics: Array<{ key: string; h1: number | null; h2: number | null; deltaPct: number | null }>;
}): string {
  const { lang, label, sessionDate, nPlayers, metrics } = input;
  const is = lang === "IS";
  const withBoth = metrics.filter((m) => m.h1 != null && m.h2 != null && m.deltaPct != null);
  if (!sessionDate || !withBoth.length) return "";

  const drops = withBoth.filter((m) => (m.deltaPct ?? 0) <= -8).sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0)).slice(0, 3);
  const rose = withBoth.filter((m) => (m.deltaPct ?? 0) >= 8).sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))[0];
  const pct = (m: { deltaPct: number | null }) => Math.round(Math.abs(m.deltaPct ?? 0));

  const lead = is
    ? `Í síðasta leik (${sessionDate}, ${nPlayers} ${nPlayers === 1 ? "leikmaður" : "leikmenn"} sem spiluðu báða hálfleiki) er hér fyrri hálfleikur á móti þeim seinni.`
    : `In your last match (${sessionDate}, ${nPlayers} ${nPlayers === 1 ? "player" : "players"} who played both halves), here's the first half versus the second.`;

  const sentences: string[] = [lead];
  if (drops.length) {
    const worst = pct(drops[0]);
    const band = worst >= 20 ? (is ? "skýrt fall í seinni hálfleik" : "a clear second-half fade")
      : worst >= 12 ? (is ? "áberandi dýfa eftir hlé" : "a noticeable dip after the break")
      : (is ? "væg dýfa eftir hlé" : "a slight dip after the break");
    const dropBits = drops.map((m) => is
      ? `${plainLabel(label(m.key))} (−${pct(m)}%)`
      : `${plainLabel(label(m.key))} (down ${pct(m)}%)`);
    sentences.push(is
      ? `Mest datt niður í ${joinList(dropBits, lang)} — ${band}${rose ? `, á meðan ${plainLabel(label(rose.key))} hækkaði (+${pct(rose)}%)` : ""}.`
      : `Output dropped most in ${joinList(dropBits, lang)} — ${band}${rose ? `, while ${plainLabel(label(rose.key))} rose (+${pct(rose)}%)` : ""}.`);
  } else {
    sentences.push(is
      ? "Liðið hélt — eða bætti — fyrri-hálfleiks stig sitt inn í seinni hálfleik; ekkert marktækt fall."
      : "The team held — or lifted — its first-half level into the second; no meaningful drop-off.");
  }
  sentences.push(is
    ? "Þetta er einn leikur, svo lestu sem augnabliksmynd; „Per leikmann“ sýnir hver dró það."
    : "It's a single match, so read it as a snapshot; the per-player view shows who drove it.");
  return sentences.join(" ");
}
