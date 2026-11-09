import { describe, expect, it } from "vitest";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { accessTokensFromCookies, claimsNeedCode, decodeJwtClaims, tokenNeedsCode } from "../twoStep";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const jwt = (payload: Record<string, unknown>) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.sig`;

const ADMIN_NO_CODE = jwt({ sub: "a", aal: "aal1", app_metadata: { mfa_required: true, provider: "email" } });
const ADMIN_WITH_CODE = jwt({ sub: "a", aal: "aal2", app_metadata: { mfa_required: true } });
const COACH = jwt({ sub: "c", aal: "aal1", app_metadata: { provider: "email" } });

describe("two-step rule", () => {
  it("refuses only a flagged account without a code", () => {
    expect(tokenNeedsCode(ADMIN_NO_CODE)).toBe(true);
    expect(tokenNeedsCode(ADMIN_WITH_CODE)).toBe(false);
    expect(tokenNeedsCode(COACH)).toBe(false);
  });

  it("treats a missing aal claim as no code", () => {
    expect(claimsNeedCode({ app_metadata: { mfa_required: true } })).toBe(true);
  });

  it("needs the flag to be exactly true", () => {
    expect(claimsNeedCode({ aal: "aal1", app_metadata: { mfa_required: "true" } })).toBe(false);
    expect(claimsNeedCode({ aal: "aal1", app_metadata: null })).toBe(false);
  });

  it("ignores tokens it cannot read", () => {
    for (const t of [null, undefined, "", "cron-secret", "a.b", "a.%%%.c", `${b64url("{}")}.${b64url("[1]")}.x`]) {
      expect(tokenNeedsCode(t)).toBe(false);
    }
  });

  it("reads non-ASCII payloads", () => {
    expect(decodeJwtClaims(jwt({ name: "Arnór Þór" }))?.name).toBe("Arnór Þór");
  });
});

describe("Supabase auth cookies", () => {
  const session = (token: string) => JSON.stringify({ access_token: token, refresh_token: "r", user: { id: "a" } });
  const key = "sb-ameccgiqgokibirwfyfa-auth-token";

  it("reads a plain cookie", () => {
    expect(accessTokensFromCookies([{ name: key, value: session(ADMIN_NO_CODE) }])).toEqual([ADMIN_NO_CODE]);
  });

  it("reads base64 chunks written by @supabase/ssr", () => {
    const big = session(ADMIN_NO_CODE) + " ".repeat(8000);
    const chunks = createChunks(key, `base64-${stringToBase64URL(big)}`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(accessTokensFromCookies(chunks)).toEqual([ADMIN_NO_CODE]);
  });

  it("reads the older array format", () => {
    expect(accessTokensFromCookies([{ name: key, value: JSON.stringify([COACH, "r"]) }])).toEqual([COACH]);
  });

  it("skips other cookies and broken values", () => {
    expect(accessTokensFromCookies([
      { name: "theme", value: "dark" },
      { name: key, value: "base64-%%%" },
      { name: `${key}-code-verifier`, value: "x" },
    ])).toEqual([]);
  });
});
