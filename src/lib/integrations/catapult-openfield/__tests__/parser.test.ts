import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseOpenFieldPlayerCsv, aggregateToDays, openFieldDayToDbRow,
  parseEuroDate, hmsToMinutes, sessionTypeToMd,
} from "../parser";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(resolve(here, "fixtures/openfield-player-sample.csv"), "utf8");

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe("helpers", () => {
  it("parses DD/MM/YYYY as European, never US", () => {
    expect(parseEuroDate("22/09/2026")).toBe("2026-09-22");
    expect(parseEuroDate("02/10/2026")).toBe("2026-10-02"); // ambiguous digits → still European
    expect(parseEuroDate("")).toBeNull();
  });
  it("HH:MM:SS → minutes", () => {
    expect(hmsToMinutes("00:14:51")).toBeCloseTo(14.85, 2);
    expect(hmsToMinutes("01:00:00")).toBe(60);
  });
  it("sessionType → MD label", () => {
    expect(sessionTypeToMd("Match Day -2")).toBe("MD-2");
    expect(sessionTypeToMd("Match Day +1")).toBe("MD+1");
    expect(sessionTypeToMd("Match Day")).toBe("MD");
    expect(sessionTypeToMd("Recovery")).toBeNull();
  });
});

describe("parseOpenFieldPlayerCsv — the real camp file (anonymised)", () => {
  const parsed = parseOpenFieldPlayerCsv(SAMPLE);

  it("reads one athlete, every drill row, and a valid header", () => {
    expect(parsed.headerOk).toBe(true);
    expect(parsed.missingColumns).toHaveLength(0);
    expect(parsed.athleteName).toBe("Test Player");
    expect(parsed.rowCount).toBe(42); // 43 lines − header
  });

  it("per-drill totals match the PDF the camp was validated against", () => {
    const d = parsed.drills;
    expect(sum(d.map((r) => r.distanceTotal))).toBe(56450.25);
    expect(sum(d.map((r) => r.accelerations))).toBe(623);
    expect(sum(d.map((r) => r.decelerations))).toBe(565);
    expect(Math.max(...d.map((r) => r.maxSpeed))).toBe(37.88);
  });
});

describe("aggregateToDays — drill → day", () => {
  const days = aggregateToDays(parseOpenFieldPlayerCsv(SAMPLE).drills);

  it("splits into one row per calendar day, date-sorted", () => {
    expect(days.length).toBe(11); // 11 distinct session dates in the camp
    expect(days[0].date).toBe("2026-09-22");
    expect(days.map((x) => x.date)).toEqual([...days.map((x) => x.date)].sort());
  });

  it("day totals re-sum to the grand totals; maxSpeed is a MAX not a sum", () => {
    expect(sum(days.map((x) => x.totalDistance))).toBe(56450.25);
    expect(sum(days.map((x) => x.accelerations))).toBe(623);
    expect(sum(days.map((x) => x.decelerations))).toBe(565);
    expect(Math.max(...days.map((x) => x.maxSpeed))).toBe(37.88);
    // A day's maxSpeed never exceeds the grand max (proves it's not accumulating).
    expect(Math.max(...days.map((x) => x.maxSpeed))).toBeLessThanOrEqual(37.88);
  });

  it("carries the MD-day label from sessionType", () => {
    const d22 = days.find((x) => x.date === "2026-09-23");
    expect(d22?.mdDayLabel).toBe("MD-2");
  });
});

describe("openFieldDayToDbRow — load-daily mapping", () => {
  const day = aggregateToDays(parseOpenFieldPlayerCsv(SAMPLE).drills)[0];
  const row = openFieldDayToDbRow(day, "player-1", "team-1", "KSÍ camp Oct 2026", "Center Back");

  it("writes source catapult + away/estimated tags, no fabricated player load", () => {
    expect(row.source).toBe("catapult"); // so the load engine's reads pick it up
    expect(row.player_id).toBe("player-1");
    expect(row.team_id).toBe("team-1");
    expect(row.date).toBe(day.date);
    expect(row.total_player_load).toBeUndefined(); // GPS-only export — never fabricated
    expect(row.sprint_distance).toBe(day.distanceZ6);
    expect(row.max_velocity).toBe(day.maxSpeed);
    expect(row.max_vel).toBe(day.maxSpeed);
    expect(row.tot_as).toBe(day.accelerations);
    expect(row.tot_ds).toBe(day.decelerations);
    const rp = row.raw_payload_json as Record<string, unknown>;
    expect(rp.away).toBe(true);
    expect(rp.estimated).toBe(false);
    expect(rp.event).toBe("KSÍ camp Oct 2026");
    expect(rp.source_detail).toBe("ksi_openfield_csv");
  });
});
