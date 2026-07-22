import { test } from "vitest";
import assert from "node:assert/strict";
import { normalizeForceDecksTrials } from "../normalizers";

// Build a minimal VALD ForceDecks payload (trials[].results[] shape).
function cmjPayload(
  results: Array<{ result: string; unit?: string; value: number; limb?: string }>,
) {
  return {
    testType: "CMJ",
    recordedUTC: "2026-07-21T10:00:00.000Z",
    trials: [
      {
        results: results.map((r) => ({
          value: r.value,
          limb: r.limb ?? "Trial",
          definition: { result: r.result, unit: r.unit ?? "" },
        })),
      },
    ],
  };
}

test("RSI-modified is DERIVED from jump height + time-to-takeoff when VALD omits it", () => {
  // jump 0.30 m → 30 cm; time-to-takeoff 0.60 s → 600 ms.
  // RSI-mod = jump_height(m) / ttt(s) = 0.30 / 0.60 = 0.50.
  const [trial] = normalizeForceDecksTrials(
    cmjPayload([
      { result: "JUMP_HEIGHT_MO", unit: "Meter", value: 0.3 },
      { result: "TIME_TO_TAKEOFF", unit: "Second", value: 0.6 },
    ]),
  );
  assert.ok(trial.rsiMod != null);
  assert.ok(Math.abs(trial.rsiMod! - 0.5) < 1e-9, `rsiMod ${trial.rsiMod}`);
  assert.equal(trial.rsiModSource, "derived");
  assert.equal(trial.jumpHeightCm, 30);
  assert.equal(trial.timeToTakeoffMs, 600);
});

test("a native VALD RSI-modified is used verbatim and wins over derivation", () => {
  const [trial] = normalizeForceDecksTrials(
    cmjPayload([
      { result: "JUMP_HEIGHT_MO", unit: "Meter", value: 0.3 },
      { result: "TIME_TO_TAKEOFF", unit: "Second", value: 0.6 },
      { result: "RSI_MODIFIED", unit: "", value: 0.55 },
    ]),
  );
  assert.equal(trial.rsiMod, 0.55);
  assert.equal(trial.rsiModSource, "vald");
});

test("no RSI and no time-to-takeoff → null, never zero (the null-vs-zero rule)", () => {
  const [trial] = normalizeForceDecksTrials(
    cmjPayload([{ result: "JUMP_HEIGHT_MO", unit: "Meter", value: 0.3 }]),
  );
  assert.equal(trial.rsiMod, null);
  assert.equal(trial.rsiModSource, null);
});

test("time-to-takeoff of zero cannot derive RSI (no divide-by-zero → null)", () => {
  const [trial] = normalizeForceDecksTrials(
    cmjPayload([
      { result: "JUMP_HEIGHT_MO", unit: "Meter", value: 0.3 },
      { result: "TIME_TO_TAKEOFF", unit: "Second", value: 0 },
    ]),
  );
  assert.equal(trial.rsiMod, null);
  assert.equal(trial.rsiModSource, null);
});

test("VALD's real keys ECCENTRIC_TIME + CONTRACTION_TIME map to the phase columns", () => {
  // VALD sends these (not TRIAL_ECCENTRIC_DURATION / TIME_TO_TAKEOFF), and it
  // MISLABELS the unit as "Millisecond" while the value is actually SECONDS
  // (0.25 = 0.25 s). The mapper must alias the keys AND the conversion must turn
  // that into real milliseconds, so the phase CV gate gets its inputs in ms.
  const [trial] = normalizeForceDecksTrials(
    cmjPayload([
      { result: "JUMP_HEIGHT_MO", unit: "Meter", value: 0.3 },
      { result: "ECCENTRIC_TIME", unit: "Millisecond", value: 0.25 },
      { result: "CONTRACTION_TIME", unit: "Millisecond", value: 0.6 },
    ]),
  );
  assert.equal(trial.eccentricDurationMs, 250);
  assert.equal(trial.timeToTakeoffMs, 600);
});

test("the diagnostic records the result keys VALD actually sent", () => {
  const [trial] = normalizeForceDecksTrials(
    cmjPayload([
      { result: "JUMP_HEIGHT_MO", unit: "Meter", value: 0.3 },
      { result: "TIME_TO_TAKEOFF", unit: "Second", value: 0.6 },
    ]),
  );
  const keys = trial.resultKeysSeen ?? [];
  assert.ok(keys.includes("TRIAL_JUMP_HEIGHT_MO"), keys.join(","));
  assert.ok(keys.includes("TRIAL_TIME_TO_TAKEOFF"), keys.join(","));
  assert.ok(!keys.some((k) => /RSI_MOD/i.test(k)), "no RSI key when VALD didn't send it");
});
