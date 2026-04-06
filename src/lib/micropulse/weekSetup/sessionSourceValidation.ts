import { resolveSessionMdContextFromSources, type WeekSetupDayRow } from "./sessionSource";

export type WeekSetupSessionSourceValidationCase = {
  id: string;
  pass: boolean;
  details: string[];
};

export type WeekSetupSessionSourceValidationResult = {
  total: number;
  passed: number;
  failed: number;
  cases: WeekSetupSessionSourceValidationCase[];
};

export function runWeekSetupSessionSourceValidation(): WeekSetupSessionSourceValidationResult {
  const cases: WeekSetupSessionSourceValidationCase[] = [];

  const forceWeekDay: WeekSetupDayRow = { day_type_final: "TRAIN", dose_final: "FORCE" };
  const forceResult = resolveSessionMdContextFromSources({
    weekSetupDay: forceWeekDay,
    rowMdContext: "MD2",
    teamMdContext: "MD2",
  });
  cases.push({
    id: "WEEK_SETUP_FORCE_OVERRIDES_GENERIC_MD2",
    pass: forceResult.mdContext === "MD3" && forceResult.source === "WEEK_SETUP",
    details: [`mdContext=${forceResult.mdContext}`, `source=${forceResult.source}`],
  });

  const recoveryWeekDay: WeekSetupDayRow = { day_type_final: "RECOVERY", dose_final: "RECOVERY" };
  const recoveryResult = resolveSessionMdContextFromSources({
    weekSetupDay: recoveryWeekDay,
    rowMdContext: "MD2",
  });
  cases.push({
    id: "WEEK_SETUP_RECOVERY_DRIVES_RECOVERY_CONTEXT",
    pass: recoveryResult.mdContext === "OFF" && recoveryResult.source === "WEEK_SETUP",
    details: [`mdContext=${recoveryResult.mdContext}`, `source=${recoveryResult.source}`],
  });

  const offWeekDay: WeekSetupDayRow = { day_type_final: "OFF", dose_final: "OFF" };
  const offResult = resolveSessionMdContextFromSources({
    weekSetupDay: offWeekDay,
    rowMdContext: "MD3",
  });
  cases.push({
    id: "WEEK_SETUP_OFF_DAY_OVERRIDES_TRAINING_MD",
    pass: offResult.mdContext === "OFF" && offResult.source === "WEEK_SETUP",
    details: [`mdContext=${offResult.mdContext}`, `source=${offResult.source}`],
  });

  const fallbackResult = resolveSessionMdContextFromSources({
    weekSetupDay: null,
    rowMdContext: null,
    teamMdContext: null,
    plannedFocusMdContext: null,
    previewMdContext: null,
  });
  cases.push({
    id: "FALLBACK_ONLY_WHEN_NO_WEEK_SETUP_OR_OTHER_CONTEXT",
    pass: fallbackResult.mdContext === "UNKNOWN" && fallbackResult.source === "FALLBACK_UNKNOWN",
    details: [`mdContext=${fallbackResult.mdContext}`, `source=${fallbackResult.source}`],
  });

  const passed = cases.filter((c) => c.pass).length;
  return {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
}
