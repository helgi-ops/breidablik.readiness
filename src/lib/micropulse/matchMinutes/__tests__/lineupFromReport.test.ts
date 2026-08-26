import { describe, it, expect } from "vitest";
import { sideToMinutes, type SideLineup } from "../lineupFromReport";

// Real Breidablik v Fram (2026-08-24) shape: 5 starters carry a time, but only 3 subs came on —
// so two of those times are yellow cards (David 25', Þorleifur 33'), not substitutions.
const side: SideLineup = {
  team: "Breidablik",
  starters: [
    { number: 1, name: "Anton Einarsson", position: "Goalkeeper", minute: null },
    { number: 18, name: "David Ingvarsson", position: "Left Wing", minute: 25 },   // yellow card → full
    { number: 99, name: "Þorleifur Úlfarsson", position: "Centre Forward", minute: 33 }, // yellow card → full
    { number: 29, name: "Gabríel Snaer Hallsson", position: "Left Defensive Midfielder", minute: 46 }, // subbed
    { number: 19, name: "Kristinn Jónsson", position: "Left Back", minute: 69 },    // subbed
    { number: 22, name: "Jónatan Arnarsson", position: "Right Wing", minute: 69 },  // subbed
  ],
  subs: [
    { number: 8, name: "Viktor Karl Einarsson", position: null, minute: 46 },
    { number: 13, name: "Anton Logi Lúdvíksson", position: null, minute: 69 },
    { number: 16, name: "Dagur Örn Fjeldsted", position: null, minute: 69 },
  ],
  unused: [{ number: 30, name: "Kristinn Steindórsson", position: null, minute: null }],
};

describe("sideToMinutes — card vs substitution pairing", () => {
  const rows = sideToMinutes(side);
  const by = (n: string) => rows.find((r) => r.name.startsWith(n))!;

  it("a starter with no time plays the full match", () => {
    expect(by("Anton Einarsson")).toMatchObject({ started: true, isDnp: false, minutes: 90 });
  });
  it("a starter whose time does NOT match a sub-on (yellow card) plays full", () => {
    expect(by("David").minutes).toBe(90);          // 25' card, no sub at 25'
    expect(by("Þorleifur").minutes).toBe(90);       // 33' card
  });
  it("a starter whose time matches a sub-on is subbed off at that minute", () => {
    expect(by("Gabríel").minutes).toBe(46);
    expect(by("Kristinn Jónsson").minutes).toBe(69);
    expect(by("Jónatan").minutes).toBe(69);
  });
  it("subs get (full − on-minute) and started=false", () => {
    expect(by("Viktor Karl")).toMatchObject({ started: false, isDnp: false, minutes: 44 });
    expect(by("Anton Logi").minutes).toBe(21);
    expect(by("Dagur Örn").minutes).toBe(21);
  });
  it("unused subs are DNP", () => {
    expect(by("Kristinn Steindórsson")).toMatchObject({ started: false, isDnp: true, minutes: 0 });
  });
  it("does not consume the same sub-on minute twice", () => {
    // two starters off at 69 pair with the two subs on at 69 — both counted, none left over
    expect(rows.filter((r) => r.started && r.minutes === 69)).toHaveLength(2);
  });
});
