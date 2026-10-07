import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake admin client (hoisted so the vi.mock factory can reference it). Records the
// tables touched; connection lookups return null (→ lazy create), insert returns an id.
const h = vi.hoisted(() => {
  const tables: string[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "update", "insert"]) builder[m] = () => builder;
  builder.maybeSingle = async () => ({ data: null });
  builder.single = async () => ({ data: { id: "conn-new" } });
  builder.then = (res: (v: { data: null; error: null }) => void) => res({ data: null, error: null });
  const sb = { from: (t: string) => { tables.push(t); return builder; } };
  return { tables, sb };
});

vi.mock("@/lib/wearables/sync", () => ({
  getWearableAdminClient: () => h.sb,
  resolveProfilePlayerId: vi.fn(async () => "player-1"),
  persistSleepNights: vi.fn(async () => 1),
  persistDailySummaries: vi.fn(async () => 1),
  deactivateOtherActiveWearables: vi.fn(async () => 0),
  syncConnection: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/wearables/terra", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    verifyTerraSignature: () => true,
    mapTerraSleep: () => [{ sleepDate: "2026-10-07", sourceRecordId: "terra:sleep:1", raw: {} }],
    mapTerraDaily: () => [{ measurementDate: "2026-10-07", sourceRecordId: "terra:daily:1", raw: {} }],
  };
});

import { POST } from "../route";
import * as sync from "@/lib/wearables/sync";

function post(body: unknown): Request {
  return new Request("http://localhost/api/wearables/terra/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "terra-signature": "t=1,v1=deadbeef" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.tables.length = 0;
  delete process.env.TERRA_SIGNING_SECRET; // unsigned allowed in non-prod (vitest)
});

describe("Terra webhook — reference_id lazy connection (synthetic test data)", () => {
  it("sleep with reference_id and no prior auth → creates the connection + persists", async () => {
    const res = await POST(post({ type: "sleep", user: { user_id: "tu1", reference_id: "prof-1", provider: "WHOOP" }, data: [{}] }));
    expect(res.status).toBe(200);
    // ensureTerraConnection ran (one-active-source dedupe), then the sink was called.
    expect(sync.deactivateOtherActiveWearables).toHaveBeenCalledWith(h.sb, "prof-1", "terra");
    expect(sync.persistSleepNights).toHaveBeenCalledTimes(1);
    expect(sync.persistDailySummaries).not.toHaveBeenCalled();
  });

  it("daily with reference_id and no prior auth → creates the connection + persists", async () => {
    const res = await POST(post({ type: "daily", user: { user_id: "tu2", reference_id: "prof-2" }, data: [{}] }));
    expect(res.status).toBe(200);
    expect(sync.deactivateOtherActiveWearables).toHaveBeenCalledWith(h.sb, "prof-2", "terra");
    expect(sync.persistDailySummaries).toHaveBeenCalledTimes(1);
  });

  it("second provider active → ensureTerraConnection deactivates it (no double source)", async () => {
    await POST(post({ type: "sleep", user: { user_id: "tu3", reference_id: "prof-3" }, data: [{}] }));
    // deactivateOtherActiveWearables keeps 'terra' and drops any other active provider.
    expect(sync.deactivateOtherActiveWearables).toHaveBeenCalledWith(h.sb, "prof-3", "terra");
  });

  it("sleep with neither a connection nor reference_id → 200, nothing written", async () => {
    const res = await POST(post({ type: "sleep", user: { user_id: "tu4" }, data: [{}] }));
    expect(res.status).toBe(200);
    expect(sync.persistSleepNights).not.toHaveBeenCalled();
    expect(sync.deactivateOtherActiveWearables).not.toHaveBeenCalled();
  });

  it("boundary: the webhook never touches readiness_entries", async () => {
    await POST(post({ type: "sleep", user: { user_id: "tu5", reference_id: "prof-5" }, data: [{}] }));
    expect(h.tables).not.toContain("readiness_entries");
    expect(h.tables).not.toContain("v_coach_readiness_today_v8");
  });
});
