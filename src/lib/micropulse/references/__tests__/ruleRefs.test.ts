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
import { APP_CITATION_SOURCES, OTHER_CITATION_SOURCES, RULE_CODE_DIRS, citationMatches, citationsIn } from "../citationScan";
import { APP_REFS } from "../appRefs";
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

const citationsUnder = (dirs: readonly string[]): string[] => [
  ...new Set(dirs.flatMap((d) => sourceFiles(d)).flatMap((f) => citationsIn(readFileSync(f, "utf8")))),
];
const codeCitations = (): string[] => citationsUnder(RULE_CODE_DIRS);

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

  it("every citation behind VALD, recovery, isometrics, tests, levers and prescriptions resolves or is unresolved", () => {
    const shorts = citationsUnder(OTHER_CITATION_SOURCES);
    expect(shorts.length).toBeGreaterThan(60);
    expect(openOnes(shorts)).toEqual([]);
  });

  it("new entries never copy a key or a paper another registry already holds", () => {
    const others: Record<string, { short: string }> = { ...SPEED_REFS, ...ACCEL_REFS, ...BRAKING_REFS, ...JUMP_REFS, ...GYM_REFS, ...RX_REFS };
    const otherShorts = new Set(Object.values(others).map((r) => r.short));
    for (const [k, r] of Object.entries({ ...RULE_REFS, ...APP_REFS })) {
      expect(r.key).toBe(k);
      expect(others[k]).toBeUndefined();
      expect(otherShorts.has(r.short)).toBe(false);
    }
    for (const k of Object.keys(APP_REFS)) expect(RULE_REFS[k]).toBeUndefined();
    const ruleShorts = new Set(Object.values(RULE_REFS).map((r) => r.short));
    for (const r of Object.values(APP_REFS)) expect(ruleShorts.has(r.short)).toBe(false);
  });

  it("each new entry has authors, title, journal and the year its short form gives", () => {
    for (const r of [...Object.values(RULE_REFS), ...Object.values(APP_REFS)]) {
      expect(r.cite).toMatch(/^[^.]+\. .+[.?] .+ \d{4}/);
      const year = r.short.replace(/[ab]$/, "").slice(-4);
      expect(r.cite.includes(`${year};`) || r.cite.includes(`ahead of print ${year}`)).toBe(true);
    }
  });

  it("an unresolved short is never also resolved", () => {
    for (const s of Object.keys(UNRESOLVED_SHORTS)) expect(findRefByShort(s)).toBeNull();
  });

  it("reads a rule's citation text in order, with other spellings and unresolved ones", () => {
    const got = fullRefsFor("Carling 2018; Nédélec 2012; Dietz & Peterson 2012");
    expect(got.map((g) => g.short)).toEqual(["Carling 2018", "Nédélec 2012", "Dietz & Peterson 2012"]);
    expect(got[0].ref?.cite).toMatch(/Sports Med 2018;48\(12\):2695–2702/);
    expect(got[2].ref).toBeNull();
    expect(got[2].unresolved?.en).toMatch(/Triphasic/);
    expect(findRefByShort("Mujika 2000")?.key).toBe("mujikapadilla2000");
    expect(findRefByShort("Dos’Santos 2019")?.key).toBe("dossantos2019");
    expect(findRefByShort("Martín-García et al. 2018")?.key).toBe("martingarcia2018");
    const sv = fullRefsFor("Sáez de Villarreal 2009 (56 studies)");
    expect(sv).toHaveLength(1);
    expect(sv[0].ref?.key).toBe("saezdevillarreal2009");
  });

  it("finds where each citation sits, so the UI can make just that text tappable", () => {
    const text = "Cormie, McGuigan & Newton 2011; Suchomel 2017 (WL derivatives); Carling (2018) said so. Nov 2026";
    const got = citationMatches(text);
    expect(got.map((m) => text.slice(m.index, m.index + m.length))).toEqual(["Cormie, McGuigan & Newton 2011", "Suchomel 2017", "Carling (2018)"]);
    expect(got.map((m) => m.short)).toEqual(["Cormie, McGuigan & Newton 2011", "Suchomel 2017", "Carling 2018"]);
    expect(findRefByShort(got[0].short)?.key).toBe("cormie2011");
  });

  it("reads a full author list as one citation, by its first author", () => {
    const text = `"Lum, Barbosa, Joseph, Balasekaran (2021). Effects of…" and "Stanley, Peake & Buchheit 2013"`;
    const got = citationMatches(text);
    expect(got.map((m) => text.slice(m.index, m.index + m.length))).toEqual(["Lum, Barbosa, Joseph, Balasekaran (2021)", "Stanley, Peake & Buchheit 2013"]);
    expect(findRefByShort(got[1].short)?.key).toBe("stanley2013");
    expect(citationsIn("Cite: Aug 2026 and Football, Season 2026")).toEqual([]);
  });

  it("citations that named the wrong paper now name the one they meant", () => {
    const all = [...codeCitations(), ...citationsUnder(OTHER_CITATION_SOURCES)];
    for (const s of ["Aedo-Muñoz 2024", "García-Pinillos 2024", "Seraphin 2024", "Cook & Purdam 2009", "Harper & McBurnie 2021", "Brownstein/Thomas 2017"]) {
      expect(all).not.toContain(s);
    }
    expect(all.some((s) => s.startsWith("Hernández-Davó"))).toBe(false);
    expect(findRefByShort("Jarosz, Gawel, Socha, Ewertowska, Wilk, Lum, Krzysztofik 2025")?.key).toBe("jaroszgawel2025");
    expect(findRefByShort("Jarosz 2025")?.key).toBe("jarosz2025");
    expect(findRefByShort("Cañadas-García 2026")?.key).toBe("canadasgarcia2026");
    expect(findRefByShort("Cook & Purdam 2012")?.key).toBe("cookpurdam2012");
    expect(findRefByShort("Harper 2022")?.key).toBe("harper2022");
  });

  it("citations that named no findable paper now name one that says what the text says (lot 1a)", () => {
    const all = [...codeCitations(), ...citationsUnder(OTHER_CITATION_SOURCES), ...citationsIn(RULES_PART)];
    for (const s of ["Rønnestad 2023", "Liu 2023", "Comfort 2018", "Lake 2018", "Lim 2020", "Lim & Childs 2020", "Howatson & Milak 2009", "Oranchuk 2023", "Welch 2019"]) {
      expect(all).not.toContain(s);
    }
    expect(findRefByShort("Cuthbert 2021")).not.toBeNull();
    expect(findRefByShort("Spiering 2021")?.key).toBe("spiering2021");
    expect(findRefByShort("Lim & Wong 2018")?.key).toBe("limwong2018");
    expect(findRefByShort("Hernández-Preciado 2018")?.key).toBe("hernandezpreciado2018");
  });

  it("VALD, load, recovery and isometric citations name verified papers (lot 1b)", () => {
    const all = [...codeCitations(), ...citationsUnder(OTHER_CITATION_SOURCES)];
    for (const s of ["Read 2022", "Toth 2019", "Petrigna 2019", "Esteve 2018", "Buchheit 2013"]) expect(all).not.toContain(s);
    const iso = readFileSync(join(ROOT, "src/lib/micropulse/isometrics/protocols.ts"), "utf8");
    expect(iso).not.toMatch(/Castelli|Cyrino/);
    expect(findRefByShort("Lanza, Balshaw, Folland (2019)".replace(" (2019)", " 2019"))?.key).toBe("lanza2019");
    expect(findRefByShort("Quintana-Cepedal 2025")?.key).toBe("quintanacepedal2025");
    expect(findRefByShort("Hägglund 2013")?.key).toBe("hagglund2013");
    expect(findRefByShort("Thomas 2017")?.cite).toMatch(/Med Sci Sports Exerc/);
  });

  it("Bishop 2020, Gabbett 2017 and Buchheit 2014 sites name one paper per meaning (lot 2)", () => {
    const all = [...codeCitations(), ...citationsUnder(OTHER_CITATION_SOURCES), ...citationsIn(RULES_PART)];
    for (const s of ["Bishop 2020", "Gabbett 2017"]) expect(all).not.toContain(s);
    expect(findRefByShort("Buchheit 2014")?.key).toBe("buchheit2014");
    expect(findRefByShort("Buchheit & Rabbani 2014")?.key).toBe("buchheitrabbani2014");
    expect(findRefByShort("Haugen & Buchheit 2016")?.key).toBe("haugenbuchheit2016");
    expect(findRefByShort("Bishop 2023")?.key).toBe("bishop2023");
    expect(unresolvedReason("Buchheit 2024")?.en).toMatch(/Sport Performance & Science Reports/);
  });

  it("overclaimed risk figures are gone and the papers behind them are registered (lot 3)", () => {
    for (const f of ["src/app/coach/hsr-intelligence/page.tsx", "src/lib/micropulse/coachSignals/index.ts", "src/lib/micropulse/sprintSpeedDrop/index.ts", "src/app/coach/dev-coach-dashboard/DevCoachDashboardClient.tsx"]) {
      const t = readFileSync(join(ROOT, f), "utf8");
      expect(t).not.toMatch(/\+200%|\+130%|BJSM-published|3–4× (HS|hamstring)/);
    }
    expect(readFileSync(join(ROOT, "src/lib/micropulse/trainingRead/catalogue.ts"), "utf8")).not.toMatch(/Nédélec/);
    expect(findRefByShort("Edouard 2018")?.cite).toMatch(/Front Physiol 2018;9:1706/);
    expect(findRefByShort("Saw 2016")?.key).toBe("saw2016");
    expect(findRefByShort("Bishop 2021")?.cite).toMatch(/Individual Approach/);
    expect(findRefByShort("Bowen 2017")?.key).toBe("bowen2017");
    expect(findRefByShort("Buchheit 2023")?.cite).toMatch(/PMID 37867737/);
    expect(findRefByShort("Petrakos 2016")?.cite).toMatch(/PMID 26553497/);
  });

  it("every citation in the checked app areas resolves or is unresolved (app lots A–D)", () => {
    const shorts = citationsUnder(APP_CITATION_SOURCES);
    expect(shorts.length).toBeGreaterThan(200);
    expect(openOnes(shorts)).toEqual([]);
  });

  it("lot A: wrong papers and overclaims are gone", () => {
    const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
    // No "criteria-based RTP battery" by Read 2020 exists; per-region tests cite Taberner 2019 / Read 2021.
    expect(read("src/lib/micropulse/rtp/testRecommender.ts")).not.toMatch(/criteria-based RTP test battery/);
    // Opar 2015 found a >10% imbalance did NOT raise hamstring risk.
    expect(read("src/app/coach/injuries/page.tsx")).not.toMatch(/Opar 2015 threshold|≥10% asymmetry → elevated hamstring/);
    const all = citationsUnder(APP_CITATION_SOURCES);
    for (const gone of ["Gore 2022", "Clark 2008", "Lago-Penas 2010", "Aspetar 2014", "Cohen 2019", "Ross 2005"]) {
      expect(all).not.toContain(gone);
    }
    expect(findRefByShort("Robertson 2017")?.cite).toMatch(/Red, Amber, or Green/);
    expect(findRefByShort("Haller 2023")?.cite).toMatch(/Machine Learning/);
    expect(findRefByShort("Green 2020b")?.cite).toMatch(/hamstring/i);
    expect(findRefByShort("Dubois & Esculier 2020")?.key).toBe("dubois2020");
  });

  it("lot B: the daily verdict and its signals cite what the papers show", () => {
    const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
    const all = citationsUnder(APP_CITATION_SOURCES);
    // Helsen 2018 (no such recovery paper), Buchheit 2019 (not indexed), "Frontiers 2018" (a journal, not an author).
    for (const gone of ["Helsen 2018", "Buchheit 2019", "Frontiers 2018", "Leckey 2024", "Buchheit 2026"]) expect(all).not.toContain(gone);
    // The Sprint Exposure chip measures weekly GPS sprint distance in soccer: Malone 2018's design.
    expect(read("src/lib/micropulse/sprintExposure/index.ts")).toMatch(/Malone 2018/);
    expect(read("src/components/coach/DecisionSummaryCard.tsx")).not.toMatch(/Sport-science consensus \(Carling 2018, Nédélec 2012, Helsen 2018\)/);
    expect(findRefByShort("Schneider 2018")?.cite).toMatch(/Front Physiol 2018;9:639/);
    expect(findRefByShort("Jiménez-Reyes 2018")?.cite).toMatch(/ahead of print 2018/);
    expect(findRefByShort("Harper 2022")?.cite).toMatch(/PMID 35643876/);
    expect(citationsIn("ML, Leckey 2025; SHAP, Rothschild 2024; Fixed 2026-04-29")).toEqual(["Leckey 2025", "Rothschild 2024"]);
  });

  it("lot C: load, GPS and match-demand pages cite what the papers show", () => {
    const all = citationsUnder(APP_CITATION_SOURCES);
    // Shorts that named no paper, the wrong paper, or a journal instead of an author.
    for (const gone of ["Bradley & Ade 2016", "Hills 2018", "Haugen 2014", "Carling 2015", "JOSPT 2020", "Micallef & Millet 2011"]) {
      expect(all).not.toContain(gone);
    }
    expect(findRefByShort("Buchheit 2023b")?.cite).toMatch(/To Rest or Not to Rest/);
    expect(findRefByShort("Martín-García 2018b")?.cite).toMatch(/Most Demanding/);
    expect(findRefByShort("Siri 1961")?.cite).toMatch(/Nutrition 1993/);
    expect(findRefByShort("Rønnestad 2011")?.cite).toMatch(/PMID 21873897/);
    expect(unresolvedReason("Catapult 2026")).toBeTruthy();
  });

  it("lot D: tutorials, PDFs, player app, trainer and pricing cite what the papers show", () => {
    const all = citationsUnder(APP_CITATION_SOURCES);
    // No such paper (Hough 2019, Sheward 2010), wrong year (Kamarauskas 2021), wrong paper (Lago-Peñas 2010, Hills
    // 2018, Carling 2015), a journal (Frontiers 2018) or a feature name read as a citation (Quadrant 2017).
    for (const gone of ["Hough 2019", "Sheward 2010", "Kamarauskas 2021", "Lago-Peñas 2010", "Hills 2018", "Carling 2015", "Frontiers 2018"]) {
      expect(all).not.toContain(gone);
    }
    expect(all.some((s) => /Quadrant 2017/.test(s))).toBe(false);
    expect(findRefByShort("Cheung 2003")?.cite).toMatch(/muscle soreness/);
    expect(findRefByShort("Ripley 2025")?.cite).toMatch(/dynamic strength index/);
    expect(findRefByShort("Dellal 2012")?.cite).toMatch(/PMID 22130401/);
    expect(unresolvedReason("Sideris et al. 2026")).toBeTruthy();
    expect(unresolvedReason("Kubatko et al. 2007")).toBeTruthy();
  });

  it("reads JSX-escaped ampersands as one two-author citation", () => {
    expect(citationsIn("PEACE &amp; LOVE (Dubois &amp; Esculier 2020)")).toEqual(["Dubois & Esculier 2020"]);
  });

  it("the catalogue's references section lists each of its citations in full, or as unresolved", () => {
    expect(CATALOGUE_REFS).not.toBe("");
    for (const s of citationsIn(RULES_PART)) {
      const ref = findRefByShort(s);
      if (ref) expect(CATALOGUE_REFS).toContain(ref.cite);
      else expect(CATALOGUE_REFS).toContain(s);
    }
  });

  it("docs/heimildir-aefingakerfis.md lists every citation in the rule code and the other sources in full, or as unresolved", () => {
    for (const s of [...codeCitations(), ...citationsUnder(OTHER_CITATION_SOURCES), ...citationsUnder(APP_CITATION_SOURCES)]) {
      const ref = findRefByShort(s);
      if (ref) expect(ALL_REFS_DOC).toContain(ref.cite);
      else expect(ALL_REFS_DOC).toContain(`**${unresolvedKey(s)}**`);
    }
  });
});

function unresolvedKey(s: string): string {
  return Object.keys(UNRESOLVED_SHORTS).find((k) => unresolvedReason(s) === UNRESOLVED_SHORTS[k]) ?? s;
}
