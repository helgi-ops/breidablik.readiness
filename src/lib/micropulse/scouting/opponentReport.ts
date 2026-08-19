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
export type ScoutMatch = {
  date: string; opponent: string | null; isHome: boolean | null;
  goals: number | null; goalsAgainst: number | null; xg: number | null; xgAgainst: number | null; result: "W" | "D" | "L" | null;
  // Rich per-match metrics (present when the Wyscout export carried the extra presets).
  // These make the 5/10/all window an HONEST recent-form profile, not just an xG line.
  shots?: number | null; shotsAgainst?: number | null; possession?: number | null; ppda?: number | null;
  defDuelsWonPct?: number | null; forwardPasses?: number | null; forwardPassAccPct?: number | null;
  passesFinalThird?: number | null; passesFinalThirdAccPct?: number | null; progressivePasses?: number | null;
  smartPasses?: number | null; smartPassAccPct?: number | null; crosses?: number | null; crossAccPct?: number | null;
  positionalAttacks?: number | null; counterattacks?: number | null; offensiveDuelsWonPct?: number | null;
};
export type ScoutPlayerRow = { name: string; position: string | null; minutes: number | null; goals: number | null; xg: number | null; assists: number | null; xa: number | null; receivedPasses: number | null };

/** A number with the reference it's judged against (for the "cite the signal" rule). */
export type Cited = { metric: string; value: number | null; league?: number | null; own?: number | null };
export type Bi = { en: string; is: string };
export type Recommendation = { id: string; text: Bi; signal: Cited };
export type Block = { verdict: Bi; facts: Cited[]; flags: string[] };

export type SideSplit = { games: number; w: number; d: number; l: number; gf: number | null; ga: number | null; xg: number | null; xga: number | null };

/** StatsBomb-only signals (present only for statsbomb-sourced seasons), with the
 *  League Average alongside each so the UI can benchmark. All optional. */
export type StatsbombExtras = {
  obv: number | null; obvAgainst: number | null; obvLeague: number | null; obvAgainstLeague: number | null;
  setPieceXg: number | null; setPieceXgAgainst: number | null; setPieceShots: number | null; setPieceShotsAgainst: number | null;
  setPieceXgLeague: number | null; setPieceXgAgainstLeague: number | null;
  // Chance quality (clear shots) + set-piece route detail (corners / throw-ins), for & vs league.
  clearShots: number | null; clearShotsLeague: number | null; clearShotsAgainst: number | null; clearShotsAgainstLeague: number | null;
  cornerXg: number | null; cornerXgLeague: number | null; throwInXg: number | null; throwInXgLeague: number | null;
  carryObvConceded: number | null; defensiveDistance: number | null;
};

export type OpponentReport = {
  opponent: string; season: string; matches: number;
  source: "wyscout" | "statsbomb";
  statsbomb: StatsbombExtras | null;
  position: number | null;
  record?: { w: number; d: number; l: number };
  goalsFor: number | null; goalsAgainst: number | null;
  summary: Bi;
  identity: Block;
  attack: Block;
  defend: Block & { recommendations: Recommendation[] };
  setPieces: Block & { players: Array<{ name: string; position: string | null; goals: number | null }> };
  keyPlayers: { available: boolean; topScorers: ScoutPlayerRow[]; watch: ScoutPlayerRow[]; topAssist: ScoutPlayerRow[]; mostTargeted: ScoutPlayerRow | null; verdict: Bi };
  matchup: { rows: Array<{ metric: string; them: number | null; you: number | null; delta: number | null; theyBetter: boolean | null }>; verdict: Bi };
  form: {
    last: ScoutMatch[]; trend: "rising" | "falling" | "steady"; verdict: Bi; results: Array<"W" | "D" | "L">;
    /** Rich metrics AVERAGED over the window (real per-match data → honest, not fabricated). */
    windowMetrics: Metrics; n: number;
  };
  /** Full per-match list (newest first) — the client re-windows form/xG/results over 5 / 10 / all. */
  allMatches: ScoutMatch[];
  splits: { home: SideSplit; away: SideSplit } | null;
  worstDefeats: Array<{ date: string; opponent: string | null; gf: number | null; ga: number | null }>;
  headToHead: Array<{ date: string; gf: number | null; ga: number | null; result: "W" | "D" | "L" | null; isHome: boolean | null }>;
  gameplan: Bi;
  confidence: { matches: number; hasPassing: boolean; hasAttacking: boolean; hasPlayers: boolean };
};

/** Fold a team name for matching across accent/spelling variants (Breiðablik/Breidablik). */
const foldName = (s?: string | null): string =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ð/g, "d").replace(/þ/g, "th").replace(/[^a-z0-9]/g, "");

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
    { metric: "gf", value: r1(o.gf), league: r1(lg.gf) },
    { metric: "shots", value: r1(o.shots), league: r1(lg.shots) },
    { metric: "crosses", value: r1(o.crosses), league: r1(lg.crosses) },
  ];
  const crossHeavy = has(o.crosses) && (o.crosses >= T.crossThreatHi || (rel(o.crosses, lg.crosses) ?? 0) >= 1 + T.outlier);
  const lineBreaking = (rel(o.smartPasses, lg.smartPasses) ?? 0) >= 1 + T.outlier;
  const boxThreat = (rel(o.positionalAttacks, lg.positionalAttacks) ?? 0) >= 1 + T.outlier;
  // Counterattacks are rare events; require a real absolute volume, not just a ratio over a tiny league mean.
  const counter = has(o.counterattacks) && o.counterattacks >= 1.5 && (rel(o.counterattacks, lg.counterattacks) ?? 0) >= 1 + T.outlier;
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
    const crEn = cr < 0.9 ? "below the league average" : cr > 1.1 ? "above the league average" : "around the league average";
    const crIs = cr < 0.9 ? "undir deildar-meðaltali" : cr > 1.1 ? "yfir deildar-meðaltali" : "við deildar-meðaltal";
    vol = {
      en: ` They take ${nd(o.shots)} shots/match (${swEn} the league) and create ${crEn} on xG (${nd(o.xgf)}).`,
      is: ` Þeir taka ${nd(o.shots)} skot/leik (${swIs} deild) og skapa ${crIs} á xG (${nd(o.xgf)}).`,
    };
  }
  // Finishing: goals vs xG. Overperformance = clinical; underperformance = wasteful.
  const finishing = has(o.gf) && has(o.xgf) ? o.gf - o.xgf : null;
  let fin = { en: "", is: "" };
  if (finishing != null && Math.abs(finishing) >= 0.2) {
    if (finishing >= 0.2) { flags.push("clinical_finishing"); fin = { en: ` They finish above their chances (${nd(o.gf)} goals vs ${nd(o.xgf)} xG) — respect their quality in the box.`, is: ` Þeir klára umfram færin (${nd(o.gf)} mörk á móti ${nd(o.xgf)} xG) — virtu gæðin í teignum.` }; }
    else { flags.push("wasteful_finishing"); fin = { en: ` They underperform their xG (${nd(o.gf)} goals vs ${nd(o.xgf)} xG) — wasteful in front of goal, so don't over-respect the goal tally.`, is: ` Þeir vannýta færin (${nd(o.gf)} mörk á móti ${nd(o.xgf)} xG) — dauf klárun, svo markatalan ofmetur ekki hættuna.` }; }
  }
  const verdict = bi(
    `${lead.en} — most threat comes from ${route.en}${has(o.xgf) ? ` (${nd(o.xgf)} xG/match)` : ""}.${vol.en}${fin.en}`,
    `${lead.is} — mesta ógnin kemur frá ${route.is}${has(o.xgf) ? ` (${nd(o.xgf)} xG/leik)` : ""}.${vol.is}${fin.is}`,
  );
  return { verdict, facts, flags };
}

// ── Block 3: how they defend — where to hurt them ─────────────────────────────
function defend(o: Metrics, lg: Metrics): Block & { recommendations: Recommendation[] } {
  const flags: string[] = [];
  const recs: Recommendation[] = [];
  const facts: Cited[] = [
    { metric: "xga", value: r1(o.xga), league: r1(lg.xga) },
    { metric: "ga", value: r1(o.ga), league: r1(lg.ga) },
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
  // Goalkeeping: goals conceded vs xGA. Conceding fewer than expected = the keeper is bailing them.
  const keeping = has(o.xga) && has(o.ga) ? o.xga - o.ga : null;
  let gk = { en: "", is: "" };
  if (keeping != null && Math.abs(keeping) >= 0.15) {
    if (keeping >= 0.15) { flags.push("keeper_overperforming"); gk = { en: ` Their goalkeeper has been bailing them out (${nd(o.ga)} conceded vs ${nd(o.xga)} xGA) — that overperformance tends to regress, so keep testing them.`, is: ` Markvörðurinn hefur bjargað þeim (${nd(o.ga)} mörk á sig þrátt fyrir ${nd(o.xga)} xGA) — sú yfirframmistaða leitar í meðaltal, svo haltu áfram að reyna á hann.` }; }
    else { flags.push("keeper_underperforming"); gk = { en: ` They concede more than their xGA (${nd(o.ga)} vs ${nd(o.xga)}) — the goal is there to be had.`, is: ` Þeir fá á sig fleiri mörk en xGA segir (${nd(o.ga)} mörk á sig, xGA ${nd(o.xga)}) — markið er til reiðu.` }; }
  }
  const verdict = bi(
    (beatable ? `Beatable at the back${detailEn}` : `Hard to break down — few chances conceded (${nd(o.xga)} xG against vs ${nd(lg.xga)}).`) + gk.en,
    (beatable ? `Hægt að vinna á vörninni${detailIs}` : `Erfitt að brjóta niður — fá færi gefin (xG á móti ${nd(o.xga)}, deild ${nd(lg.xga)}).`) + gk.is,
  );
  return { verdict, facts, flags, recommendations: recs };
}

// ── Block 4: set pieces — inferred from defenders/DMs on the scoresheet ─────────
const DEFENSIVE_POS = /\b([LRC]?CB|CB|[LR]B|[LR]WB|[LRC]?DMF|DMC)\b/i;
function setPieces(players: ScoutPlayerRow[], sb?: StatsbombExtras | null): Block & { players: Array<{ name: string; position: string | null; goals: number | null }> } {
  const flags: string[] = [];
  // StatsBomb gives real set-piece xG for & against — far better than the goal proxy.
  if (sb && (has(sb.setPieceXg) || has(sb.setPieceXgAgainst))) {
    const facts: Cited[] = [
      { metric: "setPieceXg", value: r1(sb.setPieceXg), league: r1(sb.setPieceXgLeague) },
      { metric: "setPieceXgAgainst", value: r1(sb.setPieceXgAgainst), league: r1(sb.setPieceXgAgainstLeague) },
      { metric: "setPieceShotsAgainst", value: r1(sb.setPieceShotsAgainst), league: null },
    ];
    if (has(sb.cornerXg)) facts.push({ metric: "cornerXg", value: r1(sb.cornerXg), league: r1(sb.cornerXgLeague) });
    if (has(sb.throwInXg)) facts.push({ metric: "throwInXg", value: r1(sb.throwInXg), league: r1(sb.throwInXgLeague) });
    const leak = has(sb.setPieceXgAgainst) && has(sb.setPieceXgAgainstLeague) && sb.setPieceXgAgainst >= sb.setPieceXgAgainstLeague + 0.05;
    const threat = has(sb.setPieceXg) && has(sb.setPieceXgLeague) && sb.setPieceXg >= sb.setPieceXgLeague + 0.05;
    if (leak) flags.push("weak_set_piece_defence");
    if (threat) flags.push("set_piece_threat");
    // Corner route: is the corner where their set-piece threat concentrates?
    const cornerHi = has(sb.cornerXg) && has(sb.cornerXgLeague) && sb.cornerXg >= sb.cornerXgLeague + 0.03;
    if (cornerHi) flags.push("corner_threat");
    const corner = cornerHi ? { en: ` Corners are the main route (${nd(sb.cornerXg)} xG/game vs ${nd(sb.cornerXgLeague)} league) — win the first contact.`, is: ` Horn eru aðal-leiðin (${nd(sb.cornerXg)} xG/leik á móti ${nd(sb.cornerXgLeague)} deild) — vinnið fyrstu snertingu.` } : { en: "", is: "" };
    const verdict = bi(
      `Set pieces (StatsBomb xG): they create ${nd(sb.setPieceXg)} and concede ${nd(sb.setPieceXgAgainst)} per game${leak ? " — weaker than the league defending them, attack the box on dead balls" : threat ? " — a real attacking weapon, defend them tightly" : ""}.${corner.en}`,
      `Fastaleikir (StatsBomb xG): þeir skapa ${nd(sb.setPieceXg)} og gefa frá sér ${nd(sb.setPieceXgAgainst)} á leik${leak ? " — lakari en deildin í vörn, sæktu teiginn á föstum boltum" : threat ? " — raunverulegt sóknarvopn, verjið þá þétt" : ""}.${corner.is}`,
    );
    return { verdict, facts, flags, players: [] };
  }
  // Defenders / holding midfielders with goals are a proxy for set-piece & aerial threat.
  const scorers = players
    .filter((p) => has(p.goals) && (p.goals ?? 0) >= 1 && p.position && DEFENSIVE_POS.test(p.position))
    .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))
    .map((p) => ({ name: p.name, position: p.position, goals: p.goals }));
  const total = scorers.reduce((s, p) => s + (p.goals ?? 0), 0);
  const strong = scorers.length >= 3 || total >= 5;
  if (strong) flags.push("set_piece_threat");
  const names = scorers.slice(0, 3).map((p) => `${p.name} (${p.goals})`).join(", ");
  const facts: Cited[] = [{ metric: "setPieceGoals", value: total || null, league: null }];
  const verdict = players.length === 0
    ? bi("No player export — set-piece read needs a Wyscout Advanced Search export.", "Enginn leikmanna-útflutningur — fastaleikja-lestur þarf Wyscout Advanced Search skrá.")
    : strong
      ? bi(`Real aerial / set-piece threat — ${scorers.length} defenders or holders have scored (${total} goals: ${names}). Mark up tightly and win first contact.`,
           `Raunveruleg fastaleikja- og skallaógn — ${scorers.length} varnar- eða miðjumenn hafa skorað (${total} mörk: ${names}). Merkið þétt og vinnið fyrstu snertingu.`)
      : bi(scorers.length ? `Limited set-piece threat — only ${names} among the deeper players.` : "Little set-piece threat from deep in the goal data.",
           scorers.length ? `Takmörkuð fastaleikja-ógn — aðeins ${names} úr dýpri mönnunum.` : "Lítil fastaleikja-ógn úr dýpt skv. markatölum.");
  return { verdict, facts, flags, players: scorers };
}

// ── Block 5: key players ──────────────────────────────────────────────────────
function keyPlayers(players: ScoutPlayerRow[]): OpponentReport["keyPlayers"] {
  const withMin = players.filter((p) => has(p.minutes) && (p.minutes ?? 0) > 0);
  const topScorers = [...withMin].filter((p) => has(p.goals)).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0)).slice(0, 5);
  // "Watch" = getting into positions but not converting (xG well above goals) — due to score.
  const topNames = new Set(topScorers.slice(0, 3).map((p) => p.name));
  const watch = [...withMin]
    .filter((p) => has(p.xg) && has(p.goals) && (p.xg ?? 0) - (p.goals ?? 0) >= 2.5 && !topNames.has(p.name))
    .sort((a, b) => ((b.xg ?? 0) - (b.goals ?? 0)) - ((a.xg ?? 0) - (a.goals ?? 0))).slice(0, 3);
  const topAssist = [...withMin].filter((p) => has(p.assists) || has(p.xa)).sort((a, b) => ((b.assists ?? b.xa ?? 0)) - ((a.assists ?? a.xa ?? 0))).slice(0, 3);
  const per90 = (p: ScoutPlayerRow) => (has(p.receivedPasses) && has(p.minutes) && p.minutes! > 0 ? (p.receivedPasses! / p.minutes!) * 90 : null);
  const mostTargeted = withMin.filter((p) => per90(p) != null).sort((a, b) => (per90(b) ?? 0) - (per90(a) ?? 0))[0] ?? null;
  const top = topScorers[0];
  const verdict = players.length === 0
    ? bi("No player export uploaded — add a StatsBomb Player Stats CSV or a Wyscout Advanced Search export for key players.", "Enginn leikmanna-útflutningur — bættu við StatsBomb Player Stats CSV eða Wyscout Advanced Search skrá fyrir lykilmenn.")
    : bi(
        `Stop ${top ? top.name : "their most-targeted forward"}${top && has(top.goals) ? ` (${top.goals} goals)` : ""}.`,
        `Stöðvaðu ${top ? top.name : "mest-notaða framherjann"}${top && has(top.goals) ? ` (${top.goals} mörk)` : ""}.`,
      );
  return { available: players.length > 0, topScorers, watch, topAssist, mostTargeted, verdict };
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
/**
 * Recent-form read over a chosen match window. `windowN` = how many most-recent
 * matches to include (Infinity = the whole season). Pure and re-runnable on the
 * client, so the 5 / 10 / all toggle re-scopes form/xG/results WITHOUT a refetch —
 * this is the only part backed by real per-match data; the rich season blocks stay
 * whole-season aggregates.
 */
/** Average the rich per-match metrics over a set of matches → a window-scoped Metrics.
 *  Only fields the export actually carried are non-null; xg/goals map to the for/against pair. */
export function metricsFromScoutMatches(ms: ScoutMatch[]): Metrics {
  const A = (pick: (m: ScoutMatch) => number | null | undefined) => mean(ms.map((m) => { const v = pick(m); return has(v) ? v : null; }));
  return {
    xgf: A((m) => m.xg), xga: A((m) => m.xgAgainst), gf: A((m) => m.goals), ga: A((m) => m.goalsAgainst),
    shots: A((m) => m.shots), shotsAgainst: A((m) => m.shotsAgainst), possession: A((m) => m.possession),
    ppda: A((m) => m.ppda), defDuelsWonPct: A((m) => m.defDuelsWonPct),
    forwardPasses: A((m) => m.forwardPasses), forwardPassAccPct: A((m) => m.forwardPassAccPct),
    passesFinalThird: A((m) => m.passesFinalThird), passesFinalThirdAccPct: A((m) => m.passesFinalThirdAccPct),
    progressivePasses: A((m) => m.progressivePasses), smartPasses: A((m) => m.smartPasses), smartPassAccPct: A((m) => m.smartPassAccPct),
    crosses: A((m) => m.crosses), crossAccPct: A((m) => m.crossAccPct),
    positionalAttacks: A((m) => m.positionalAttacks), counterattacks: A((m) => m.counterattacks), offensiveDuelsWonPct: A((m) => m.offensiveDuelsWonPct),
  };
}

/** Rich metrics eligible to enrich the form verdict, with bilingual labels + formatting.
 *  `unit` appends %, `d` = decimals. Order here is the tiebreak when relative changes tie. */
const FORM_EXTRA_METRICS: Array<{ k: keyof Metrics; en: string; is: string; d: number; unit?: string }> = [
  { k: "possession", en: "possession", is: "boltahald", d: 0, unit: "%" },
  { k: "ppda", en: "PPDA", is: "PPDA", d: 1 },
  { k: "shots", en: "shots", is: "skot", d: 0 },
  { k: "crosses", en: "crosses", is: "fyrirgjafir", d: 0 },
  { k: "positionalAttacks", en: "positional attacks", is: "staðsóknir", d: 0 },
  { k: "counterattacks", en: "counters", is: "skyndisóknir", d: 0 },
  { k: "passesFinalThird", en: "passes to final third", is: "sendingar á lokaþriðjung", d: 0 },
  { k: "defDuelsWonPct", en: "defensive duels", is: "varnarnávígi", d: 0, unit: "%" },
];

/** Pick the most telling rich metrics present in the window and phrase them "label X (season Y)".
 *  Returns null when the export carried no rich per-match data (xG-only opponents). */
function formExtras(windowM: Metrics, seasonM: Metrics): Bi | null {
  const cand = FORM_EXTRA_METRICS
    .map((m) => {
      const wv = windowM[m.k], sv = seasonM[m.k];
      if (!has(wv)) return null;
      const relChange = has(sv) && sv !== 0 ? Math.abs((wv - sv) / sv) : 0;
      return { m, wv, sv, relChange };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.relChange - a.relChange)
    .slice(0, 3);
  if (!cand.length) return null;
  const phrase = (lang: "en" | "is") => cand
    .map(({ m, wv, sv }) => {
      const u = m.unit ?? "";
      const val = `${nd(wv, m.d)}${u}`;
      // Only cite the season number when it meaningfully differs from the window.
      const showSeason = has(sv) && Math.abs(wv - sv) >= (m.d === 0 ? 1 : 0.1);
      const seasonTxt = showSeason ? ` (${lang === "is" ? "tímab. " : "season "}${nd(sv, m.d)}${u})` : "";
      return `${m[lang]} ${val}${seasonTxt}`;
    })
    .join(", ");
  return { en: phrase("en"), is: phrase("is") };
}

export function computeFormWindow(matches: ScoutMatch[], windowN: number = T.formMatches): OpponentReport["form"] {
  const sorted = [...matches].filter((m) => m.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted.slice(0, Math.max(1, windowN));
  const seasonXgDiff = mean(matches.map((m) => (has(m.xg) && has(m.xgAgainst) ? m.xg! - m.xgAgainst! : null)));
  const lastXgDiff = mean(last.map((m) => (has(m.xg) && has(m.xgAgainst) ? m.xg! - m.xgAgainst! : null)));
  let trend: "rising" | "falling" | "steady" = "steady";
  if (has(seasonXgDiff) && has(lastXgDiff)) {
    if (lastXgDiff - seasonXgDiff >= T.xgDrift) trend = "rising";
    else if (seasonXgDiff - lastXgDiff >= T.xgDrift) trend = "falling";
  }
  const w = last.filter((m) => m.result === "W").length, d = last.filter((m) => m.result === "D").length, l = last.filter((m) => m.result === "L").length;
  const graded = w + d + l;
  const results = last.filter((m) => m.result != null).map((m) => m.result as "W" | "D" | "L");
  const trendIsF = trend === "rising" ? "á uppleið" : trend === "falling" ? "á niðurleið" : "stöðug";     // feminine (þróunin)
  // When graded, describe form by the actual results, not the (noisier) xG drift.
  const toneEn = w > l ? "good" : l > w ? "poor" : "mixed", toneIs = w > l ? "gott" : l > w ? "slæmt" : "blandað";
  // Weave the standout rich metrics into the verdict — so it's a real recent-form read, not
  // just an xG line — from real per-match data, each vs the opponent's own season average.
  const windowM = metricsFromScoutMatches(last);
  const seasonM = metricsFromScoutMatches(sorted);
  const extra = formExtras(windowM, seasonM);
  const extraEn = extra ? ` Over these ${last.length}: ${extra.en}.` : "";
  const extraIs = extra ? ` Í þessum ${last.length}: ${extra.is}.` : "";
  const verdict = graded > 0
    ? bi(
        `Last ${last.length}: ${w}W ${d}D ${l}L — form is ${toneEn}.${extraEn}`,
        `Síðustu ${last.length}: ${w}S ${d}J ${l}T — formið er ${toneIs}.${extraIs}`,
      )
    : bi(
        `Last ${last.length} on xG: ${nd(lastXgDiff)} xG difference/match — trend is ${trend}.${extraEn}${extra ? "" : " Results not imported (no scores), so W/D/L can't be shown."}`,
        `Síðustu ${last.length} á xG: ${nd(lastXgDiff)} xG-munur/leik — þróunin er ${trendIsF}.${extraIs}${extra ? "" : " Úrslit ekki flutt inn (engin mörk), svo S/J/T er ekki hægt að sýna."}`,
      );
  return { last, trend, verdict, results, windowMetrics: windowM, n: last.length };
}

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter(has);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const ord = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");

// ── Útdráttur / abstract: a tight 4–6 sentence lede, not a pile of block verdicts ──
function buildSummary(a: {
  name: string; position: number | null; matchesN: number;
  record?: { w: number; d: number; l: number }; o: Metrics; lg: Metrics;
  top: ScoutPlayerRow | undefined; last5: ScoutMatch[];
}): Bi {
  const { name, position, matchesN, record, o, lg, top, last5 } = a;
  const gfTot = has(o.gf) ? Math.round(o.gf * matchesN) : null;
  const gaTot = has(o.ga) ? Math.round(o.ga * matchesN) : null;
  const goalsIs = gfTot != null && gaTot != null ? ` (mörk ${gfTot}:${gaTot})` : "";
  const goalsEn = gfTot != null && gaTot != null ? ` (${gfTot}:${gaTot} goals)` : "";
  const en: string[] = [], is: string[] = [];

  // 1) Standing
  if (record) {
    const rec = `${record.w}W ${record.d}D ${record.l}L`;
    const recIs = `${record.w === 1 ? "1 sigur" : `${record.w} sigra`}, ${record.d} jafntefli og ${record.l === 1 ? "1 tap" : `${record.l} töp`}`;
    en.push(`${name} ${position != null ? `sit ${position}${ord(position)}` : "have a"}${position != null ? ` on a ${rec} record` : ` ${rec} record`}${goalsEn}.`);
    is.push(`${name} ${position != null ? `situr í ${position}. sæti með` : "er með"} ${recIs}${goalsIs}.`);
  } else if (position != null) {
    en.push(`${name} sit ${position}${ord(position)}.`); is.push(`${name} situr í ${position}. sæti.`);
  }

  // 2) Underlying quality (xG difference)
  const xgd = has(o.xgf) && has(o.xga) ? o.xgf - o.xga : null;
  if (xgd != null) {
    if (xgd <= -0.15) { en.push(`The underlying numbers are worse than the table — they concede more than they create (xG difference ${nd(xgd, 2)}).`); is.push(`Undirliggjandi tölur eru lakari en staðan segir — þeir gefa meira frá sér en þeir skapa (xG-munur ${nd(xgd, 2)}).`); }
    else if (xgd >= 0.15) { en.push(`The underlying numbers are strong (xG difference +${nd(xgd, 2)}).`); is.push(`Undirliggjandi tölur eru sterkar (xG-munur +${nd(xgd, 2)}).`); }
    else { en.push(`Underlying, they sit near the league average (xG difference ${nd(xgd, 2)}).`); is.push(`Undirliggjandi eru þeir nálægt meðaltali deildarinnar (xG-munur ${nd(xgd, 2)}).`); }
  }

  // 3) Defensive weakness
  const ships = (rel(o.shotsAgainst, lg.shotsAgainst) ?? 0) >= 1.1;
  const weakDuels = has(o.defDuelsWonPct) && (o.defDuelsWonPct < T.defDuelLow || (has(lg.defDuelsWonPct) && o.defDuelsWonPct <= lg.defDuelsWonPct - 3));
  if (ships || weakDuels) {
    const duelEn = weakDuels && has(o.defDuelsWonPct) ? ` and win only ${ni(o.defDuelsWonPct)}% of defensive duels` : "";
    const duelIs = weakDuels && has(o.defDuelsWonPct) ? ` og vinna aðeins ${ni(o.defDuelsWonPct)}% varnareinvígja` : "";
    en.push(`The defence is the soft spot — ${has(o.shotsAgainst) ? `${nd(o.shotsAgainst)} shots conceded per match` : "leaky at the back"}${duelEn}.`);
    is.push(`Vörnin er veika hliðin — ${has(o.shotsAgainst) ? `${nd(o.shotsAgainst)} skot á sig á leik` : "þeir leka aftast"}${duelIs}.`);
  }

  // 4) Finishing vs goalkeeping (both regress)
  const fin = has(o.gf) && has(o.xgf) ? o.gf - o.xgf : null;
  const keep = has(o.xga) && has(o.ga) ? o.xga - o.ga : null;
  const wasteful = fin != null && fin <= -0.2, keeperUp = keep != null && keep >= 0.15;
  if (wasteful && keeperUp) { en.push(`They waste chances in attack while the goalkeeper keeps the score down — both tend to regress.`); is.push(`Sóknin vannýtir færin en markvörðurinn heldur tapatölunni niðri — hvort tveggja leitar í meðaltal.`); }
  else if (wasteful) { en.push(`They underperform their xG in attack — wasteful in front of goal.`); is.push(`Þeir vannýta færin í sókn — dauf klárun.`); }
  else if (keeperUp) { en.push(`The goalkeeper has kept the concession below their xGA.`); is.push(`Markvörðurinn hefur haldið mörkum á sig undir xGA.`); }

  // 5) Key man
  if (top) { en.push(`Their main threat is ${top.name}${has(top.goals) ? ` (${top.goals} goals)` : ""}.`); is.push(`Aðalógnin er ${top.name}${has(top.goals) ? ` (${top.goals} mörk)` : ""}.`); }

  // 6) Form
  const w5 = last5.filter((m) => m.result === "W").length, l5 = last5.filter((m) => m.result === "L").length, g5 = w5 + last5.filter((m) => m.result === "D").length + l5;
  if (g5 > 0) {
    const tEn = w5 > l5 ? "strong" : l5 > w5 ? "poor" : "mixed", tIs = w5 > l5 ? "gott" : l5 > w5 ? "slæmt" : "blandað";
    en.push(`Form is ${tEn}: ${w5}W ${l5}L in the last ${g5}.`); is.push(`Formið er ${tIs}: ${w5 === 1 ? "1 sigur" : `${w5} sigrar`} og ${l5 === 1 ? "1 tap" : `${l5} töp`} í síðustu ${g5}.`);
  }

  return bi(en.join(" "), is.join(" "));
}

/** Read the stored sb_extras jsonb ({ team, league }) into the StatsbombExtras shape. */
function parseSbExtras(x: Record<string, unknown> | null | undefined): StatsbombExtras | null {
  if (!x || typeof x !== "object") return null;
  const t = (x.team ?? {}) as Record<string, unknown>;
  const l = (x.league ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    obv: n(t.obv), obvAgainst: n(t.obvAgainst), obvLeague: n(l.obv), obvAgainstLeague: n(l.obvAgainst),
    setPieceXg: n(t.setPieceXg), setPieceXgAgainst: n(t.setPieceXgAgainst), setPieceShots: n(t.setPieceShots), setPieceShotsAgainst: n(t.setPieceShotsAgainst),
    setPieceXgLeague: n(l.setPieceXg), setPieceXgAgainstLeague: n(l.setPieceXgAgainst),
    clearShots: n(t.clearShots), clearShotsLeague: n(l.clearShots), clearShotsAgainst: n(t.clearShotsFaced), clearShotsAgainstLeague: n(l.clearShotsFaced),
    cornerXg: n(t.cornerXg), cornerXgLeague: n(l.cornerXg), throwInXg: n(t.throwInXg), throwInXgLeague: n(l.throwInXg),
    carryObvConceded: n(t.carryObvConceded), defensiveDistance: n(t.defensiveDistance),
  };
}

export function buildOpponentReport(input: {
  opponent: TeamProfile;
  league: Metrics;
  own: Metrics;
  matches: ScoutMatch[];
  players: ScoutPlayerRow[];
  season: string;
  ownName?: string;
  position?: number | null;
  source?: string;
  sbExtras?: Record<string, unknown> | null;
}): OpponentReport {
  const { opponent, league, own, matches, players, season, ownName, position } = input;
  const source: "wyscout" | "statsbomb" = input.source === "statsbomb" ? "statsbomb" : "wyscout";
  const statsbomb = source === "statsbomb" ? parseSbExtras(input.sbExtras) : null;
  const o = opponent.m;
  const w = matches.filter((m) => m.result === "W").length, d = matches.filter((m) => m.result === "D").length, l = matches.filter((m) => m.result === "L").length;
  // Only surface a W/D/L record when matches are actually graded — otherwise it reads as "0W 0D 0L".
  const record = w + d + l > 0 ? { w, d, l } : undefined;

  // Head-to-head vs the coach's own team (accent/spelling tolerant), graded matches only.
  const on = foldName(ownName);
  const headToHead = on
    ? matches
        .filter((m) => { const fo = foldName(m.opponent); return fo && (fo === on || fo.includes(on) || on.includes(fo)); })
        .filter((m) => m.result != null)
        .map((m) => ({ date: m.date, gf: m.goals, ga: m.goalsAgainst, result: m.result, isHome: m.isHome }))
    : [];
  const kp = keyPlayers(players);
  const fm = computeFormWindow(matches);
  const sp = setPieces(players, statsbomb);
  const dfd = defend(o, league);
  const idn = identity(o, league);
  const matchesN = opponent.matches;
  const goalsFor = has(o.gf) ? Math.round(o.gf * matchesN) : null;
  const goalsAgainst = has(o.ga) ? Math.round(o.ga * matchesN) : null;

  // Home / away split (only if any match carries a home/away flag).
  const side = (home: boolean): SideSplit => {
    const ms = matches.filter((m) => m.isHome === home), g = ms.filter((m) => m.result != null);
    return { games: ms.length, w: g.filter((m) => m.result === "W").length, d: g.filter((m) => m.result === "D").length, l: g.filter((m) => m.result === "L").length,
      gf: mean(ms.map((m) => m.goals)), ga: mean(ms.map((m) => m.goalsAgainst)), xg: mean(ms.map((m) => m.xg)), xga: mean(ms.map((m) => m.xgAgainst)) };
  };
  const splits = matches.some((m) => m.isHome != null) ? { home: side(true), away: side(false) } : null;

  // Their heaviest defeats — how they fold under pressure.
  const worstDefeats = matches
    .filter((m) => m.result === "L" && has(m.goals) && has(m.goalsAgainst))
    .sort((a, b) => (b.goalsAgainst! - b.goals!) - (a.goalsAgainst! - a.goals!))
    .slice(0, 3).map((m) => ({ date: m.date, opponent: m.opponent, gf: m.goals, ga: m.goalsAgainst }));

  // Game plan — a distinct synthesis (not a repeat of the defend verdict).
  const gpEn: string[] = [], gpIs: string[] = [];
  if (dfd.flags.includes("concedes_many_shots") || dfd.flags.includes("concedes_high_xga")) { gpEn.push("attack the box in volume"); gpIs.push("sæktu teiginn í magni"); }
  if (dfd.flags.includes("weak_def_duels")) { gpEn.push("take their defenders on 1v1"); gpIs.push("taktu varnarmenn á einn-á-einn"); }
  if (idn.flags.includes("direct_low_possession") || (rel(o.passesFinalThird, league.passesFinalThird) ?? 1) < 0.9) { gpEn.push("press their first phase"); gpIs.push("pressaðu fyrstu uppbyggingu"); }
  if (dfd.flags.includes("keeper_overperforming")) { gpEn.push("keep testing the keeper — his form regresses"); gpIs.push("haltu áfram að reyna á markvörðinn"); }
  if (kp.topScorers[0]) { gpEn.push(`deny ${kp.topScorers[0].name}`); gpIs.push(`gefðu ${kp.topScorers[0].name} ekkert`); }
  if (sp.flags.includes("set_piece_threat")) { gpEn.push("defend set pieces — their defenders score"); gpIs.push("verðu fastaleiki — varnarmenn þeirra skora"); }
  const gameplan = bi(
    gpEn.length ? `To beat them: ${gpEn.slice(0, 4).join(", ")}.` : "Play your game — no single obvious lever in the data.",
    gpIs.length ? `Til að vinna þá: ${gpIs.slice(0, 4).join(", ")}.` : "Spilaðu ykkar leik — engin ein augljós vísbending í gögnunum.",
  );

  const summary = buildSummary({ name: opponent.name, position: position ?? null, matchesN, record, o, lg: league, top: kp.topScorers[0], last5: fm.last });
  return {
    opponent: opponent.name,
    season,
    matches: matchesN,
    source,
    statsbomb,
    position: position ?? null,
    record,
    goalsFor, goalsAgainst,
    summary,
    identity: idn,
    attack: attack(o, league),
    defend: dfd,
    setPieces: sp,
    keyPlayers: kp,
    matchup: matchup(o, own),
    form: fm,
    allMatches: [...matches].filter((m) => m.date).sort((a, b) => (a.date < b.date ? 1 : -1)),
    splits,
    worstDefeats,
    headToHead,
    gameplan,
    confidence: {
      matches: opponent.matches,
      hasPassing: has(o.smartPasses) || has(o.passesFinalThird),
      hasAttacking: has(o.positionalAttacks) || has(o.offensiveDuelsWonPct),
      hasPlayers: players.length > 0,
    },
  };
}
