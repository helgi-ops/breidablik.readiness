import { test } from "vitest";
import assert from "node:assert/strict";
import { parseSportscodeXml } from "../parseSportscode";
import { surnameOf, instanceToEvent, matchCodesToPlayers } from "../toMatchEvents";

const XML = `<file><ALL_INSTANCES>
  <instance><ID>1</ID><start>60</start><end>62</end><code>(9) O. Omarsson</code><label><text>Passes</text></label></instance>
  <instance><ID>2</ID><start>500</start><end>502</end><code>(9) O. Omarsson</code><label><text>Interceptions</text></label></instance>
  <instance><ID>3</ID><start>510</start><end>512</end><code>team</code><label><text>Defending style of play</text></label></instance>
</ALL_INSTANCES></file>`;

test("parseSportscodeXml reads instances with start/end/code/labels", () => {
  const inst = parseSportscodeXml(XML);
  assert.equal(inst.length, 3);
  assert.equal(inst[0].startSec, 60);
  assert.equal(inst[0].code, "(9) O. Omarsson");
  assert.deepEqual(inst[1].labels, ["Interceptions"]);
});

test("surnameOf strips jersey number, initials and diacritics", () => {
  assert.equal(surnameOf("(9) O. Omarsson"), "omarsson");
  assert.equal(surnameOf("Óli Valur Ómarsson"), "omarsson");   // roster full name → same surname
  assert.equal(surnameOf("Dagur Örn Fjeldsted"), "fjeldsted");
});

test("matchCodesToPlayers matches Wyscout code → roster by surname (unambiguous only)", () => {
  const roster = [
    { id: "p-oli", full_name: "Óli Valur Ómarsson" },
    { id: "p-dagur", full_name: "Dagur Örn Fjeldsted" },
  ];
  const m = matchCodesToPlayers(["(9) O. Omarsson", "(3) D. Fjeldsted"], roster);
  assert.equal(m.get("(9) O. Omarsson"), "p-oli");
  assert.equal(m.get("(3) D. Fjeldsted"), "p-dagur");
});

test("a surname shared by two roster players is NOT auto-matched (needs hand-map)", () => {
  const roster = [
    { id: "p-a", full_name: "Jon Ari Sigurdsson" },
    { id: "p-b", full_name: "Petur Sigurdsson" },
  ];
  const m = matchCodesToPlayers(["(5) J. Sigurdsson"], roster);
  assert.equal(m.size, 0); // ambiguous surname → skipped
});

test("instanceToEvent: actor on-ball pass = own possession; interception = out of possession", () => {
  const inst = parseSportscodeXml(XML);
  const pass = instanceToEvent(inst[0], true);
  assert.equal(pass.subjectIsActor, true);
  assert.equal(pass.type, "passes");
  assert.equal(pass.ownPossession, true);
  const interception = instanceToEvent(inst[1], true);
  assert.equal(interception.ownPossession, false); // defensive label
  const teamDefend = instanceToEvent(inst[2], false);
  assert.equal(teamDefend.subjectIsActor, false);
  assert.equal(teamDefend.ownPossession, false);   // "Defending style of play"
});
