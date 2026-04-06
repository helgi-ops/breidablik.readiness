import type { TrainingRecommendation } from "@/lib/micropulse/decision";

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
