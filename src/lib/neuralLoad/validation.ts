import { classifyNeuralLoad } from "@/lib/neuralLoad/classify";
import { buildTeamNeuralLoadSummary } from "@/lib/neuralLoad/teamSummary";
import type { NeuralLoadClassification, NeuralLoadInput } from "@/lib/neuralLoad/types";

type CaseSpec = {
  id: string;
  title: string;
  input: NeuralLoadInput;
  expect: {
    states: Array<NeuralLoadClassification["neuralLoadState"]>;
    trajectories: Array<NeuralLoadClassification["readinessTrajectory"]>;
    risks: Array<NeuralLoadClassification["nextDayRisk"]>;
  };
};

export type NeuralValidationCaseResult = {
  id: string;
  title: string;
  pass: boolean;
  output: Pick<NeuralLoadClassification, "neuralLoadState" | "readinessTrajectory" | "nextDayRisk" | "neuralLoadScore" | "summary">;
  details: string[];
};

export type NeuralValidationSuiteResult = {
  total: number;
  passed: number;
  failed: number;
  teamSummary: ReturnType<typeof buildTeamNeuralLoadSummary>;
  cases: NeuralValidationCaseResult[];
};

function fixtureCases(): CaseSpec[] {
  return [
    {
      id: "A",
      title: "Stable player",
      input: {
        playerId: "A",
        z: 0.2,
        zPrev: 0.1,
        deltaZ: 0.1,
        sten: 6,
        lowStenDays: 0,
        totalScore: 74,
        energy: 4,
        sleepQuality: 4,
        sleepDuration: 4,
        stress: 2,
        soreness: 2,
        zHistory: [0.0, 0.1, 0.2],
        volatility: 10,
        hsrHighYesterday: false,
        maxVelocityHighYesterday: false,
        scheduleCongestion: false,
        travelFlag: false,
        matchMinutesHigh: false,
        teamVolatilityHigh: false,
        fatigue: { primaryFatigueType: "NONE", severity: "LOW" },
      },
      expect: { states: ["STABLE", "RISING"], trajectories: ["IMPROVING", "FLAT"], risks: ["LOW"] },
    },
    {
      id: "B",
      title: "Neural overload",
      input: {
        playerId: "B",
        z: -1.3,
        zPrev: -0.2,
        deltaZ: -1.1,
        sten: 3,
        lowStenDays: 2,
        totalScore: 32,
        energy: 1,
        sleepQuality: 2,
        sleepDuration: 2,
        stress: 4,
        soreness: 1,
        zHistory: [-0.1, -0.5, -1.3],
        volatility: 45,
        hsrHighYesterday: true,
        maxVelocityHighYesterday: true,
        scheduleCongestion: true,
        travelFlag: true,
        matchMinutesHigh: true,
        teamVolatilityHigh: true,
        fatigue: { primaryFatigueType: "NEURAL", severity: "HIGH" },
      },
      expect: { states: ["HIGH", "CRITICAL"], trajectories: ["DECLINING"], risks: ["HIGH"] },
    },
    {
      id: "C",
      title: "Systemic overload",
      input: {
        playerId: "C",
        z: -0.8,
        zPrev: -0.4,
        deltaZ: -0.4,
        sten: 4,
        lowStenDays: 3,
        totalScore: 38,
        energy: 2,
        sleepQuality: 2,
        sleepDuration: 2,
        stress: 4,
        soreness: 4,
        zHistory: [-0.2, -0.5, -0.8],
        volatility: 35,
        hsrHighYesterday: false,
        maxVelocityHighYesterday: false,
        scheduleCongestion: true,
        travelFlag: false,
        matchMinutesHigh: true,
        teamVolatilityHigh: true,
        fatigue: { primaryFatigueType: "SYSTEMIC", severity: "HIGH" },
      },
      expect: { states: ["RISING", "HIGH", "CRITICAL"], trajectories: ["DECLINING", "FLAT"], risks: ["MODERATE", "HIGH"] },
    },
    {
      id: "D",
      title: "Recovery improving",
      input: {
        playerId: "D",
        z: 0.3,
        zPrev: -0.1,
        deltaZ: 0.4,
        sten: 6,
        lowStenDays: 1,
        totalScore: 62,
        energy: 3,
        sleepQuality: 4,
        sleepDuration: 4,
        stress: 2,
        soreness: 2,
        zHistory: [-0.5, -0.1, 0.3],
        volatility: 20,
        hsrHighYesterday: false,
        maxVelocityHighYesterday: false,
        scheduleCongestion: false,
        travelFlag: false,
        matchMinutesHigh: false,
        teamVolatilityHigh: false,
        fatigue: { primaryFatigueType: "NONE", severity: "LOW" },
      },
      expect: { states: ["STABLE", "RISING"], trajectories: ["IMPROVING"], risks: ["LOW", "MODERATE"] },
    },
    {
      id: "E",
      title: "Sparse data",
      input: {
        playerId: "E",
        z: null,
        zPrev: null,
        deltaZ: null,
        sten: null,
        lowStenDays: 0,
        totalScore: null,
        energy: null,
        sleepQuality: null,
        sleepDuration: null,
        stress: null,
        soreness: null,
        zHistory: null,
        volatility: null,
        hsrHighYesterday: false,
        maxVelocityHighYesterday: false,
        scheduleCongestion: false,
        travelFlag: false,
        matchMinutesHigh: false,
        teamVolatilityHigh: false,
        fatigue: { primaryFatigueType: "NONE", severity: "LOW" },
      },
      expect: { states: ["STABLE"], trajectories: ["FLAT"], risks: ["LOW"] },
    },
  ];
}

export function runNeuralLoadValidationSuite(): NeuralValidationSuiteResult {
  const cases = fixtureCases();
  const results: NeuralValidationCaseResult[] = [];
  const allOutputs: NeuralLoadClassification[] = [];

  for (const c of cases) {
    const inputBefore = JSON.stringify(c.input);
    const out1 = classifyNeuralLoad(c.input);
    const out2 = classifyNeuralLoad(c.input);
    const inputAfter = JSON.stringify(c.input);

    const details: string[] = [];
    details.push(inputBefore === inputAfter ? "No-mutation: PASS" : "No-mutation: FAIL");
    details.push(JSON.stringify(out1) === JSON.stringify(out2) ? "Deterministic: PASS" : "Deterministic: FAIL");

    const statePass = c.expect.states.includes(out1.neuralLoadState);
    const trajPass = c.expect.trajectories.includes(out1.readinessTrajectory);
    const riskPass = c.expect.risks.includes(out1.nextDayRisk);

    details.push(statePass ? "State: PASS" : `State: FAIL (${out1.neuralLoadState})`);
    details.push(trajPass ? "Trajectory: PASS" : `Trajectory: FAIL (${out1.readinessTrajectory})`);
    details.push(riskPass ? "Risk: PASS" : `Risk: FAIL (${out1.nextDayRisk})`);
    details.push(out1.drivers.length > 0 || out1.neuralLoadScore === 0 ? "Drivers: PASS" : "Drivers: FAIL");

    const pass = details.every((d) => d.includes("PASS"));
    allOutputs.push(out1);

    results.push({
      id: c.id,
      title: c.title,
      pass,
      output: {
        neuralLoadState: out1.neuralLoadState,
        readinessTrajectory: out1.readinessTrajectory,
        nextDayRisk: out1.nextDayRisk,
        neuralLoadScore: out1.neuralLoadScore,
        summary: out1.summary,
      },
      details,
    });
  }

  const teamSummary = buildTeamNeuralLoadSummary(allOutputs);
  const passed = results.filter((r) => r.pass).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    teamSummary,
    cases: results,
  };
}
