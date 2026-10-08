import { describe, it, expect, beforeEach, vi } from "vitest";

// Control the week_plans row + engine output per test.
const h = vi.hoisted(() => ({
  wp: null as { day_type: string } | null,
  session: null as unknown,
  structure: [] as unknown[],
}));

const wpBuilder: Record<string, unknown> = {};
for (const m of ["select", "eq"]) wpBuilder[m] = () => wpBuilder;
wpBuilder.maybeSingle = async () => ({ data: h.wp });

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: () => wpBuilder }) }));
vi.mock("@/lib/session-rpe/server", () => ({
  requireAuthedPlayerId: vi.fn(async () => ({ playerId: "p1" })),
  getPlayerTeamId: vi.fn(async () => "t1"),
}));
vi.mock("@/lib/micropulse/strengthProgramming/loader", () => ({ loadPlayerStrengthSnapshot: vi.fn(async () => ({})) }));
const buildMock = vi.fn((..._a: unknown[]) => h.session);
vi.mock("@/lib/micropulse/strengthProgramming", () => ({ buildStrengthSession: (...a: unknown[]) => buildMock(...a) }));
vi.mock("@/lib/micropulse/strengthProgramming/toTodayStructure", () => ({ strengthSessionToTodayStructure: () => h.structure }));

import { GET } from "../route";
import type { NextRequest } from "next/server";

const req = (day = "2026-10-08") =>
  new Request(`http://localhost/api/player/today-strength-default?day=${day}`, {
    headers: { authorization: "Bearer x" },
  }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  h.wp = null;
  h.session = { mdContext: "MD-3", summaryEN: "s", summaryIS: "s", durationMin: 30 };
  h.structure = [{ block: "A" }];
});

describe("today-strength-default — no fabrication without a planned day", () => {
  it("no week_plans row ⇒ no_planned_day, engine never runs (no fabricated MD-3)", async () => {
    h.wp = null;
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: false, reason: "no_planned_day" });
    expect(buildMock).not.toHaveBeenCalled();
  });

  it("explicit OFF row ⇒ off_day, engine never runs", async () => {
    h.wp = { day_type: "OFF" };
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: false, reason: "off_day" });
    expect(buildMock).not.toHaveBeenCalled();
  });

  it("training day (TRAIN) ⇒ builds the default session as today", async () => {
    h.wp = { day_type: "TRAIN" };
    const res = await GET(req());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.structure)).toBe(true);
    expect(body.structure.length).toBe(1);
    expect(buildMock).toHaveBeenCalledTimes(1);
  });

  it("training day but engine returns null (MD+2/MD+3-rest) ⇒ ok:true, structure null", async () => {
    h.wp = { day_type: "TRAIN" };
    h.session = null;
    const res = await GET(req());
    expect(await res.json()).toEqual({ ok: true, structure: null, reason: "no-session" });
  });
});
