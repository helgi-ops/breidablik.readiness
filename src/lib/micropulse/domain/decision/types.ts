import type { TrainingRecommendation } from "@/lib/micropulse/decision";
import type { Counterfactual } from "./counterfactuals";

export type AthleteState = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type SessionMode = "full" | "modified" | "recovery" | "pending";
export type LoadAction = "normal" | "reduce" | "cap" | "top_up" | "monitor";
export type NeuralStatus = "clear" | "caution" | "suppressed" | "unknown";

export interface AthleteDecision {
  athleteId: string;
  date: string;

  athleteState: AthleteState;
  sessionMode: SessionMode;
  loadAction: LoadAction;
  neuralStatus: NeuralStatus;

  readinessScore?: number | null;
  decisionConfidence: number;

  flags: {
    hardBlock: boolean;
    recoveryBias: boolean;
    whoopInfluenced: boolean;
    loadConcern: boolean;
    neuralConcern: boolean;
    injuryConcern: boolean;
    lowDataConfidence: boolean;
  };

  reasons: string[];
  explanationLines: string[];
  recommendations: string[];

  sourceSummary: {
    manual: boolean;
    whoop: boolean;
    load: boolean;
    neuromuscular: boolean;
    context: boolean;
  };

  // ── Sequence / streak context (decision_history derived) ─────────
  // Set by buildAthleteDecision when recentDecisions are passed in.
  // Coaches see "3rd yellow day in a row" instead of treating each
  // day as isolated — chronic warnings become visible.
  streakContext?: {
    consecutiveYellow: number;   // YELLOW days in a row up to and including today
    consecutiveRed: number;      // RED days in a row up to and including today
    daysOfYellowOrRed: number;   // any non-green over the last 7d
    daysSinceGreen: number | null; // null = always green / no history
    escalationApplied: "none" | "yellow_streak_to_red" | "red_streak_sustained";
  };

  // ── Counterfactual "what-if" alternatives ────────────────────────
  // Up to 3 single-lever flips that would have changed today's verdict
  // for the better. Empty for GREEN/GRAY states (no counterfactuals
  // are useful) or when no single-lever flip improves the verdict.
  // Coaches see "If indoor composite had been TYPICAL → YELLOW not RED"
  // — the actionable counterpart to the reasons[] explanation.
  counterfactuals?: Counterfactual[];
  engineContributions?: {
    readiness?: {
      score?: number | null;
      state?: AthleteState | null;
      confidence?: number | null;
    };
    whoop?: {
      overallSupportScore?: number | null;
      confidence?: number | null;
    };
    neural?: {
      status?: NeuralStatus | null;
      confidence?: number | null;
    };
    injury?: {
      severity?: "none" | "low" | "moderate" | "high" | null;
    };
    load?: {
      concernLevel?: "none" | "low" | "moderate" | "high" | null;
    };
  };
  trainingRecommendation?: TrainingRecommendation;
}
