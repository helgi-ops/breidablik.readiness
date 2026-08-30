import { describe, it, expect } from "vitest";
import {
  evaluateRpeExpectation, minutesBucket, isRpeExpectationActionable,
  DEFAULT_RPE_BANDS, type RpeBandGrid,
} from "../index";

describe("minutesBucket", () => {
  it("bins on the 60 / 30 cutoffs, boundaries inclusive", () => {
    expect(minutesBucket(60)).toBe("full");
    expect(minutesBucket(59)).toBe("partial");
    expect(minutesBucket(30)).toBe("partial");
    expect(minutesBucket(29)).toBe("minimal");
    expect(minutesBucket(0)).toBe("minimal");
    expect(minutesBucket(null)).toBe("minimal"); // no minutes = didn't play
  });
  it("honours coach-tuned cutoffs", () => {
    expect(minutesBucket(45, { full: 45, partial: 20 })).toBe("full");
  });
});

describe("evaluateRpeExpectation — grid resolution", () => {
  it("within band → 'within', high confidence, default provenance", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD-3", matchMinutes: null, actualRpe: 7 });
    expect(r.status).toBe("within");
    expect(r.expected).toEqual([6, 8]);
    expect(r.bandSource).toBe("default");
    expect(r.confidence).toBe("high");
    expect(r.verdict.en).toMatch(/as planned/);
    expect(r.verdict.is).toMatch(/innan væntinga/);
  });

  it("over the taper on MD-1 → 'over'", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD-1", matchMinutes: 90, actualRpe: 7 });
    expect(r.status).toBe("over");
    expect(r.expected).toEqual([2, 4]);
    expect(r.verdict.en).toMatch(/harder than planned/);
  });

  it("a full-minutes starter on MD+1 who logs recovery RPE is 'within' (1-3)", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD+1", matchMinutes: 90, actualRpe: 2 });
    expect(r.bucket).toBe("full");
    expect(r.expected).toEqual([1, 3]);
    expect(r.status).toBe("within");
  });

  it("the TOP-UP flag: a bench player on MD+1 logging low RPE → 'missed_topup'", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD+1", matchMinutes: 12, actualRpe: 2 });
    expect(r.bucket).toBe("minimal");
    expect(r.expected).toEqual([6, 8]);
    expect(r.isTopup).toBe(true);
    expect(r.status).toBe("missed_topup");
    expect(r.verdict.en).toMatch(/top-up missed/);
    expect(r.verdict.is).toMatch(/top-up vantaði/);
  });

  it("a bench player on MD+1 who DID the top-up (RPE 7) is 'within'", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD+1", matchMinutes: 0, actualRpe: 7 });
    expect(r.status).toBe("within");
    expect(r.isTopup).toBe(true);
  });

  it("under on a non-top-up day is plain 'under', not 'missed_topup'", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD-2", matchMinutes: 90, actualRpe: 2 });
    expect(r.status).toBe("under");
    expect(r.isTopup).toBe(false);
  });
});

describe("evaluateRpeExpectation — gates (no false flags)", () => {
  it("missing RPE → 'not_logged', never a false green", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD-3", matchMinutes: null, actualRpe: null });
    expect(r.status).toBe("not_logged");
    expect(r.confidence).toBe("n/a");
    expect(r.verdict.en).toMatch(/no RPE logged/);
    expect(isRpeExpectationActionable(r)).toBe(true);
  });

  it("unknown / unmodelled MD-day → 'unknown_day', silent (no chip)", () => {
    for (const md of ["OTHER", "", null, "MD+9"]) {
      const r = evaluateRpeExpectation({ mdDay: md, matchMinutes: 90, actualRpe: 5 });
      expect(r.status).toBe("unknown_day");
      expect(isRpeExpectationActionable(r)).toBe(false);
      expect(r.verdict.en).toBe("");
    }
  });

  it("a non-player on MD (match day) has no expectation → silent", () => {
    const r = evaluateRpeExpectation({ mdDay: "MD", matchMinutes: 0, actualRpe: 3 });
    expect(r.bucket).toBe("minimal");
    expect(r.status).toBe("unknown_day"); // MD has no 'minimal' cell
  });
});

describe("coach override bands", () => {
  it("uses coach bands + marks provenance 'coach'", () => {
    const coach: RpeBandGrid = { ...DEFAULT_RPE_BANDS, "MD-3": { full: [8, 9], partial: [8, 9], minimal: [8, 9] } };
    const r = evaluateRpeExpectation({ mdDay: "MD-3", matchMinutes: 90, actualRpe: 7, bands: coach });
    expect(r.bandSource).toBe("coach");
    expect(r.expected).toEqual([8, 9]);
    expect(r.status).toBe("under"); // 7 < 8 now, under the coach's higher peak
  });
});
