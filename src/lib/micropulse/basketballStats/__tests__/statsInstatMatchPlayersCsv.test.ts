import { describe, it, expect } from "vitest";
import {
  isInstatMatchPlayersHeader,
  teamNameFromSheet,
  parseInstatMatchPlayers,
} from "../statsInstatMatchPlayersCsv";
import type { InstatIngestContext } from "../statsInstatBasketball";

// Synthetic rows mirroring the REAL InStat single-match "Box score" columns (full names).
const HEADERS = ["Jersey number", "Player", "Minutes", "Points", "Field goals made", "Field goals attempted", "3-pt field goals made", "3-pt field goals attempted", "Free throws made", "Free throws attempted", "Rebounds", "Offensive rebounds", "Defensive rebounds", "Assists", "Steals", "Turnovers", "Blocks", "Fouls", "Plus/Minus", "Points per player's possession", "Deflections"];
const row = (vals: (string | number | null)[]) => Object.fromEntries(HEADERS.map((h, i) => [h, vals[i] ?? null]));

const CTX: InstatIngestContext = { ownerTeamId: "T", matchRef: "instat:match:keflavik:2026-10-07", matchDate: "2026-10-07", opponent: "Keflavik" };

describe("statsInstatMatchPlayersCsv", () => {
  it("detects the single-match box, not the season export", () => {
    expect(isInstatMatchPlayersHeader(HEADERS)).toBe(true);
    // Season export adds "Games played" → must NOT match here.
    expect(isInstatMatchPlayersHeader([...HEADERS, "Games played"])).toBe(false);
    // Football export → rejected.
    expect(isInstatMatchPlayersHeader(["Player", "Minutes", "xG", "OBV"])).toBe(false);
    // Missing the Minutes column (season Games is team-level) → rejected.
    expect(isInstatMatchPlayersHeader(["Date", "Opponent", "Points"])).toBe(false);
  });

  it("strips the sheet suffix to the team name", () => {
    expect(teamNameFromSheet("Njardvik W - Box score")).toBe("Njardvik W");
    expect(teamNameFromSheet("Keflavik - Box score")).toBe("Keflavik");
    expect(teamNameFromSheet("Weird Name")).toBe("Weird Name");
  });

  it("parses per-game box lines with derived eFG/TS and mm:ss minutes", () => {
    const rows = [
      row(["12", "Brittanny Dinkins", "39:52", 36, 14, 25, 1, 4, 7, 8, 3, "-", 3, 3, 6, 6, "-", 2, 13, 1.04, 5]),
      row(["15", "Asta Grimsdottir", "32:17", 5, 1, 2, "-", "-", 3, 4, 15, 7, 8, 3, 1, 2, 2, 3, -1, 0.87, "-"]),
      row(["", "Total", "", 0, 0, 0]), // non-player row → skipped
    ];
    const { players, skipped } = parseInstatMatchPlayers(rows, CTX);
    expect(players).toHaveLength(2);
    expect(skipped).toHaveLength(1);

    const p = players[0];
    expect(p.playerName).toBe("Brittanny Dinkins");
    expect(p.points).toBe(36);
    expect(p.fgm).toBe(14); expect(p.fga).toBe(25);
    expect(p.reb).toBe(3); expect(p.assists).toBe(3); expect(p.plusMinus).toBe(13);
    expect(p.minutes).toBeCloseTo(39.867, 2); // 39:52
    expect(p.gameId).toBe(CTX.matchRef);
    expect(p.gameDate).toBe("2026-10-07");
    expect(p.opponent).toBe("Keflavik");
    expect(p.source).toBe("instat");
    expect(p.sourcePlayerRef).toBe("instat:brittanny dinkins");
    // eFG% = (14 + 0.5*1) / 25 = 58%; TS% = 36 / (2*(25 + 0.44*8)) = 63.1%
    expect(p.advanced?.efgPct).toBeCloseTo(58, 1);
    expect(p.advanced?.tsPct).toBeCloseTo(63.1, 1);
    expect(p.advanced?.ppp).toBe(1.04);

    // "-" cells become null, never 0.
    const q = players[1];
    expect(q.tpm).toBeNull(); expect(q.tpa).toBeNull();
    expect(q.oreb).toBe(7);
  });
});
