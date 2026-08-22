import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { computeWinFactors, criticalR, boxFromTotals, teamGamesFromFibaGame, beatTeamPlan, computeTeamForm, ownTeamGameFromFibaGame, teamGameForTeam, type TeamGame, type TeamBox } from "../winFactors";

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
  it("computeTeamForm builds a game log, averages, a trend and a verdict for one team", () => {
    // 6 games ordered by id; the team improves in the recent half.
    const mk = (id: string, pf: number, pa: number, opp: string) => ({
      own_name: "NJA", opp_name: opp, match_id: id,
      own_totals: { points: pf, fgm: 30, fga: 62, tpm: 8, tpa: 22, ftm: 15, fta: 20, oreb: 10, dreb: 28, tov: 12, ast: 18 },
      opp_totals: { points: pa, fgm: 28, fga: 63, tpm: 7, tpa: 23, ftm: 14, fta: 19, oreb: 9, dreb: 27, tov: 13, ast: 15 },
    });
    const rows = [mk("101", 70, 78, "A"), mk("102", 72, 75, "B"), mk("103", 74, 76, "C"), mk("104", 88, 70, "D"), mk("105", 90, 72, "E"), mk("106", 95, 74, "F")];
    const games = rows.map((r) => ownTeamGameFromFibaGame(r)).filter((g): g is TeamGame => g != null);
    const form = computeTeamForm(games);
    expect(form.games).toBe(6);
    expect(form.log).toHaveLength(6);
    expect(form.log[0].opponent).toBe("A"); // ordered by id
    expect(form.wins).toBe(3);              // last three are wins
    expect(form.trend).not.toBeNull();
    expect(form.trend!.recentNet).toBeGreaterThan(form.trend!.earlierNet); // improving
    expect(form.trend!.note.en.toLowerCase()).toContain("up");
    expect(form.verdict.en).toContain("NJA");
    expect(form.confidence.en).toContain("6 loaded games");
  });
  it("ownTeamGameFromFibaGame needs shooting totals", () => {
    expect(ownTeamGameFromFibaGame({ own_totals: { points: 5 }, opp_totals: { points: 3 } })).toBeNull();
  });
  it("flags a single-team-dominated sample as not a league", () => {
    // One team (X) in every game; opponents appear once → not a real league.
    const g = (opp: string, pf: number, pa: number) => ({
      own_name: "X", opp_name: opp, match_id: `${opp}`,
      own_totals: { points: pf, fgm: 30, fga: 62, tpm: 8, tpa: 22, ftm: 15, fta: 20, oreb: 10, dreb: 28, tov: 12, ast: 18 },
      opp_totals: { points: pa, fgm: 28, fga: 63, tpm: 7, tpa: 23, ftm: 14, fta: 19, oreb: 9, dreb: 27, tov: 13, ast: 15 },
    });
    const rows = [g("A", 90, 80), g("B", 85, 82), g("C", 88, 70), g("D", 79, 84), g("E", 92, 75)];
    const wf = computeWinFactors(rows.flatMap((r) => teamGamesFromFibaGame(r)));
    expect(wf.isLeague).toBe(false);
    expect(wf.dominantTeam).toBe("X");
  });
  it("teamGameForTeam orients to the named team whether it is home or away", () => {
    const matches = (n: string | null | undefined) => n === "NJA";
    const home = teamGameForTeam({ own_name: "NJA", opp_name: "KR", match_id: "1", own_totals: { points: 90, fga: 60 }, opp_totals: { points: 80, fga: 62 } }, matches)!;
    expect(home.team).toBe("NJA"); expect(home.win).toBe(true); expect(home.box.pts).toBe(90);
    const away = teamGameForTeam({ own_name: "KR", opp_name: "NJA", match_id: "2", own_totals: { points: 88, fga: 61 }, opp_totals: { points: 95, fga: 63 } }, matches)!;
    expect(away.team).toBe("NJA"); expect(away.win).toBe(true); expect(away.box.pts).toBe(95); expect(away.opponent).toBe("KR");
    expect(teamGameForTeam({ own_name: "KR", opp_name: "Valur", match_id: "3", own_totals: { points: 70, fga: 60 }, opp_totals: { points: 72, fga: 60 } }, matches)).toBeNull();
  });
  it("a tiny 2-team sample is flagged unreliable and hedges instead of claiming r=±1", () => {
    // A 4-game final between two teams — degenerate for team-level correlation.
    const games = [
      { own_name: "A", opp_name: "B", match_id: "1", own_totals: { points: 85, fgm: 30, fga: 62, tpm: 8, tpa: 22, ftm: 17, fta: 22, oreb: 10, dreb: 28, tov: 12, ast: 18 }, opp_totals: { points: 80, fgm: 29, fga: 64, tpm: 7, tpa: 24, ftm: 15, fta: 20, oreb: 9, dreb: 27, tov: 14, ast: 15 } },
      { own_name: "A", opp_name: "B", match_id: "2", own_totals: { points: 86, fgm: 31, fga: 60, tpm: 9, tpa: 20, ftm: 15, fta: 18, oreb: 8, dreb: 30, tov: 11, ast: 20 }, opp_totals: { points: 83, fgm: 30, fga: 63, tpm: 6, tpa: 23, ftm: 17, fta: 21, oreb: 10, dreb: 26, tov: 13, ast: 16 } },
      { own_name: "A", opp_name: "B", match_id: "3", own_totals: { points: 89, fgm: 32, fga: 66, tpm: 7, tpa: 21, ftm: 18, fta: 24, oreb: 11, dreb: 29, tov: 13, ast: 19 }, opp_totals: { points: 94, fgm: 34, fga: 65, tpm: 10, tpa: 26, ftm: 16, fta: 20, oreb: 8, dreb: 25, tov: 10, ast: 21 } },
      { own_name: "A", opp_name: "B", match_id: "4", own_totals: { points: 109, fgm: 40, fga: 70, tpm: 11, tpa: 28, ftm: 18, fta: 22, oreb: 12, dreb: 31, tov: 9, ast: 24 }, opp_totals: { points: 102, fgm: 38, fga: 72, tpm: 9, tpa: 27, ftm: 17, fta: 23, oreb: 10, dreb: 28, tov: 12, ast: 20 } },
    ];
    const wf = computeWinFactors(games.flatMap((g) => teamGamesFromFibaGame(g)));
    expect(wf.teams).toBe(2);
    expect(wf.teamReliable).toBe(false);
    expect(wf.teamLevel.every((f) => !f.significant)).toBe(true); // no degenerate r=±1 flagged
    expect(wf.verdict.en.toLowerCase()).toContain("too small");
    expect(wf.confidence.en).toContain("too few");
    // beatTeamPlan has nothing significant to build on → empty advisory
    const bp = beatTeamPlan(games.flatMap((g) => teamGamesFromFibaGame(g)), "A")!;
    expect(bp.exploit.length + bp.neutralize.length).toBe(0);
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
    expect(wf!.isLeague).toBe(true); expect(wf!.dominantTeam).toBeNull(); // balanced → a real league
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
  it("beatTeamPlan exposes exploit/neutralize aligned with the team's real profile", () => {
    if (!has) return;
    // ÍA (worst defense in the league) → their defense is exploitable.
    const ia = beatTeamPlan(tgs, "ÍA")!;
    expect(ia).not.toBeNull();
    expect(ia.games).toBe(22);
    expect(ia.exploit.some((i) => i.key === "oppEfg" || i.key === "pa")).toBe(true);
    // Grindavík (best defense) → defense is a strength to neutralize, not exploit.
    const gr = beatTeamPlan(tgs, "Grindavík")!;
    expect(gr.neutralize.some((i) => i.key === "oppEfg" || i.key === "pa")).toBe(true);
    expect(beatTeamPlan(tgs, "Nonexistent")).toBeNull();
  });
});
