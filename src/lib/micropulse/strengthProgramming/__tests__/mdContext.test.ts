import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAutoMdContext } from "../loader";

/** Minimal week_plans stub matching the query chain fetchMdContext uses:
 *  .from().select().eq().gte().lte().order() → { data }. */
function sbWithWeekPlans(rows: Array<{ day_date: string; day_type: string }>): SupabaseClient {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.gte = () => q;
  q.lte = () => q;
  q.order = () => Promise.resolve({ data: rows, error: null });
  return { from: () => q } as unknown as SupabaseClient;
}

describe("resolveAutoMdContext — week_plans drives MD, PDF control cannot leak in", () => {
  it("GAME tomorrow → MD-1 (the reported bug: no override, reads the plan)", async () => {
    const sb = sbWithWeekPlans([
      { day_date: "2026-09-10", day_type: "TRAIN" },
      { day_date: "2026-09-11", day_type: "GAME" },
    ]);
    expect(await resolveAutoMdContext(sb, "team1", "2026-09-10")).toBe("MD-1");
  });

  it("GAME in 3 days → MD-3", async () => {
    const sb = sbWithWeekPlans([{ day_date: "2026-09-13", day_type: "GAME" }]);
    expect(await resolveAutoMdContext(sb, "team1", "2026-09-10")).toBe("MD-3");
  });

  it("matchday (GAME today) → OFF", async () => {
    const sb = sbWithWeekPlans([{ day_date: "2026-09-10", day_type: "GAME" }]);
    expect(await resolveAutoMdContext(sb, "team1", "2026-09-10")).toBe("OFF");
  });

  it("no GAME in range → MD-3 default", async () => {
    const sb = sbWithWeekPlans([{ day_date: "2026-09-10", day_type: "TRAIN" }]);
    expect(await resolveAutoMdContext(sb, "team1", "2026-09-10")).toBe("MD-3");
  });

  it("no team → MD-3 default", async () => {
    expect(await resolveAutoMdContext(sbWithWeekPlans([]), null, "2026-09-10")).toBe("MD-3");
  });
});
