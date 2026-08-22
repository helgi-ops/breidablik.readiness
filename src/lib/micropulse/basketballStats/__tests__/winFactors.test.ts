import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { computeWinFactors, criticalR, boxFromTotals, teamGamesFromFibaGame, type TeamGame, type TeamBox } from "../winFactors";

// ── Deterministic math checks (committed, no fixture) ──
describe("winFactors math", () => {
  it("criticalR matches the expected thresholds for n=12 and n=264", () => {
    expect(criticalR(12)).toBeCloseTo(0.58, 2);
    expect(criticalR(264)).toBeCloseTo(0.12, 2);
  });
  it("builds two team-games from one stored game and flags the winner", () => {
    const tg = teamGamesFromFibaGame({ own_name: "A", opp_name: "B", own_totals: { points: 90, fgm: 30, fga: 60, tpm: 8, tpa: 20, ftm: 22, fta: 26, oreb: 10, dreb: 28, tov: 12, ast: 20 }, opp_totals: { points: 80, fgm: 28, fga: 62, tpm: 6, tpa: 22, ftm: 18, fta: 24, oreb: 8, dreb: 26, tov: 14, ast: 16 }, match_id: "g1" });
    expect(tg).toHaveLength(2);
    expect(tg[0].team).toBe("A"); expect(tg[0].win).toBe(true);
    expect(tg[1].team).toBe("B"); expect(tg[1].win).toBe(false);
  });
  it("skips games without shooting totals", () => {
    expect(teamGamesFromFibaGame({ own_totals: { points: 5 }, opp_totals: { points: 3 } })).toHaveLength(0);
  });
  it("boxFromTotals coerces missing/null fields to 0", () => {
    const b = boxFromTotals({ points: 88, fga: 70 });
    expect(b.pts).toBe(88); expect(b.fga).toBe(70); expect(b.tov).toBe(0);
  });
});

// ── Full validation against the 132-game Bónus deild karla 2025-26 fixture ──
const FIX = join(__dirname, "fixtures", "bonus-mens-2025-26-games.csv");
const CODE2NAME: Record<string, string> = { GRI: "Grindavík", TIN: "Tindastóll", STJ: "Stjarnan", VAL: "Valur", KEF: "Keflavík", KR: "KR", "KR.": "KR", "ÍR": "ÍR", "ÍR.": "ÍR", NJA: "Njarðvík", "ÁLF": "Álftanes", ALF: "Álftanes", "ÁRM": "Ármann", ARM: "Ármann", "ÞÓR": "Þór Þ.", THO: "Þór Þ.", "ÍA": "ÍA", "ÍA.": "ÍA" };
const STANDINGS: Record<string, number> = { Grindavík: 18, Tindastóll: 17, Stjarnan: 15, Valur: 14, Keflavík: 12, KR: 12, "ÍR": 11, Njarðvík: 8, Álftanes: 8, Ármann: 7, "Þór Þ.": 6, "ÍA": 4 };

function loadFixtureTeamGames(): TeamGame[] {
  const lines = readFileSync(FIX, "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const idx = (c: string) => head.indexOf(c);
  const num = (r: string[], c: string) => Number(r[idx(c)]);
  const byGame = new Map<string, string[][]>();
  for (const line of lines.slice(1)) {
    const r = line.split(",");
    const g = r[idx("gameid")];
    const a = byGame.get(g) ?? []; a.push(r); byGame.set(g, a);
  }
  const box = (r: string[]): TeamBox => ({ pts: num(r, "pts"), fgm: num(r, "fgm"), fga: num(r, "fga"), tpm: num(r, "tpm"), tpa: num(r, "tpa"), ftm: num(r, "ftm"), fta: num(r, "fta"), oreb: num(r, "oreb"), dreb: num(r, "dreb"), tov: num(r, "tov"), stl: num(r, "stl"), blk: num(r, "blk"), ast: num(r, "ast") });
  const out: TeamGame[] = [];
  for (const [g, rows] of byGame) {
    if (rows.length !== 2) continue;
    for (let i = 0; i < 2; i++) {
      const me = rows[i], opp = rows[1 - i];
      out.push({ gameId: g, team: CODE2NAME[me[idx("team")]] ?? me[idx("team")], win: num(me, "win") === 1, box: box(me), oppBox: box(opp) });
    }
  }
  return out;
}

describe("winFactors — Bónus deild karla 2025-26 (132 games)", () => {
  const has = existsSync(FIX);
  const tgs = has ? loadFixtureTeamGames() : [];
  const wf = has ? computeWinFactors(tgs) : null;
  const gr = (k: string) => wf!.gameLevel.find((f) => f.key === k)!.r;
  const tr = (k: string) => wf!.teamLevel.find((f) => f.key === k)!.r;

  it("loads 132 games / 264 team-games / 12 teams", () => {
    if (!has) return;
    expect(wf!.games).toBe(132); expect(wf!.teamGames).toBe(264); expect(wf!.teams).toBe(12);
  });
  it("per-team win counts equal the kki.is standings (22 GP each)", () => {
    if (!has) return;
    for (const row of wf!.netRating) {
      expect(row.gp, `${row.team} GP`).toBe(22);
      expect(row.wins, `${row.team} wins`).toBe(STANDINGS[row.team]);
    }
  });
  it("reproduces the GAME-level r-table", () => {
    if (!has) return;
    expect(wf!.eFGDiffR).toBeCloseTo(0.66, 1);
    expect(gr("efg")).toBeCloseTo(0.47, 1);
    expect(gr("oppEfg")).toBeCloseTo(-0.47, 1);
    expect(gr("tp3")).toBeCloseTo(0.43, 1);
    expect(gr("ast")).toBeCloseTo(0.42, 1);
    expect(wf!.gameCritical).toBeCloseTo(0.12, 2);
  });
  it("reproduces the TEAM-level r-table (incl. defense + net rating)", () => {
    if (!has) return;
    expect(tr("net")).toBeCloseTo(0.88, 1);
    expect(tr("pa")).toBeCloseTo(-0.79, 1);
    expect(tr("ast")).toBeCloseTo(0.78, 1);
    expect(tr("oppEfg")).toBeCloseTo(-0.75, 1);
    expect(tr("tovPct")).toBeCloseTo(-0.66, 1);
    expect(wf!.teamCritical).toBeCloseTo(0.58, 2);
  });
  it("produces a plain-language verdict + supporting facts with confidence", () => {
    if (!has) return;
    expect(wf!.verdict.en.length).toBeGreaterThan(0);
    expect(wf!.verdict.is.length).toBeGreaterThan(0);
    expect(wf!.facts.length).toBeGreaterThanOrEqual(2);
    expect(wf!.confidence.en).toContain("264");
    // Grindavík: best record on the best defense — the named exception.
    expect(wf!.netRating.sort((a, b) => b.winPct - a.winPct)[0].team).toBe("Grindavík");
  });
});
