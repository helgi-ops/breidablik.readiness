import { describe, it, expect } from "vitest";
import {
  loadRowTier, isEstimatedLoad, isAwayLoad, aggregateLoadProvenance,
  loadProvenanceCopy, LOAD_STALE_AFTER_DAYS,
} from "../provenance";
import { computePlayerLoadAcwr, type DailyLoad } from "@/lib/micropulse/playerLoadAcwr";

describe("loadRowTier", () => {
  it("estimated wins over everything", () => {
    expect(loadRowTier({ estimated: true, away: true }, { ageDays: 99 })).toBe("estimated");
  });
  it("away when real-but-elsewhere", () => {
    expect(loadRowTier({ away: true })).toBe("away");
  });
  it("stale only when old enough and not estimated/away", () => {
    expect(loadRowTier(null, { ageDays: LOAD_STALE_AFTER_DAYS })).toBe("stale");
    expect(loadRowTier(null, { ageDays: LOAD_STALE_AFTER_DAYS - 1 })).toBe("measured");
  });
  it("measured when no flags and fresh (absent = measured)", () => {
    expect(loadRowTier(null)).toBe("measured");
    expect(loadRowTier({ estimated: false, away: false }, { ageDays: 1 })).toBe("measured");
    expect(isEstimatedLoad({ estimated: false })).toBe(false);
    expect(isAwayLoad({})).toBe(false);
  });
});

describe("aggregateLoadProvenance", () => {
  it("counts estimated/away days and picks the most-cautious tier", () => {
    const r = aggregateLoadProvenance([{ estimated: true }, {}, { away: true }, {}, {}]);
    expect(r.estimatedCount).toBe(1);
    expect(r.awayCount).toBe(1);
    expect(r.total).toBe(5);
    expect(r.worstTier).toBe("estimated");
  });
  it("away is worst when no estimates", () => {
    expect(aggregateLoadProvenance([{ away: true }, {}]).worstTier).toBe("away");
  });
  it("all measured → worstTier measured", () => {
    expect(aggregateLoadProvenance([{}, {}]).worstTier).toBe("measured");
  });
});

describe("loadProvenanceCopy", () => {
  it("is bilingual and measured renders a plain label", () => {
    expect(loadProvenanceCopy("estimated", "EN", { estimatedDays: 2, totalDays: 10 }).tip).toMatch(/2 of 10 days/);
    expect(loadProvenanceCopy("away", "IS").label).toBe("annars staðar");
    expect(loadProvenanceCopy("measured", "EN").label).toBe("measured");
  });
});

// ── The additive provenance counts must never change the ratio/band math ──
describe("computePlayerLoadAcwr — provenance is additive", () => {
  const today = "2026-10-28";
  // 20 consecutive real sessions ENDING today (so the acute window is populated),
  // flat 500 PL/day → ratio ~1.0, SAFE.
  const days: DailyLoad[] = Array.from({ length: 20 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    return { date: d, load: 500 } as DailyLoad;
  });

  it("reports estimated/away day counts without touching ratio/band", () => {
    const plain = computePlayerLoadAcwr(days, today);
    // Mark 3 of the days estimated + 2 away.
    const tagged = days.map((d, i) => (i < 3 ? { ...d, estimated: true } : i < 5 ? { ...d, away: true } : d));
    const withProv = computePlayerLoadAcwr(tagged, today);

    expect(withProv.ratio).toBe(plain.ratio);
    expect(withProv.band).toBe(plain.band);
    expect(withProv.acuteMean).toBe(plain.acuteMean);
    expect(withProv.chronicMean).toBe(plain.chronicMean);
    expect(withProv.daysObserved).toBe(plain.daysObserved);
    expect(withProv.estimatedDays).toBe(3);
    expect(withProv.awayDays).toBe(2);
    expect(plain.estimatedDays).toBe(0);
  });

  it("flags stale when the acute window has no observed session but chronic does", () => {
    // Sessions only in the first 10 days of the window (none in the last 7).
    const old: DailyLoad[] = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(Date.parse(`${today}T00:00:00Z`) - (27 - i) * 86_400_000).toISOString().slice(0, 10);
      return { date: d, load: 500 } as DailyLoad;
    });
    const r = computePlayerLoadAcwr(old, today);
    expect(r.stale).toBe(true);
    expect(computePlayerLoadAcwr(days, today).stale).toBe(false); // recent sessions → not stale
  });
});
