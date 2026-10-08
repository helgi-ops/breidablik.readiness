import { describe, it, expect, beforeEach, vi } from "vitest";

// State the fake admin client answers from.
const h = vi.hoisted(() => ({
  wp: null as { day_type: string } | null,
  teams: [{ id: "t1", strength_send_mode: "standard", strength_auto_send: true }] as unknown[],
  players: [{ id: "p1", full_name: "P One" }] as unknown[],
}));

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update"]) b[m] = () => b;
  b.maybeSingle = async () =>
    table === "week_plans" ? { data: h.wp } : { data: null }; // override-exists check → null
  b.then = (res: (v: { data: unknown }) => void) =>
    res({ data: table === "teams" ? h.teams : table === "players" ? h.players : null });
  return b;
}
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => makeBuilder(t) }) }));
vi.mock("@/lib/micropulse/strengthProgramming/loader", () => ({ loadPlayerStrengthSnapshot: vi.fn(async () => ({})) }));
const buildMock = vi.fn(() => ({ blocks: [{}], mdContext: "MD-3", durationMin: 30 }));
vi.mock("@/lib/micropulse/strengthProgramming", () => ({ buildStrengthSession: () => buildMock() }));
const persistMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/micropulse/strengthProgramming/persistTodayOverride", () => ({ persistTodayStrengthOverride: () => persistMock() }));
vi.mock("@/lib/push/webPush", () => ({ sendWebPush: vi.fn(async () => {}), isSubscriptionGone: () => false }));

import { GET } from "../route";
import type { NextRequest } from "next/server";

const CRON = "cron-secret";
const req = () => new Request("http://localhost/api/strength/auto-send", { headers: { authorization: `Bearer ${CRON}` } }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON;
  h.wp = { day_type: "TRAIN" };
});

describe("strength auto-send — never on a rest/unplanned day", () => {
  it("skips the whole team when there is NO week_plans row (unplanned) — no MD-3 fabrication", async () => {
    h.wp = null;
    const res = await GET(req());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(buildMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("skips the team on an explicit OFF day", async () => {
    h.wp = { day_type: "OFF" };
    const res = await GET(req());
    expect((await res.json()).ok).toBe(true);
    expect(buildMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("sends on a planned training day (persists an origin='auto' override)", async () => {
    h.wp = { day_type: "TRAIN" };
    const res = await GET(req());
    expect((await res.json()).ok).toBe(true);
    expect(buildMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledTimes(1);
  });
});
