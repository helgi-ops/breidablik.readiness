/**
 * Every short citation in the rule catalogue (docs/aefingakerfi-reglur.md) and in the rule code resolves to a full
 * reference or is listed as unresolved with a reason (2026-11-23).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SPEED_REFS } from "@/lib/micropulse/speedMethods";
import { ACCEL_REFS } from "@/lib/micropulse/goalPlan/acceleration";
import { BRAKING_REFS } from "@/lib/micropulse/goalPlan/braking";
import { GYM_REFS } from "@/lib/micropulse/goalPlan/gymGoals";
import { JUMP_REFS } from "@/lib/micropulse/goalPlan/jump";
import { RX_REFS } from "@/lib/micropulse/goalPlan/liftRx";
import { RULE_CODE_DIRS, citationsIn } from "../citationScan";
import { RULE_REFS, UNRESOLVED_SHORTS, findRefByShort, fullRefsFor, unresolvedReason } from "../ruleRefs";

const ROOT = join(__dirname, "../../../../..");
const CATALOGUE = readFileSync(join(ROOT, "docs/aefingakerfi-reglur.md"), "utf8");
const HEADING = "## Heimildir";
const RULES_PART = CATALOGUE.split(HEADING)[0];
const CATALOGUE_REFS = CATALOGUE.includes(HEADING) ? CATALOGUE.split(HEADING)[1] : "";
const ALL_REFS_DOC = readFileSync(join(ROOT, "docs/heimildir-aefingakerfis.md"), "utf8");

function sourceFiles(p: string): string[] {
  const abs = join(ROOT, p);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => {
    if (name === "__tests__") return [];
    const child = join(p, name);
    const st = statSync(join(ROOT, child));
    if (st.isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(name) ? [join(ROOT, child)] : [];
  });
}

const codeCitations = (): string[] => [
  ...new Set(RULE_CODE_DIRS.flatMap((d) => sourceFiles(d)).flatMap((f) => citationsIn(readFileSync(f, "utf8")))),
];

const openOnes = (shorts: string[]) => shorts.filter((s) => !findRefByShort(s) && !unresolvedReason(s));

describe("rule references", () => {
  it("every short citation in the rule catalogue resolves or is listed as unresolved", () => {
    const shorts = citationsIn(RULES_PART);
    expect(shorts.length).toBeGreaterThan(40);
    expect(openOnes(shorts)).toEqual([]);
  });

  it("every short citation in the rule code resolves or is listed as unresolved", () => {
    const shorts = codeCitations();
    expect(shorts.length).toBeGreaterThan(150);
    expect(openOnes(shorts)).toEqual([]);
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
      expect(r.cite).toMatch(/^[^.]+\. .+[.?] .+ \d{4}/);
      const year = r.short.slice(-4);
      expect(r.cite.includes(`${year};`) || r.cite.includes(`ahead of print ${year}`)).toBe(true);
    }
  });

  it("an unresolved short is never also resolved", () => {
    for (const s of Object.keys(UNRESOLVED_SHORTS)) expect(findRefByShort(s)).toBeNull();
  });

  it("reads a rule's citation text in order, with other spellings and unresolved ones", () => {
    const got = fullRefsFor("Carling 2018; Nédélec 2012; Rønnestad 2023");
    expect(got.map((g) => g.short)).toEqual(["Carling 2018", "Nédélec 2012", "Rønnestad 2023"]);
    expect(got[0].ref?.cite).toMatch(/Sports Med 2018;48\(12\):2695–2702/);
    expect(got[2].ref).toBeNull();
    expect(got[2].unresolved?.en).toMatch(/Cuthbert/);
    expect(findRefByShort("Mujika 2000")?.key).toBe("mujikapadilla2000");
    expect(findRefByShort("Dos’Santos 2019")?.key).toBe("dossantos2019");
    expect(findRefByShort("Martín-García et al. 2018")?.key).toBe("martingarcia2018");
    expect(unresolvedReason("Lim & Childs 2020")?.en).toMatch(/Lim & Wong 2018/);
    const sv = fullRefsFor("Sáez de Villarreal 2009 (56 studies)");
    expect(sv).toHaveLength(1);
    expect(sv[0].ref?.key).toBe("saezdevillarreal2009");
  });

  it("the catalogue's references section lists each of its citations in full, or as unresolved", () => {
    expect(CATALOGUE_REFS).not.toBe("");
    for (const s of citationsIn(RULES_PART)) {
      const ref = findRefByShort(s);
      if (ref) expect(CATALOGUE_REFS).toContain(ref.cite);
      else expect(CATALOGUE_REFS).toContain(s);
    }
  });

  it("docs/heimildir-aefingakerfis.md lists every citation in the rule code in full, or as unresolved", () => {
    for (const s of codeCitations()) {
      const ref = findRefByShort(s);
      if (ref) expect(ALL_REFS_DOC).toContain(ref.cite);
      else expect(ALL_REFS_DOC).toContain(`**${unresolvedKey(s)}**`);
    }
  });
});

function unresolvedKey(s: string): string {
  return Object.keys(UNRESOLVED_SHORTS).find((k) => unresolvedReason(s) === UNRESOLVED_SHORTS[k]) ?? s;
}
