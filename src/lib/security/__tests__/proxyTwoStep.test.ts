import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const jwt = (payload: Record<string, unknown>) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.sig`;
const ADMIN_NO_CODE = jwt({ sub: "a", aal: "aal1", app_metadata: { mfa_required: true } });
const ADMIN_WITH_CODE = jwt({ sub: "a", aal: "aal2", app_metadata: { mfa_required: true } });
const COACH = jwt({ sub: "c", aal: "aal1", app_metadata: {} });

const call = (headers: Record<string, string>, path = "/api/coach/teams") =>
  proxy(new NextRequest(`https://app.micropulse.is${path}`, { headers }));

describe("proxy two-step check", () => {
  it("refuses an admin session without a code", async () => {
    const res = await call({ authorization: `Bearer ${ADMIN_NO_CODE}` });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "mfa_required" });
  });

  it("refuses it in an auth cookie too", async () => {
    const value = JSON.stringify({ access_token: ADMIN_NO_CODE });
    const res = await call({ cookie: `sb-ameccgiqgokibirwfyfa-auth-token=${encodeURIComponent(value)}` });
    expect(res.status).toBe(401);
  });

  it("lets an admin with a code and an ordinary coach through", async () => {
    for (const t of [ADMIN_WITH_CODE, COACH]) {
      const res = await call({ authorization: `Bearer ${t}` });
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("lets requests without a token through to the route's own check", async () => {
    const res = await call({});
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
