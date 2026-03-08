export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type CalibrationConfig = {
  fatigue: {
    severityThresholds: {
      moderateMin: number;
      highMin: number;
    };
    mixedStateGapMax: number;
  };
  decision: {
    teamActionThresholds: {
      recoveryBelow: number;
      reducedBelow: number;
    };
    fatigueDominantPenalties: {
      SYSTEMIC: number;
      NEURAL: number;
      TISSUE: number;
      MIXED: number;
    };
  };
  loadExposure: {
    hsrHighYesterday: number;
    accDecHighYesterday: number;
    totalDistanceHighYesterday: number;
    maxVelocityHighYesterdayPct: number;
  };
  neuralBias: {
    enabled: boolean;
    player: {
      risingModerate: {
        decisionPenalty: number;
        extraReduceVolumePct: number;
      };
      high: {
        decisionPenalty: number;
        extraReduceVolumePct: number;
        extraReduceContactsPct: number;
        forceExtendRest: boolean;
      };
      critical: {
        decisionPenalty: number;
        extraReduceVolumePct: number;
        extraReduceContactsPct: number;
        forceExtendRest: boolean;
        preferSimplifySession: boolean;
        preferRecoveryBias: boolean;
      };
      actionNudgeThresholds: {
        reduceDecisionPenaltyMin: number;
        noSprintContactsPctMin: number;
      };
    };
    team: {
      risingPenalty: number;
      highPenalty: number;
      criticalPenalty: number;
      criticalMinHighRiskCount: number;
    };
  };
  adaptation: {
    maxExtraVolumePct: number;
    maxExtraContactsPct: number;
  };
};

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  fatigue: {
    severityThresholds: {
      moderateMin: 3,
      highMin: 6,
    },
    mixedStateGapMax: 1,
  },
  decision: {
    teamActionThresholds: {
      recoveryBelow: 45,
      reducedBelow: 70,
    },
    fatigueDominantPenalties: {
      SYSTEMIC: 10,
      NEURAL: 6,
      TISSUE: 4,
      MIXED: 8,
    },
  },
  loadExposure: {
    hsrHighYesterday: 800,
    accDecHighYesterday: 120,
    totalDistanceHighYesterday: 9000,
    maxVelocityHighYesterdayPct: 90,
  },
  neuralBias: {
    enabled: true,
    player: {
      risingModerate: {
        decisionPenalty: 4,
        extraReduceVolumePct: 8,
      },
      high: {
        decisionPenalty: 8,
        extraReduceVolumePct: 12,
        extraReduceContactsPct: 15,
        forceExtendRest: true,
      },
      critical: {
        decisionPenalty: 12,
        extraReduceVolumePct: 18,
        extraReduceContactsPct: 25,
        forceExtendRest: true,
        preferSimplifySession: true,
        preferRecoveryBias: true,
      },
      actionNudgeThresholds: {
        reduceDecisionPenaltyMin: 4,
        noSprintContactsPctMin: 15,
      },
    },
    team: {
      risingPenalty: 4,
      highPenalty: 8,
      criticalPenalty: 11,
      criticalMinHighRiskCount: 3,
    },
  },
  adaptation: {
    maxExtraVolumePct: 30,
    maxExtraContactsPct: 40,
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  if (!isObject(base) || !isObject(patch)) return (patch as T) ?? base;

  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch)) {
    const b = (base as Record<string, unknown>)[key];
    const p = (patch as Record<string, unknown>)[key];
    if (p === undefined) continue;
    if (isObject(b) && isObject(p)) out[key] = deepMerge(b, p);
    else out[key] = p;
  }
  return out as T;
}

export function resolveCalibrationConfig(config?: DeepPartial<CalibrationConfig>): CalibrationConfig {
  return deepMerge(DEFAULT_CALIBRATION_CONFIG, config);
}

export function withNeuralBiasDisabled(config?: DeepPartial<CalibrationConfig>): CalibrationConfig {
  const merged = resolveCalibrationConfig(config);
  return {
    ...merged,
    neuralBias: {
      ...merged.neuralBias,
      enabled: false,
    },
  };
}

