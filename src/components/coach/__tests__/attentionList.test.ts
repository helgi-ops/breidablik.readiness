import { describe, it, expect } from "vitest";
import {
  buildAttentionList,
  selectNeedsAttention,
  type BriefingRow,
} from "@/components/coach/DailyBriefingCard";
import type { AthleteMetricBaseline } from "@/lib/micropulse/baselines";
import { MIN_MATURE_OBS } from "@/lib/micropulse/attention/thresholds";

// ─────────────────────────────────────────────────────────────────────────────
// "Needs attention" bulletproofing matrix.
//
// buildAttentionList is the single source that turns BriefingRow[] into the
// coach's morning action list. These tests lock the hardened selection + delta
// rules: an estimate never fires an identical hard ALERT to a measurement, a
// "worse" trend is never built on an estimate/stale row, thresholds are the
// named constants, ordering is deterministic, and missing data is never green.
// ─────────────────────────────────────────────────────────────────────────────

const TODAY = "2026-07-28";
const YESTERDAY_GREEN = { color: "green" as const, score: 20 };

type Comp = Parameters<typeof buildAttentionList>[1][string];

const comp = (over: Partial<Comp> = {}): Comp => ({
  compositeScore: 0.3,
  concernLevel: "none",
  fatigueType: null,
  playerLoadSpike: null,
  loadRatio: null,
  ...over,
});

const baseline = (obs: number, status: AthleteMetricBaseline["status"] = "active"): Record<string, AthleteMetricBaseline> => {
  const one = (metric_key: string): AthleteMetricBaseline => ({
    player_id: "p1", metric_key, n_observations: obs,
    mean: 4, sd: 0.6, cv: 0.15, median: 4, window_days: 28, status, computed_at: TODAY,
  });
  return {
    "wellness.sleep_quality": one("wellness.sleep_quality"),
    "wellness.fatigue_energy": one("wellness.fatigue_energy"),
    "wellness.stress_mood": one("wellness.stress_mood"),
    "wellness.muscle_soreness": one("wellness.muscle_soreness"),
  };
};

// A fully-measured RED row with all four wellness sub-scores + Δz present.
const measuredRed = (over: Partial<BriefingRow> = {}): BriefingRow => ({
  player_id: "p1", full_name: "P One", entry_date: TODAY,
  final_color: "red", total_score: 10,
  sleep_quality: 2, fatigue_energy: 2, stress_mood: 2, muscle_soreness: 2,
  _dz: -0.8, md_day: "MD-2",
  ...over,
});

type Opts = {
  comps?: Record<string, Comp>;
  baselines?: Record<string, Record<string, AthleteMetricBaseline>> | null;
  recentDayTypes?: Record<string, string | null> | null;
  injuries?: Parameters<typeof buildAttentionList>[7];
  deltas?: Parameters<typeof buildAttentionList>[8];
  lang?: "IS" | "EN";
};

function build(rows: BriefingRow[], opts: Opts = {}) {
  return buildAttentionList(
    rows,
    opts.comps ?? {},
    opts.lang ?? "EN",
    opts.baselines ?? null,
    null,
    opts.recentDayTypes ?? null,
    TODAY,
    opts.injuries ?? null,
    opts.deltas ?? null,
  );
}

const byId = (rows: ReturnType<typeof build>, id: string) => rows.find((r) => r.playerId === id);

describe("buildAttentionList — bulletproofing matrix", () => {
  it("measured RED, full data → hard ALERT, delta worse", () => {
    const [it0] = build([measuredRed()], {
      baselines: { p1: baseline(28) },
      comps: { p1: comp() },
      deltas: { p1: YESTERDAY_GREEN },
    });
    expect(it0.level).toBe("alert");
    expect(it0.estimated).toBeFalsy();
    expect(it0.provisional).toBeFalsy();
    expect(it0.delta?.kind).toBe("worse");
  });

  it("imputed RED (no check-in) → provisional/estimated, NOT hard alert; delta not a confident worse", () => {
    const [it0] = build([measuredRed({ is_imputed: true })], {
      deltas: { p1: YESTERDAY_GREEN },
    });
    expect(it0.estimated).toBe(true);
    expect(it0.level).not.toBe("alert"); // demoted — never identical to a measured RED
    expect(it0.delta?.kind).not.toBe("worse"); // no confident ↓↓ on an estimate
  });

  it("RED today, yesterday imputed → delta relabelled, not a confident worse", () => {
    const [it0] = build([measuredRed()], {
      deltas: { p1: { color: "green", score: 20, imputed: true } },
    });
    expect(it0.level).toBe("alert"); // today is measured — flag stands
    expect(it0.delta?.kind).not.toBe("worse");
  });

  it("stale row (older than today) → stale-flagged; delta not worse", () => {
    const [it0] = build([measuredRed({ entry_date: "2026-07-25" })], {
      deltas: { p1: YESTERDAY_GREEN },
    });
    expect(it0.stale).toBe(true);
    expect(it0.delta?.kind).not.toBe("worse");
  });

  it("measured RED, baseline obs < MIN_MATURE → ALERT tagged provisional", () => {
    const [it0] = build([measuredRed()], {
      baselines: { p1: baseline(MIN_MATURE_OBS - 5) },
      comps: { p1: comp() },
    });
    expect(it0.level).toBe("alert"); // real concern stays visible
    expect(it0.provisional).toBe(true); // but on thinner ice
  });

  it("YELLOW, low coverage (1/4 wellness) → monitor, provisional", () => {
    const row: BriefingRow = {
      player_id: "p1", full_name: "P One", entry_date: TODAY,
      final_color: "yellow", total_score: 15, sleep_quality: 2, md_day: "MD-2",
    };
    const [it0] = build([row]);
    expect(it0.level).toBe("monitor");
    expect(it0.provisional).toBe(true);
  });

  it("post-match MD+1 PL spike 1.7× → monitor (downgraded), not alert", () => {
    const row = measuredRed({ player_id: "p1", final_color: "green", total_score: 20, md_day: "MD+1" });
    const [it0] = build([row], { comps: { p1: comp({ playerLoadSpike: 1.7 }) } });
    expect(it0.level).toBe("monitor");
    expect(it0.matchContextUnknown).toBeFalsy();
    expect(it0.reasons.some((r) => /post-match|expected/i.test(r))).toBe(true);
  });

  it("post-match spike but plan/day-type data missing → context-unknown, not a silent hard alert", () => {
    const row = measuredRed({ final_color: "green", total_score: 20, md_day: null });
    const [it0] = build([row], { comps: { p1: comp({ playerLoadSpike: 1.7 }) }, recentDayTypes: null });
    expect(it0.level).toBe("monitor");
    expect(it0.matchContextUnknown).toBe(true);
    expect(it0.reasons.some((r) => /context unknown/i.test(r))).toBe(true);
  });

  it("active injury + green readiness → in list, injury leads", () => {
    const row = measuredRed({ final_color: "green", total_score: 20 });
    const [it0] = build([row], { injuries: { p1: { status: "injured" } } });
    expect(it0.injury?.kind).toBe("injured");
    expect(it0.level).toBe("alert");
  });

  it("resolved (cleared) injury + green readiness → not pinned in the list", () => {
    const row = measuredRed({ final_color: "green", total_score: 20 });
    const out = build([row], { injuries: { p1: { status: "cleared" } } });
    expect(byId(out, "p1")).toBeUndefined();
  });

  it("duplicate player_id in rows → listed once", () => {
    const out = build([measuredRed(), measuredRed()], { deltas: { p1: YESTERDAY_GREEN } });
    expect(out.filter((r) => r.playerId === "p1")).toHaveLength(1);
  });

  it("no rows / all green → empty list", () => {
    const green: BriefingRow = { player_id: "p1", full_name: "P One", entry_date: TODAY, final_color: "green", total_score: 22, md_day: "MD-2" };
    expect(build([green])).toHaveLength(0);
    expect(build([])).toHaveLength(0);
  });

  it("ACWR tie between two players → stable, id-ordered", () => {
    const p2 = measuredRed({ player_id: "p2", full_name: "P Two" });
    const p1 = measuredRed({ player_id: "p1", full_name: "P One" });
    const out = build([p2, p1], { comps: { p1: comp({ playerLoadSpike: 1.2 }), p2: comp({ playerLoadSpike: 1.2 }) } });
    expect(out.map((r) => r.playerId)).toEqual(["p1", "p2"]);
  });

  it("count parity — selectNeedsAttention is the single source", () => {
    const rows = [
      measuredRed({ player_id: "p1" }),
      measuredRed({ player_id: "p2", final_color: "yellow", total_score: 15 }),
      { player_id: "p3", full_name: "P Three", entry_date: TODAY, final_color: "green", total_score: 22, md_day: "MD-2" } as BriefingRow,
    ];
    const sel = selectNeedsAttention(rows, {}, "EN", null, null, null, TODAY, null, null);
    expect(sel.count).toBe(sel.items.length);
    expect(sel.alertCount).toBe(sel.items.filter((i) => i.level === "alert").length);
    // p3 (green) is not flagged; p1 (red) + p2 (yellow) are.
    expect(sel.count).toBe(2);
    expect(sel.alertCount).toBe(1);
  });
});
