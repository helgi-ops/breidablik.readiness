import { describe, expect, it } from "vitest";
import { buildTableName, fitTableName } from "../templateAutoGenerate";

const NJARDVIK_BASE = "njardvik_w_korfubolti_basketball_konur_microdose_templates";
const VALID = /^[a-z][a-z0-9_]*$/;

describe("fitTableName", () => {
  it("leaves names that fit unchanged, so existing tables are still found", () => {
    for (const name of [
      "breidablik_football_karlar_microdose_templates",
      NJARDVIK_BASE,
      // Exactly 63 characters.
      "hk_football_karlar_microdose_templates_player_07b04f1a_20260728",
    ]) {
      expect(fitTableName(name)).toBe(name);
    }
  });

  it("keeps every week of a long team name in its own table", () => {
    const weeks = ["20261019", "20261026", "20261102", "20261109", "20261116", "20261123", "20261130"];
    const names = weeks.map((w) => fitTableName(`${NJARDVIK_BASE}_week_${w}`));
    expect(new Set(names).size).toBe(weeks.length);
    // What Postgres would have stored for each one if the name were still too long.
    expect(new Set(names.map((n) => n.slice(0, 63))).size).toBe(weeks.length);
    names.forEach((n, i) => {
      expect(n.length).toBeLessThanOrEqual(63);
      expect(n).toMatch(VALID);
      expect(n.endsWith(`_microdose_templates_week_${weeks[i]}`)).toBe(true);
    });
  });

  // The migration 20261109120000 hardcodes these. If the hash changes, the builder stops finding these tables.
  it("matches the names the Njarðvík W migration created", () => {
    const migrated: Record<string, string> = {
      "20261019": "njardvik_w_korfubolt_edbfb149_microdose_templates_week_20261019",
      "20261026": "njardvik_w_korfubolt_68bca153_microdose_templates_week_20261026",
      "20261102": "njardvik_w_korfubolt_7e2aa152_microdose_templates_week_20261102",
      "20261109": "njardvik_w_korfubolt_852aac57_microdose_templates_week_20261109",
      "20261116": "njardvik_w_korfubolt_7c2cdcc3_microdose_templates_week_20261116",
      "20261123": "njardvik_w_korfubolt_872f2cab_microdose_templates_week_20261123",
      "20261130": "njardvik_w_korfubolt_0e323fc7_microdose_templates_week_20261130",
    };
    for (const [week, name] of Object.entries(migrated)) {
      expect(fitTableName(`${NJARDVIK_BASE}_week_${week}`)).toBe(name);
    }
  });

  it("keeps per-player tables apart", () => {
    const a = fitTableName(`${NJARDVIK_BASE}_player_07b04f1a_20261109`);
    const b = fitTableName(`${NJARDVIK_BASE}_player_9c21aa04_20261109`);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(63);
    expect(a).toMatch(VALID);
    expect(a).toContain("_microdose_templates_player_07b04f1a_20261109");
  });

  it("gives the same answer every time, and a fitted name stays as it is", () => {
    const long = `${NJARDVIK_BASE}_week_20261109`;
    expect(fitTableName(long)).toBe(fitTableName(long));
    expect(fitTableName(fitTableName(long))).toBe(fitTableName(long));
  });

  it("separates two long teams that share the same first letters", () => {
    const a = fitTableName("a_very_long_team_name_that_goes_on_and_on_one_football_karlar_microdose_templates");
    const b = fitTableName("a_very_long_team_name_that_goes_on_and_on_two_football_karlar_microdose_templates");
    expect(a).not.toBe(b);
    expect(a.endsWith("_microdose_templates")).toBe(true);
    expect(a.length).toBeLessThanOrEqual(63);
  });

  it("copes with a long name that has no known tail", () => {
    const n = fitTableName("x".repeat(90));
    expect(n.length).toBeLessThanOrEqual(63);
    expect(n).toMatch(VALID);
  });

  it("keeps an empty name empty, so the route's missing-name check still fires", () => {
    expect(fitTableName("")).toBe("");
  });
});

describe("buildTableName", () => {
  it("builds the Njarðvík W name as before", () => {
    expect(buildTableName("Njarðvík W (körfubolti)", "basketball", "F")).toBe(NJARDVIK_BASE);
  });

  it("keeps a very long team name within the limit", () => {
    const n = buildTableName("Ungmennafélagið Einhver Mjög Langur Klúbbur Í Reykjavík", "basketball", "F");
    expect(n.length).toBeLessThanOrEqual(63);
    expect(n).toMatch(VALID);
    expect(n.endsWith("_microdose_templates")).toBe(true);
  });
});
