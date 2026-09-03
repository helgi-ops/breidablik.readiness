/**
 * Player physical story — the whole-page synthesis for the Power Curve player tab.
 *
 * The manifesto's LAYERED READ applied to the page, not a new metric: it reads the ALREADY-
 * COMPUTED outputs of the cards below (role-demand fit, power curve, season trend, movement
 * signature / style) and composes ONE coherent story so a coach gets the picture in a sentence
 * before drilling in — and it reconciles the apparent contradictions between the cards in plain
 * words. Rules compute — not AI: deterministic sentence templates keyed off the card verdicts.
 * Descriptive — it never touches the readiness colour, the load target, or the daily decision.
 */

export type Bi = { en: string; is: string };
export type Trend = "up" | "flat" | "down";
export type Conf = "high" | "medium" | "low";

export type StoryInput = {
  role?: {
    roleLabel?: Bi | null;
    engineBand?: "elite" | "strong" | "solid" | "developing" | "low" | "unknown";
    driverFit?: "fits" | "stretches" | "mismatch" | "unknown";
    outputRead?: "above" | "at" | "below" | "unknown";
    watch?: Bi[];          // watch-item labels (highest-demand quality he sits below on)
    confidence?: Conf;
    smallGroup?: boolean;  // position norms thin (small squad) → hedge position claims
  } | null;
  powerCurve?: { retentionPct?: number | null; rankPct?: number | null; confidence?: Conf } | null;
  season?: { hsrTrend?: Trend | null; imaTrend?: Trend | null; forward?: number | null; backward?: number | null; lateral?: number | null; confidence?: Conf } | null;
  style?: { label?: "linear" | "balanced" | "multidirectional" | "insufficient" | null; confidence?: Conf } | null;
};

export type StoryFact = { text: Bi; source: Bi; anchor: string };
export type PhysicalStory = {
  hasData: boolean;
  verdict: Bi;
  facts: StoryFact[];
  reconciliations: Bi[];
  confidence: Conf;
  smallGroupNote: Bi | null;
};

// Source tags (bilingual) + the DOM anchor of the card each fact came from.
const SRC = {
  role: { label: { en: "Role-demand fit", is: "Hlutverks-krafa" }, anchor: "pc-role" },
  curve: { label: { en: "Power curve", is: "Afl-kúrfa" }, anchor: "pc-curve" },
  season: { label: { en: "Season trend", is: "Leiktímabils-þróun" }, anchor: "pc-season" },
  movement: { label: { en: "Movement signature", is: "Hreyfi-fingrafar" }, anchor: "pc-movement" },
  style: { label: { en: "Movement style", is: "Hreyfi-stíll" }, anchor: "pc-style" },
} as const;

const CONF_RANK: Record<Conf, number> = { low: 0, medium: 1, high: 2 };
const minConf = (cs: Array<Conf | undefined | null>): Conf => {
  const present = cs.filter((c): c is Conf => !!c);
  if (present.length === 0) return "low";
  return present.reduce((m, c) => (CONF_RANK[c] < CONF_RANK[m] ? c : m), "high" as Conf);
};

const ENGINE_ADJ: Record<string, Bi> = {
  elite: { en: "an elite", is: "framúrskarandi" },
  strong: { en: "a strong, durable", is: "sterka, þolmikla" },
  solid: { en: "a solid", is: "trausta" },
  developing: { en: "a developing", is: "vaxandi" },
  low: { en: "a limited", is: "takmarkaða" },
};

/** durability phrasing from the power-curve retention %. */
function durability(retention: number | null | undefined): Bi | null {
  if (retention == null) return null;
  if (retention >= 55) return { en: "durable endurance engine", is: "þolmikla úthaldsvél" };
  if (retention <= 40) return { en: "front-loaded, explosive engine", is: "framhlaðna, sprengikrafts-vél" };
  return { en: "moderately durable engine", is: "hóflega þolmikla vél" };
}

function dominantDir(s: StoryInput["season"]): { key: "forward" | "backward" | "lateral"; label: Bi } | null {
  if (!s || s.forward == null || s.backward == null || s.lateral == null) return null;
  const arr: Array<{ key: "forward" | "backward" | "lateral"; v: number; label: Bi }> = [
    { key: "forward", v: s.forward, label: { en: "forward", is: "fram" } },
    { key: "backward", v: s.backward, label: { en: "backward", is: "aftur" } },
    { key: "lateral", v: s.lateral, label: { en: "lateral", is: "til hliðar" } },
  ];
  arr.sort((a, b) => b.v - a.v);
  return { key: arr[0].key, label: arr[0].label };
}

const TREND_WORD: Record<Trend, Bi> = {
  up: { en: "trending up", is: "hækkandi" },
  flat: { en: "steady", is: "stöðugt" },
  down: { en: "drifting down", is: "lækkandi" },
};

/** Build the layered physical story. Pure. */
export function buildPhysicalStory(input: StoryInput): PhysicalStory {
  const role = input.role ?? null;
  const pc = input.powerCurve ?? null;
  const season = input.season ?? null;
  const style = input.style ?? null;

  const hasData = !!(role?.engineBand && role.engineBand !== "unknown") || pc?.retentionPct != null || season?.hsrTrend != null || !!(season && dominantDir(season));
  const confidence = minConf([role?.confidence, pc?.confidence, season?.confidence, style?.confidence]);

  // ── Level 0 — one-sentence verdict ──────────────────────────────────────
  const roleEn = role?.roleLabel?.en || "This player";
  const roleIs = role?.roleLabel?.is || "Þessi leikmaður";
  const adj = role?.engineBand && ENGINE_ADJ[role.engineBand] ? ENGINE_ADJ[role.engineBand] : { en: "an", is: "" };
  const dur = durability(pc?.retentionPct) ?? { en: "engine", is: "vél" };
  const styleClause: Bi | null = style?.label === "multidirectional"
    ? { en: " that moves unusually laterally for the role", is: " sem hreyfist óvenju mikið til hliðar miðað við stöðuna" }
    : style?.label === "linear"
      ? { en: ", a straight-line runner", is: ", beinn-línu hlaupari" } : null;
  const outClause: Bi | null = role?.outputRead === "above" ? { en: "turning it into above-usual output", is: "breytir því í yfir-venjulega afköst" }
    : role?.outputRead === "at" ? { en: "at his usual output", is: "á sínum venjulegu afköstum" }
      : role?.outputRead === "below" ? { en: "with output below his usual", is: "með afköst undir venju" } : null;
  const watch0 = role?.watch && role.watch.length ? role.watch[0] : null;
  const watchClause: Bi | null = watch0 ? { en: `with ${watch0.en.toLowerCase()} the thing to build`, is: `með ${watch0.is.toLowerCase()} sem þarf að byggja` } : null;

  const tail = [outClause, watchClause].filter((x): x is Bi => !!x);
  const verdict: Bi = {
    en: `${roleEn} with ${adj.en} ${dur.en}${styleClause ? styleClause.en : ""}${tail.length ? " — " + tail.map((t) => t.en).join(", ") : ""}.`,
    is: `${roleIs} með ${adj.is} ${dur.is}${styleClause ? styleClause.is : ""}${tail.length ? " — " + tail.map((t) => t.is).join(", ") : ""}.`,
  };

  // ── Level 1 — 2–3 supporting facts, priority: watch > durability > shape > trend ──
  const pool: StoryFact[] = [];
  if (watch0) pool.push({
    text: { en: `The base to build is his ${watch0.en.toLowerCase()} — the highest-demand quality he sits below on.`, is: `Grunnurinn sem þarf að byggja er ${watch0.is.toLowerCase()} — mest krafða gæðin sem hann situr undir í.` },
    source: SRC.role.label, anchor: SRC.role.anchor,
  });
  if (pc?.retentionPct != null) pool.push({
    text: {
      en: `Holds ${pc.retentionPct}% of his hardest-minute pace over 5 minutes${pc.rankPct != null ? ` — ${pc.rankPct >= 50 ? "above" : "below"} the squad` : ""}.`,
      is: `Heldur ${pc.retentionPct}% af hörðustu-mínútu ferðinni yfir 5 mínútur${pc.rankPct != null ? ` — ${pc.rankPct >= 50 ? "yfir" : "undir"} liðinu` : ""}.`,
    }, source: SRC.curve.label, anchor: SRC.curve.anchor,
  });
  const dom = dominantDir(season);
  if (dom) pool.push({
    text: {
      en: `Movement is ${dom.label.en}-leaning${style?.label === "multidirectional" ? ", more lateral than typical for the role" : ""}.`,
      is: `Hreyfing hallar ${dom.label.is}${style?.label === "multidirectional" ? ", meira til hliðar en dæmigert fyrir stöðuna" : ""}.`,
    }, source: SRC.movement.label, anchor: SRC.movement.anchor,
  });
  if (season?.hsrTrend) pool.push({
    text: {
      en: `High-speed running is ${TREND_WORD[season.hsrTrend].en} over recent matches${season.imaTrend ? `; accel/decel density ${TREND_WORD[season.imaTrend].en}` : ""}.`,
      is: `Háhraðahlaup er ${TREND_WORD[season.hsrTrend].is} síðustu leiki${season.imaTrend ? `; hröðun/hraðaminnkun þéttleiki ${TREND_WORD[season.imaTrend].is}` : ""}.`,
    }, source: SRC.season.label, anchor: SRC.season.anchor,
  });
  const facts = pool.slice(0, 3);

  // ── Level 2 — reconcile the tensions a coach will notice (each fires only if both sides present) ──
  const reconciliations: Bi[] = [];
  if (style?.label === "multidirectional") reconciliations.push({
    en: "“Multidirectional” vs “straight-line runner”: he positions laterally a lot (covering, shuffling), but when he actually sprints it's straight — both are true, they measure different things.",
    is: "„Fjöl-átta“ vs „beinn-línu hlaupari“: hann staðsetur sig mikið til hliðar (þekja, hliðarskref), en þegar hann tekur sprett er hann beinn — hvort tveggja er rétt, þau mæla ólíka hluti.",
  });
  if (watch0 && (role?.engineBand === "solid" || role?.engineBand === "strong" || role?.engineBand === "elite")) reconciliations.push({
    en: "“Strong engine” + a watch-item: the aerobic base is strong; the gap is the explosive / repeated-sprint base under the peaks — that's the watch-item, not the endurance.",
    is: "„Sterk vél“ + atriði til að fylgjast með: loftháða grunnurinn er sterkur; gatið er sprengikrafts- / endurtekinna-spretta grunnurinn undir toppunum — það er atriðið, ekki úthaldið.",
  });
  if ((role?.outputRead === "at" || role?.outputRead === "above") && season?.hsrTrend === "down") reconciliations.push({
    en: "“At norm output” + HSR drifting down: output is at his usual level; the recent high-speed dip is worth a glance — form or load management, not yet a flag.",
    is: "„Á venjulegum afköstum“ + háhraði lækkandi: afköst eru á venjulegu stigi; nýlega háhraða-dýfan er þess virði að kíkja á — form eða álagsstýring, ekki enn viðvörun.",
  });

  const smallGroupNote: Bi | null = role?.smallGroup
    ? { en: "Position comparisons here are vs a small group (n≈2–3) — read “unusual for the role” as a hint, not a verdict.", is: "Stöðu-samanburður hér er við lítinn hóp (n≈2–3) — lestu „óvenjulegt fyrir stöðuna“ sem vísbendingu, ekki dóm." }
    : null;

  return { hasData, verdict, facts, reconciliations, confidence, smallGroupNote };
}
