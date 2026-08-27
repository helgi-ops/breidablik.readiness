import { describe, it, expect } from "vitest";
import { detectCmjPersonalBest, detectPersonalBest, pbPushCopy, pbCardCopy, type CmjTestBest, type TestBest } from "../index";

const T = (testId: string, at: string, bestJumpCm: number): CmjTestBest => ({ testId, at, bestJumpCm });
const NOW = "2026-08-27T12:00:00Z";

describe("detectCmjPersonalBest", () => {
  it("returns null for a first-ever test (nothing to beat)", () => {
    expect(detectCmjPersonalBest([T("a", "2026-08-20", 45)], { now: NOW })).toBeNull();
  });
  it("returns null when the latest test does not beat prior history", () => {
    const tests = [T("a", "2026-08-01", 48), T("b", "2026-08-10", 46), T("c", "2026-08-26", 47.5)];
    expect(detectCmjPersonalBest(tests, { now: NOW })).toBeNull();
  });
  it("returns null for a sub-margin bump (measurement noise)", () => {
    const tests = [T("a", "2026-08-01", 48.0), T("b", "2026-08-26", 48.3)]; // +0.3 cm < 0.5
    expect(detectCmjPersonalBest(tests, { now: NOW })).toBeNull();
  });
  it("detects a genuine PB with value + improvement", () => {
    const tests = [T("a", "2026-08-01", 48.0), T("b", "2026-08-10", 49.0), T("c", "2026-08-26", 50.5)];
    const pb = detectCmjPersonalBest(tests, { now: NOW })!;
    expect(pb).not.toBeNull();
    expect(pb.value).toBe(50.5);
    expect(pb.priorBest).toBe(49.0);
    expect(pb.improvement).toBe(1.5);
    expect(pb.testId).toBe("c");
    expect(pb.metric).toBe("cmj_jump_height");
  });
  it("does not re-celebrate: a later NON-PB test after a PB returns null", () => {
    const tests = [T("a", "2026-08-01", 48), T("b", "2026-08-10", 50.5), T("c", "2026-08-26", 49)];
    expect(detectCmjPersonalBest(tests, { now: NOW })).toBeNull(); // 49 < prior best 50.5
  });
  it("recency gate: a genuine PB that is too old does not fire", () => {
    const tests = [T("a", "2026-07-01", 48), T("b", "2026-08-01", 51)]; // best is 26 days before NOW
    expect(detectCmjPersonalBest(tests, { now: NOW, recencyDays: 3 })).toBeNull();
    expect(detectCmjPersonalBest(tests, { now: NOW, recencyDays: 60 })).not.toBeNull();
  });
  it("ignores invalid/zero jumps and unordered input", () => {
    const tests = [T("c", "2026-08-26", 51), T("a", "2026-08-01", 48), T("bad", "2026-08-10", 0)];
    const pb = detectCmjPersonalBest(tests, { now: NOW })!;
    expect(pb.value).toBe(51);
    expect(pb.priorBest).toBe(48);
  });
});

describe("detectPersonalBest — Nordic & IMTP (metric-driven margins)", () => {
  const V = (id: string, at: string, value: number): TestBest => ({ testId: id, at, value });

  it("Nordic: +18 N clears the 15 N / 3% floor → PB in N", () => {
    const pb = detectPersonalBest("nordic_peak_force", [V("a", "2026-08-01", 380), V("b", "2026-08-26", 398)], { now: NOW })!;
    expect(pb).not.toBeNull();
    expect(pb.metric).toBe("nordic_peak_force");
    expect(pb.unit).toBe("N");
    expect(pb.value).toBe(398);
    expect(pb.improvement).toBe(18);
  });
  it("Nordic: a +8 N bump is below the 15 N floor → null", () => {
    expect(detectPersonalBest("nordic_peak_force", [V("a", "2026-08-01", 380), V("b", "2026-08-26", 388)], { now: NOW })).toBeNull();
  });
  it("IMTP: +120 N clears the 40 N / 3% floor → PB", () => {
    const pb = detectPersonalBest("imtp_peak_force", [V("a", "2026-08-01", 2800), V("b", "2026-08-26", 2920)], { now: NOW })!;
    expect(pb.metric).toBe("imtp_peak_force");
    expect(pb.value).toBe(2920);
    expect(pb.improvement).toBe(120);
  });
  it("IMTP: +30 N is below the 40 N floor → null", () => {
    expect(detectPersonalBest("imtp_peak_force", [V("a", "2026-08-01", 2800), V("b", "2026-08-26", 2830)], { now: NOW })).toBeNull();
  });
  it("metric-aware copy names the discipline", () => {
    const nordic = detectPersonalBest("nordic_peak_force", [V("a", "2026-08-01", 380), V("b", "2026-08-26", 400)], { now: NOW })!;
    expect(pbPushCopy(nordic, "en").body).toMatch(/strongest Nordic yet — 400 N/);
    expect(pbCardCopy(nordic, "en").headline).toMatch(/400 N Nordic strength/);
    const imtp = detectPersonalBest("imtp_peak_force", [V("a", "2026-08-01", 2800), V("b", "2026-08-26", 2950)], { now: NOW })!;
    expect(pbPushCopy(imtp, "en").body).toMatch(/strongest IMTP pull yet — 2950 N/);
  });
});

describe("copy helpers", () => {
  const pb = detectCmjPersonalBest([T("a", "2026-08-01", 49), T("c", "2026-08-26", 50.5)], { now: NOW })!;
  it("push copy is bilingual and trims .0", () => {
    expect(pbPushCopy(pb, "en").title).toMatch(/personal best/i);
    expect(pbPushCopy(pb, "en").body).toContain("50.5 cm");
    expect(pbPushCopy(pb, "en").body).toContain("+1.5 cm");
    expect(pbPushCopy(pb, "is").body).toContain("hæsta stökkið");
  });
  it("card copy names the metric + prior best", () => {
    expect(pbCardCopy(pb, "en").headline).toMatch(/50.5 cm jump height/);
    expect(pbCardCopy(pb, "en").sub).toContain("49 cm");
    expect(pbCardCopy(pb, "is").headline).toContain("stökkhæð");
  });
});
