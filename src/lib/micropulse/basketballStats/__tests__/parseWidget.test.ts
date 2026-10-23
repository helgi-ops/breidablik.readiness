import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBoxScore, parseSchedule, parseShotChartFilters, unwrapWidgetHtml, parseQuarterScores, parseAdvancedStats, parseGameDate } from "../parseWidget";

const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const BOX = fx("boxscore-6146419.txt");
const SCHED = fx("schedule-130403.txt");
const SHOTCHART = fx("shotchart-6146419.txt");

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

describe("parseShotChartFilters (real fixture)", () => {
  const f = parseShotChartFilters(SHOTCHART);
  it("extracts the quarters and per-team player ids", () => {
    expect(f.quarters).toEqual(["1", "2", "3", "4"]);
    expect(f.playerA.length).toBeGreaterThan(5);
    expect(f.playerB.length).toBeGreaterThan(5);
    expect(f.playerA).toContain("6359231"); // Dedrick, from the box score
    expect(f.playerA.every((v) => /^\d+$/.test(v))).toBe(true);
  });
});

describe("parseQuarterScores", () => {
  it("reads the mbt-gamecard-quarters line score into per-team arrays", () => {
    const html = `MBT.API.update('view110', '<div class="mbt-gamecard-quarters">\\r\\n<span>18 - 20<\\/span><span>15 - 15<\\/span><span>14 - 17<\\/span><span>30 - 12<\\/span><\\/div>');`;
    const q = parseQuarterScores(html);
    expect(q).not.toBeNull();
    expect(q!.a).toEqual([18, 15, 14, 30]);
    expect(q!.b).toEqual([20, 15, 17, 12]);
    expect(q!.a.reduce((s, v) => s + v, 0)).toBe(77);
    expect(q!.b.reduce((s, v) => s + v, 0)).toBe(64);
  });
  it("returns null when there is no quarters block", () => {
    expect(parseQuarterScores("<div>nope</div>")).toBeNull();
  });
});

describe("parseAdvancedStats", () => {
  const html = `MBT.API.update('view110', '<table>` +
    `<tr><td><\\/td><td>Valur<\\/td><td>Njarðvík<\\/td><\\/tr>` +
    `<tr><td>M. Ball, R. Stone<\\/td><td>+8.0<\\/td><\\/tr>` +
    `<tr><td>Stig inni í teig<\\/td><td>38<\\/td><td>28<\\/td><\\/tr>` +
    `<tr><td>Stig úr hraðaupphlaupum<\\/td><td>2<\\/td><td>7<\\/td><\\/tr>` +
    `<tr><td>Mesta forskot<\\/td><td>13 (77:64)<\\/td><td>8 (42:50)<\\/td><\\/tr>` +
    `<\\/table>');`;
  it("keeps label+two-value stat rows, skips the header and lineup rows", () => {
    const rows = parseAdvancedStats(html);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Stig inni í teig");
    expect(labels).toContain("Stig úr hraðaupphlaupum");
    expect(labels).toContain("Mesta forskot");
    expect(labels).not.toContain(""); // header row dropped
    expect(labels.some((l) => l.includes(","))).toBe(false); // lineup row dropped
    expect(rows.find((r) => r.label === "Stig inni í teig")).toMatchObject({ a: "38", b: "28" });
  });
});

describe("parseGameDate", () => {
  it("reads dd.mm.yyyy → ISO", () => {
    expect(parseGameDate("<div class=\"mbt-gamecard\">17.05.2026 kl. 19:15</div>")).toBe("2026-05-17");
  });
  it("reads dd-mm-yyyy → ISO", () => {
    expect(parseGameDate("Leikur 3-11-2025 18:00")).toBe("2025-11-03");
  });
  it("prefers an explicit ISO date", () => {
    expect(parseGameDate("date 2026-01-09 played")).toBe("2026-01-09");
  });
  it("returns null when there is no date / an impossible month", () => {
    expect(parseGameDate("no date here")).toBeNull();
    expect(parseGameDate("99.99.2026")).toBeNull();
  });
});
