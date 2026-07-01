// @ts-nocheck
/* eslint-disable */
import { describe, it, expect } from "vitest";
import { normalizeUsagePath } from "../usagePath";

describe("normalizeUsagePath", () => {
  it("leaves static coach routes untouched", () => {
    expect(normalizeUsagePath("/coach/decel-intelligence")).toBe("/coach/decel-intelligence");
    expect(normalizeUsagePath("/coach")).toBe("/coach");
  });

  it("collapses UUID player-detail segments to :id (privacy + aggregation)", () => {
    expect(
      normalizeUsagePath("/coach/player/3f2504e0-4f89-41d3-9a0c-0305e82c3301/summary"),
    ).toBe("/coach/player/:id/summary");
  });

  it("collapses numeric id segments to :id", () => {
    expect(normalizeUsagePath("/trainer/clients/12345")).toBe("/trainer/clients/:id");
  });

  it("drops query string and hash", () => {
    expect(normalizeUsagePath("/coach?tab=md#top")).toBe("/coach");
  });

  it("drops a trailing slash but keeps the root", () => {
    expect(normalizeUsagePath("/coach/quadrant/")).toBe("/coach/quadrant");
    expect(normalizeUsagePath("/")).toBe("/");
  });

  it("handles null / empty safely", () => {
    expect(normalizeUsagePath(null)).toBe("/");
    expect(normalizeUsagePath("")).toBe("/");
  });
});
