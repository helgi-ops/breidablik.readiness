/**
 * Pre-match Opponent Scouting report — pure, IO-free.
 *
 * Turns a scouted opponent's own-season Wyscout profile (+ its match list, +
 * optional players) into a plain-language pre-match plan: how they play, where
 * they hurt you, how to hurt them. Benchmarked against the league average AND the
 * coach's own team. Rules compute the facts; every flag records the numbers that
 * triggered it, and every recommendation cites its signal and is coach-overridable.
 *
 * Descriptive context only — it never touches the readiness colour, the daily
 * decision, or the training recommendation. v1 = Wyscout Team → Stats Excel only
 * (no Data API / video). Thresholds are constants at the top; tweak here.
 */

// ── Thresholds (all editable; every derived flag cites the number it used) ─────
export const T = {
  possHigh: 55, possLow: 45,          // possession %
  ppdaPress: 1.5,                     // PPDA below league − this = high press (lower PPDA = more pressing)
  directFinalThird: 1.0,              // passes-to-final-third ratio vs league to call "direct/territorial"
  outlier: 0.15,                      // ±15% vs league to flag a strength/weakness
  defDuelLow: 48,                     // defensive-duels won % below this = beatable 1v1
  crossThreatHi: 18,                  // opponent crosses/match above this = cross-heavy
  formMatches: 5,
  xgDrift: 0.25,                      // season xG-diff vs last-5 xG-diff gap to call rising/falling
};

export type Metrics = {
  xgf: number | null; xga: number | null; gf: number | null; ga: number | null;
  shots: number | null; shotsAgainst: number | null; possession: number | null;
  ppda: number | null; defDuelsWonPct: number | null;
  forwardPasses: number | null; forwardPassAccPct: number | null;
  passesFinalThird: number | null; passesFinalThirdAccPct: number | null;
  progressivePasses: number | null; smartPasses: number | null; smartPassAccPct: number | null;
  crosses: number | null; crossAccPct: number | null;
  positionalAttacks: number | null; counterattacks: number | null; offensiveDuelsWonPct: number | null;
};
export type TeamProfile = { name: string; matches: number; m: Metrics };
export type ScoutMatch = { date: string; opponent: string | null; isHome: boolean | null; goals: number | null; goalsAgainst: number | null; xg: number | null; xgAgainst: number | null; result: "W" | "D" | "L" | null };
export type ScoutPlayerRow = { name: string; position: string | null; minutes: number | null; goals: number | null; xg: number | null; assists: number | null; xa: number | null; receivedPasses: number | null };

/** A number with the reference it's judged against (for the "cite the signal" rule). */
export type Cited = { metric: string; value: number | null; league?: number | null; own?: number | null };
export type Bi = { en: string; is: string };
export type Recommendation = { id: string; text: Bi; signal: Cited };
export type Block = { verdict: Bi; facts: Cited[]; flags: string[] };

export type OpponentReport = {
  opponent: string; season: string; matches: number;
  record?: { w: number; d: number; l: number };
  identity: Block;
  attack: Block;
  defend: Block & { recommendations: Recommendation[] };
  setPieces: Block;
  keyPlayers: { available: boolean; topScorers: ScoutPlayerRow[]; topAssist: ScoutPlayerRow[]; mostTargeted: ScoutPlayerRow | null; verdict: Bi };
  matchup: { rows: Array<{ metric: string; them: number | null; you: number | null; delta: number | null; theyBetter: boolean | null }>; verdict: Bi };
  form: { last: ScoutMatch[]; trend: "rising" | "falling" | "steady"; verdict: Bi };
  confidence: { matches: number; hasPassing: boolean; hasAttacking: boolean; hasPlayers: boolean };
};

const has = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const r1 = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10);
const pct = (v: number | null): number | null => (v == null ? null : Math.round(v));
/** relative position vs a reference: >1 = above, <1 = below. null-safe. */
const rel = (v: number | null, ref: number | null | undefined): number | null =>
  has(v) && has(ref) && ref !== 0 ? v / ref : null;
/** verdict-string number formatting: 1 decimal for rates, integer for whole values. */
const nd = (v: number | null, d = 1): string => (v == null ? "—" : v.toFixed(d));
const ni = (v: number | null): string => (v == null ? "—" : String(Math.round(v)));

function bi(en: string, is: string): Bi { return { en, is }; }

// ── Block 1: identity / style ─────────────────────────────────────────────────
function identity(o: Metrics, lg: Metrics): Block {
  const flags: string[] = [];
  const facts: Cited[] = [
    { metric: "possession", value: r1(o.possession), league: r1(lg.possession) },
    { metric: "ppda", value: r1(o.ppda), league: r1(lg.ppda) },
    { metric: "passesFinalThird", value: r1(o.passesFinalThird), league: r1(lg.passesFinalThird) },
  ];
  const possDom = has(o.possession) && o.possession >= T.possHigh;
  const possLow = has(o.possession) && o.possession <= T.possLow;
  if (possDom) flags.push("possession_dominant");
  if (possLow) flags.push("direct_low_possession");
  // Lower PPDA than league (by margin) = high press.
  const highPress = has(o.ppda) && has(lg.ppda) && o.ppda <= lg.ppda - T.ppdaPress;
  const passive = has(o.ppda) && has(lg.ppda) && o.ppda >= lg.ppda + T.ppdaPress;
  if (highPress) flags.push("high_press");
  if (passive) flags.push("passive_block");

  const enParts: string[] = [];
  const isParts: string[] = [];
  if (possDom) { enParts.push("dominate the ball"); isParts.push("ráða boltanum"); }
  else if (possLow) { enParts.push("play direct, without much of the ball"); isParts.push("spila beint, með lítinn bolta"); }
  else if (has(o.possession)) { enParts.push("share possession"); isParts.push("deila boltanum"); }
  if (highPress) { enParts.push("press high"); isParts.push("pressa hátt"); }
  else if (passive) { enParts.push("sit off in a block"); isParts.push("sitja í blokk"); }
  // If possession is unknown and press is neutral, lead from the build-up instead of guessing.
  if (enParts.length === 0) { enParts.push("press at a league-average rate"); isParts.push("pressa á svipuðum takti og deildin"); }

  // Build-up level vs the league (final-third entries) — adds a real second sentence.
  const bu = rel(o.passesFinalThird, lg.passesFinalThird);
  let buEn = "", buIs = "";
  if (bu != null) {
    const wEn = bu < 0.9 ? "below" : bu > 1.1 ? "above" : "around";
    const wIs = bu < 0.9 ? "undir" : bu > 1.1 ? "yfir" : "við";
    buEn = ` Their build-up runs ${wEn} the league on final-third entries (${nd(o.passesFinalThird)} vs ${nd(lg.passesFinalThird)}).`;
    buIs = ` Uppbyggingin er ${wIs} deild í lokaþriðjungs-sendingum (${nd(o.passesFinalThird)} á móti ${nd(lg.passesFinalThird)}).`;
  }
  const tail = has(o.possession)
    ? { en: ` (${pct(o.possession)}% possession, PPDA ${nd(o.ppda)})`, is: ` (${pct(o.possession)}% boltahald, PPDA ${nd(o.ppda)})` }
    : has(o.ppda) ? { en: ` (PPDA ${nd(o.ppda)})`, is: ` (PPDA ${nd(o.ppda)})` } : { en: "", is: "" };
  const verdict = bi(
    `They ${enParts.join(" and ")}${tail.en}.${buEn}`,
    `Þeir ${isParts.join(" og ")}${tail.is}.${buIs}`,
  );
  return { verdict, facts, flags };
}

// ── Block 2: how they attack ──────────────────────────────────────────────────
function attack(o: Metrics, lg: Metrics): Block {
  const flags: string[] = [];
  const facts: Cited[] = [
    { metric: "xgf", value: r1(o.xgf), league: r1(lg.xgf) },
    { metric: "shots", value: r1(o.shots), league: r1(lg.shots) },
    { metric: "crosses", value: r1(o.crosses), league: r1(lg.crosses) },
  ];
  const crossHeavy = has(o.crosses) && (o.crosses >= T.crossThreatHi || (rel(o.crosses, lg.crosses) ?? 0) >= 1 + T.outlier);
  const lineBreaking = (rel(o.smartPasses, lg.smartPasses) ?? 0) >= 1 + T.outlier;
  const boxThreat = (rel(o.positionalAttacks, lg.positionalAttacks) ?? 0) >= 1 + T.outlier;
  const counter = (rel(o.counterattacks, lg.counterattacks) ?? 0) >= 1 + T.outlier;
  const strongAttack = (rel(o.xgf, lg.xgf) ?? 0) >= 1 + T.outlier;
  if (crossHeavy) flags.push("threat_crosses");
  if (lineBreaking) flags.push("threat_line_breaking");
  if (boxThreat) flags.push("threat_positional");
  if (counter) flags.push("threat_counter");
  if (strongAttack) flags.push("strong_attack");

  const shyAttack = (rel(o.xgf, lg.xgf) ?? 1) <= 1 - T.outlier;
  const route = crossHeavy ? bi("crosses into the box", "fyrirgjöfum í teiginn")
    : counter ? bi("quick counterattacks", "hröðum skyndisóknum")
    : lineBreaking ? bi("line-breaking passes through the middle", "línubrjótandi sendingum í gegnum miðjuna")
    : boxThreat ? bi("sustained positional attacks", "þrálátum staðsóknum")
    : bi("a spread of sources rather than one clear route", "dreifðum uppsprettum fremur en einni skýrri leið");
  const lead = bi(
    strongAttack ? "A dangerous attack" : shyAttack ? "A shy attack" : "A moderate attack",
    strongAttack ? "Hættuleg sókn" : shyAttack ? "Dauf sókn" : "Miðlungs sókn",
  );
  // Second sentence: shot volume + creation level vs the league.
  let vol = { en: "", is: "" };
  if (has(o.shots)) {
    const sw = (rel(o.shots, lg.shots) ?? 1);
    const swEn = sw < 0.9 ? "below" : sw > 1.1 ? "above" : "around";
    const swIs = sw < 0.9 ? "undir" : sw > 1.1 ? "yfir" : "við";
    const cr = (rel(o.xgf, lg.xgf) ?? 1);
    const crEn = cr < 0.9 ? "under" : cr > 1.1 ? "over" : "at";
    const crIs = cr < 0.9 ? "undir" : cr > 1.1 ? "yfir" : "við";
    vol = {
      en: ` They take ${nd(o.shots)} shots/match (${swEn} the league) and create ${crEn} the league on xG.`,
      is: ` Þeir taka ${nd(o.shots)} skot/leik (${swIs} deild) og skapa ${crIs} deildar-meðaltal á xG.`,
    };
  }
  const verdict = bi(
    `${lead.en} — most threat comes from ${route.en}${has(o.xgf) ? ` (${nd(o.xgf)} xG/match)` : ""}.${vol.en}`,
    `${lead.is} — mesta ógnin kemur frá ${route.is}${has(o.xgf) ? ` (${nd(o.xgf)} xG/leik)` : ""}.${vol.is}`,
  );
  return { verdict, facts, flags };
}

// ── Block 3: how they defend — where to hurt them ─────────────────────────────
function defend(o: Metrics, lg: Metrics): Block & { recommendations: Recommendation[] } {
  const flags: string[] = [];
  const recs: Recommendation[] = [];
  const facts: Cited[] = [
    { metric: "xga", value: r1(o.xga), league: r1(lg.xga) },
    { metric: "shotsAgainst", value: r1(o.shotsAgainst), league: r1(lg.shotsAgainst) },
    { metric: "defDuelsWonPct", value: pct(o.defDuelsWonPct), league: pct(lg.defDuelsWonPct) },
  ];
  const leaky = (rel(o.xga, lg.xga) ?? 0) >= 1 + T.outlier;
  // Conceding many shots is a defensive weakness even when xGA sits near the league mean.
  const shipsShots = (rel(o.shotsAgainst, lg.shotsAgainst) ?? 0) >= 1.1;
  // Weak in duels if below an absolute floor OR clearly under the league.
  const weakDuels = has(o.defDuelsWonPct) &&
    (o.defDuelsWonPct < T.defDuelLow || (has(lg.defDuelsWonPct) && o.defDuelsWonPct <= lg.defDuelsWonPct - 3));
  const highLine = has(o.ppda) && has(lg.ppda) && o.ppda <= lg.ppda - T.ppdaPress; // presses high → space in behind
  const beatable = leaky || shipsShots || weakDuels;
  if (leaky) flags.push("concedes_high_xga");
  if (shipsShots) flags.push("concedes_many_shots");
  if (weakDuels) flags.push("weak_def_duels");
  if (highLine) flags.push("high_line");

  if (highLine) recs.push({ id: "in_behind", text: bi("They press high — play balls in behind their line.", "Þeir pressa hátt — spilaðu bolta á bak við vörnina."), signal: { metric: "ppda", value: r1(o.ppda), league: r1(lg.ppda) } });
  if (leaky || shipsShots) recs.push({ id: "attack_channels", text: bi("They give up a lot of shots — attack the channels in volume and get early balls into the box.", "Þeir gefa frá sér mörg skot — sæktu rásirnar í magni og komdu boltanum snemma í teiginn."), signal: { metric: "shotsAgainst", value: r1(o.shotsAgainst), league: r1(lg.shotsAgainst) } });
  if (weakDuels) recs.push({ id: "take_them_on", text: bi("They lose a lot of defensive duels — take defenders on around the box.", "Þeir tapa mörgum varnareinvígjum — taktu varnarmenn á í og við teiginn."), signal: { metric: "defDuelsWonPct", value: pct(o.defDuelsWonPct), league: pct(lg.defDuelsWonPct) } });
  if (recs.length === 0) recs.push({ id: "solid", text: bi("No obvious defensive weakness in the data — patience and quality in the final third.", "Enginn augljós varnarveikleiki í gögnunum — þolinmæði og gæði á lokaþriðjungi."), signal: { metric: "xga", value: r1(o.xga), league: r1(lg.xga) } });

  // Verdict weaves in whichever numbers fired the flag.
  const bits: { en: string; is: string }[] = [];
  if (shipsShots && has(o.shotsAgainst)) bits.push({ en: `${nd(o.shotsAgainst)} shots/match conceded (vs ${nd(lg.shotsAgainst)} league)`, is: `${nd(o.shotsAgainst)} skot/leik á móti (deild ${nd(lg.shotsAgainst)})` });
  if (leaky && has(o.xga)) bits.push({ en: `${nd(o.xga)} xG against (vs ${nd(lg.xga)})`, is: `${nd(o.xga)} xG á móti (deild ${nd(lg.xga)})` });
  if (weakDuels && has(o.defDuelsWonPct)) bits.push({ en: `only ${ni(o.defDuelsWonPct)}% of defensive duels won`, is: `aðeins ${ni(o.defDuelsWonPct)}% varnareinvígja unnin` });
  const detailEn = bits.length ? ` — ${bits.map((b) => b.en).join(", ")}.` : ".";
  const detailIs = bits.length ? ` — ${bits.map((b) => b.is).join(", ")}.` : ".";
  const verdict = bi(
    beatable ? `Beatable at the back${detailEn}` : `Hard to break down — few chances conceded (${nd(o.xga)} xG against vs ${nd(lg.xga)}).`,
    beatable ? `Hægt að vinna á vörninni${detailIs}` : `Erfitt að brjóta niður — fá færi gefin (${nd(o.xga)} xG á móti á móti ${nd(lg.xga)}).`,
  );
  return { verdict, facts, flags, recommendations: recs };
}

// ── Block 4: set pieces ───────────────────────────────────────────────────────
function setPieces(o: Metrics, lg: Metrics): Block {
  // v1: proxy from goals vs xG overperformance (finishing) as a weak set-piece signal.
  const flags: string[] = [];
  const finishing = has(o.gf) && has(o.xgf) ? o.gf - o.xgf : null;
  const overFinish = has(finishing) && finishing >= 0.25;
  if (overFinish) flags.push("clinical_finishing");
  const facts: Cited[] = [
    { metric: "finishing", value: r1(finishing), league: 0 },
    { metric: "gf", value: r1(o.gf), league: r1(lg.gf) },
  ];
  const verdict = bi(
    overFinish ? "They finish above their chances — respect their delivery and second balls." : "Set-piece detail needs the Wyscout Data API (v2); no strong flag from the season totals.",
    overFinish ? "Þeir klára umfram færin — virtu sendingar og lausa bolta." : "Fastaleikja-smáatriði þarfnast Wyscout Data API (v2); ekkert sterkt merki úr árstölunum.",
  );
  return { verdict, facts, flags };
}

// ── Block 5: key players ──────────────────────────────────────────────────────
function keyPlayers(players: ScoutPlayerRow[]): OpponentReport["keyPlayers"] {
  const withMin = players.filter((p) => has(p.minutes) && (p.minutes ?? 0) > 0);
  const topScorers = [...withMin].filter((p) => has(p.goals)).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0)).slice(0, 3);
  const topAssist = [...withMin].filter((p) => has(p.assists) || has(p.xa)).sort((a, b) => ((b.assists ?? b.xa ?? 0)) - ((a.assists ?? a.xa ?? 0))).slice(0, 3);
  const per90 = (p: ScoutPlayerRow) => (has(p.receivedPasses) && has(p.minutes) && p.minutes! > 0 ? (p.receivedPasses! / p.minutes!) * 90 : null);
  const mostTargeted = withMin.filter((p) => per90(p) != null).sort((a, b) => (per90(b) ?? 0) - (per90(a) ?? 0))[0] ?? null;
  const top = topScorers[0];
  const verdict = players.length === 0
    ? bi("No player export uploaded — add a Wyscout Advanced Search export for key players.", "Enginn leikmanna-útflutningur — bættu við Wyscout Advanced Search skrá fyrir lykilmenn.")
    : bi(
        `Stop ${top ? top.name : "their most-targeted forward"}${top && has(top.goals) ? ` (${top.goals} goals)` : ""}.`,
        `Stöðvaðu ${top ? top.name : "mest-notaða framherjann"}${top && has(top.goals) ? ` (${top.goals} mörk)` : ""}.`,
      );
  return { available: players.length > 0, topScorers, topAssist, mostTargeted, verdict };
}

// ── Block 6: matchup (them vs you) ────────────────────────────────────────────
const MATCHUP_KEYS: Array<{ metric: string; higherBetter: boolean }> = [
  { metric: "xgf", higherBetter: true }, { metric: "xga", higherBetter: false },
  { metric: "possession", higherBetter: true }, { metric: "ppda", higherBetter: false },
  { metric: "defDuelsWonPct", higherBetter: true }, { metric: "shots", higherBetter: true },
];
function matchup(o: Metrics, you: Metrics): OpponentReport["matchup"] {
  const rows = MATCHUP_KEYS.map(({ metric, higherBetter }) => {
    const them = (o as unknown as Record<string, number | null>)[metric] ?? null;
    const yr = (you as unknown as Record<string, number | null>)[metric] ?? null;
    const delta = has(them) && has(yr) ? r1(them - yr) : null;
    const theyBetter = has(delta) ? (higherBetter ? them! > yr! : them! < yr!) : null;
    return { metric, them: r1(them), you: r1(yr), delta, theyBetter };
  });
  const edges = rows.filter((r) => r.theyBetter === false).length; // where YOU are better
  const verdict = bi(
    `You are better on ${edges} of ${rows.filter((r) => r.theyBetter != null).length} compared measures — lean on those.`,
    `Þú ert betri á ${edges} af ${rows.filter((r) => r.theyBetter != null).length} bornum mælikvörðum — nýttu það.`,
  );
  return { rows, verdict };
}

// ── Block 7: form ─────────────────────────────────────────────────────────────
function form(matches: ScoutMatch[]): OpponentReport["form"] {
  const sorted = [...matches].filter((m) => m.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted.slice(0, T.formMatches);
  const seasonXgDiff = mean(matches.map((m) => (has(m.xg) && has(m.xgAgainst) ? m.xg! - m.xgAgainst! : null)));
  const lastXgDiff = mean(last.map((m) => (has(m.xg) && has(m.xgAgainst) ? m.xg! - m.xgAgainst! : null)));
  let trend: "rising" | "falling" | "steady" = "steady";
  if (has(seasonXgDiff) && has(lastXgDiff)) {
    if (lastXgDiff - seasonXgDiff >= T.xgDrift) trend = "rising";
    else if (seasonXgDiff - lastXgDiff >= T.xgDrift) trend = "falling";
  }
  const w = last.filter((m) => m.result === "W").length, d = last.filter((m) => m.result === "D").length, l = last.filter((m) => m.result === "L").length;
  const graded = w + d + l;
  const trendIs = trend === "rising" ? "á uppleið" : trend === "falling" ? "á niðurleið" : "stöðugt";      // neuter (formið)
  const trendIsF = trend === "rising" ? "á uppleið" : trend === "falling" ? "á niðurleið" : "stöðug";     // feminine (þróunin)
  const verdict = graded > 0
    ? bi(
        `Last ${last.length}: ${w}W ${d}D ${l}L — form is ${trend}.`,
        `Síðustu ${last.length}: ${w}S ${d}J ${l}T — formið er ${trendIs}.`,
      )
    : bi(
        `Last ${last.length} on xG: ${nd(lastXgDiff)} xG difference/match — trend is ${trend}. Results not imported (no scores), so W/D/L can't be shown.`,
        `Síðustu ${last.length} á xG: ${nd(lastXgDiff)} xG-munur/leik — þróunin er ${trendIsF}. Úrslit ekki flutt inn (engin mörk), svo S/J/T er ekki hægt að sýna.`,
      );
  return { last, trend, verdict };
}

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter(has);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function buildOpponentReport(input: {
  opponent: TeamProfile;
  league: Metrics;
  own: Metrics;
  matches: ScoutMatch[];
  players: ScoutPlayerRow[];
  season: string;
}): OpponentReport {
  const { opponent, league, own, matches, players, season } = input;
  const o = opponent.m;
  const w = matches.filter((m) => m.result === "W").length, d = matches.filter((m) => m.result === "D").length, l = matches.filter((m) => m.result === "L").length;
  // Only surface a W/D/L record when matches are actually graded — otherwise it reads as "0W 0D 0L".
  const record = w + d + l > 0 ? { w, d, l } : undefined;
  return {
    opponent: opponent.name,
    season,
    matches: opponent.matches,
    record,
    identity: identity(o, league),
    attack: attack(o, league),
    defend: defend(o, league),
    setPieces: setPieces(o, league),
    keyPlayers: keyPlayers(players),
    matchup: matchup(o, own),
    form: form(matches),
    confidence: {
      matches: opponent.matches,
      hasPassing: has(o.smartPasses) || has(o.passesFinalThird),
      hasAttacking: has(o.positionalAttacks) || has(o.offensiveDuelsWonPct),
      hasPlayers: players.length > 0,
    },
  };
}
