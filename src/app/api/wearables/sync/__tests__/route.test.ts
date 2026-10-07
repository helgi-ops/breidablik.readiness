import { describe, it, expect, beforeEach, vi } from "vitest";

// syncAllConnections / syncConnection are mocked — the route test only checks auth
// gating + wiring, not the sync internals (those are covered in sync's own tests).
const h = vi.hoisted(() => ({ allCalls: 0 }));
vi.mock("@/lib/wearables/sync", () => ({
  syncAllConnections: vi.fn(async () => { h.allCalls++; return { total: 2, ok: 2, failed: 0, errors: [] }; }),
  syncConnection: vi.fn(async () => ({ ok: true, sleepCount: 1, dailyCount: 1 })),
}));
// createClient is imported at module load; stub it so import doesn't blow up.
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

import { GET } from "../route";
import * as sync from "@/lib/wearables/sync";

const CRON = "test-cron-secret";

function get(auth?: string): Request {
  return new Request("http://localhost/api/wearables/sync", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.allCalls = 0;
  process.env.CRON_SECRET = CRON;
  delete process.env.REMINDER_CRON_SECRET;
});

describe("GET /api/wearables/sync (Vercel Cron)", () => {
  it("rejects a missing Authorization header with 401 (no sync)", async () => {
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(sync.syncAllConnections).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer with 401", async () => {
    const res = await GET(get("Bearer nope"));
    expect(res.status).toBe(401);
    expect(sync.syncAllConnections).not.toHaveBeenCalled();
  });

  it("runs syncAllConnections with the correct CRON_SECRET and returns the result", async () => {
    const res = await GET(get(`Bearer ${CRON}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    // The route spreads {...result, ok: true}, so the boolean ok shadows the count.
    expect(body).toEqual({ total: 2, ok: true, failed: 0, errors: [] });
    expect(sync.syncAllConnections).toHaveBeenCalledTimes(1);
  });
});
