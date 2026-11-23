/**
 * Every short citation in the rule catalogue (docs/aefingakerfi-reglur.md) resolves to a full reference or is
 * listed as unresolved with a reason (2026-11-23).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPEED_REFS } from "@/lib/micropulse/speedMethods";
import { ACCEL_REFS } from "@/lib/micropulse/goalPlan/acceleration";
import { BRAKING_REFS } from "@/lib/micropulse/goalPlan/braking";
import { GYM_REFS } from "@/lib/micropulse/goalPlan/gymGoals";
import { JUMP_REFS } from "@/lib/micropulse/goalPlan/jump";
import { RX_REFS } from "@/lib/micropulse/goalPlan/liftRx";
import { RULE_REFS, UNRESOLVED_SHORTS, findRefByShort, fullRefsFor } from "../ruleRefs";

const DOC = readFileSync(join(__dirname, "../../../../../docs/aefingakerfi-reglur.md"), "utf8");
const HEADING = "## Heimildir";
const RULES_PART = DOC.split(HEADING)[0];
const REFS_PART = DOC.includes(HEADING) ? DOC.split(HEADING)[1] : "";

/** "Carling 2018", "van der Horst 2015", "Hoff & Helgerud 2004", "Harøy et al. 2019". */
const SHORT_RE = /(?:(?:van der|van|de|di) )?\p{Lu}[\p{L}'’-]+(?: et al\.)?(?: & \p{Lu}[\p{L}'’-]+)? (?:19|20)\d{2}/gu;
/** Year-like words in the catalogue that are not citations. */
const NOT_CITATIONS = new Set(["Breiðabliks 2026"]);

function catalogueShorts(): string[] {
  return [...new Set([...RULES_PART.matchAll(SHORT_RE)].map((m) => m[0]))].filter((s) => !NOT_CITATIONS.has(s));
}

describe("rule references", () => {
  it("every short citation in the rule catalogue resolves or is listed as unresolved", () => {
    const shorts = catalogueShorts();
    expect(shorts.length).toBeGreaterThan(40);
    const missing = shorts.filter((s) => !findRefByShort(s) && !UNRESOLVED_SHORTS[s]);
    expect(missing).toEqual([]);
  });

  it("new entries never copy a key or a paper another registry already holds", () => {
    const others: Record<string, { short: string }> = { ...SPEED_REFS, ...ACCEL_REFS, ...BRAKING_REFS, ...JUMP_REFS, ...GYM_REFS, ...RX_REFS };
    const otherShorts = new Set(Object.values(others).map((r) => r.short));
    for (const [k, r] of Object.entries(RULE_REFS)) {
      expect(r.key).toBe(k);
      expect(others[k]).toBeUndefined();
      expect(otherShorts.has(r.short)).toBe(false);
    }
  });

  it("each new entry has authors, title, journal and the year its short form gives", () => {
    for (const r of Object.values(RULE_REFS)) {
      const year = r.short.slice(-4);
      expect(r.cite).toMatch(/^[^.]+\. .+[.?] .+ \d{4}/);
      expect(r.cite).toContain(`${year};`);
    }
  });

  it("an unresolved short is never also resolved", () => {
    for (const s of Object.keys(UNRESOLVED_SHORTS)) expect(findRefByShort(s)).toBeNull();
  });

  it("reads a rule's citation text in order, with spellings and unresolved ones", () => {
    const got = fullRefsFor("Carling 2018; Nédélec 2012; Rønnestad 2023");
    expect(got.map((g) => g.short)).toEqual(["Carling 2018", "Nédélec 2012", "Rønnestad 2023"]);
    expect(got[0].ref?.cite).toMatch(/Sports Med 2018;48\(12\):2695–2702/);
    expect(got[2].ref).toBeNull();
    expect(got[2].unresolved?.en).toMatch(/Cuthbert/);
    expect(findRefByShort("Mujika 2000")?.key).toBe("mujikapadilla2000");
    expect(findRefByShort("Dos’Santos 2019")?.key).toBe("dossantos2019");
  });

  it("the catalogue's references section lists every resolved citation in full, and every unresolved one", () => {
    expect(REFS_PART).not.toBe("");
    for (const s of catalogueShorts()) {
      const ref = findRefByShort(s);
      if (ref) expect(REFS_PART).toContain(ref.cite);
      else expect(REFS_PART).toContain(s);
    }
  });
});
