import { test, vi } from "vitest";
import assert from "node:assert/strict";

vi.mock("@/lib/supabaseServer", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/integrations/vald", () => ({}));
vi.mock("@/lib/integrations/vald/config", () => ({ maskSecret: vi.fn() }));
vi.mock("@/lib/notifications/sendPersonalBestNudge", () => ({ runPersonalBestDetection: vi.fn() }));

test("the sync route allows longer than the slowest completed Breiðablik sync", async () => {
  const { maxDuration } = await import("@/app/api/integrations/vald/sync/route");
  // Slowest one-day sync that finished since the device back-fill: 108 s on 2026-08-27.
  assert.ok(maxDuration > 108, `maxDuration ${maxDuration}s would cut the sync off`);
});
