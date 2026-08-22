/**
 * FIBA LiveStats (Genius Sports) public feed — the play/shot data KKI runs on every game.
 *
 * The widget at .../u/KKI/<matchId>/pbp.html is backed by a JSON feed at
 * .../data/<matchId>/data.json. This adapter parses that JSON into shots (court x/y +
 * made/missed + 2pt/3pt + sub-type), the two teams, and per-player shooting tendencies.
 * Pure (no IO) — the fetch happens in the route.
 *
 * Free, public, DESCRIPTIVE scouting data — it never touches the readiness colour, the
 * load, or the daily decision.
 */

export type FibaShot = {
  tno: number;                 // FIBA team number (1 or 2)
  playerNo: number | null;     // roster number within the team feed (`p`)
  pno: number | null;          // player id within the feed
  playerName: string;
  shirt: string | null;
  x: number | null;            // court coordinate (feed's 0-100 scale)
  y: number | null;
  result: 0 | 1 | null;        // 1 made, 0 missed
  actionType: string | null;   // '2pt' | '3pt'
  subType: string | null;      // jumpshot | layup | dunk | ...
  period: number | null;
  actionNumber: number | null; // unique event id within the game
};

export type FibaTeam = { tno: number; name: string; code: string | null };

export type FibaPlayerBox = {
  tno: number; name: string; shirt: string | null;
  min: string | null; pts: number | null;
  reb: number | null; oreb: number | null; dreb: number | null;
  ast: number | null; stl: number | null; blk: number | null; tov: number | null;
  pm: number | null; pip: number | null;
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null;
};

export type FibaTeamTotals = {
  tno: number; points: number | null;
  reb: number | null; oreb: number | null; dreb: number | null;
  ast: number | null; stl: number | null; blk: number | null; tov: number | null;
  // shooting (needed for the Four Factors: eFG%, TOV%, FT rate)
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null;
  pointsInPaint: number | null; fastbreak: number | null; pointsOffTurnovers: number | null; secondChance: number | null; bench: number | null;
  // momentum
  biggestLead: number | null; biggestRun: number | null; leadChanges: number | null; timesLevel: number | null;
};

/** One score checkpoint for the game-flow chart: t = seconds elapsed, h/a = running
 *  scores for team 1 (home) / team 2 (away), per = period. */
export type FlowPoint = { t: number; h: number; a: number; per: number };

/** Who fed whom — from the play-by-play (assist.previousAction → the made shot). */
export type AssistLink = { passer: string; scorer: string; count: number; threes: number };
/** Where a team's made field goals came from (play-by-play qualifiers). */
export type ShotContext = { totalMade: number; paint: number; fastbreak: number; offTurnover: number; secondChance: number };
export type PbpSummary = { assists: AssistLink[]; context: ShotContext };

/** One scoring run (a stretch where only one team scored ≥ threshold unanswered points),
 *  with the play-by-play anatomy of HOW it was built and what the other team gave up. */
export type ScoringRun = {
  team: number;               // tno of the scoring team
  points: number;             // unanswered points in the run
  startPer: number; startClock: string | null;
  endPer: number; endClock: string | null;
  scoreHome: number; scoreAway: number;   // running score right after the run
  // How the scoring team built it (counts within the run window)
  made2: number; made3: number; ftMade: number;
  paint: number; fastbreak: number; offTurnover: number; secondChance: number;
  assisted: number; steals: number; oreb: number;
  // What the conceding team did (their failures during the run window)
  oppTurnovers: number; oppMissed: number; oppTimeout: boolean;
};

/** Aggregate "recipe" for one team's runs: how their runs typically get built, and what
 *  the opponent tends to do wrong while being outscored. Shares are % of made field goals. */
export type RunRecipe = {
  team: number;
  runs: number;               // count of significant runs
  totalPoints: number;
  biggestRun: number;
  madeFG: number;             // total made field goals across the runs (share denominator)
  paintPct: number | null; threePct: number | null; fastbreakPct: number | null;
  offTurnoverPct: number | null; secondChancePct: number | null; assistedPct: number | null;
  steals: number; oreb: number;
  oppTurnovers: number; oppMissed: number;   // what they forced / exploited
};

export type RunAnalysis = { threshold: number; runs: ScoringRun[]; recipe: Record<number, RunRecipe> };

export type FibaGame = { teams: FibaTeam[]; shots: FibaShot[]; players: FibaPlayerBox[]; totals: FibaTeamTotals[]; pbp: Record<number, PbpSummary>; flow: FlowPoint[]; runs: RunAnalysis; period: number | null };

const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const asStr = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);

/** Pull the numeric match id out of a pasted FIBA LiveStats URL (or a bare id). */
export function extractMatchId(input: string): string | null {
  const s = String(input).trim();
  if (/^\d{4,}$/.test(s)) return s;
  const m = s.match(/\/(\d{4,})(?:\/|$)/) ?? s.match(/(\d{5,})/);
  return m ? m[1] : null;
}

/** The JSON feed URL for a match id. */
export function fibaDataUrl(matchId: string): string {
  return `https://fibalivestats.dcd.shared.geniussports.com/data/${matchId}/data.json`;
}

/** Parse the FIBA LiveStats data.json into teams + shots. Defensive: unknown shapes → empty. */
export function parseFibaGame(json: unknown): FibaGame {
  const root = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const tm = (root.tm && typeof root.tm === "object" ? root.tm : {}) as Record<string, unknown>;

  const teams: FibaTeam[] = [];
  for (const key of Object.keys(tm)) {
    const t = (tm[key] && typeof tm[key] === "object" ? tm[key] : {}) as Record<string, unknown>;
    const tno = asNum(key) ?? asNum(t.no);
    if (tno == null) continue;
    teams.push({
      tno,
      name: asStr(t.name) ?? asStr(t.shortName) ?? asStr(t.code) ?? `Team ${tno}`,
      code: asStr(t.code) ?? asStr(t.codeName),
    });
  }
  teams.sort((a, b) => a.tno - b.tno);

  // Shots live per-team at tm[k].shot (each team's array spans the whole court — they
  // switch ends at half, so foldShot() collapses both ends onto one half). Fall back to a
  // top-level `shot` array if a feed variant ever provides one.
  const shotArr: unknown[] = [];
  for (const key of Object.keys(tm)) {
    const t = (tm[key] && typeof tm[key] === "object" ? tm[key] : {}) as Record<string, unknown>;
    if (Array.isArray(t.shot)) shotArr.push(...t.shot);
  }
  if (shotArr.length === 0 && Array.isArray(root.shot)) shotArr.push(...root.shot);
  const shots: FibaShot[] = shotArr
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => {
      const r = asNum(s.r);
      return {
        tno: asNum(s.tno) ?? 0,
        playerNo: asNum(s.p),
        pno: asNum(s.pno),
        playerName: asStr(s.player) ?? "—",
        shirt: asStr(s.shirtNumber),
        x: asNum(s.x),
        y: asNum(s.y),
        result: (r === 1 ? 1 : r === 0 ? 0 : null) as 0 | 1 | null,
        actionType: asStr(s.actionType),
        subType: asStr(s.subType),
        period: asNum(s.per),
        actionNumber: asNum(s.actionNumber),
      };
    })
    .filter((s) => s.tno === 1 || s.tno === 2);

  // Per-player box (tm[k].pl) + team totals (tm[k].tot_*) — the "more descriptive" layer.
  const players: FibaPlayerBox[] = [];
  const totals: FibaTeamTotals[] = [];
  for (const key of Object.keys(tm)) {
    const t = (tm[key] && typeof tm[key] === "object" ? tm[key] : {}) as Record<string, unknown>;
    const tno = asNum(key) ?? asNum(t.no);
    if (tno == null) continue;
    totals.push({
      tno, points: asNum(t.tot_sPoints),
      reb: asNum(t.tot_sReboundsTotal), oreb: asNum(t.tot_sReboundsOffensive), dreb: asNum(t.tot_sReboundsDefensive),
      ast: asNum(t.tot_sAssists), stl: asNum(t.tot_sSteals), blk: asNum(t.tot_sBlocks), tov: asNum(t.tot_sTurnovers),
      fgm: asNum(t.tot_sFieldGoalsMade), fga: asNum(t.tot_sFieldGoalsAttempted),
      tpm: asNum(t.tot_sThreePointersMade), tpa: asNum(t.tot_sThreePointersAttempted),
      ftm: asNum(t.tot_sFreeThrowsMade), fta: asNum(t.tot_sFreeThrowsAttempted),
      pointsInPaint: asNum(t.tot_sPointsInThePaint), fastbreak: asNum(t.tot_sPointsFastBreak),
      pointsOffTurnovers: asNum(t.tot_sPointsFromTurnovers), secondChance: asNum(t.tot_sPointsSecondChance), bench: asNum(t.tot_sBenchPoints),
      biggestLead: asNum(t.tot_sBiggestLead), biggestRun: asNum(t.tot_sBiggestScoringRun),
      leadChanges: asNum(t.tot_sLeadChanges), timesLevel: asNum(t.tot_sTimesScoresLevel),
    });
    const pl = (t.pl && typeof t.pl === "object" ? t.pl : {}) as Record<string, unknown>;
    for (const pk of Object.keys(pl)) {
      const p = (pl[pk] && typeof pl[pk] === "object" ? pl[pk] : {}) as Record<string, unknown>;
      const min = asStr(p.sMinutes);
      const pts = asNum(p.sPoints);
      // Skip players who never checked in (no minutes, no stat line).
      if ((min == null || min === "0:00" || min === "00:00") && !pts) continue;
      players.push({
        tno, name: asStr(p.name) ?? asStr(p.familyName) ?? "—", shirt: asStr(p.shirtNumber),
        min, pts,
        reb: asNum(p.sReboundsTotal), oreb: asNum(p.sReboundsOffensive), dreb: asNum(p.sReboundsDefensive),
        ast: asNum(p.sAssists), stl: asNum(p.sSteals), blk: asNum(p.sBlocks), tov: asNum(p.sTurnovers),
        pm: asNum(p.sPlusMinusPoints), pip: asNum(p.sPointsInThePaint),
        fgm: asNum(p.sFieldGoalsMade), fga: asNum(p.sFieldGoalsAttempted),
        tpm: asNum(p.sThreePointersMade), tpa: asNum(p.sThreePointersAttempted),
        ftm: asNum(p.sFreeThrowsMade), fta: asNum(p.sFreeThrowsAttempted),
      });
    }
  }
  players.sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));

  return { teams, shots, players, totals, pbp: parsePbp(root), flow: parseFlow(root), runs: analyzeScoringRuns(root), period: asNum(root.period) };
}

/** Score progression for the game-flow chart. The pbp is newest-first; reverse it and
 *  sample a point whenever the score changes. t = seconds elapsed (10-min quarters, 5-min OT). */
function parseFlow(root: Record<string, unknown>): FlowPoint[] {
  const raw = Array.isArray(root.pbp) ? [...root.pbp].reverse() : [];
  const out: FlowPoint[] = [{ t: 0, h: 0, a: 0, per: 1 }];
  let lastH = 0, lastA = 0;
  for (const ev of raw) {
    const e = (ev && typeof ev === "object" ? ev : {}) as Record<string, unknown>;
    const h = asNum(e.s1), a = asNum(e.s2);
    if (h == null || a == null || (h === lastH && a === lastA)) continue;
    lastH = h; lastA = a;
    const per = asNum(e.period) ?? 1;
    const gt = typeof e.gt === "string" ? e.gt : "";
    const m = /^(\d+):(\d+)$/.exec(gt);
    const secsLeft = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    const periodLen = per <= 4 ? 600 : 300;
    const before = per <= 4 ? (per - 1) * 600 : 2400 + (per - 5) * 300;
    out.push({ t: before + (periodLen - secsLeft), h, a, per });
  }
  return out;
}

/** Assist network (passer→scorer) + shot context (paint/fastbreak/off-TO/2nd-chance) per team. */
function parsePbp(root: Record<string, unknown>): Record<number, PbpSummary> {
  const out: Record<number, PbpSummary> = {
    1: { assists: [], context: { totalMade: 0, paint: 0, fastbreak: 0, offTurnover: 0, secondChance: 0 } },
    2: { assists: [], context: { totalMade: 0, paint: 0, fastbreak: 0, offTurnover: 0, secondChance: 0 } },
  };
  const pbp = Array.isArray(root.pbp) ? root.pbp : [];
  const events = pbp.filter((e): e is Record<string, unknown> => !!e && typeof e === "object");

  // Index made field goals by their event number, to resolve assists + context.
  const madeShot = new Map<number, { tno: number; player: string; three: boolean }>();
  for (const e of events) {
    const at = asStr(e.actionType);
    if ((at === "2pt" || at === "3pt") && e.success === 1) {
      const an = asNum(e.actionNumber); const tno = asNum(e.tno);
      if (an != null && (tno === 1 || tno === 2)) madeShot.set(an, { tno, player: asStr(e.player) ?? "—", three: at === "3pt" });
    }
  }

  // Assists: an assist event references the made shot via previousAction.
  const links = new Map<string, AssistLink & { tno: number }>();
  for (const e of events) {
    if (asStr(e.actionType) !== "assist") continue;
    const tno = asNum(e.tno); const prev = asNum(e.previousAction);
    if ((tno !== 1 && tno !== 2) || prev == null) continue;
    const shot = madeShot.get(prev);
    if (!shot || shot.tno !== tno) continue;
    const passer = asStr(e.player) ?? "—", scorer = shot.player;
    const key = `${tno}|${passer}|${scorer}`;
    const l = links.get(key) ?? { tno, passer, scorer, count: 0, threes: 0 };
    l.count += 1; if (shot.three) l.threes += 1; links.set(key, l);
  }
  for (const l of links.values()) out[l.tno].assists.push({ passer: l.passer, scorer: l.scorer, count: l.count, threes: l.threes });
  for (const tno of [1, 2]) out[tno].assists.sort((a, b) => b.count - a.count);

  // Shot context: qualifiers on each made field goal.
  for (const e of events) {
    const at = asStr(e.actionType);
    if (!((at === "2pt" || at === "3pt") && e.success === 1)) continue;
    const tno = asNum(e.tno); if (tno !== 1 && tno !== 2) continue;
    const q = Array.isArray(e.qualifier) ? (e.qualifier as unknown[]).map((x) => String(x)) : [];
    const c = out[tno].context;
    c.totalMade += 1;
    if (q.includes("pointsinthepaint")) c.paint += 1;
    if (q.includes("fastbreak")) c.fastbreak += 1;
    if (q.includes("fromturnover")) c.offTurnover += 1;
    if (q.includes("2ndchance")) c.secondChance += 1;
  }
  return out;
}

// ── Scoring-run anatomy ───────────────────────────────────────────────────────
// A "run" is a maximal stretch where only one team scored. Inside that window the
// play-by-play tells us HOW those points came (transition off turnovers, second-chance,
// paint attacks, threes, assisted vs unassisted) and what the OTHER team did to allow it
// (turnovers, missed shots, a stoppage timeout). Answers the coach's real question:
// "when a team goes on a run, what is the scorer doing right and the other team doing wrong?"

type PbpEv = {
  idx: number; per: number; gt: string | null;
  tno: number | null; actionType: string | null; subType: string | null;
  success: number | null; qualifiers: string[];
  dH: number; dA: number;        // score delta this event contributed (home / away)
  h: number; a: number;          // running score after this event
};

const isMadeFG = (e: PbpEv) => (e.actionType === "2pt" || e.actionType === "3pt") && e.success === 1;
const isMissFG = (e: PbpEv) => (e.actionType === "2pt" || e.actionType === "3pt") && e.success === 0;
const share = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Build the per-run anatomy + per-team recipe. threshold = min unanswered points to count. */
export function analyzeScoringRuns(root: Record<string, unknown>, threshold = 6): RunAnalysis {
  const raw = Array.isArray(root.pbp) ? [...root.pbp].reverse() : [];
  const evs: PbpEv[] = [];
  let lastH = 0, lastA = 0;
  raw.forEach((r, i) => {
    const e = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const h = asNum(e.s1) ?? lastH, a = asNum(e.s2) ?? lastA;
    evs.push({
      idx: i, per: asNum(e.period) ?? 1, gt: typeof e.gt === "string" ? e.gt : null,
      tno: asNum(e.tno), actionType: asStr(e.actionType), subType: asStr(e.subType),
      success: asNum(e.success),
      qualifiers: Array.isArray(e.qualifier) ? (e.qualifier as unknown[]).map(String) : [],
      dH: Math.max(0, h - lastH), dA: Math.max(0, a - lastA), h, a,
    });
    lastH = h; lastA = a;
  });

  // Scoring plays in order: which team scored and how many points.
  const plays = evs
    .map((e) => ({ idx: e.idx, team: e.dH > 0 ? 1 : e.dA > 0 ? 2 : 0, pts: e.dH > 0 ? e.dH : e.dA }))
    .filter((p) => p.team === 1 || p.team === 2);

  const runs: ScoringRun[] = [];
  let i = 0;
  while (i < plays.length) {
    const team = plays[i].team;
    let j = i, pts = 0;
    while (j < plays.length && plays[j].team === team) { pts += plays[j].pts; j++; }
    if (pts >= threshold) {
      // Window = the whole drought: from just after the opponent's previous score to just
      // before their NEXT score (the play that ends the run). This captures the responding
      // timeout and the opponent's late misses/turnovers, not only the run's own baskets.
      const startEv = i === 0 ? 0 : plays[i - 1].idx + 1;
      const endEv = j < plays.length ? plays[j].idx - 1 : evs.length - 1;
      const firstScore = evs[plays[i].idx], lastScore = evs[plays[j - 1].idx];
      const run: ScoringRun = {
        team, points: pts,
        startPer: firstScore.per, startClock: firstScore.gt,
        endPer: lastScore.per, endClock: lastScore.gt,
        scoreHome: lastScore.h, scoreAway: lastScore.a,
        made2: 0, made3: 0, ftMade: 0, paint: 0, fastbreak: 0, offTurnover: 0, secondChance: 0,
        assisted: 0, steals: 0, oreb: 0, oppTurnovers: 0, oppMissed: 0, oppTimeout: false,
      };
      for (let k = startEv; k <= endEv; k++) {
        const e = evs[k];
        if (e.tno === team) {
          if (isMadeFG(e)) {
            if (e.actionType === "3pt") run.made3++; else run.made2++;
            if (e.qualifiers.includes("pointsinthepaint")) run.paint++;
            if (e.qualifiers.includes("fastbreak")) run.fastbreak++;
            if (e.qualifiers.includes("fromturnover")) run.offTurnover++;
            if (e.qualifiers.includes("2ndchance")) run.secondChance++;
          } else if (e.actionType === "freethrow" && e.success === 1) run.ftMade++;
          else if (e.actionType === "assist") run.assisted++;
          else if (e.actionType === "steal") run.steals++;
          else if (e.actionType === "rebound" && e.subType === "offensive") run.oreb++;
        } else if (e.tno && e.tno !== team) {
          if (e.actionType === "turnover") run.oppTurnovers++;
          else if (isMissFG(e)) run.oppMissed++;
          else if (e.actionType === "timeout") run.oppTimeout = true;
        }
      }
      runs.push(run);
    }
    i = j;
  }

  const recipe: Record<number, RunRecipe> = {};
  for (const team of [1, 2]) {
    const rs = runs.filter((r) => r.team === team);
    const madeFG = rs.reduce((s, r) => s + r.made2 + r.made3, 0);
    const sum = (f: (r: ScoringRun) => number) => rs.reduce((s, r) => s + f(r), 0);
    recipe[team] = {
      team, runs: rs.length, totalPoints: sum((r) => r.points), biggestRun: rs.reduce((m, r) => Math.max(m, r.points), 0),
      madeFG,
      paintPct: share(sum((r) => r.paint), madeFG), threePct: share(sum((r) => r.made3), madeFG),
      fastbreakPct: share(sum((r) => r.fastbreak), madeFG), offTurnoverPct: share(sum((r) => r.offTurnover), madeFG),
      secondChancePct: share(sum((r) => r.secondChance), madeFG), assistedPct: share(sum((r) => r.assisted), madeFG),
      steals: sum((r) => r.steals), oreb: sum((r) => r.oreb),
      oppTurnovers: sum((r) => r.oppTurnovers), oppMissed: sum((r) => r.oppMissed),
    };
  }
  return { threshold, runs, recipe };
}

// ── Cross-game run trends ─────────────────────────────────────────────────────
// "When a team goes on a BIG run (>=8), what does it have in common that ordinary
// scoring doesn't?" — pool every run across the ingested games, split BIG (>=big) vs
// CONTROL (the smaller 6-7 runs), and measure the LIFT of each driver (big-run mean share
// minus control mean share). The strongest positive lift is the correlate. Descriptive,
// small-sample honest: confidence is gated on how many big runs we actually have.

const DRIVER_KEYS = ["offTurnover", "transition", "paint", "three", "secondChance", "assisted"] as const;
export type DriverKey = (typeof DRIVER_KEYS)[number];

export type RunTrendDriver = { key: DriverKey; bigMeanPct: number; controlMeanPct: number; lift: number };
export type RunTrend = {
  perspective: "ours" | "against";
  bigThreshold: number;
  games: number;
  bigCount: number; controlCount: number; bigPointsTotal: number;
  basis: "lift" | "composition";                 // "lift" once there are enough control runs to compare against
  drivers: RunTrendDriver[];                      // ranked (by lift, or by big-share when basis="composition")
  bigMeans: { steals: number; oreb: number; oppTurnovers: number; oppMissed: number };
  controlMeans: { steals: number; oreb: number; oppTurnovers: number; oppMissed: number };
  timeoutRate: number | null;                     // % of big runs that forced a stopping timeout
  leadCorrelate: RunTrendDriver | null;           // the standout driver, if the signal + sample justify one
  confidence: "none" | "low" | "moderate" | "good";
};
export type RunTrendAnalysis = { bigThreshold: number; ours: RunTrend; against: RunTrend };

const r1 = (n: number) => Math.round(n * 10) / 10;
const runFG = (r: ScoringRun) => r.made2 + r.made3;
const driverCount = (r: ScoringRun, k: DriverKey): number =>
  k === "offTurnover" ? r.offTurnover : k === "transition" ? r.fastbreak : k === "paint" ? r.paint
  : k === "three" ? r.made3 : k === "secondChance" ? r.secondChance : r.assisted;

function meanShare(runs: ScoringRun[], k: DriverKey): number {
  const withFG = runs.filter((r) => runFG(r) > 0);
  if (!withFG.length) return 0;
  return withFG.reduce((s, r) => s + (100 * driverCount(r, k)) / runFG(r), 0) / withFG.length;
}
function meanCounts(runs: ScoringRun[]) {
  const n = runs.length || 1;
  const s = (f: (r: ScoringRun) => number) => r1(runs.reduce((a, r) => a + f(r), 0) / n);
  return { steals: s((r) => r.steals), oreb: s((r) => r.oreb), oppTurnovers: s((r) => r.oppTurnovers), oppMissed: s((r) => r.oppMissed) };
}

function buildTrend(perspective: "ours" | "against", allRuns: ScoringRun[], bigThreshold: number, games: number): RunTrend {
  const big = allRuns.filter((r) => r.points >= bigThreshold);
  const control = allRuns.filter((r) => r.points < bigThreshold);
  const basis: "lift" | "composition" = control.length >= 3 ? "lift" : "composition";
  const drivers: RunTrendDriver[] = DRIVER_KEYS.map((k) => {
    const b = meanShare(big, k), c = meanShare(control, k);
    return { key: k, bigMeanPct: r1(b), controlMeanPct: r1(c), lift: r1(b - c) };
  }).sort((a, b) => (basis === "lift" ? b.lift - a.lift : b.bigMeanPct - a.bigMeanPct));
  const confidence: RunTrend["confidence"] = big.length >= 10 ? "good" : big.length >= 5 ? "moderate" : big.length >= 2 ? "low" : "none";
  const top = drivers[0] ?? null;
  const strong = top && confidence !== "none" && (basis === "lift" ? top.lift >= 8 : top.bigMeanPct >= 40) ? top : null;
  return {
    perspective, bigThreshold, games,
    bigCount: big.length, controlCount: control.length, bigPointsTotal: big.reduce((s, r) => s + r.points, 0),
    basis, drivers, bigMeans: meanCounts(big), controlMeans: meanCounts(control),
    timeoutRate: big.length ? r1((100 * big.filter((r) => r.oppTimeout).length) / big.length) : null,
    leadCorrelate: strong, confidence,
  };
}

/** Pool runs across games and find what BIG runs (>=bigThreshold) have in common, from
 *  both perspectives: our own big runs, and big runs scored against us. */
export function analyzeRunTrends(games: Array<{ runs: RunAnalysis; ownTno: number }>, bigThreshold = 8): RunTrendAnalysis {
  const ours: ScoringRun[] = [], against: ScoringRun[] = [];
  let gc = 0;
  for (const g of games) {
    if (!g?.runs || !Array.isArray(g.runs.runs)) continue;
    gc++;
    const oppTno = g.ownTno === 1 ? 2 : 1;
    for (const r of g.runs.runs) {
      if (r.team === g.ownTno) ours.push(r);
      else if (r.team === oppTno) against.push(r);
    }
  }
  return { bigThreshold, ours: buildTrend("ours", ours, bigThreshold, gc), against: buildTrend("against", against, bigThreshold, gc) };
}

// ── Shot-chart geometry ──────────────────────────────────────────────────────
// The feed plots both teams on the full court (0-100 each axis). Fold every shot onto
// ONE half so a per-team/per-player chart reads on a half-court: mirror the far half.
// The attacking basket then sits near the low-x baseline, centred on y. (Orientation is
// verified against a real pull in prod; the fold is symmetric so it is robust either way.)
export function foldShot(x: number, y: number): { x: number; y: number } {
  return x <= 50 ? { x, y } : { x: 100 - x, y: 100 - y };
}

// ── Per-player shooting tendencies (coordinate-free — from actionType/subType) ──
export type PlayerTendency = {
  key: string;                 // shirt|name
  name: string;
  shirt: string | null;
  fgm: number; fga: number; fgPct: number | null;
  twoM: number; twoA: number; twoPct: number | null;
  tpm: number; tpa: number; tpPct: number | null;
  byType: Array<{ type: string; made: number; att: number; pct: number | null }>;
};

const pct = (m: number, a: number): number | null => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);

/** Aggregate one team's shots into per-player shooting tendencies (most attempts first). */
export function playerTendencies(shots: FibaShot[]): PlayerTendency[] {
  const by = new Map<string, PlayerTendency & { types: Map<string, { made: number; att: number }> }>();
  for (const s of shots) {
    const key = `${s.shirt ?? ""}|${s.playerName}`;
    let p = by.get(key);
    if (!p) { p = { key, name: s.playerName, shirt: s.shirt, fgm: 0, fga: 0, fgPct: null, twoM: 0, twoA: 0, twoPct: null, tpm: 0, tpa: 0, tpPct: null, byType: [], types: new Map() }; by.set(key, p); }
    const made = s.result === 1 ? 1 : 0;
    p.fga += 1; p.fgm += made;
    if (s.actionType === "3pt") { p.tpa += 1; p.tpm += made; } else { p.twoA += 1; p.twoM += made; }
    const t = s.subType ?? "other";
    const tt = p.types.get(t) ?? { made: 0, att: 0 }; tt.att += 1; tt.made += made; p.types.set(t, tt);
  }
  const out = [...by.values()].map((p) => ({
    key: p.key, name: p.name, shirt: p.shirt,
    fgm: p.fgm, fga: p.fga, fgPct: pct(p.fgm, p.fga),
    twoM: p.twoM, twoA: p.twoA, twoPct: pct(p.twoM, p.twoA),
    tpm: p.tpm, tpa: p.tpa, tpPct: pct(p.tpm, p.tpa),
    byType: [...p.types.entries()].map(([type, v]) => ({ type, made: v.made, att: v.att, pct: pct(v.made, v.att) })).sort((a, b) => b.att - a.att),
  }));
  return out.sort((a, b) => b.fga - a.fga);
}
