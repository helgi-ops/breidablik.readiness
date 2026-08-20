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
  pointsInPaint: number | null; fastbreak: number | null; pointsOffTurnovers: number | null; secondChance: number | null; bench: number | null;
};

export type FibaGame = { teams: FibaTeam[]; shots: FibaShot[]; players: FibaPlayerBox[]; totals: FibaTeamTotals[]; period: number | null };

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
      pointsInPaint: asNum(t.tot_sPointsInThePaint), fastbreak: asNum(t.tot_sPointsFastBreak),
      pointsOffTurnovers: asNum(t.tot_sPointsFromTurnovers), secondChance: asNum(t.tot_sPointsSecondChance), bench: asNum(t.tot_sBenchPoints),
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

  return { teams, shots, players, totals, period: asNum(root.period) };
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
