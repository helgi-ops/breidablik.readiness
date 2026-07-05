import { test } from "vitest";
import assert from "node:assert/strict";
import { normalizeName, resolveCatapultMatch, type PlayerRow } from "../mapAthletes";
import type { CatapultAthlete, CatapultAthleteMapRecord } from "../types";

const BREID = "94b52a06-0b83-48da-8664-639ec3486a0c";
const KEF = "keflavik-team-id";

function athlete(firstName: string, lastName: string, extra: Partial<CatapultAthlete> = {}): CatapultAthlete {
  return { id: "cat-1", firstName, lastName, email: null, ...extra };
}
function player(id: string, full_name: string, team_id: string, email: string | null = null): PlayerRow {
  return { id, full_name, team_id, email };
}

// ── Bug 2: accent folding, no spurious spaces ──────────────────────────────
test("normalizeName folds Icelandic diacritics to base letters without inserting spaces", () => {
  // The core incident: accented vs plain must collapse to the same key.
  assert.equal(normalizeName("Dagur Örn Fjeldsted"), normalizeName("Dagur Orn Fjeldsted"));
  assert.equal(normalizeName("Dagur Örn Fjeldsted"), "dagur orn fjeldsted");
  // "Örn" must be ONE token, not "o rn".
  assert.equal(normalizeName("Örn").split(" ").length, 1);
  // Every accented vowel + þ/ð/æ.
  assert.equal(normalizeName("Áéíóúýü"), "aeiouyu");
  assert.equal(normalizeName("Guðni"), "gudni");
  assert.equal(normalizeName("Þór"), "thor");
  assert.equal(normalizeName("Sæþór"), "saethor");
  assert.equal(normalizeName("Örvar Ómarsson"), "orvar omarsson");
});

// ── AC1 + Bug 2: correct same-name match after accent fold ─────────────────
test("athlete matches the accent-folded exact name on its own team", () => {
  const a = athlete("Dagur Örn", "Fjeldsted"); // OpenField often stores plain ASCII, but either way must match
  const plain = athlete("Dagur Orn", "Fjeldsted");
  const roster: PlayerRow[] = [player("breid-dagur", "Dagur Örn Fjeldsted", BREID)];
  for (const cand of [a, plain]) {
    const m = resolveCatapultMatch(cand, roster, undefined, BREID);
    assert.ok(m, "should match");
    assert.equal(m!.micropulsePlayerId, "breid-dagur");
    assert.equal(m!.matchMethod, "name");
  }
});

// ── AC1 + Bug 1: no cross-team match. The roster is team-scoped upstream, so a
// Keflavík "Dagur" is simply not in the candidate list. ────────────────────
test("does NOT match a different-team same-first-name player (roster is team-scoped)", () => {
  const a = athlete("Dagur Orn", "Fjeldsted");
  const keflavikRoster: PlayerRow[] = [player("kef-dagur", "Dagur", KEF)];
  const m = resolveCatapultMatch(a, keflavikRoster, undefined, KEF);
  assert.equal(m, null); // bare "Dagur" no longer a candidate; last-initial "o" has no match
});

// ── Bug 3: bare first name is no longer a match candidate ──────────────────
test("bare first-name player is not matched to a full-name athlete", () => {
  const a = athlete("Dagur Orn", "Fjeldsted");
  const roster: PlayerRow[] = [player("p-dagur", "Dagur", BREID)];
  assert.equal(resolveCatapultMatch(a, roster, undefined, BREID), null);
});

// ── Bug 1: no source team → never match (global match is impossible) ───────
test("no sourceTeamId returns null even with an exact-name player present", () => {
  const a = athlete("Dagur Orn", "Fjeldsted");
  const roster: PlayerRow[] = [player("p", "Dagur Orn Fjeldsted", BREID)];
  assert.equal(resolveCatapultMatch(a, roster, undefined, null), null);
});

// ── Bug 1 hardening: a stale persisted mapping pointing off-team is ignored ─
test("a persisted mapping to a player NOT on this team is ignored (self-heal)", () => {
  const a = athlete("Dagur Orn", "Fjeldsted");
  const roster: PlayerRow[] = [player("breid-dagur", "Dagur Örn Fjeldsted", BREID)];
  const staleCrossTeam: CatapultAthleteMapRecord = {
    catapultAthleteId: "cat-1",
    micropulsePlayerId: "fylkir-tumi", // not in the Breiðablik roster
    matchMethod: "name",
    confidence: 0.64,
    sourceTeamId: BREID,
  };
  const m = resolveCatapultMatch(a, roster, staleCrossTeam, BREID);
  assert.ok(m);
  assert.notEqual(m!.micropulsePlayerId, "fylkir-tumi"); // did not honor the stale row
  assert.equal(m!.micropulsePlayerId, "breid-dagur");    // re-matched correctly
});

test("a persisted mapping to a player ON this team is honored", () => {
  const a = athlete("Whatever", "Name");
  const roster: PlayerRow[] = [player("breid-x", "Some Player", BREID)];
  const good: CatapultAthleteMapRecord = {
    catapultAthleteId: "cat-1", micropulsePlayerId: "breid-x", matchMethod: "manual", confidence: 1, sourceTeamId: BREID,
  };
  const m = resolveCatapultMatch(a, roster, good, BREID);
  assert.equal(m!.micropulsePlayerId, "breid-x");
  assert.equal(m!.matchMethod, "manual");
});

// ── Email stays a high-confidence path (still team-scoped) ─────────────────
test("email match wins over name and is team-scoped", () => {
  const a = athlete("Someone", "Else", { email: "d@club.is" });
  const roster: PlayerRow[] = [player("p-email", "Different Name", BREID, "d@club.is")];
  const m = resolveCatapultMatch(a, roster, undefined, BREID);
  assert.equal(m!.micropulsePlayerId, "p-email");
  assert.equal(m!.matchMethod, "email");
});
