import { describe, it, expect } from "vitest";
import {
  isMatchReportPdfText, parseTitle, parseTeamLinePage4, reconcile, validateMatchReportPlayers,
  type MatchReportPlayer,
} from "../matchReportExtract";

// Verbatim pdf-parse text of the title + page-4 "Match Statistics" from the committed
// sample (Thor Akureyri v Breiðablik, 2026-08-04). The AI per-player extraction is
// verified live (network); these cover the deterministic spine.
const SAMPLE = `MATCH REPORTTHOR AKUREYRI V BREIDABLIK
BESTA DEILD KARLA20262026-08-04
MATCH STATISTICS
THOR AKUREYRIBREIDABLIKvs
1Goals0
1.63xG1.71
1.62Cumulative xG1.61
13Shots14
3Shots On Target4
39Possession %61
74Pass Completion %83
358 (264)Total Passes (Completed)562 (464)
145Pressures106
36Pressure Regains28
23 (37)Tackles Won (Attempts)17 (20)
1Yellow Cards1
0 / 0Red Cards/Second Yellow Cards0 / 0
Thor AkureyriBreidablik
page 4Statsbomb Match Report Version 1.1`;

describe("Match Report PDF — deterministic spine", () => {
  it("fingerprints a real Match Report and rejects other PDFs", () => {
    expect(isMatchReportPdfText(SAMPLE)).toBe(true);
    expect(isMatchReportPdfText("Some other StatsBomb Squad export with OBV and Non Penalty xG")).toBe(false);
    expect(isMatchReportPdfText("")).toBe(false);
  });

  it("parses the two team names and the date from the title", () => {
    const m = parseTitle(SAMPLE);
    expect(m.home).toBe("THOR AKUREYRI");
    expect(m.away).toBe("BREIDABLIK");
    expect(m.date).toBe("2026-08-04");
  });

  it("parses the page-4 team line, home=left / away=right, without xG/Shots collisions", () => {
    const { home, away } = parseTeamLinePage4(SAMPLE);
    // Own team here is Breiðablik = AWAY.
    expect(home.xg).toBe(1.63);            // NOT 1.62 (Cumulative xG must not win)
    expect(away.xg).toBe(1.71);            // the brief's spot-check
    expect(home.goals).toBe(1);
    expect(away.goals).toBe(0);
    expect(home.shots).toBe(13);           // NOT captured from "Shots On Target"
    expect(away.shots).toBe(14);
    expect(home.shotsOnTarget).toBe(3);
    expect(away.shotsOnTarget).toBe(4);
    expect(home.possession).toBe(39);
    expect(away.possession).toBe(61);
    expect(home.passes).toBe(358);         // leading number of "358 (264)"
    expect(away.passes).toBe(562);
    expect(home.tacklesWon).toBe(23);      // leading number of "23 (37)"
    expect(away.pressures).toBe(106);
    expect(away.yellowCards).toBe(1);
  });

  it("reconciles per-player sums against the team totals within tolerance", () => {
    const { away } = parseTeamLinePage4(SAMPLE); // Breiðablik
    const mk = (name: string, xg: number, shots: number, goals: number): MatchReportPlayer => ({
      name, team: "away", shots, goals, xg, xgPerShot: null, keyPasses: null, assists: null, xgAssisted: null,
      opKeyPasses: null, opAssists: null, xgChain: null, opXgChain: null, xgBuildup: null, opXgBuildup: null,
      tackles: null, interceptions: null, dribbledPast: null, deepProgressions: null, passes: null, passesIntoBox: null,
    });
    // A plausible split of Breiðablik's 14 shots / 1.71 xG / 0 goals across a few players.
    const players = [mk("A", 0.88, 1, 0), mk("B", 0.40, 6, 0), mk("C", 0.43, 7, 0)];
    const checks = reconcile(away, players);
    expect(checks.every((c) => c.withinTolerance)).toBe(true);

    const bad = reconcile(away, [mk("A", 0.10, 2, 0)]); // way under the team totals
    expect(bad.find((c) => c.metric === "shots")!.withinTolerance).toBe(false);
  });

  it("validates/coerces the model's player JSON into the typed shape", () => {
    const players = validateMatchReportPlayers({
      players: [
        { name: "Arnar Bjarki Gunnleifsson", team: "away", shots: "1", goals: 0, xg: "0.88", key_passes: 1, xg_chain: 0.11 },
        { name: "", team: "home", xg: 1 }, // dropped — no name
        { team: "away" },                    // dropped — no name
      ],
    });
    expect(players.length).toBe(1);
    expect(players[0].name).toBe("Arnar Bjarki Gunnleifsson");
    expect(players[0].shots).toBe(1);        // coerced from string
    expect(players[0].xg).toBe(0.88);
    expect(players[0].team).toBe("away");
    expect(players[0].xgChain).toBe(0.11);
  });
});
