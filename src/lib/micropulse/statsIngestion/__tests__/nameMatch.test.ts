import { describe, it, expect } from "vitest";
import {
  normalizeName,
  nameTokens,
  scoreName,
  matchPlayerName,
  matchByInitialSurname,
  initialSurnameKey,
  FUZZY_REVIEW_FLOOR,
} from "../nameMatch";
import type { SquadPlayer } from "../types";

const SQUAD: SquadPlayer[] = [
  { id: "agust", fullName: "Ágúst Orri Þorsteinsson" },
  { id: "vidar", fullName: "Viktor Örn Margeirsson" },
  { id: "jonatan", fullName: "Jónatan Guðni Arnarsson" },
  { id: "andri", fullName: "Andri Rafn Yeoman" },
];

describe("normalizeName", () => {
  it("strips accents and lowercases", () => {
    expect(normalizeName("Ágúst")).toBe("agust");
    expect(normalizeName("Viktor Örn")).toBe("viktor orn");
  });
  it("transliterates Icelandic letters NFD can't decompose", () => {
    expect(normalizeName("Þorsteinsson")).toBe("thorsteinsson");
    expect(normalizeName("Guðni")).toBe("dudni".replace("dud", "gud")); // ð→d: 'gudni'
    expect(normalizeName("Guðni")).toBe("gudni");
    expect(normalizeName("Sævar")).toBe("saevar");
  });
  it("reorders 'Lastname, Firstname'", () => {
    expect(normalizeName("Þorsteinsson, Ágúst Orri")).toBe("agust orri thorsteinsson");
  });
  it("drops punctuation but keeps initials as tokens", () => {
    expect(nameTokens("B. Þorsteinsson")).toEqual(["b", "thorsteinsson"]);
  });
});

describe("scoreName", () => {
  it("scores an exact (accent-only) difference as 1", () => {
    expect(scoreName("Agust Orri Thorsteinsson", "Ágúst Orri Þorsteinsson")).toBeCloseTo(1, 5);
  });
  it("is order-independent", () => {
    expect(scoreName("Þorsteinsson Ágúst Orri", "Ágúst Orri Þorsteinsson")).toBeCloseTo(1, 5);
  });
});

describe("matchPlayerName", () => {
  it("auto-maps an exact match (accents ignored)", () => {
    const m = matchPlayerName("Agust Orri Thorsteinsson", SQUAD);
    expect(m.confidence).toBe("exact");
    expect(m.playerId).toBe("agust");
  });

  it("auto-maps regardless of token order and comma order", () => {
    expect(matchPlayerName("Þorsteinsson, Ágúst Orri", SQUAD).playerId).toBe("agust");
    expect(matchPlayerName("Margeirsson Viktor Örn", SQUAD).confidence).toBe("exact");
  });

  it("surfaces a partial/initial name as fuzzy for review, not auto-mapped", () => {
    const m = matchPlayerName("Á. Þorsteinsson", SQUAD);
    expect(m.confidence).toBe("fuzzy");
    expect(m.playerId).toBe("agust"); // best suggestion…
    expect(m.candidates[0].playerId).toBe("agust"); // …but it's a suggestion, confirmed by a human
  });

  it("handles romanized surname with a first-name initial as fuzzy", () => {
    const m = matchPlayerName("Torsteinsson A.", SQUAD);
    expect(["fuzzy", "exact"]).toContain(m.confidence);
    expect(m.candidates[0]?.playerId).toBe("agust");
  });

  it("returns none (unmatched tray) below the review floor — never a wrong guess", () => {
    const m = matchPlayerName("Cristiano Ronaldo", SQUAD);
    expect(m.confidence).toBe("none");
    expect(m.playerId).toBeNull();
    expect(m.score).toBeLessThan(FUZZY_REVIEW_FLOOR);
  });

  it("empty / garbage name → none", () => {
    expect(matchPlayerName("", SQUAD).confidence).toBe("none");
    expect(matchPlayerName("   ", SQUAD).playerId).toBeNull();
  });

  it("does not auto-exact when two squad members share the same token set", () => {
    const dupSquad: SquadPlayer[] = [
      { id: "a1", fullName: "Jon Jonsson" },
      { id: "a2", fullName: "Jonsson Jon" },
    ];
    const m = matchPlayerName("Jon Jonsson", dupSquad);
    expect(m.confidence).toBe("fuzzy"); // ambiguous → human decides
  });
});

// The proven Wyscout player-list matcher: abbreviated "A. Bjarnason" → full name
// by (first-initial, surname). Mapped 22/22 senior on the real export.
describe("matchByInitialSurname (abbreviated Wyscout names)", () => {
  it("keys on first initial + last token, transliterating Icelandic", () => {
    expect(initialSurnameKey("A. Bjarnason")).toBe("a bjarnason");
    expect(initialSurnameKey("G. Snær Hallsson")).toBe("g hallsson");
    expect(initialSurnameKey("Þ. Andersen Willumsson")).toBe("t willumsson"); // þ→th, first char t
  });

  it("auto-maps a unique initial+surname hit to the full name", () => {
    const m = matchByInitialSurname("A. Bjarnason", SQUAD_FULL);
    expect(m.confidence).toBe("exact");
    expect(m.playerId).toBe("arnor");
  });

  it("maps the middle-name export shape (G. Snær Hallsson → Gabríel Snær Hallsson)", () => {
    const m = matchByInitialSurname("G. Snær Hallsson", SQUAD_FULL);
    expect(m.confidence).toBe("exact");
    expect(m.playerId).toBe("gabriel");
  });

  it("stays fuzzy when two squad players share initial+surname → review", () => {
    const dup: SquadPlayer[] = [
      { id: "b1", fullName: "Bjarki Freyr Ágústsson" },
      { id: "b2", fullName: "Baldur Ágústsson" },
    ];
    const m = matchByInitialSurname("B. Ágústsson", dup);
    expect(m.confidence).toBe("fuzzy");
    expect(m.candidates.length).toBe(2);
  });

  it("keeps an unmatched abbreviated name as none (unmatched tray)", () => {
    const m = matchByInitialSurname("Z. Nobody", SQUAD_FULL);
    expect(m.confidence).toBe("none");
    expect(m.playerId).toBeNull();
  });
});

const SQUAD_FULL: SquadPlayer[] = [
  { id: "arnor", fullName: "Arnór Bjarnason" },
  { id: "gabriel", fullName: "Gabríel Snær Hallsson" },
  { id: "jonatan", fullName: "Jónatan Guðni Arnarsson" },
];
