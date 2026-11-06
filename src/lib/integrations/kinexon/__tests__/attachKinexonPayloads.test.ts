import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachKinexonPayloads } from "../attachKinexonPayloads";
import { KINEXON_CATALOG, readKinexonMetric } from "../metricCatalog";

/** A query builder that records its filters and answers with the given rows. */
function fakeSb(payloads: Array<{ player_id: string; date: string; raw_payload_json: unknown }>) {
  const eq = vi.fn();
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, value: unknown) => { eq(col, value); return builder; }),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(async () => ({ data: payloads, error: null })),
  };
  const from = vi.fn(() => builder);
  return { sb: { from } as unknown as SupabaseClient, from, eq };
}

const scope = { teamId: "team-1", startDate: "2026-10-01", endDate: "2026-10-31" };

describe("attachKinexonPayloads", () => {
  it("makes no query at all for a team without Kinexon rows", async () => {
    const { sb, from } = fakeSb([]);
    const rows = [
      { player_id: "a", date: "2026-10-01", source: "catapult" },
      { player_id: "b", date: "2026-10-01", source: "manual" },
    ];
    expect(await attachKinexonPayloads(sb, rows, scope)).toBe(rows);
    expect(from).not.toHaveBeenCalled();
  });

  it("gives each Kinexon row its own payload and leaves other sources without one", async () => {
    const { sb, eq } = fakeSb([
      { player_id: "a", date: "2026-10-01", raw_payload_json: { x: 1 } },
      { player_id: "a", date: "2026-10-02", raw_payload_json: { x: 2 } },
    ]);
    const out = await attachKinexonPayloads(
      sb,
      [
        { player_id: "a", date: "2026-10-01", source: "kinexon" },
        { player_id: "a", date: "2026-10-02", source: "kinexon" },
        { player_id: "a", date: "2026-10-01", source: "catapult" },
        { player_id: "b", date: "2026-10-01", source: "kinexon" },
      ],
      scope,
    );
    expect(out.map((r) => (r as { raw_payload_json?: unknown }).raw_payload_json)).toEqual([{ x: 1 }, { x: 2 }, undefined, null]);
    expect(eq).toHaveBeenCalledWith("source", "kinexon");
    expect(eq).toHaveBeenCalledWith("team_id", "team-1");
  });

  it("does not filter by team when an admin has none selected", async () => {
    const { sb, eq } = fakeSb([]);
    await attachKinexonPayloads(sb, [{ player_id: "a", date: "2026-10-01", source: "kinexon" }], { ...scope, teamId: null });
    expect(eq).not.toHaveBeenCalledWith("team_id", expect.anything());
  });

  it("leaves metrics readable, so Kinexon MLI and metabolic values do not change", async () => {
    const metric = KINEXON_CATALOG.flatMap((g) => g.metrics).find((m) => m.key === "mech_load")!;
    const { sb } = fakeSb([
      { player_id: "a", date: "2026-10-01", raw_payload_json: { [metric.tokens.join(" ")]: 321 } },
    ]);
    const [row] = await attachKinexonPayloads(sb, [{ player_id: "a", date: "2026-10-01", source: "kinexon" }], scope);
    expect(readKinexonMetric(row as Record<string, unknown>, metric)).toBe(321);
  });
});
