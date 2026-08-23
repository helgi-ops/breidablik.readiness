import { describe, it, expect } from "vitest";
import {
  computePeakPeriodContext, alignEventsToWindow, classifyEventAction,
  type MatchEvent, type PeakWindow,
} from "../index";

const ev = (over: Partial<MatchEvent>): MatchEvent => ({
  tSec: 100, type: "pass", subjectIsActor: true, ownPossession: true, x: 50, forward: true, outcomeSuccess: true, obv: 0.05, ...over,
});
const win = (over: Partial<PeakWindow> = {}): PeakWindow => ({ windowMin: 1, startSec: 600, endSec: 660, metric: "distance", value: 320, ...over });

describe("alignEventsToWindow", () => {
  it("keeps only events whose clock is inside [startSec, endSec]", () => {
    const w = win();
    const events = [ev({ tSec: 599 }), ev({ tSec: 600 }), ev({ tSec: 630 }), ev({ tSec: 660 }), ev({ tSec: 661 })];
    expect(alignEventsToWindow(events, w)).toHaveLength(3); // 600, 630, 660
  });
});

describe("classifyEventAction — on-ball Ju actions", () => {
  it("carries/dribbles → run with ball, or run-in-behind in the attacking third", () => {
    expect(classifyEventAction(ev({ type: "carry", x: 40 }))).toBe("run_with_ball");
    expect(classifyEventAction(ev({ type: "dribble", x: 80, forward: true }))).toBe("run_in_behind");
  });
  it("receptions → move to receive, or run-in-behind high up", () => {
    expect(classifyEventAction(ev({ type: "ball receipt", x: 40, forward: false }))).toBe("move_to_receive");
    expect(classifyEventAction(ev({ type: "reception", x: 85, forward: true }))).toBe("run_in_behind");
  });
  it("passes → support play; unknown own-possession event → other", () => {
    expect(classifyEventAction(ev({ type: "pass" }))).toBe("support_play");
    expect(classifyEventAction(ev({ type: "throw-in", ownPossession: true }))).toBe("other");
  });
  it("out-of-possession defensive events are labelled off-ball proxies", () => {
    expect(classifyEventAction(ev({ type: "ball recovery", ownPossession: false }))).toBe("recovery_run");
    expect(classifyEventAction(ev({ type: "pressure", ownPossession: false }))).toBe("covering");
  });
});

describe("computePeakPeriodContext", () => {
  it("builds the action distribution + attacking verdict for a winger's peak window", () => {
    const w = win();
    const events = [
      ev({ tSec: 610, type: "carry", x: 80, forward: true }),        // run_in_behind
      ev({ tSec: 615, type: "dribble", x: 85, forward: true }),      // run_in_behind
      ev({ tSec: 620, type: "reception", x: 82, forward: true }),    // run_in_behind
      ev({ tSec: 630, type: "pass" }),                                // support_play
      ev({ tSec: 640, type: "ball receipt", x: 40, forward: false }),// move_to_receive
      ev({ tSec: 650, type: "pressure", ownPossession: false }),     // covering (off-ball)
    ];
    const r = computePeakPeriodContext([w], events);
    expect(r.hasEvents).toBe(true);
    expect(r.events).toBe(6);
    expect(r.onBallEvents).toBe(5);
    expect(r.actions[0].action).toBe("run_in_behind"); // most frequent
    expect(r.verdict.en.toLowerCase()).toContain("attacking");
    expect(r.offBallNote.en).toContain("tracking");
    expect(r.confidence).toBe("medium"); // 6 events
    expect(r.citation).toContain("Ju W");
  });

  it("picks the shortest window with a clock (the 1-min peak) and aligns to it", () => {
    const windows = [win({ windowMin: 5, startSec: 500, endSec: 800 }), win({ windowMin: 1, startSec: 600, endSec: 660 })];
    const events = [ev({ tSec: 550 }), ev({ tSec: 630 })];
    const r = computePeakPeriodContext(windows, events);
    expect(r.window?.windowMin).toBe(1);
    expect(r.events).toBe(1); // only tSec 630 is inside the 1-min window
  });
});

describe("computePeakPeriodContext — honest data gates", () => {
  it("no window clock position → gated, names the GPS-side feed needed", () => {
    const noClock = { windowMin: 1, startSec: NaN, endSec: NaN, metric: "distance", value: 320 } as unknown as PeakWindow;
    const r = computePeakPeriodContext([noClock], [ev({})]);
    expect(r.hasEvents).toBe(false);
    expect(r.window).toBeNull();
    expect(r.verdict.en.toLowerCase()).toContain("catapult");
  });

  it("window present but no aligned events → gated, names the event-feed needed", () => {
    const r = computePeakPeriodContext([win()], [ev({ tSec: 100 })]); // event outside the window
    expect(r.hasEvents).toBe(false);
    expect(r.verdict.en.toLowerCase()).toContain("time-stamped event feed");
  });
});
