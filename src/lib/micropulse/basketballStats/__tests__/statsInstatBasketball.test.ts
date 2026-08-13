import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  parseInstatTitle,
  isInstatGameReportText,
  parseInstatTeamStatsText,
  instatTeamMatchRows,
  fourFactors,
  extractInstatGameReport,
} from "../statsInstatBasketballPdf";
import {
  isInstatBasketballHeader,
  parseInstatBasketballCsv,
} from "../statsInstatBasketballCsv";
import type { InstatIngestContext } from "../statsInstatBasketball";

const CTX: InstatIngestContext = {
  ownerTeamId: "team-uuid",
  matchRef: "val-bas-2026-05-10",
  ownerTeamName: "Valencia BC",
};

// ── deterministic units (always on) ──────────────────────────────────────────

describe("Instat title + fingerprint", () => {
  it("parses the game title", () => {
    const m = parseInstatTitle("10.05.2026. Valencia BC 86:88 Bitci Baskonia");
    expect(m).toEqual({
      date: "2026-05-10",
      home: "Valencia BC",
      away: "Bitci Baskonia",
      homeScore: 86,
      awayScore: 88,
    });
  });

  it("fingerprints an InStat game report text layer", () => {
    const text = "Teams stats\nBox score\nVAL BAS\nPOINTS 86 88\n1 period 26 23\nOffensive efficiency";
    expect(isInstatGameReportText(text)).toBe(true);
    expect(isInstatGameReportText("some random pdf about football xG")).toBe(false);
  });
});

describe("fourFactors", () => {
  it("computes eFG%, TO%, OREB%, FTF, PPP", () => {
    const ff = fourFactors(
      { fgm: 33, fga: 66, tpm: 8, ftm: 12, tov: 12, oreb: 9, dreb: 18, points: 86, possessions: 86 },
      { oreb: 5, dreb: 23 },
    );
    expect(ff.efgPct).toBeCloseTo(56.1, 1); // (33 + 0.5*8)/66
    expect(ff.toPct).toBeCloseTo(14.0, 1); // 12/86
    expect(ff.orebPct).toBeCloseTo(28.1, 1); // 9/(9+23)
    expect(ff.ftf).toBeCloseTo(18.2, 1); // 12/66
    expect(ff.ppp).toBeCloseTo(1.0, 2); // 86/86
  });
});

// ── CSV adapter (synthetic, always on) ───────────────────────────────────────

describe("Instat CSV adapter", () => {
  it("fingerprints a basketball player table and rejects football", () => {
    expect(isInstatBasketballHeader(["Player", "PTS", "FGM", "FGA", "3PM", "OREB", "AST"])).toBe(true);
    expect(isInstatBasketballHeader(["Player", "Points", "xG", "OBV", "Passes"])).toBe(false);
  });

  it("normalizes a player row incl. advanced metrics", () => {
    const rows = [
      { Player: "De Larrea", PTS: 15, FGM: 4, FGA: 9, "3PM": 1, "3PA": 5, OREB: 1, DREB: 3, REB: 4, AST: 7, STL: 1, TO: 2, "EFG%": "50%" },
      { Player: "Total", PTS: 86 },
    ];
    const { players, skipped } = parseInstatBasketballCsv(rows, CTX);
    expect(players).toHaveLength(1);
    expect(skipped.map((s) => s.player)).toContain("Total");
    const p = players[0];
    expect(p.playerName).toBe("De Larrea");
    expect(p.source).toBe("instat");
    expect(p.sourcePlayerRef).toBe("instat:de larrea");
    expect(p.points).toBe(15);
    expect(p.fgm).toBe(4);
    expect(p.fga).toBe(9);
    expect(p.tpm).toBe(1);
    expect(p.assists).toBe(7);
    expect(p.advanced?.efgPct).toBe(50);
    expect(p.playerId).toBeNull(); // resolved downstream, never guessed
  });
});

// ── PDF adapter against the committed real fixture ───────────────────────────

const FIXTURE = path.join(process.cwd(), "docs/samples/instat/InStat-Game-Report-Valencia-Baskonia.pdf");
const hasFixture = fs.existsSync(FIXTURE);

describe.skipIf(!hasFixture)("InStat Game Report PDF (real fixture)", () => {
  it("extracts team + per-quarter rows with Four Factors", async () => {
    const buffer = fs.readFileSync(FIXTURE);
    const { meta, teams } = await extractInstatGameReport({ buffer, ctx: CTX });

    expect(meta?.home).toBe("Valencia BC");
    expect(meta?.away).toBe("Bitci Baskonia");
    expect(meta?.homeScore).toBe(86);
    expect(meta?.awayScore).toBe(88);

    const game = teams.filter((r) => r.period === "game");
    expect(game).toHaveLength(2);

    // Valencia = our club (ownerTeamName), so isOpponent=false.
    const val = game.find((r) => r.isOpponent === false)!;
    const bas = game.find((r) => r.isOpponent === true)!;

    expect(val.points).toBe(86);
    expect(bas.points).toBe(88);
    expect(val.fgm).toBe(33);
    expect(val.fga).toBe(66);
    expect(bas.fgm).toBe(27);
    expect(bas.fga).toBe(56);
    expect(val.tpm).toBe(8);
    expect(val.oreb).toBe(9);
    expect(val.dreb).toBe(18);
    expect(bas.oreb).toBe(5);
    expect(val.turnovers).toBe(12);
    expect(val.possessions).toBe(86);
    expect(val.assists).toBe(16);
    expect(bas.assists).toBe(15);

    // Four Factors computed from the box.
    expect(val.advanced?.efgPct).toBeCloseTo(56.1, 1);
    expect(bas.advanced?.efgPct).toBeCloseTo(57.1, 1);
    expect(val.advanced?.orebPct).toBeCloseTo(28.1, 1);
    expect(val.advanced?.ppp).toBeCloseTo(1.0, 2);

    // Offensive-efficiency extras.
    expect(val.advanced?.pointsInPaint).toBe(46);
    expect(bas.advanced?.pointsInPaint).toBe(34);
    expect(val.advanced?.pointsOffTo).toBe(16);
    expect(val.advanced?.secondChancePts).toBe(4);

    // Per-quarter points: VAL 26/15/17/28, BAS 23/18/22/25.
    const valQ = teams.filter((r) => r.isOpponent === false && r.period.startsWith("q")).sort((a, b) => a.period.localeCompare(b.period));
    expect(valQ.map((r) => r.points)).toEqual([26, 15, 17, 28]);
    const basQ = teams.filter((r) => r.isOpponent === true && r.period.startsWith("q")).sort((a, b) => a.period.localeCompare(b.period));
    expect(basQ.map((r) => r.points)).toEqual([23, 18, 22, 25]);

    // Per-quarter field goals for VAL: 11-17, 6-17, 6-18, 10-14.
    expect(valQ.map((r) => `${r.fgm}-${r.fga}`)).toEqual(["11-17", "6-17", "6-18", "10-14"]);
  });

  it("parses the raw text layer directly", () => {
    const parse = parseInstatTeamStatsText(
      "10.05.2026. Valencia BC 86:88 Bitci Baskonia\nTeams stats\nBox score\nVAL BAS\nPOINTS 86 88\n1 period 26 23\n2 period 15 18\n3 period 17 22\n4 period 28 25\nFIELD GOALS 33 - 66\n50%\n27 - 56\n48%\nOffensive efficiency",
    );
    expect(parse?.team.points).toEqual({ own: 86, opp: 88 });
    expect(parse?.team.pointsByQ.map((q) => q.own)).toEqual([26, 15, 17, 28]);
    expect(parse?.team.fg.own).toEqual({ m: 33, a: 66 });
    expect(parse?.team.fg.opp).toEqual({ m: 27, a: 56 });
    const rows = instatTeamMatchRows(parse!, CTX);
    expect(rows.find((r) => r.period === "game" && !r.isOpponent)?.points).toBe(86);
  });
});
