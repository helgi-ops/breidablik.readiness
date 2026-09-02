/**
 * Map Wyscout SportsCode instances onto peakPeriodContext `MatchEvent`s, and match a
 * Wyscout player code ("(9) O. Omarsson") to a roster full name by surname.
 *
 * SportsCode carries labels + a start/end clock but NO pitch x/y or OBV, so those map
 * to null (the classifier stays conservative — on-ball actions classify, the rest read
 * "other"/off-ball). Pure. Descriptive tactical context — never the readiness colour.
 */
import type { SportscodeInstance } from "./parseSportscode";
import type { MatchEvent } from "../peakPeriodContext";

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Defensive / out-of-possession labels → ownPossession false for the actor. */
const DEFENSIVE = /intercept|clearance|clear|recover|tackle|duel|foul|block|defend/i;

/** One instance → a normalised MatchEvent. `subjectIsActor` = the peak-window player. */
export function instanceToEvent(inst: SportscodeInstance, subjectIsActor: boolean): MatchEvent {
  const labelText = (inst.labels.join(" ") || inst.code || "").trim();
  const type = (inst.labels[0] ?? inst.code ?? "").toLowerCase();
  const defensive = DEFENSIVE.test(labelText);
  return {
    tSec: inst.startSec,
    type,
    subjectIsActor,
    // Actor on-ball: in possession unless a defensive action. Team-context events:
    // "attacking …" = own possession, "defending …" = not.
    ownPossession: subjectIsActor ? !defensive : /attack/i.test(labelText),
    x: null,
    forward: null,
    outcomeSuccess: null,
    obv: null,
  };
}

/** Surname of a roster name or a Wyscout code, diacritic-stripped, initials removed. */
export function surnameOf(nameOrCode: string): string {
  const cleaned = strip(nameOrCode)
    .replace(/^\(\d+\)\s*/, "")          // drop a leading "(9) " jersey number
    .replace(/\b[a-z]\.\s*/g, " ")       // drop "O." style initials
    .replace(/\s+/g, " ")
    .trim();
  const toks = cleaned.split(" ").filter(Boolean);
  return toks.length ? toks[toks.length - 1] : "";
}

/**
 * Map roster players to their Wyscout player code by surname. Returns code→playerId only
 * for UNAMBIGUOUS matches (a surname shared by two roster players, or matched by two codes,
 * is skipped — a coach hand-check beats a wrong attribution). `codes` = distinct player-event codes.
 */
export function matchCodesToPlayers(
  codes: string[],
  roster: Array<{ id: string; full_name: string | null }>,
): Map<string, string> {
  const out = new Map<string, string>();
  // roster surname → ids (skip surnames shared by >1 roster player)
  const rosterBySurname = new Map<string, string[]>();
  for (const p of roster) {
    if (!p.full_name) continue;
    const s = surnameOf(p.full_name);
    if (!s) continue;
    (rosterBySurname.get(s) ?? rosterBySurname.set(s, []).get(s)!).push(p.id);
  }
  // code surname → codes (skip surnames shared by >1 code)
  const codesBySurname = new Map<string, string[]>();
  for (const c of codes) {
    const s = surnameOf(c);
    if (!s) continue;
    (codesBySurname.get(s) ?? codesBySurname.set(s, []).get(s)!).push(c);
  }
  for (const [surname, ids] of rosterBySurname) {
    const cs = codesBySurname.get(surname);
    if (ids.length === 1 && cs && cs.length === 1) out.set(cs[0], ids[0]);
  }
  return out;
}
