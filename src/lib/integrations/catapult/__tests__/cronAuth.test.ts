import { describe, expect, it } from "vitest";
import { isCatapultCronAuthorized } from "../cronAuth";

const URL_BASE = "https://app.example/api/integrations/catapult/daily-sync";
const req = (opts: { query?: string; headers?: Record<string, string> } = {}) =>
  new Request(`${URL_BASE}${opts.query ?? ""}`, { headers: opts.headers });
const env = { CATAPULT_CRON_SECRET: "own-secret", CRON_SECRET: "vercel-secret", NODE_ENV: "production" };

describe("isCatapultCronAuthorized", () => {
  it("lets the Vercel cron in with the shared CRON_SECRET as Bearer", () => {
    expect(isCatapultCronAuthorized(req({ headers: { authorization: "Bearer vercel-secret" } }), env)).toBe(true);
  });

  it("lets scripts in with the route's own secret (header, query or Bearer)", () => {
    expect(isCatapultCronAuthorized(req({ headers: { "x-cron-secret": "own-secret" } }), env)).toBe(true);
    expect(isCatapultCronAuthorized(req({ query: "?secret=own-secret" }), env)).toBe(true);
    expect(isCatapultCronAuthorized(req({ headers: { authorization: "Bearer own-secret" } }), env)).toBe(true);
  });

  it("refuses a wrong or missing value", () => {
    expect(isCatapultCronAuthorized(req({ headers: { authorization: "Bearer old-leaked-secret" } }), env)).toBe(false);
    expect(isCatapultCronAuthorized(req({ query: "?secret=" }), env)).toBe(false);
    expect(isCatapultCronAuthorized(req(), env)).toBe(false);
  });

  it("a coach login token is not a cron secret (the route checks it separately)", () => {
    expect(isCatapultCronAuthorized(req({ headers: { authorization: "Bearer eyJhbGciOi.coach.jwt" } }), env)).toBe(false);
  });

  it("with no secret configured: closed in production, open in local dev", () => {
    expect(isCatapultCronAuthorized(req(), { NODE_ENV: "production" })).toBe(false);
    expect(isCatapultCronAuthorized(req(), { NODE_ENV: "development" })).toBe(true);
  });

  it("works with only one of the two secrets set", () => {
    expect(isCatapultCronAuthorized(req({ headers: { authorization: "Bearer vercel-secret" } }), { CRON_SECRET: "vercel-secret", NODE_ENV: "production" })).toBe(true);
    expect(isCatapultCronAuthorized(req({ query: "?secret=own-secret" }), { CATAPULT_CRON_SECRET: "own-secret", NODE_ENV: "production" })).toBe(true);
  });
});
