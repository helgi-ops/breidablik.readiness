import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: "admin" as "admin" | "unauth" | "forbidden",
  team: { id: "t1", plan_tier: "FREE" } as { id: string; plan_tier: string } | null,
  updateRows: null as Array<{ id: string; plan_tier: string }> | null, // null = echo the update
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminUser: vi.fn(async () => {
    if (h.admin === "unauth") throw new Error("Unauthorized");
    if (h.admin === "forbidden") throw new Error("Forbidden");
    return "admin-1";
  }),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      if (table === "team_plan_changes") {
        return { insert: async (row: Record<string, unknown>) => { h.inserts.push(row); return { error: null }; } };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.team, error: null }) }) }),
        update: (patch: Record<string, unknown>) => {
          h.updates.push(patch);
          return {
            eq: () => ({
              select: async () => ({
                data: h.updateRows ?? (h.team ? [{ id: h.team.id, plan_tier: String(patch.plan_tier) }] : []),
                error: null,
              }),
            }),
          };
        },
      };
    },
  }),
}));

import { POST } from "../route";

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/admin/team-plan", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  h.admin = "admin";
  h.team = { id: "t1", plan_tier: "FREE" };
  h.updateRows = null;
  h.inserts = [];
  h.updates = [];
});

describe("POST /api/admin/team-plan", () => {
  it("refuses anyone who is not an admin", async () => {
    h.admin = "unauth";
    expect((await call({ team_id: "t1", plan_tier: "PRO" })).status).toBe(401);
    h.admin = "forbidden";
    expect((await call({ team_id: "t1", plan_tier: "PRO" })).status).toBe(403);
    expect(h.updates).toEqual([]);
  });

  it("rejects an unknown plan and a missing team id", async () => {
    expect((await call({ team_id: "t1", plan_tier: "GOLD" })).status).toBe(400);
    expect((await call({ plan_tier: "PRO" })).status).toBe(400);
    expect(h.updates).toEqual([]);
  });

  it("answers 404 for a team that does not exist", async () => {
    h.team = null;
    expect((await call({ team_id: "nope", plan_tier: "PRO" })).status).toBe(404);
    expect(h.updates).toEqual([]);
  });

  it("never says 'saved' when the database changed nothing", async () => {
    h.updateRows = [];
    const res = await call({ team_id: "t1", plan_tier: "PRO" });
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
    expect(h.inserts).toEqual([]);
  });

  it("saves the plan and logs who changed it, from → to", async () => {
    const res = await call({ team_id: "t1", plan_tier: "pro" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, from: "FREE", to: "PRO", logged: true });
    expect(h.updates).toEqual([{ plan_tier: "PRO" }]);
    expect(h.inserts).toEqual([{ team_id: "t1", from_tier: "FREE", to_tier: "PRO", changed_by: "admin-1" }]);
  });

  it("does not log a 'change' to the same plan", async () => {
    const res = await call({ team_id: "t1", plan_tier: "FREE" });
    expect(res.status).toBe(200);
    expect(h.inserts).toEqual([]);
  });
});
