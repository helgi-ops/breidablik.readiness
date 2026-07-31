import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBoxScore, parseSchedule, unwrapWidgetHtml } from "../parseWidget";

const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const BOX = fx("boxscore-6146419.txt");
const SCHED = fx("schedule-130403.txt");

describe("unwrapWidgetHtml", () => {
  it("strips the MBT.API.update envelope + JS escapes", () => {
    const h = unwrapWidgetHtml(BOX);
    expect(h).toContain("<table");
    expect(h).not.toContain("\\n");
    expect(h).not.toContain('\\"');
  });
});

describe("parseBoxScore (real fixture, game 6146419)", () => {
  const rows = parseBoxScore(BOX, "6146419", "team-uuid");

  it("returns per-player rows for both teams", () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.every((r) => r.sourcePlayerRef && r.playerName)).toBe(true);
  });

  it("parses a known player correctly (Dedrick Deon Basile)", () => {
    const d = rows.find((r) => r.playerName.startsWith("Dedrick"))!;
    expect(d).toBeTruthy();
    expect(d.points).toBe(20);
    expect(d.fgm).toBe(6); expect(d.fga).toBe(22);   // Skot 6/22
    expect(d.tpm).toBe(2); expect(d.tpa).toBe(8);    // 3ja 2/8
    expect(d.ftm).toBe(6); expect(d.fta).toBe(7);    // Víti 6/7
    expect(d.oreb).toBe(1); expect(d.dreb).toBe(3); expect(d.reb).toBe(4);
    expect(d.minutes).toBeCloseTo(36.7, 1);          // 36:42
    expect(d.sourcePlayerRef).toBe("6359231");
    expect(d.playerName).not.toContain("*");         // starter marker stripped
  });

  it("reconciles points = 2·2ptM + 3·3ptM + FTM for every player", () => {
    for (const r of rows) {
      if (r.points == null || r.fgm == null || r.tpm == null || r.ftm == null) continue;
      const twoM = r.fgm - r.tpm;              // total FG made − 3pt made = 2pt made
      const derived = 2 * twoM + 3 * r.tpm + r.ftm;
      expect(derived).toBe(r.points);
    }
  });

  it("reconciles rebounds: offensive + defensive = total", () => {
    for (const r of rows) {
      if (r.oreb == null || r.dreb == null || r.reb == null) continue;
      expect(r.oreb + r.dreb).toBe(r.reb);
    }
  });

  it("keeps the full raw box-score row in stats (nothing lost)", () => {
    const d = rows.find((r) => r.playerName.startsWith("Dedrick"))!;
    expect(d.stats["Stig"]).toBe("20");
    expect(Object.keys(d.stats).length).toBe(24);
  });

  it("tags each row with its team name", () => {
    const teams = new Set(rows.map((r) => r.team).filter(Boolean));
    expect(teams.size).toBe(2);
  });
});

describe("parseSchedule (real fixture, season 130403)", () => {
  const games = parseSchedule(SCHED);

  it("extracts games with ids, teams and scores", () => {
    expect(games.length).toBeGreaterThanOrEqual(5);
    expect(games.every((g) => /^\d{5,}$/.test(g.gameId))).toBe(true);
    expect(games.every((g) => g.homeTeam && g.awayTeam)).toBe(true);
  });

  it("marks finished games (both scores present)", () => {
    const finished = games.filter((g) => g.finished);
    expect(finished.length).toBeGreaterThan(0);
    for (const g of finished) {
      expect(typeof g.homeScore).toBe("number");
      expect(typeof g.awayScore).toBe("number");
    }
  });

  it("dedupes game ids", () => {
    const ids = games.map((g) => g.gameId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
