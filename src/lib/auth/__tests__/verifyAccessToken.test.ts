import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createClient, type JWK, type SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { verifiedUserIdFromToken, resetVerifiedTokenKeyCache } from "@/lib/auth/verifyAccessToken";

const SUPABASE_URL = "https://example.supabase.co";
const KID = "test-kid";

function b64url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let publicJwk: JWK;

async function sign(payload: Record<string, unknown>, key: CryptoKey = signingKey): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
}

const now = () => Math.floor(Date.now() / 1000);
const userClaims = (over: Record<string, unknown> = {}) => ({
  sub: "user-1",
  role: "authenticated",
  aud: "authenticated",
  iss: `${SUPABASE_URL}/auth/v1`,
  iat: now(),
  exp: now() + 3600,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
let sb: SupabaseClient;
let getUserSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  signingKey = pair.privateKey;
  const exported = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JWK;
  publicJwk = { ...exported, kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] } as JWK;
  const other = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  otherKey = other.privateKey;
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  resetVerifiedTokenKeyCache();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  sb = createClient(SUPABASE_URL, "service-key", { auth: { persistSession: false } });
  getUserSpy = vi.spyOn(sb.auth, "getUser");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verifiedUserIdFromToken", () => {
  it("returns the user id for a valid token without calling Supabase Auth", async () => {
    expect(await verifiedUserIdFromToken(sb, await sign(userClaims()))).toBe("user-1");
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  it("fetches the public keys once and reuses them across requests", async () => {
    await verifiedUserIdFromToken(sb, await sign(userClaims()));
    await verifiedUserIdFromToken(sb, await sign(userClaims({ sub: "user-2" })));
    const jwksCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("/.well-known/jwks.json"));
    expect(jwksCalls).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/auth/v1/user"))).toBe(false);
  });

  it("rejects an expired token", async () => {
    expect(await verifiedUserIdFromToken(sb, await sign(userClaims({ exp: now() - 10 })))).toBeNull();
  });

  it("rejects a token signed with a different key", async () => {
    expect(await verifiedUserIdFromToken(sb, await sign(userClaims(), otherKey))).toBeNull();
  });

  it("rejects a token whose payload was changed after signing", async () => {
    const token = await sign(userClaims());
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64url(JSON.stringify(userClaims({ sub: "someone-else" })))}.${s}`;
    expect(await verifiedUserIdFromToken(sb, forged)).toBeNull();
  });

  it("rejects a correctly signed token that is not a signed-in user", async () => {
    expect(await verifiedUserIdFromToken(sb, await sign(userClaims({ role: "anon" })))).toBeNull();
    expect(await verifiedUserIdFromToken(sb, await sign(userClaims({ sub: undefined })))).toBeNull();
  });

  it("rejects garbage and empty tokens", async () => {
    expect(await verifiedUserIdFromToken(sb, "not-a-jwt")).toBeNull();
    expect(await verifiedUserIdFromToken(sb, "")).toBeNull();
  });
});
