import { describe, it, expect } from "vitest";
import { writePlayerDrillLoad, type PeriodRow, type DrillMatch } from "../index";

/** Minimal fake Supabase that captures the upsert payload. */
function fakeSb() {
  const captured: { table?: string; rows?: Record<string, unknown>[]; opts?: unknown } = {};
  const sb = {
    from(table: string) {
      captured.table = table;
      return {
        upsert(rows: Record<string, unknown>[], opts: unknown) {
          captured.rows = rows;
          captured.opts = opts;
          return { error: null };
        },
      };
    },
  };
  return { sb, captured };
}

const metrics = (o: Partial<Record<string, number>>) => ({
  player_load: null, player_load_per_min: null, distance_m: null, hir_total: null, vel_b5: null, vel_b6: null,
  max_velocity: null, accel_b23: null, decel_b23: null, accel_total: null, decel_total: null, hmld_m: null,
  metabolic_power_avg: null, metabolic_power_peak: null, duration_min: null, ima_accel: null, ima_decel: null,
  ima_cod_total: null, high_ima: null, jumps: null, ...o,
} as PeriodRow["metrics"]);

describe("writePlayerDrillLoad", () => {
  const rows: PeriodRow[] = [
    { periodName: "Rondo", order: 0, athleteKey: "A1", metrics: metrics({ distance_m: 400, ima_cod_total: 12 }) },
    { periodName: "Rondo", order: 0, athleteKey: "A2", metrics: metrics({ distance_m: 380, ima_cod_total: 9 }) },
    { periodName: "SSG 8v8", order: 1, athleteKey: "A1", metrics: metrics({ distance_m: 1200 }) },
    { periodName: "SSG 8v8", order: 1, athleteKey: "A9", metrics: metrics({ distance_m: 1100 }) }, // unmatched athlete
  ];
  const matchByNorm = new Map<string, DrillMatch>([
    ["rondo", { drillId: "drill-rondo", matchedBy: "name", periodName: "Rondo" }],
    ["ssg 8v8", { drillId: "drill-ssg", matchedBy: "order", periodName: "SSG 8v8" }],
  ]);
  const resolve = (k: string) => (k === "A1" ? "P1" : k === "A2" ? "P2" : null); // A9 unmatched

  it("writes one row per (player, drill), skips unresolved athletes, attaches the drill match", async () => {
    const { sb, captured } = fakeSb();
    const res = await writePlayerDrillLoad(
      sb,
      { teamId: "T1", dateISO: "2026-07-11", sessionId: "S1", matchByNorm, source: "catapult" },
      rows,
      resolve,
    );
    expect(res.ok).toBe(true);
    // P1: Rondo + SSG = 2 rows; P2: Rondo = 1 row; A9 skipped → 3 rows, 2 players
    expect(res.rows).toBe(3);
    expect(res.players).toBe(2);
    expect(captured.table).toBe("player_drill_load");

    const byKey = new Map((captured.rows ?? []).map((r) => [`${r.player_id}:${r.period_norm}`, r]));
    const p1Rondo = byKey.get("P1:rondo")!;
    expect(p1Rondo.drill_id).toBe("drill-rondo");
    expect(p1Rondo.matched_by).toBe("name");
    expect(p1Rondo.distance_m).toBe(400);       // P1's OWN value, not a squad mean
    expect(p1Rondo.ima_cod_total).toBe(12);
    expect(p1Rondo.session_date).toBe("2026-07-11");
    expect(p1Rondo.saved_session_id).toBe("S1");
    expect(p1Rondo.external_athlete_id).toBe("A1");

    const p2Rondo = byKey.get("P2:rondo")!;
    expect(p2Rondo.distance_m).toBe(380);       // different player, own value
    const p1Ssg = byKey.get("P1:ssg 8v8")!;
    expect(p1Ssg.drill_id).toBe("drill-ssg");
    expect(p1Ssg.matched_by).toBe("order");
    // A9 (unresolved) never written
    expect([...byKey.keys()].some((k) => k.startsWith("A9"))).toBe(false);
  });

  it("upserts on the natural key (idempotent re-sync)", async () => {
    const { sb, captured } = fakeSb();
    await writePlayerDrillLoad(sb, { teamId: "T1", dateISO: "2026-07-11", sessionId: "S1", matchByNorm }, rows, resolve);
    expect(captured.opts).toEqual({ onConflict: "player_id,session_date,period_norm,source" });
  });

  it("no-op when nothing resolves", async () => {
    const { sb } = fakeSb();
    const res = await writePlayerDrillLoad(sb, { teamId: "T1", dateISO: "2026-07-11", sessionId: null, matchByNorm }, rows, () => null);
    expect(res).toEqual({ ok: true, rows: 0, players: 0 });
  });
});
