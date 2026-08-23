import { describe, it, expect } from "vitest";
import { getValdProductBaseUrl } from "../config";
import { inferValdProductFromPayload, mapValdTestSummary } from "../mappers";
import { normalizeNordBordResult, normalizeForceFrameResult } from "../normalizers";
import { extractDeviceTestMetrics } from "../battery";

// Sample payloads taken verbatim from VALD's own External-API guides
// (support.vald.com, "A guide to using the External NordBord/ForceFrame API",
// confirmed 23 Aug 2026 — /tests/v2 flat response shape).

const NORDBORD_TEST = {
  profileId: "1a91089d-b4d0-417d-ac64-0fb7ca85c225",
  testId: "7519c96f-b1cc-42a3-bdee-adbaf59ae713",
  modifiedDateUtc: "2024-03-11T05:50:28.981Z",
  testDateUtc: "2024-03-11T05:50:28.935Z",
  testTypeId: "596a6004-553f-4afa-aef0-1474903b462e",
  testTypeName: "Nordic",
  notes: "Max Strength Testing",
  device: "NordBord-1033",
  leftAvgForce: 219.25,
  leftImpulse: 200.56,
  leftMaxForce: 219.25,
  leftTorque: 64.13,
  leftCalibration: 0,
  leftRepetitions: 1,
  rightAvgForce: 228.25,
  rightImpulse: 217.365,
  rightMaxForce: 250.0,
  rightTorque: 66.76,
  rightCalibration: 0,
  rightRepetitions: 1,
};

const FORCEFRAME_ANKLE_TEST = {
  profileId: "aaa11111-b4d0-417d-ac64-0fb7ca85c225",
  testId: "bbb22222-b1cc-42a3-bdee-adbaf59ae713",
  testDateUtc: "2023-01-25T00:00:00.000Z",
  testTypeId: "ccc33333-2ddc-40b9-935a-bc7097870d4c",
  testPositionId: "ddd44444-da6a-4e17-b515-e2458d81c1f0",
  notes: "Ankle Testing",
  innerLeftAvgForce: 297,
  innerLeftImpulse: 2796,
  innerLeftMaxForce: 326,
  innerLeftRepetitions: 3,
  innerRightAvgForce: 293,
  innerRightImpulse: 2758,
  innerRightMaxForce: 320,
  innerRightRepetitions: 3,
  outerLeftAvgForce: 20,
  outerLeftImpulse: 40,
  outerLeftMaxForce: 22,
  outerLeftRepetitions: 3,
  outerRightAvgForce: 24,
  outerRightImpulse: 44,
  outerRightMaxForce: 26,
  outerRightRepetitions: 3,
  device: "ForceFrame - 1337",
  modifiedDateUtc: "2023-10-02T03:32:13.5367851Z",
  testTypeName: "Ankle IN/EV",
  testPositionName: "Ankle Inversion/Eversion - Supine",
};

describe("VALD External NordBord/ForceFrame — region base URLs", () => {
  it("uses the documented `external`-prefixed hosts, not the HUB-internal guesses", () => {
    expect(getValdProductBaseUrl("euw", "nordbord")).toBe("https://prd-euw-api-externalnordbord.valdperformance.com");
    expect(getValdProductBaseUrl("euw", "forceframe")).toBe("https://prd-euw-api-externalforceframe.valdperformance.com");
    // ForceDecks keeps its legacy host.
    expect(getValdProductBaseUrl("euw", "forcedecks")).toBe("https://prd-euw-api-extforcedecks.valdperformance.com");
    expect(getValdProductBaseUrl("use", "nordbord")).toBe("https://prd-use-api-externalnordbord.valdperformance.com");
  });
});

describe("product inference on flat /tests/v2 payloads", () => {
  it("classifies a NordBord test by testTypeName / structure", () => {
    expect(inferValdProductFromPayload(NORDBORD_TEST)).toBe("nordbord");
  });
  it("classifies a ForceFrame test by inner/outer paddles even with an anatomical name", () => {
    expect(inferValdProductFromPayload(FORCEFRAME_ANKLE_TEST)).toBe("forceframe");
  });
});

describe("mapValdTestSummary — regression: testDateUtc must not be dropped", () => {
  it("maps a NordBord test (testDateUtc is the timestamp source)", () => {
    const s = mapValdTestSummary(NORDBORD_TEST);
    expect(s).not.toBeNull();
    expect(s!.testId).toBe(NORDBORD_TEST.testId);
    expect(s!.athleteId).toBe(NORDBORD_TEST.profileId);
    expect(s!.product).toBe("nordbord");
    expect(s!.testType).toBe("Nordic");
    expect(s!.testTimestamp).toBe("2024-03-11T05:50:28.935Z");
    expect(s!.sourceUpdatedAt).toBe("2024-03-11T05:50:28.981Z");
  });
  it("maps a ForceFrame test", () => {
    const s = mapValdTestSummary(FORCEFRAME_ANKLE_TEST);
    expect(s).not.toBeNull();
    expect(s!.product).toBe("forceframe");
    expect(s!.testTimestamp).toBe("2023-01-25T00:00:00.000Z");
  });
});

describe("normalizeNordBordResult — flat fields", () => {
  it("reads leftMaxForce / rightMaxForce + avg, computes asymmetry", () => {
    const n = normalizeNordBordResult(NORDBORD_TEST);
    expect(n.product).toBe("nordbord");
    expect(n.testType).toBe("Nordic");
    expect(n.leftPeakForceN).toBe(219.25);
    expect(n.rightPeakForceN).toBe(250.0);
    expect(n.leftAvgForceN).toBe(219.25);
    expect(n.rightAvgForceN).toBe(228.25);
    // (250-219.25)/250 = 12.3%, weaker side = left
    expect(n.asymmetryPercent).toBeCloseTo(12.3, 1);
    expect(n.asymmetrySide).toBe("left");
    expect(n.isValid).toBe(true);
  });
});

describe("normalizeForceFrameResult — inner/outer paddle sets", () => {
  it("reports the DOMINANT paddle set (inner here) and the test position", () => {
    const f = normalizeForceFrameResult(FORCEFRAME_ANKLE_TEST);
    expect(f.product).toBe("forceframe");
    expect(f.testType).toBe("Ankle IN/EV");
    expect(f.bodyRegion).toBe("Ankle");
    expect(f.movementPattern).toBe("Ankle Inversion/Eversion - Supine");
    // Inner (326/320) dominates outer (22/26) → those are the reported limbs.
    expect(f.leftPeakForceN).toBe(326);
    expect(f.rightPeakForceN).toBe(320);
    expect(f.asymmetrySide).toBe("right");
    expect(f.isValid).toBe(true);
  });

  it("switches to the outer set when it is the loaded movement", () => {
    const outerDominant = {
      ...FORCEFRAME_ANKLE_TEST,
      innerLeftMaxForce: 10,
      innerRightMaxForce: 12,
      outerLeftMaxForce: 300,
      outerRightMaxForce: 280,
    };
    const f = normalizeForceFrameResult(outerDominant);
    expect(f.leftPeakForceN).toBe(300);
    expect(f.rightPeakForceN).toBe(280);
  });
});

// Sample from VALD's guide: GET /tests/{id}/metrics — a FLAT object of camelCase
// keys (per-kg force, windowed RFD/impulse), shared shape for NordBord/ForceFrame.
const METRICS = {
  athleteId: "1a91089d-b4d0-417d-ac64-0fb7ca85c225",
  testId: "7519c96f-b1cc-42a3-bdee-adbaf59ae713",
  leftMaxForcePerKg: 2.5692,
  rightMaxForcePerKg: 2.4879,
  leftMaxRFDNewtonsPerSecond: 288.235,
  rightMaxRFDNewtonsPerSecond: 264.705,
  leftMaxRFD100msNewtonsPerSecond: 87.5,
  leftMinTimeToMaxForceSeconds: 2.285,
  leftMaxImpulse250msNewtonSeconds: 3.4225,
};

describe("extractDeviceTestMetrics — flat /tests/{id}/metrics", () => {
  it("splits limb prefix, snake-uppers the code, and infers units", () => {
    const rows = extractDeviceTestMetrics(METRICS);
    // athleteId / testId are not limb-prefixed → skipped
    expect(rows.every((r) => r.limb === "Left" || r.limb === "Right")).toBe(true);
    const byKey = (code: string, limb: string) => rows.find((r) => r.code === code && r.limb === limb);

    const perKg = byKey("MAX_FORCE", "Left");
    expect(perKg?.value).toBeCloseTo(2.5692, 3);
    expect(perKg?.unit).toBe("per kg");

    const rfd = byKey("MAX_RFD", "Right");
    expect(rfd?.value).toBeCloseTo(264.705, 2);
    expect(rfd?.unit).toBe("N/s");

    expect(byKey("MAX_RFD_100_MS", "Left")?.unit).toBe("N/s");
    expect(byKey("MIN_TIME_TO_MAX_FORCE", "Left")?.unit).toBe("s");
    expect(byKey("MAX_IMPULSE_250_MS", "Left")?.unit).toBe("N.s");

    // Every metric row carries trial 0 (per-test summary, not per-trial).
    expect(rows.every((r) => r.trialNumber === 0)).toBe(true);
  });

  it("handles inner/outer ForceFrame limb prefixes", () => {
    const rows = extractDeviceTestMetrics({ innerLeftMaxForcePerKg: 3.1, outerRightMaxRFDNewtonsPerSecond: 200 });
    expect(rows.find((r) => r.limb === "InnerLeft")?.code).toBe("MAX_FORCE");
    expect(rows.find((r) => r.limb === "OuterRight")?.code).toBe("MAX_RFD");
  });
});
