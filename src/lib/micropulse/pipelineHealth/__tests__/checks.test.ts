import { describe, it, expect } from "vitest";
import {
  evaluateTeamHealth, shouldAlert, isActionableHealth,
  checkStage4Alive, checkExternalLoadIngestion, checkCheckinsFlowing, checkWearableSync,
  type TeamHealthFacts, type HealthStatus,
} from "../checks";

const TODAY = "2026-10-16";
const NOW = Date.parse(`${TODAY}T06:00:00Z`);
const daysAgo = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const facts = (over: Partial<TeamHealthFacts>): TeamHealthFacts => ({
  teamId: "t1", teamName: "Breiðablik", today: TODAY, nowMs: NOW,
  activePlayerCount: 22, usesWellness: true, gpsExpected: true, hasActiveWearables: true,
  readinessMaxDate: TODAY, realCheckinTodayCount: 18, coachViewRowsToday: 18,
  stage4MaxDate: TODAY, teamSignalRowToday: true, weekPlanTodayExists: true,
  externalLoadMaxDate: daysAgo(1), wearableMaxSync: `${TODAY}T05:00:00Z`, wearableErrorCount: 0,
  ...over,
});

const byId = (rs: ReturnType<typeof evaluateTeamHealth>, id: string) => rs.find((r) => r.id === id);

describe("evaluateTeamHealth — healthy team", () => {
  it("every applicable check is ok, none actionable", () => {
    const rs = evaluateTeamHealth(facts({}));
    expect(rs.every((r) => r.status === "ok")).toBe(true);
    expect(rs.some(isActionableHealth)).toBe(false);
    expect(rs).toHaveLength(7);
  });
});

describe("the 2026-09-14 regression — engine stalled while check-ins flow", () => {
  it("stage4 stale vs latest check-in → stage4_alive RED", () => {
    const r = checkStage4Alive(facts({ readinessMaxDate: TODAY, stage4MaxDate: "2026-09-14" }));
    expect(r?.status).toBe("red");
    expect(r?.detail.en).toMatch(/stalled/i);
  });
  it("and if the team-signal row is missing on a check-in day → team_signal_consistent RED", () => {
    const rs = evaluateTeamHealth(facts({ stage4MaxDate: "2026-09-14", realCheckinTodayCount: 18, teamSignalRowToday: false }));
    expect(byId(rs, "stage4_alive")?.status).toBe("red");
    expect(byId(rs, "team_signal_consistent")?.status).toBe("red");
    // red sorts first
    expect(rs[0].status).toBe("red");
  });
  it("stage4 never written at all → RED", () => {
    expect(checkStage4Alive(facts({ stage4MaxDate: null }))?.status).toBe("red");
  });
});

describe("canonical colour view", () => {
  it("check-ins today but 0 view rows → RED (broken view)", () => {
    const rs = evaluateTeamHealth(facts({ realCheckinTodayCount: 12, coachViewRowsToday: 0 }));
    expect(byId(rs, "canonical_colour_fresh")?.status).toBe("red");
  });
  it("no check-ins today and 0 view rows → info (quiet day, not a fault)", () => {
    const rs = evaluateTeamHealth(facts({ realCheckinTodayCount: 0, coachViewRowsToday: 0 }));
    expect(byId(rs, "canonical_colour_fresh")?.status).toBe("info");
  });
});

describe("gating — no false reds for teams a check doesn't apply to", () => {
  it("gps_only team: check-in / colour / stage4 / team-signal checks are dropped (null)", () => {
    const rs = evaluateTeamHealth(facts({ usesWellness: false, realCheckinTodayCount: 0, coachViewRowsToday: 0, teamSignalRowToday: false, stage4MaxDate: null }));
    expect(byId(rs, "checkins_flowing")).toBeUndefined();
    expect(byId(rs, "canonical_colour_fresh")).toBeUndefined();
    expect(byId(rs, "stage4_alive")).toBeUndefined();
    expect(byId(rs, "team_signal_consistent")).toBeUndefined();
  });
  it("Lite / no-GPS team: external-load check is dropped (no false amber)", () => {
    expect(checkExternalLoadIngestion(facts({ gpsExpected: false, externalLoadMaxDate: null }))).toBeNull();
  });
  it("team with no wearables: wearable check is dropped", () => {
    expect(checkWearableSync(facts({ hasActiveWearables: false, wearableMaxSync: null }))).toBeNull();
  });
  it("team with no active players: nothing fires", () => {
    const rs = evaluateTeamHealth(facts({ activePlayerCount: 0 }));
    expect(rs.filter(isActionableHealth)).toHaveLength(0);
  });
});

describe("freshness thresholds", () => {
  it("check-ins silent ≥3 days → amber", () => {
    expect(checkCheckinsFlowing(facts({ readinessMaxDate: daysAgo(3) }))?.status).toBe("amber");
    expect(checkCheckinsFlowing(facts({ readinessMaxDate: daysAgo(2) }))?.status).toBe("ok");
  });
  it("GPS load silent ≥14 days → amber", () => {
    expect(checkExternalLoadIngestion(facts({ externalLoadMaxDate: daysAgo(14) }))?.status).toBe("amber");
    expect(checkExternalLoadIngestion(facts({ externalLoadMaxDate: daysAgo(10) }))?.status).toBe("ok");
  });
  it("wearable sync >48h or an error → amber", () => {
    expect(checkWearableSync(facts({ wearableMaxSync: `${daysAgo(3)}T05:00:00Z` }))?.status).toBe("amber");
    expect(checkWearableSync(facts({ wearableErrorCount: 1 }))?.status).toBe("amber");
  });
});

describe("shouldAlert — dedup", () => {
  it("fires on a new/worsened actionable status, silent while unchanged", () => {
    expect(shouldAlert(null, "red")).toBe(true);    // new red
    expect(shouldAlert("ok", "red")).toBe(true);    // regressed
    expect(shouldAlert("amber", "red")).toBe(true); // worsened
    expect(shouldAlert("red", "red")).toBe(false);  // persistent — already alerted
    expect(shouldAlert("red", "amber")).toBe(true); // changed (still actionable)
  });
  it("never fires for non-actionable", () => {
    expect(shouldAlert(null, "ok")).toBe(false);
    expect(shouldAlert("red", "ok")).toBe(false);   // a clear is not an alert
    expect(shouldAlert(null, "info")).toBe(false);
  });
  it("a recurrence after a clear re-alerts", () => {
    const seq: HealthStatus[] = ["red", "ok", "red"];
    expect(shouldAlert(seq[0], seq[1])).toBe(false); // red→ok clear
    expect(shouldAlert(seq[1], seq[2])).toBe(true);  // ok→red recurrence
  });
});
