import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearFreeLockCache, isFreeBlockedApi, isFreeLockedRequest } from "../freeLockApi";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const jwt = (sub: string) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub, aal: "aal1" }))}.sig`;
const HK = "11111111-1111-1111-1111-111111111111";
const BLIKAR = "22222222-2222-2222-2222-222222222222";
const env = { url: "https://db.test", key: "service" };

/** Fake RPC: HK's coach is locked, everyone else is not. */
function rpc(lockedUsers: string[]) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const { p_user_id } = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(lockedUsers.includes(p_user_id)), { status: 200 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

beforeEach(() => clearFreeLockCache());

describe("isFreeBlockedApi (which routes)", () => {
  it("covers AI, sends, uploads, syncs and the paid Today reads", () => {
    expect(isFreeBlockedApi("/api/coach/player/abc/summary", "POST")).toBe(true);
    expect(isFreeBlockedApi("/api/coach/team/send-strength-sessions", "POST")).toBe(true);
    expect(isFreeBlockedApi("/api/coach/external-load/upload", "POST")).toBe(true);
    expect(isFreeBlockedApi("/api/integrations/catapult/daily-sync", "GET")).toBe(true);
    expect(isFreeBlockedApi("/api/coach/signals", "GET")).toBe(true);
    expect(isFreeBlockedApi("/api/coach/player/abc/robustness-watch", "GET")).toBe(true);
  });
  it("leaves the FREE base alone: check-in, readiness, players, messages", () => {
    for (const p of ["/api/coach/teams", "/api/messages/broadcast", "/api/coach/players", "/api/player/checkin", "/api/coach/signals/cron"]) {
      expect(isFreeBlockedApi(p, "POST")).toBe(false);
      expect(isFreeBlockedApi(p, "GET")).toBe(false);
    }
  });
  it("lets a saved AI result be READ (GET on an AI write route)", () => {
    expect(isFreeBlockedApi("/api/coach/player/abc/summary", "GET")).toBe(false);
  });
});

describe("isFreeLockedRequest (who)", () => {
  const path = { pathname: "/api/coach/team/send-strength-sessions", method: "POST" };

  it("refuses a FREE-locked team's coach", async () => {
    const f = rpc([HK]);
    expect(await isFreeLockedRequest({ ...path, tokens: [jwt(HK)] }, { fetchImpl: f, env })).toBe(true);
  });
  it("lets a paying team through", async () => {
    const f = rpc([HK]);
    expect(await isFreeLockedRequest({ ...path, tokens: [jwt(BLIKAR)] }, { fetchImpl: f, env })).toBe(false);
  });
  it("cannot be dodged with a second token: any locked token refuses", async () => {
    const f = rpc([HK]);
    expect(await isFreeLockedRequest({ ...path, tokens: [jwt(BLIKAR), jwt(HK)] }, { fetchImpl: f, env })).toBe(true);
  });
  it("fails open: no token, a cron secret, a failed or slow lookup", async () => {
    const f = rpc([HK]);
    expect(await isFreeLockedRequest({ ...path, tokens: [null] }, { fetchImpl: f, env })).toBe(false);
    expect(await isFreeLockedRequest({ ...path, tokens: ["plain-cron-secret"] }, { fetchImpl: f, env })).toBe(false);
    expect(f).not.toHaveBeenCalled();
    const broken = vi.fn(async () => new Response("err", { status: 500 })) as unknown as typeof fetch;
    expect(await isFreeLockedRequest({ ...path, tokens: [jwt(HK)] }, { fetchImpl: broken, env })).toBe(false);
    const throws = vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
    expect(await isFreeLockedRequest({ ...path, tokens: [jwt(HK)] }, { fetchImpl: throws, env })).toBe(false);
  });
  it("never looks anything up on an open route", async () => {
    const f = rpc([HK]);
    expect(await isFreeLockedRequest({ pathname: "/api/coach/teams", method: "GET", tokens: [jwt(HK)] }, { fetchImpl: f, env })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("caches the answer for a minute", async () => {
    const f = rpc([HK]);
    await isFreeLockedRequest({ ...path, tokens: [jwt(HK)] }, { fetchImpl: f, env });
    await isFreeLockedRequest({ ...path, tokens: [jwt(HK)] }, { fetchImpl: f, env });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("proxy returns 402 for a FREE-locked coach", () => {
  it("answers PRO_REQUIRED", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", env.url);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", env.key);
    vi.stubGlobal("fetch", rpc([HK]));
    try {
      const { proxy } = await import("@/proxy");
      const res = await proxy(new NextRequest("https://app.micropulse.is/api/coach/team/send-strength-sessions", {
        method: "POST", headers: { authorization: `Bearer ${jwt(HK)}` },
      }));
      expect(res.status).toBe(402);
      expect(await res.json()).toMatchObject({ error: "PRO_REQUIRED" });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("every listed route exists", () => {
  it("has a route file for each FREE-blocked path", async () => {
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { FREE_BLOCKED_READ_PATHS, FREE_BLOCKED_SEND_PATHS, FREE_BLOCKED_SYNC_PATHS } = await import("../freeLockApi");
    const missing = [...FREE_BLOCKED_SEND_PATHS, ...FREE_BLOCKED_SYNC_PATHS, ...FREE_BLOCKED_READ_PATHS]
      .map((p) => p.replace(/^\/api\//, "src/app/api/").replace(/:id/g, "[id]") + "/route.ts")
      .filter((f) => !existsSync(resolve(process.cwd(), f)));
    expect(missing).toEqual([]);
  });
});
