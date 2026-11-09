import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_READ_PATHS, AI_WRITE_PATHS, INVITE_PATHS, PUBLIC_FORM_PATHS, RULES, UPLOAD_PATHS, ruleFor, secondsUntilAllowed,
} from "../rateLimit";

const env = { url: "https://db.test", key: "k" };
const reply = (allowed: boolean, retry_after = 120) =>
  (async () => new Response(JSON.stringify([{ allowed, hits: 1, retry_after }]), { status: 200 })) as typeof fetch;

describe("ruleFor", () => {
  it("limits AI writes but leaves the saved-result read free", () => {
    expect(ruleFor("/api/coach/player/abc-123/summary", "POST")?.name).toBe("ai");
    expect(ruleFor("/api/coach/player/abc-123/summary", "GET")).toBeNull();
  });
  it("limits routes that call AI on GET", () => {
    expect(ruleFor("/api/coach/total-player-analysis", "GET")?.name).toBe("ai");
  });
  it("matches invite links at any depth and the bare path", () => {
    expect(ruleFor("/api/coach-invites/tok/accept", "POST")?.name).toBe("invite");
    expect(ruleFor("/api/team-invites/tok", "GET")?.name).toBe("invite");
  });
  it("does not catch a longer path that only shares a prefix", () => {
    expect(ruleFor("/api/coach/player/abc/summary/extra", "POST")).toBeNull();
    expect(ruleFor("/api/coach/player-analysis-other", "POST")).toBeNull();
  });
  it("ignores ordinary routes and OPTIONS", () => {
    expect(ruleFor("/api/coach/load-plan", "GET")).toBeNull();
    expect(ruleFor("/api/public/demo-request", "OPTIONS")).toBeNull();
  });
  it("gives the public form the tightest limit and no token counter", () => {
    expect(RULES.public_form.perIp).toBeLessThan(RULES.invite.perIp);
    expect(RULES.public_form.perToken).toBeNull();
  });
});

describe("secondsUntilAllowed", () => {
  const who = { token: "t", ip: "1.2.3.4" };
  it("returns null under the limit", async () => {
    expect(await secondsUntilAllowed(RULES.ai, who, { env, fetchImpl: reply(true) })).toBeNull();
  });
  it("returns the wait over the limit", async () => {
    expect(await secondsUntilAllowed(RULES.ai, who, { env, fetchImpl: reply(false, 77) })).toBe(77);
  });
  it("fails open when the database errors, answers badly or is unreachable", async () => {
    const down = (async () => { throw new Error("down"); }) as typeof fetch;
    const bad = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    expect(await secondsUntilAllowed(RULES.ai, who, { env, fetchImpl: down })).toBeNull();
    expect(await secondsUntilAllowed(RULES.ai, who, { env, fetchImpl: bad })).toBeNull();
  });
  it("sends hashes, never the raw IP or token", async () => {
    const bodies: string[] = [];
    const spy = (async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    await secondsUntilAllowed(RULES.ai, { token: "secret-token", ip: "1.2.3.4" }, { env, fetchImpl: spy });
    expect(bodies).toHaveLength(2);
    expect(bodies.join()).not.toMatch(/secret-token|1\.2\.3\.4/);
  });
});

describe("proxy matcher", () => {
  const proxy = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");
  it("lists every limited path", () => {
    for (const path of [...AI_WRITE_PATHS, ...AI_READ_PATHS, ...UPLOAD_PATHS, ...PUBLIC_FORM_PATHS, ...INVITE_PATHS]) {
      expect(proxy).toContain(`"${path}"`);
    }
  });
});
