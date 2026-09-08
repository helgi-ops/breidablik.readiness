import { describe, it, expect } from "vitest";
import { TEST_CATALOGUE, CATALOGUE_BY_SLUG, catalogueByCategory, defaultBattery } from "../testCatalogue";
import { SEED_MOVEMENT_TESTS } from "../registry";

describe("movement-test catalogue", () => {
  it("has unique slugs across a broad catalogue", () => {
    const slugs = TEST_CATALOGUE.map((x) => x.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBeGreaterThanOrEqual(50);
  });

  it("every entry is bilingual with a screens-for line", () => {
    for (const x of TEST_CATALOGUE) {
      expect(x.name.en.length, x.slug).toBeGreaterThan(0);
      expect(x.name.is.length, x.slug).toBeGreaterThan(0);
      expect(x.screensFor.en.length, x.slug).toBeGreaterThan(0);
      expect(x.screensFor.is.length, x.slug).toBeGreaterThan(0);
    }
  });

  it("covers all six selectable categories + the composite-system reference bucket", () => {
    const cats = catalogueByCategory().map((g) => g.category);
    expect(cats).toEqual([
      "squat_lower_limb", "mobility", "balance_motor_control", "core_trunk",
      "jump_landing", "hop_agility", "composite_system",
    ]);
  });

  it("the default battery is ~10–12 tests and spans the review's breadth", () => {
    const b = defaultBattery();
    expect(b.length).toBeGreaterThanOrEqual(10);
    expect(b.length).toBeLessThanOrEqual(13);
    // slow-bilateral, slow-unilateral, high-bilateral, high-unilateral all present
    const has = (speed: string, lat: string) => b.some((x) => x.speed === speed && (x.laterality === lat || x.laterality === "either"));
    expect(has("slow", "bilateral")).toBe(true);
    expect(has("slow", "unilateral")).toBe(true);
    expect(has("high", "bilateral")).toBe(true);
    expect(has("high", "unilateral")).toBe(true);
  });

  it("instrumented members resolve to a real MovementTest in the registry", () => {
    const seedSlugs = new Set(SEED_MOVEMENT_TESTS.map((t) => t.slug));
    const linked = TEST_CATALOGUE.filter((x) => x.instrumentedSlug);
    expect(linked.length).toBeGreaterThan(0);
    for (const x of linked) expect(seedSlugs.has(x.instrumentedSlug!), `${x.slug} → ${x.instrumentedSlug}`).toBe(true);
    // OHSA + SLDJ + hop are members
    expect(CATALOGUE_BY_SLUG["overhead_squat"]?.instrumentedSlug).toBe("overhead_squat_assessment");
    expect(CATALOGUE_BY_SLUG["single_leg_landing"]?.instrumentedSlug).toBe("single_leg_drop_jump");
    expect(CATALOGUE_BY_SLUG["single_hop_distance"]?.instrumentedSlug).toBe("hop_for_distance");
  });

  it("proprietary systems are flagged cite-only (FMS/SFMA/Y-Balance), SEBT is open", () => {
    expect(CATALOGUE_BY_SLUG["fms"]?.proprietary).toBeTruthy();
    expect(CATALOGUE_BY_SLUG["sfma"]?.proprietary).toBeTruthy();
    expect(CATALOGUE_BY_SLUG["y_balance"]?.proprietary).toBeTruthy();
    expect(CATALOGUE_BY_SLUG["sebt_lower"]?.proprietary).toBeFalsy(); // open, in-product default
    expect(CATALOGUE_BY_SLUG["sebt_lower"]?.defaultBattery).toBe(true);
  });
});
