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
  parseInstatPlayerShooting,
  instatPlayerShootingRows,
  resolveOwnerIsHome,
  parseInstatLineups,
  instatOwnerLineups,
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

// ── owner-side assignment (which team is ours) ───────────────────────────────

describe("owner-side assignment", () => {
  const SYNTH = "10.05.2026. Valencia BC 86:88 Bitci Baskonia\nBox score\nVAL BAS\nPOINTS 86 88\nOffensive efficiency";
  const parse = parseInstatTeamStatsText(SYNTH)!;
  const ownGamePts = (ctx: InstatIngestContext) =>
    instatTeamMatchRows(parse, ctx).find((r) => r.period === "game" && !r.isOpponent)?.points;

  it("defaults to HOME when the team name matches neither side", () => {
    expect(ownGamePts({ ownerTeamId: "x", matchRef: "m", ownerTeamName: "Breidablik" })).toBe(86);
  });
  it("matches the away side by name", () => {
    expect(ownGamePts({ ownerTeamId: "x", matchRef: "m", ownerTeamName: "Baskonia" })).toBe(88);
  });
  it("respects an explicit ownerIsHome override (the coach's swap)", () => {
    expect(ownGamePts({ ownerTeamId: "x", matchRef: "m", ownerTeamName: "Valencia BC", ownerIsHome: false })).toBe(88);
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

    // FG Playtypes + offensive-efficiency shooting survive into advanced.extra.
    const extra = val.advanced?.extra as Record<string, number | null> | undefined;
    expect(extra).toBeTruthy();
    // Transitions (VAL/home own column): 6 - 9.
    expect(extra?.eff_transitionShot_m).toBe(6);
    expect(extra?.eff_transitionShot_a).toBe(9);
    // Positional attacks (VAL own): 44 - 77 — was clobbered by the longer
    // "positional attacks points 65 56" line until the shot-rest guard.
    expect(extra?.eff_positional_m).toBe(44);
    expect(extra?.eff_positional_a).toBe(77);
    // FG-playtypes carried through (VAL isolations own: 3 - 5).
    expect(extra?.pt_iso_m).toBe(3);
    expect(extra?.pt_iso_a).toBe(5);
  });

  it("parses the per-player Field goals table (identity + zones) from the real PDF", async () => {
    const buffer = fs.readFileSync(FIXTURE);
    const { text } = await extractInstatGameReport({ buffer, ctx: CTX });
    const shooting = parseInstatPlayerShooting(text);
    // Two teams, each with a real roster.
    expect(shooting).toHaveLength(2);
    expect(shooting[0].teamName).toBe("Valencia BC");
    expect(shooting[0].players.length).toBeGreaterThanOrEqual(8);
    // De Larrea: 15 pts, FG 4-9, 3-pt 1-5, ~23.2 min (23:13).
    const dl = shooting[0].players.find((p) => p.name === "De Larrea")!;
    expect(dl).toBeTruthy();
    expect(dl.points).toBe(15);
    expect(dl.fg).toEqual({ m: 4, a: 9 });
    expect(dl.threePt).toEqual({ m: 1, a: 5 });
    expect(dl.minutes).toBeCloseTo(23.2, 1);
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

// ── effShots: the "positional attacks points" clobber guard (CI-safe synthetic) ──
describe("parseInstatTeamStatsText — offensive-efficiency shot rows", () => {
  const SYNTH = [
    "10.05.2026. Valencia BC 86:88 Bitci Baskonia",
    "Teams stats", "Box score", "VAL BAS", "POINTS 86 88",
    "Offensive efficiency",
    " Positional attacks 44 - 77", "57%", " 42 - 78", "54%",
    " Positional attacks points 65 56",       // longer-labelled line — must NOT clobber
    " Transitions 6 - 9", "67%", " 5 - 8", "63%",
    " Transition points 7 8",
    "FG Playtypes",
  ].join("\n");

  it("parses positional attacks and is not clobbered by the '... points' line", () => {
    const p = parseInstatTeamStatsText(SYNTH)!;
    expect(p.team.effShots.positional?.own).toEqual({ m: 44, a: 77 });
    expect(p.team.effShots.positional?.opp).toEqual({ m: 42, a: 78 });
    expect(p.team.effShots.transitionShot?.own).toEqual({ m: 6, a: 9 });
  });
});

// ── per-player "Field goals" table (p5/p8) ────────────────────────────────────
// Synthetic text mirroring the real InStat FG-table layout (licensed sample text
// is never committed): one clean line per player, each shot cell "N - N" or "-".
describe("parseInstatPlayerShooting", () => {
  const SAMPLE = [
    "Field goals. Valencia BC",
    "Field goals",
    "   Minutes Points Field goals 2 pt 3 pt In paint FG < 2m FG < 4m < 3 pt line 3-pt < 8m 3-pt > 8m",
    "32Nogues 22:57 2 1 - 3 1 - 2 0 - 1 1 - 1 1 - 1 - 0 - 1 0 - 1 -",
    "5De Larrea 23:13 15 4 - 9 3 - 4 1 - 5 2 - 3 1 - 1 1 - 2 1 - 1 1 - 5 -",
    "24Costello 13:34 6 2 - 5 - 2 - 5 - - - - 2 - 5 -",
    "7Key 08:58 - 0 - 3 0 - 1 0 - 2 0 - 1 0 - 1 - - 0 - 2 -",
    "Field goals - spots on map",
    "Field goals. Bitci Baskonia",
    "Field goals",
    "   Minutes Points Field goals 2 pt 3 pt In paint FG < 2m FG < 4m < 3 pt line 3-pt < 8m 3-pt > 8m",
    "1Taylor 17:19 10 5 - 8 5 - 8 - 4 - 6 2 - 4 2 - 2 1 - 2 - -",
    "Field goals - spots on map",
  ].join("\n");

  it("returns one entry per team in report order, with players", () => {
    const parsed = parseInstatPlayerShooting(SAMPLE);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].teamName).toBe("Valencia BC");
    expect(parsed[1].teamName).toBe("Bitci Baskonia");
    expect(parsed[0].players).toHaveLength(4);
    expect(parsed[1].players.map((p) => p.name)).toEqual(["Taylor"]);
  });

  it("parses identity, minutes and points", () => {
    const [val] = parseInstatPlayerShooting(SAMPLE);
    const dl = val.players.find((p) => p.name === "De Larrea")!; // multi-word name
    expect(dl.jersey).toBe(5);
    expect(dl.minutes).toBe(23.2); // 23:13 → 23 + 13/60 = 23.216 → 23.2
    expect(dl.points).toBe(15);
    expect(dl.fg).toEqual({ m: 4, a: 9 });
    expect(dl.threePt).toEqual({ m: 1, a: 5 });
  });

  it("maps distance/zone bands and treats a lone '-' as an empty cell", () => {
    const [val] = parseInstatPlayerShooting(SAMPLE);
    const cost = val.players.find((p) => p.name === "Costello")!;
    // 6 2-5 | - | 2-5 | - | - | - | - | 2-5 | -
    expect(cost.fg).toEqual({ m: 2, a: 5 });
    expect(cost.twoPt).toEqual({ m: null, a: null });   // empty
    expect(cost.threePt).toEqual({ m: 2, a: 5 });
    expect(cost.inPaint).toEqual({ m: null, a: null }); // empty
    expect(cost.threeUnder8m).toEqual({ m: 2, a: 5 });
    expect(cost.threeOver8m).toEqual({ m: null, a: null });
  });

  it("handles a scoreless player ('-' points)", () => {
    const [val] = parseInstatPlayerShooting(SAMPLE);
    const key = val.players.find((p) => p.name === "Key")!;
    expect(key.points).toBeNull();
    expect(key.fg).toEqual({ m: 0, a: 3 });
  });
});

// ── per-player rows mapper (identity + zones → BasketballBoxScoreRow) ─────────
describe("instatPlayerShootingRows", () => {
  const META = { date: "2026-05-10", home: "Valencia BC", away: "Bitci Baskonia", homeScore: 86, awayScore: 88 };
  const SHOOTING = [
    { teamName: "Valencia BC", players: [
      { jersey: 5, name: "De Larrea", minutes: 23.2, points: 15,
        fg: { m: 4, a: 9 }, twoPt: { m: 3, a: 4 }, threePt: { m: 1, a: 5 },
        inPaint: { m: 2, a: 3 }, fgUnder2m: { m: 1, a: 1 }, fgUnder4m: { m: 1, a: 2 },
        under3ptLine: { m: 1, a: 1 }, threeUnder8m: { m: 1, a: 5 }, threeOver8m: { m: null, a: null } },
    ] },
    { teamName: "Bitci Baskonia", players: [
      { jersey: 1, name: "Taylor", minutes: 17.3, points: 10,
        fg: { m: 5, a: 8 }, twoPt: { m: 5, a: 8 }, threePt: { m: null, a: null },
        inPaint: { m: 4, a: 6 }, fgUnder2m: { m: 2, a: 4 }, fgUnder4m: { m: 2, a: 2 },
        under3ptLine: { m: 1, a: 2 }, threeUnder8m: { m: null, a: null }, threeOver8m: { m: null, a: null } },
    ] },
  ];

  it("emits owner-side players only, with zones in advanced.extra", () => {
    const rows = instatPlayerShootingRows(SHOOTING, META, CTX); // ownerTeamName Valencia BC → home
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.playerName).toBe("De Larrea");
    expect(r.sourcePlayerRef).toBe("instat:de larrea"); // same key as the CSV adapter
    expect(r.source).toBe("instat");
    expect(r.playerId).toBeNull();
    expect(r.homeAway).toBe("home");
    expect(r.opponent).toBe("Bitci Baskonia");
    expect(r.points).toBe(15);
    expect(r.fgm).toBe(4); expect(r.fga).toBe(9);
    expect(r.tpm).toBe(1); expect(r.tpa).toBe(5);
    expect(r.advanced?.extra?.zone_paint_m).toBe(2);
    expect(r.advanced?.extra?.zone_3pt_gt8m_m).toBeNull();
  });

  it("follows the owner override to the away side", () => {
    expect(resolveOwnerIsHome(META, { ...CTX, ownerTeamName: "Baskonia" })).toBe(false);
    const rows = instatPlayerShootingRows(SHOOTING, META, { ...CTX, ownerTeamName: "Bitci Baskonia" });
    expect(rows).toHaveLength(1);
    expect(rows[0].playerName).toBe("Taylor");
    expect(rows[0].homeAway).toBe("away");
  });
});

// ── Lineups (p12-13) ──────────────────────────────────────────────────────────
describe("parseInstatLineups", () => {
  const SAMPLE = [
    "Lineups statistics. Valencia BC",
    "Lineups statistics",
    " TEAM STATS OPPONENT TEAM STATS",
    "24.Costello, 12.Sako",
    "10.Moore, 32.Nogues, 5.De Larrea",
    " ",
    "04:05+8",
    "  14 9 - 6 - 9",
    "67%",
    "13.Thompson, 4.Pradilla",
    "12.Sako, 10.Moore, 32.Nogues",
    " ",
    "03:21-6",
    "  2 5 - 1 - 4",
    "25%",
    "Lineups statistics. Bitci Baskonia",
    "Lineups statistics",
    "1.A, 2.B",
    "3.C, 4.D, 5.E",
    " ",
    "05:00+2",
    "  10 8 - 3 - 6",
  ].join("\n");

  it("parses 5-man units, minutes, +/- and points for/against per team", () => {
    const p = parseInstatLineups(SAMPLE);
    expect(p.map((s) => s.teamName)).toEqual(["Valencia BC", "Bitci Baskonia"]);
    const val = p[0].lineups;
    expect(val).toHaveLength(2);
    expect(val[0].players).toEqual(["24.Costello", "12.Sako", "10.Moore", "32.Nogues", "5.De Larrea"]);
    expect(val[0].minutes).toBe(4.1); // 04:05
    expect(val[0].plusMinus).toBe(8);
    expect(val[0].pointsFor).toBe(14);
    expect(val[0].pointsAgainst).toBe(6); // 14 - 8 (derived, matches +/-)
    expect(val[1].plusMinus).toBe(-6);
    expect(val[1].pointsFor).toBe(2);
    expect(val[1].pointsAgainst).toBe(8); // 2 - (-6)
  });

  it("instatOwnerLineups selects the owner side", () => {
    const p = parseInstatLineups(SAMPLE);
    const meta = { date: "2026-05-10", home: "Valencia BC", away: "Bitci Baskonia", homeScore: 86, awayScore: 88 };
    const own = instatOwnerLineups(p, meta, CTX); // ownerTeamName Valencia BC → home
    expect(own).toHaveLength(2);
    expect(own[0].players[0]).toBe("24.Costello");
    const away = instatOwnerLineups(p, meta, { ...CTX, ownerTeamName: "Bitci Baskonia" });
    expect(away[0].players).toEqual(["1.A", "2.B", "3.C", "4.D", "5.E"]);
  });
});
