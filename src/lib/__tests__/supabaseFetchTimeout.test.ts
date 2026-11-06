import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { createFetchWithTimeout } from "@/lib/supabaseFetchTimeout";

describe("createFetchWithTimeout against a server that never answers", () => {
  // Accepts the connection and then says nothing, like Supabase did during the
  // 2026-11-06 outage.
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const client = () =>
    createClient(baseUrl, "test-key", {
      auth: { persistSession: false },
      global: { fetch: createFetchWithTimeout(50) },
    });

  it("turns a stuck table query into an ordinary error", async () => {
    const { data, error } = await client().from("players").select("id");
    expect(data).toBeNull();
    expect(error?.message).toMatch(/timeout|aborted/i);
  });

  it("turns a stuck auth check into an error, not a user", async () => {
    const { data, error } = await client().auth.getUser("some-token");
    expect(data.user).toBeNull();
    expect(error).not.toBeNull();
  });

  it("logs which call got stuck, without the query string", async () => {
    await client().from("players").select("id").eq("team_id", "secret-looking-team");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("/rest/v1/players");
    expect(logged).not.toContain("secret-looking-team");
  });
});

describe("createFetchWithTimeout routing", () => {
  const stub = () => vi.fn<typeof fetch>(async () => new Response("ok"));

  it("leaves storage and edge functions alone, since those can run long", async () => {
    const base = stub();
    const timed = createFetchWithTimeout(50, base);
    await timed("https://x.supabase.co/storage/v1/object/bucket/big.mp4", { method: "POST" });
    await timed("https://x.supabase.co/functions/v1/worker");
    for (const [, init] of base.mock.calls) expect(init?.signal).toBeUndefined();
  });

  it("still honours a caller's own abort signal", async () => {
    const base = stub();
    const caller = new AbortController();
    await createFetchWithTimeout(10_000, base)("https://x.supabase.co/rest/v1/players", { signal: caller.signal });
    const signal = base.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    caller.abort();
    expect(signal?.aborted).toBe(true);
  });
});

describe("server Supabase clients", () => {
  it("both factories use the timed fetch", async () => {
    vi.resetModules();
    const create = vi.fn(() => ({}));
    vi.doMock("@supabase/supabase-js", () => ({ createClient: create }));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "key");

    const { supabaseFetchWithTimeout: timed } = await import("@/lib/supabaseFetchTimeout");
    const { getSupabaseServer } = await import("@/lib/supabaseServer");
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    getSupabaseServer();
    getSupabaseAdmin();

    expect(create).toHaveBeenCalledTimes(2);
    for (const call of create.mock.calls as unknown as Array<[string, string, { global: { fetch: unknown } }]>) {
      expect(call[2].global.fetch).toBe(timed);
    }

    vi.doUnmock("@supabase/supabase-js");
    vi.unstubAllEnvs();
  });
});
