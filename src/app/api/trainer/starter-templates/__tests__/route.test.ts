import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/trainer/starter-templates must not touch a client on a team the
 * trainer doesn't hold: no delete, no archive, no insert — answer 404.
 */

type Op = { table: string; op: "select" | "delete" | "update" | "insert"; filters: Record<string, unknown> };

const h = vi.hoisted(() => ({
  user: "trainer-1" as string | null,
  profile: { role: "COACH", team_id: "team-a" } as { role: string; team_id: string | null } | null,
  players: { "client-a": "team-a", "client-b": "team-b", "client-c": "team-c" } as Record<string, string | null>,
  coachTeams: [] as Array<{ coach_id: string; team_id: string }>,
  ops: [] as Op[],
}));

function builder(table: string) {
  const state: Op = { table, op: "select", filters: {} };
  const result = () => {
    if (state.op !== "select") return { data: state.op === "insert" ? { id: "new-assignment" } : null, error: null, count: null };
    if (table === "profiles") return { data: h.profile, error: null };
    if (table === "players") {
      const id = String(state.filters.id);
      return { data: id in h.players ? { team_id: h.players[id] } : null, error: null };
    }
    if (table === "coach_teams") {
      const row = h.coachTeams.find((r) => r.coach_id === state.filters.coach_id && r.team_id === state.filters.team_id);
      return { data: row ? { team_id: row.team_id } : null, error: null };
    }
    if (table === "pt_explosive_programmes") return { data: null, error: null, count: 1 };
    return { data: [], error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    order: () => b,
    eq: (col: string, val: unknown) => { state.filters[col] = val; return b; },
    delete: () => { state.op = "delete"; h.ops.push(state); return b; },
    update: () => { state.op = "update"; h.ops.push(state); return b; },
    insert: () => { state.op = "insert"; h.ops.push(state); return b; },
    maybeSingle: async () => result(),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
  };
  return b;
}

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServer: () => ({
    auth: { getUser: async () => ({ data: { user: h.user ? { id: h.user } : null } }) },
    from: (table: string) => builder(table),
  }),
}));

import { POST } from "../route";

const call = (body: unknown, token = "tok") =>
  POST(
    new Request("http://localhost/api/trainer/starter-templates", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
  );

const writes = () => h.ops.filter((o) => o.op !== "select");

beforeEach(() => {
  h.user = "trainer-1";
  h.profile = { role: "COACH", team_id: "team-a" };
  h.coachTeams = [];
  h.ops = [];
});

describe("POST /api/trainer/starter-templates — client must be on the trainer's team", () => {
  it("answers 404 and writes nothing for another team's client", async () => {
    const res = await call({ clientId: "client-b", programmeKey: "starter_x_8w", level: "beginner" });
    expect(res.status).toBe(404);
    expect(writes()).toEqual([]);
  });

  it("answers 404 and writes nothing for a client that does not exist", async () => {
    const res = await call({ clientId: "nobody", programmeKey: "starter_x_8w" });
    expect(res.status).toBe(404);
    expect(writes()).toEqual([]);
  });

  it("STAFF is team-restricted too", async () => {
    h.profile = { role: "STAFF", team_id: "team-a" };
    const res = await call({ clientId: "client-b", programmeKey: "starter_x_8w" });
    expect(res.status).toBe(404);
    expect(writes()).toEqual([]);
  });

  it("refuses without a token or for a player login", async () => {
    expect((await call({ clientId: "client-a", programmeKey: "k" }, "")).status).toBe(401);
    h.profile = { role: "PLAYER", team_id: "team-a" };
    expect((await call({ clientId: "client-a", programmeKey: "k" })).status).toBe(403);
    expect(writes()).toEqual([]);
  });

  it("assigns to a client on the trainer's own team (replaces the old active programme)", async () => {
    const res = await call({ clientId: "client-a", programmeKey: "starter_x_8w", level: "beginner" });
    expect(res.status).toBe(200);
    expect(writes().map((o) => `${o.op}:${o.table}`)).toEqual([
      "delete:pt_explosive_programme_assignments",
      "update:individual_training_plans",
      "insert:pt_explosive_programme_assignments",
    ]);
    expect(writes()[0].filters).toMatchObject({ client_id: "client-a" });
  });

  it("assigns to a client on a coach_teams team", async () => {
    h.coachTeams = [{ coach_id: "trainer-1", team_id: "team-c" }];
    const res = await call({ clientId: "client-c", programmeKey: "starter_x_8w" });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(3);
  });

  it("ADMIN may assign on any team", async () => {
    h.profile = { role: "ADMIN", team_id: "team-a" };
    const res = await call({ clientId: "client-b", programmeKey: "starter_x_8w" });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(3);
  });
});
