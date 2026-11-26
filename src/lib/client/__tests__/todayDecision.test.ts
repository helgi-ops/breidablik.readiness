import { describe, expect, it } from "vitest";
import { decideToday, type DecisionInput } from "../todayDecision";

const base: DecisionInput = {
  checkinOn: false,
  checkedIn: false,
  session: { restDay: false, matchDay: false, daysToGame: null, readiness: null },
  fosterStatus: "ok",
  fosterReason: "",
  loadRatio: 1.0,
};
const session = base.session!;

describe("decideToday", () => {
  it("check-in off: steady load is a full session, never a check-in prompt", () => {
    const d = decideToday(base);
    expect(d.headline.EN).toBe("Full session today");
    expect(d.needsCheckin).toBeUndefined();
  });

  it("ignores readiness when check-in is off", () => {
    const d = decideToday({ ...base, session: { ...session, readiness: { applied: true, zone: "yellow", volumePct: 80, intensityPct: 90, action: "deload" } } });
    expect(d.headline.EN).toBe("Full session today");
  });

  it("check-in on and not done asks for check-in first on a training day", () => {
    expect(decideToday({ ...base, checkinOn: true }).needsCheckin).toBe(true);
  });

  it("rest day beats the check-in prompt", () => {
    const d = decideToday({ ...base, checkinOn: true, session: { ...session, restDay: true } });
    expect(d.headline.EN).toBe("Rest day");
    expect(d.label).toBeNull();
  });

  it("states an applied adjustment with its numbers", () => {
    const d = decideToday({ ...base, checkinOn: true, checkedIn: true, session: { ...session, readiness: { applied: true, zone: "yellow", volumePct: 80, intensityPct: 90, action: "deload" } } });
    expect(d.headline.EN).toBe("Lighter session today");
    expect(d.why.EN).toContain("20% less volume and 10% less weight");
  });

  it("uses the same load bands as the trainer list", () => {
    expect(decideToday({ ...base, loadRatio: 1.6 }).tone).toBe("bad");
    expect(decideToday({ ...base, loadRatio: 1.4 }).tone).toBe("warn");
    expect(decideToday({ ...base, loadRatio: 0.7 }).label?.EN).toBe("Load below normal");
  });

  it("match day wins over everything", () => {
    const d = decideToday({ ...base, loadRatio: 1.7, session: { ...session, matchDay: true } });
    expect(d.headline.EN).toBe("No gym today");
  });

  it("no programme says so plainly", () => {
    expect(decideToday({ ...base, session: null }).headline.EN).toBe("Your trainer is setting up your plan");
  });

  it("a plan that starts later says when, before anything else", () => {
    // 2026-11-30 is a Monday.
    const d = decideToday({ ...base, session: null, upcoming: { startDate: "2026-11-30", daysUntil: 3 } });
    expect(d.headline.EN).toBe("Your plan starts on Monday");
    expect(d.headline.IS).toBe("Áætlunin byrjar á mánudag");
    expect(decideToday({ ...base, upcoming: { startDate: "2026-11-28", daysUntil: 1 } }).headline.EN).toBe("Your plan starts tomorrow");
    expect(decideToday({ ...base, upcoming: { startDate: "2026-12-14", daysUntil: 17 } }).headline.EN).toBe("Your plan starts on 14 December");
  });

  it("a finished programme says so", () => {
    expect(decideToday({ ...base, completed: true }).headline.EN).toBe("Programme finished");
  });

  it("a rest day names the next session", () => {
    const d = decideToday({ ...base, session: { ...session, restDay: true, nextSessionWeekday: 3 } });
    expect(d.why.EN).toContain("Next session: Wednesday.");
    expect(d.why.IS).toContain("Næsta æfing er á miðvikudag.");
  });

  it("deload is in plain words; the technical reason goes behind details", () => {
    const d = decideToday({ ...base, fosterStatus: "deload_required", fosterReason: "Monotony 2.10 · strain 6400 — high overload risk." });
    expect(d.headline.EN).toBe("Take a lighter week");
    expect(d.why.EN).not.toContain("Monotony");
    expect(d.detail).toContain("Monotony 2.10");
    expect(d.fosterCited).toBe(true);
  });
});
