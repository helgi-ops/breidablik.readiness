/**
 * Lota 2 (find + trust): every public page in the sitemap exists, the app stays
 * out of search engines, internal documents are no longer served, and the legal
 * texts name the operator's contact and promise no trial that doesn't exist.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_PATHS } from "../publicPaths";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PRACTICE_TERMS } from "@/lib/legal/practiceTerms";
import { PRACTICE_PRIVACY } from "@/lib/legal/practicePrivacy";
import { OPERATOR } from "@/lib/legal/operator";

const APP = path.join(process.cwd(), "src", "app");

describe("public pages", () => {
  it("every sitemap path has a page", () => {
    for (const p of PUBLIC_PATHS) {
      expect(existsSync(path.join(APP, ...p.split("/").filter(Boolean), "page.tsx")), p).toBe(true);
    }
  });

  it("sitemap lists the trainer page and blog articles", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/personal-trainers"))).toBe(true);
    expect(urls.some((u) => u.includes("/blog/"))).toBe(true);
  });

  it("robots keeps the app and API out of search engines", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow as string[];
    for (const p of ["/api/", "/client", "/coach", "/player", "/trainer", "/invite/", "/admin"]) {
      expect(disallow).toContain(p);
    }
  });

  it("internal documents and the old club manifest are no longer served", () => {
    expect(existsSync(path.join(process.cwd(), "public", "docs"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "public", "manifest.webmanifest"))).toBe(false);
    for (const f of ["load-alerts-mockup.html", "nav-suggestions.html", "player-ui-suggestions.html", "ui-suggestions.html"]) {
      expect(existsSync(path.join(process.cwd(), "public", f)), f).toBe(false);
    }
  });

  it("help no longer promises a 14-day trial", () => {
    const help = readFileSync(path.join(APP, "help", "page.tsx"), "utf8");
    expect(help).not.toMatch(/14 days|14 daga/);
    expect(help).not.toContain("/docs/");
  });
});

describe("legal texts", () => {
  it("terms and privacy exist in both languages with the same sections", () => {
    for (const t of [PRACTICE_TERMS, PRACTICE_PRIVACY]) {
      expect(t.EN.sections.length).toBe(t.IS.sections.length);
      expect(t.EN.sections.length).toBeGreaterThan(3);
    }
  });

  it("name the operator's contact for data requests", () => {
    const all = JSON.stringify([PRACTICE_TERMS, PRACTICE_PRIVACY]);
    expect(all).toContain(OPERATOR.supportEmail);
    expect(all).toContain(OPERATOR.name);
  });
});
