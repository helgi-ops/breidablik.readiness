import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The lv_profile add-on flag unlocks saving LV tests for a client, so turning
 * it on must be limited to clients on a team the trainer holds.
 */

const h = vi.hoisted(() => ({
  profile: { role: "COACH", team_id: "team-a" } as { role: string; team_id: string | null },
  players: { "client-a": "team-a", "client-b": "team-b" } as Record<string, string>,
  upserts: [] as Array<Record<string, unknown>>,
}));

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, val: unknown) => { filters[col] = val; return b; },
    upsert: (row: Record<string, unknown>) => { h.upserts.push(row); return b; },
    maybeSingle: async () => {
      if (table === "profiles") return { data: h.profile, error: null };
      if (table === "players") {
        const id = String(filters.id);
        return { data: id in h.players ? { team_id: h.players[id] } : null, error: null };
      }
      if (table === "coach_teams") return { data: null, error: null };
      return { data: { id: "addon-1" }, error: null };
    },
  };
  return b;
}

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServer: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "trainer-1" } } }) },
    from: (table: string) => builder(table),
  }),
}));

import { POST } from "../route";

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/trainer/lv-profile/addon", {
    method: "POST",
    headers: { authorization: "Bearer tok" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  h.profile = { role: "COACH", team_id: "team-a" };
  h.upserts = [];
});

describe("POST /api/trainer/lv-profile/addon", () => {
  it("answers 404 and writes nothing for another team's client", async () => {
    expect((await call({ clientId: "client-b", enabled: true })).status).toBe(404);
    expect(h.upserts).toEqual([]);
  });

  it("turns the add-on on for the trainer's own client", async () => {
    expect((await call({ clientId: "client-a", enabled: true })).status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]).toMatchObject({ trainer_id: "trainer-1", client_id: "client-a", addon_key: "lv_profile" });
  });
});
