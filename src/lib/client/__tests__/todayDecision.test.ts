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
    expect(decideToday({ ...base, session: null }).headline.EN).toBe("No session planned");
  });
});
