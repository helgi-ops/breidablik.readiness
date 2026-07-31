import { describe, it, expect } from "vitest";
import { rollupBasketballSeason } from "../rollup";
import { basketballGameStatToDbRow, BASKETBALL_MATCH_CONFLICT } from "../persist";
import type { BasketballBoxScoreRow } from "../types";

const g = (over: Partial<BasketballBoxScoreRow>): BasketballBoxScoreRow => ({
  teamId: "T", gameId: "G", gameDate: "2026-01-01", stats: {},
  source: "baskethotel", sourcePlayerRef: "p1", playerName: "Jón Jónsson",
  ...over,
});

describe("rollupBasketballSeason", () => {
  it("aggregates per-game averages + shooting %/TS%/ast-to with catalog keys", () => {
    const rows: BasketballBoxScoreRow[] = [
      g({ gameId: "G1", minutes: 30, points: 20, fgm: 8, fga: 15, tpm: 2, tpa: 5, ftm: 2, fta: 2, oreb: 1, dreb: 4, reb: 5, assists: 6, steals: 2, blocks: 0, turnovers: 3, efficiency: 18 }),
      g({ gameId: "G2", minutes: 28, points: 10, fgm: 4, fga: 9, tpm: 1, tpa: 3, ftm: 1, fta: 2, oreb: 1, dreb: 3, reb: 4, assists: 4, steals: 1, blocks: 1, turnovers: 1, efficiency: 12 }),
    ];
    const [s] = rollupBasketballSeason(rows, "T", "2026");
    const m = s.metrics;
    expect(m["Games"]).toBe(2);
    expect(s.minutes).toBe(58);                 // season total minutes
    expect(m["Points per game"]).toBe(15);      // (20+10)/2
    expect(m["Assists per game"]).toBe(5);      // (6+4)/2
    expect(m["Rebounds per game"]).toBe(4.5);
    expect(m["Field goals %"]).toBe(50);        // 12/24
    expect(m["Three-point %"]).toBe(37.5);      // 3/8
    expect(m["Assist to turnover"]).toBe(2.5);  // 10/4
    // TS% = PTS / (2*(FGA + 0.44*FTA)) = 30 / (2*(24 + 0.44*4)) = 30/51.52
    expect(m["True shooting %"]).toBe(58.2);
    expect(m["Efficiency"]).toBe(15);           // (18+12)/2
    expect(s.source).toBe("baskethotel");
    expect(s.sourcePlayerRef).toBe("p1");
    expect(s.wyscoutPlayerName).toBe("Jón Jónsson");
  });

  it("groups by player and counts each player's own games", () => {
    const rows = [
      g({ sourcePlayerRef: "a", playerName: "A", points: 10 }),
      g({ sourcePlayerRef: "a", playerName: "A", points: 20 }),
      g({ sourcePlayerRef: "b", playerName: "B", points: 8 }),
    ];
    const out = rollupBasketballSeason(rows, "T", "2026");
    expect(out.length).toBe(2);
    const a = out.find((s) => s.sourcePlayerRef === "a")!;
    const b = out.find((s) => s.sourcePlayerRef === "b")!;
    expect(a.metrics["Games"]).toBe(2);
    expect(a.metrics["Points per game"]).toBe(15);
    expect(b.metrics["Games"]).toBe(1);
    expect(b.metrics["Points per game"]).toBe(8);
  });

  it("a never-reported stat is null (never 0) — centre with no threes", () => {
    const rows = [g({ points: 12, fga: 8, fgm: 6, tpa: 0, tpm: 0 })]; // took no threes
    const [s] = rollupBasketballSeason(rows, "T", "2026");
    expect(s.metrics["Three-point %"]).toBeNull(); // 0 attempts ⇒ "–", not 0%
    expect(s.metrics["Field goals %"]).toBe(75);
    expect(s.metrics["Blocks per game"]).toBeNull(); // never reported
  });

  it("degrades cleanly when nothing but a name is present", () => {
    const [s] = rollupBasketballSeason([g({})], "T", "2026");
    expect(s.metrics["Games"]).toBe(1);
    expect(s.metrics["Points per game"]).toBeNull();
    expect(s.minutes).toBeNull();
  });
});

describe("basketballGameStatToDbRow", () => {
  it("maps normalized row → table columns, defaulting missing to null", () => {
    const row = basketballGameStatToDbRow(
      g({ gameId: "G7", minutes: 25, points: 14, reb: 6, plusMinus: 8 }),
      "player-uuid",
    );
    expect(row.team_id).toBe("T");
    expect(row.player_id).toBe("player-uuid");
    expect(row.game_id).toBe("G7");
    expect(row.points).toBe(14);
    expect(row.plus_minus).toBe(8);
    expect(row.blocks).toBeNull();
    expect(row.source).toBe("baskethotel");
    expect(row.source_ref).toBe("G7");         // falls back to gameId
    expect(row.source_player_name).toBe("Jón Jónsson");
  });

  it("keeps player_id null when unmatched", () => {
    const row = basketballGameStatToDbRow(g({}), null);
    expect(row.player_id).toBeNull();
  });

  it("exposes the idempotency key", () => {
    expect(BASKETBALL_MATCH_CONFLICT).toBe("team_id,source,game_id,source_player_ref");
  });
});
