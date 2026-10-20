import { test } from "vitest";
import assert from "node:assert/strict";
import { dayIdea } from "../dayIdeas";

test("dayIdea: in-season MD day → planned-load band/duration + in-season focus + cited SSG pitch example", () => {
  const mech = dayIdea({ stimulus: "mechanical", character: "MECHANICAL", mdDay: "MD-4", dayType: "TRAIN", focus: "MD-4 Mechanical", phase: "inseason" });
  assert.equal(mech.load?.band, "high"); // MD-4 = high (planSessionLoad)
  assert.ok((mech.load?.durationMin ?? 0) > 0 && (mech.load?.sessionLoad ?? 0) > 0);
  assert.match(mech.focus.en, /acceleration\/deceleration/i); // in-season pitch focus, not "strength"
  assert.equal(mech.pitch.length, 1);
  assert.match(mech.pitch[0].area.en, /tight pitch/i);
  assert.match(mech.pitch[0].bout.en, /3–5 min/);
  assert.match(mech.pitch[0].cite, /Hill-Haas 2011/);

  const loco = dayIdea({ stimulus: "locomotive", character: "LOCOMOTIVE", mdDay: "MD-3", dayType: "TRAIN", focus: "MD-3 Locomotive", phase: "inseason" });
  assert.equal(loco.load?.band, "high"); // MD-3 = very_high → high
  assert.match(loco.pitch[0].area.en, /large \/ open pitch/i);
  assert.match(loco.pitch[0].form.en, /running/i);

  const md1 = dayIdea({ stimulus: "technical", character: "TECHNICAL", mdDay: "MD-1", dayType: "TRAIN", focus: "MD-1 Technical", phase: "inseason" });
  assert.equal(md1.load?.band, "low"); // MD-1 = light → low
});

test("dayIdea: development phase → gym-led focus + dev fallback load (no MD) + dev pitch examples", () => {
  const strength = dayIdea({ stimulus: "mechanical", character: "MECHANICAL", mdDay: null, dayType: "TRAIN", focus: null, phase: "offseason" });
  assert.match(strength.focus.en, /strength \/ max-force/i); // dev vocabulary, not accel/decel
  assert.equal(strength.load?.band, "high"); // dev fallback for strength
  assert.ok((strength.load?.durationMin ?? 0) > 0);
  assert.match(strength.pitch[0].form.en, /gym max-strength/i); // gym-led, not match-prep SSG

  const cond = dayIdea({ stimulus: "locomotive", character: "LOCOMOTIVE", mdDay: null, dayType: "TRAIN", focus: null, phase: "offseason" });
  assert.match(cond.focus.en, /conditioning/i);
  assert.match(cond.pitch[0].form.en, /running/i);
});

test("dayIdea: OFF and recovery days carry no load/pitch (OFF) or a low band (recovery)", () => {
  const off = dayIdea({ stimulus: null, character: "OFF", mdDay: null, dayType: "OFF", focus: null, phase: "inseason" });
  assert.equal(off.load, null);
  assert.equal(off.pitch.length, 0);
  assert.match(off.focus.en, /rest day/i);

  const rec = dayIdea({ stimulus: null, character: "RECOVERY", mdDay: "MD+1", dayType: "RECOVERY", focus: "MD+1 Recovery", phase: "inseason" });
  assert.ok(rec.load != null && rec.load.band === "low"); // recovery is a low-load day
  assert.equal(rec.pitch.length, 0); // no SSG example for a recovery day
  assert.match(rec.focus.en, /recovery/i);
});
