import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { whoopProvider } from "../whoop";
import type { WearableConnectionState } from "../types";

beforeEach(() => {
  process.env.WHOOP_CLIENT_ID = "cid";
  process.env.WHOOP_CLIENT_SECRET = "csecret";
});
afterEach(() => vi.restoreAllMocks());

const state: WearableConnectionState = {
  providerUserId: "42944843",
  accessToken: "old-access",
  refreshToken: "old-refresh",
  expiresAt: new Date(Date.now() - 1000).toISOString(),
  scopes: ["read:sleep", "offline"],
  deviceLabel: "Whoop",
};

describe("whoop authorizeUrl", () => {
  it("requests the offline scope (required for a refresh_token)", () => {
    const url = whoopProvider.authorizeUrl("st8", "https://app.micropulse.is/api/wearables/callback");
    const scope = new URL(url).searchParams.get("scope") ?? "";
    expect(scope.split(/\s+/)).toContain("offline");
  });
});

describe("whoop refreshAccessToken", () => {
  const stubToken = (body: Record<string, unknown>) => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body, text: async () => "" }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    return fetchMock;
  };

  it("POSTs grant_type=refresh_token with client creds + offline scope, and rotates the refresh token", async () => {
    const fetchMock = stubToken({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "read:sleep offline" });
    const next = await whoopProvider.refreshAccessToken!(state);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.prod.whoop.com/oauth/oauth2/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("csecret");
    expect(body.get("scope")).toBe("offline");
    expect(next.accessToken).toBe("new-access");
    expect(next.refreshToken).toBe("new-refresh"); // rotated
    expect(next.expiresAt).not.toBeNull();
  });

  it("keeps the old refresh token when the response omits one", async () => {
    stubToken({ access_token: "new-access", expires_in: 3600 });
    const next = await whoopProvider.refreshAccessToken!(state);
    expect(next.accessToken).toBe("new-access");
    expect(next.refreshToken).toBe("old-refresh"); // fell back to the stored one
  });

  it("throws (no token leak) when there is no stored refresh token", async () => {
    await expect(whoopProvider.refreshAccessToken!({ ...state, refreshToken: null })).rejects.toThrow(/no refresh_token/i);
  });
});

describe("whoop uses v2 endpoints (v1 was sunset → 404)", () => {
  const capture = () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (u: string) => { urls.push(u); return { ok: true, json: async () => ({ records: [], next_token: undefined }), text: async () => "" }; });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    return urls;
  };

  it("fetchSleep hits /v2/activity/sleep", async () => {
    const urls = capture();
    await whoopProvider.fetchSleep(state, "2026-10-01", "2026-10-07");
    expect(urls[0]).toContain("/developer/v2/activity/sleep");
    expect(urls[0]).not.toContain("/v1/");
  });

  it("fetchDailySummary hits /v2/recovery", async () => {
    const urls = capture();
    await whoopProvider.fetchDailySummary(state, "2026-10-01", "2026-10-07");
    expect(urls[0]).toContain("/developer/v2/recovery");
    expect(urls[0]).not.toContain("/v1/");
  });
});
