import { describe, it, expect } from "vitest";
import { squadDayMedians, type DayRow } from "@/lib/micropulse/sessionEnough/dayRows";

/** An outdoor session row: `a` accelerations, 70 min, GPS on. */
const row = (pid: string, date: string, a: number, over: Record<string, unknown> = {}): DayRow => ({
  player_id: pid, date, source: "catapult",
  ima_accel: a, ima_decel: a * 1.5, ima_cod_left_high: 10, ima_cod_left_medium: 20, ima_cod_left_low: 30, ima_cod_right_high: 10, ima_cod_right_medium: 20, ima_cod_right_low: 30,
  velocity_band5_total_distance: 200, velocity_band6_total_distance: 50, total_distance: 5000, total_player_load: 450, session_duration_minutes: 70,
  ...over,
});
const D = "2026-10-06", M = "2026-10-04";

describe("squadDayMedians", () => {
  it("takes the median of the players with a full session", () => {
    const rows = [row("a", D, 40), row("b", D, 50), row("c", D, 60), row("d", D, 90, { session_duration_minutes: 30 }) /* < 60% of 70 → shortened */];
    const [d] = squadDayMedians({ dates: [D], rows, matchDates: new Set(), minutesByKey: new Map() });
    expect(d.players).toBe(3);
    expect(d.med.imaAccel).toBe(50);
    expect(d.med.imaCod).toBe(120);
    expect(d.med.hsr).toBe(250);
    expect(d.med.load).toBe(450);
  });

  it("splits out the players who did not start the last match (top-up)", () => {
    const rows = [row("a", D, 10), row("b", D, 12), row("c", D, 50), row("d", D, 52), row("e", D, 54)];
    const minutesByKey = new Map([["a|" + M, 90], ["b|" + M, 75], ["c|" + M, 20], ["d|" + M, 0]]); // e: no minutes → not a starter
    const [d] = squadDayMedians({ dates: [D], rows, matchDates: new Set([M]), minutesByKey });
    expect(d.nonStarters).toBe(3);
    expect(d.medNonStarter.imaAccel).toBe(52);
    expect(d.med.imaAccel).toBe(50);
  });

  it("indoors (no GPS) keeps the IMA counts and leaves high-speed running and distance empty", () => {
    const indoor = { velocity_band5_total_distance: 0, velocity_band6_total_distance: 0, total_distance: 12 };
    const [d] = squadDayMedians({ dates: [D], rows: ["a", "b", "c"].map((p) => row(p, D, 40, indoor)), matchDates: new Set(), minutesByKey: new Map() });
    expect(d.med.imaAccel).toBe(40);
    expect(d.med.hsr).toBeNull();
    expect(d.med.dist).toBeNull();
  });

  it("marks a match day and returns an empty day when nobody trained", () => {
    const [m, e] = squadDayMedians({ dates: [M, D], rows: [row("a", M, 80)], matchDates: new Set([M]), minutesByKey: new Map() });
    expect(m.isMatch).toBe(true);
    expect(e).toMatchObject({ isMatch: false, players: 0, nonStarters: 0 });
    expect(e.med.imaAccel).toBeNull();
  });
});
