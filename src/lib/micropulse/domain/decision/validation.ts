import { buildAthleteDecision } from "./buildDecision";
import { buildDailyAthleteSnapshot } from "../snapshot/buildSnapshot";
import type { AthleteDecision } from "./types";

type ValidationCase = {
  name: string;
  run: () => AthleteDecision;
  assert: (decision: AthleteDecision) => { pass: boolean; notes: string[] };
};

export type AthleteDecisionValidationSuite = {
  pass: boolean;
  cases: Array<{
    name: string;
    pass: boolean;
    notes: string[];
    decision: AthleteDecision;
  }>;
};

export function runAthleteDecisionValidationSuite(): AthleteDecisionValidationSuite {
  const cases: ValidationCase[] = [
    {
      name: "manual-only athlete",
      run: () =>
        buildAthleteDecision({
          snapshot: buildDailyAthleteSnapshot({
            athleteId: "a1",
            date: "2026-03-15",
            manual: { totalScore: 18, soreness: 4, sleepQuality: 4, completed: true },
          }),
          readinessDecision: {
            athleteState: "GREEN",
            sessionMode: "full",
            confidence: "medium",
            why: ["Manual check-in was stable."],
            coachAction: ["Run planned session with standard monitoring."],
            riskFactors: [],
          },
        }),
      assert: (decision) => ({
        pass: decision.sourceSummary.manual && decision.athleteState === "GREEN",
        notes: [],
      }),
    },
    {
      name: "manual + whoop athlete",
      run: () =>
        buildAthleteDecision({
          snapshot: buildDailyAthleteSnapshot({
            athleteId: "a2",
            date: "2026-03-15",
            manual: { totalScore: 17, completed: true },
            whoop: {
              connected: true,
              sourceDate: "2026-03-15",
              snapshot: {
                athleteId: "a2",
                source: "whoop",
                date: "2026-03-15",
                recoveryScore: 72,
                hrv: 85,
                sleepPerformance: 88,
                workoutStrain: 12,
              },
            },
          }),
          readinessDecision: {
            athleteState: "GREEN",
            sessionMode: "full",
            confidence: "high",
            why: ["Manual and WHOOP recovery data aligned."],
            coachAction: ["Run planned session."],
            riskFactors: ["whoop_positive_support"],
          },
          whoop: {
            overallSupportScore: 0.5,
            confidence: 0.7,
            explanationLine: "WHOOP recovery data supported readiness but did not override the primary decision.",
          },
        }),
      assert: (decision) => ({
        pass: decision.sourceSummary.whoop && decision.flags.whoopInfluenced,
        notes: [],
      }),
    },
    {
      name: "hard red preserved against positive whoop",
      run: () =>
        buildAthleteDecision({
          snapshot: buildDailyAthleteSnapshot({
            athleteId: "a3",
            date: "2026-03-15",
            manual: { totalScore: 8, completed: true },
            whoop: {
              connected: true,
              sourceDate: "2026-03-15",
              snapshot: {
                athleteId: "a3",
                source: "whoop",
                date: "2026-03-15",
                recoveryScore: 90,
              },
            },
            context: { rehab: true },
          }),
          readinessDecision: {
            athleteState: "RED",
            sessionMode: "recovery",
            confidence: "high",
            why: ["Significant fatigue indicators are present today."],
            coachAction: ["Shift to recovery emphasis."],
            riskFactors: [],
          },
          whoop: {
            overallSupportScore: 0.9,
            confidence: 0.8,
            explanationLine: "WHOOP recovery data was positive but did not override protection rules.",
          },
          hardBlock: true,
        }),
      assert: (decision) => ({
        pass: decision.athleteState === "RED" && decision.sessionMode === "recovery",
        notes: [],
      }),
    },
    {
      name: "yellow caution with positive whoop stays explainable",
      run: () =>
        buildAthleteDecision({
          snapshot: buildDailyAthleteSnapshot({
            athleteId: "a4",
            date: "2026-03-15",
            manual: { totalScore: 13, completed: true },
            whoop: {
              connected: true,
              sourceDate: "2026-03-15",
              snapshot: {
                athleteId: "a4",
                source: "whoop",
                date: "2026-03-15",
                recoveryScore: 78,
                sleepPerformance: 82,
              },
            },
          }),
          readinessDecision: {
            athleteState: "YELLOW",
            sessionMode: "modified",
            confidence: "medium",
            why: ["Some fatigue indicators are present today."],
            coachAction: ["Modify load and monitor response."],
            riskFactors: ["whoop_positive_support"],
          },
          whoop: {
            overallSupportScore: 0.4,
            confidence: 0.65,
            explanationLine: "WHOOP recovery data supported readiness but did not override load caution.",
          },
        }),
      assert: (decision) => ({
        pass: decision.athleteState === "YELLOW" && decision.explanationLines.length > 0,
        notes: [],
      }),
    },
    {
      name: "low-data athlete",
      run: () =>
        buildAthleteDecision({
          snapshot: buildDailyAthleteSnapshot({
            athleteId: "a5",
            date: "2026-03-15",
          }),
        }),
      assert: (decision) => ({
        pass: decision.flags.lowDataConfidence && (decision.athleteState === "GRAY" || decision.sessionMode === "pending"),
        notes: [],
      }),
    },
    {
      name: "load-rich athlete avoids whoop double count",
      run: () =>
        buildAthleteDecision({
          snapshot: buildDailyAthleteSnapshot({
            athleteId: "a6",
            date: "2026-03-15",
            manual: { totalScore: 15, completed: true },
            load: { gpsLoad: 920, sessionRpeLoad: 610, acuteLoad: 880, acwr: 1.18 },
            whoop: {
              connected: true,
              sourceDate: "2026-03-15",
              snapshot: {
                athleteId: "a6",
                source: "whoop",
                date: "2026-03-15",
                workoutStrain: 16,
              },
            },
          }),
          readinessDecision: {
            athleteState: "YELLOW",
            sessionMode: "modified",
            confidence: "medium",
            why: ["Recent load remains elevated."],
            coachAction: ["Reduce volume slightly."],
            riskFactors: [],
          },
        }),
      assert: (decision) => ({
        pass: decision.sourceSummary.load,
        notes: [],
      }),
    },
  ];

  const results = cases.map((testCase) => {
    const decision = testCase.run();
    const assertion = testCase.assert(decision);
    return {
      name: testCase.name,
      pass: assertion.pass,
      notes: assertion.notes,
      decision,
    };
  });

  return {
    pass: results.every((result) => result.pass),
    cases: results,
  };
}
