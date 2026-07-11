export type WeekSetupSessionMdContext =
  | "MD5"
  | "MD4"
  | "MD3"
  | "MD2"
  | "MD1"
  | "MD_PLUS_1"
  | "OFF"
  | "UNKNOWN";

export type WeekSetupDayRow = {
  day_date?: string | null;
  md_day?: string | null;
  day_type_final?: string | null;
  dose_final?: string | null;
};

function normalizeWeekSetupFocusToken(v: string | null | undefined): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/\//g, "_");
}

export function mapWeekSetupDayToMdContext(params: {
  doseFinal?: string | null;
  dayTypeFinal?: string | null;
}): WeekSetupSessionMdContext | null {
  const dose = normalizeWeekSetupFocusToken(params.doseFinal);
  const dayType = normalizeWeekSetupFocusToken(params.dayTypeFinal);
  const token = dose || dayType;
  if (!token) return null;
  if (token.includes("OFF") || token.includes("RECOVERY")) return "OFF";
  // NOTE: GAME is the match day itself (MD). This compact type has no match-day
  // token, so it falls to MD1 — a known limitation, not part of the periodization
  // alignment below. Game days normally resolve via the fixture path, not here.
  if (token.includes("GAME")) return "MD1";
  // Canonical Week-setup intent → MD mapping. MUST match loadPlan/forTeam.ts
  // MD_OF (the Week-setup dropdown's own definition): FORCE=MD-4,
  // NEURAL_VELOCITY=MD-3, VELOCITY=MD-2, POLISH_CALM=MD-2, ACTIVATION=MD-1.
  // Order matters: NEURAL_VELOCITY before the generic VELOCITY check, and
  // POLISH/CALM (MD-2) is split from ACTIVATION (MD-1) — they are different days.
  if (token.includes("FORCE")) return "MD4";
  if (token.includes("NEURAL") && token.includes("VELOCITY")) return "MD3";
  if (token.includes("VELOCITY")) return "MD2";
  if (token.includes("POLISH") || token.includes("CALM")) return "MD2";
  if (token.includes("ACTIVATION")) return "MD1";
  return null;
}

export function resolveSessionMdContextFromSources(params: {
  weekSetupDay?: WeekSetupDayRow | null;
  rowMdContext?: WeekSetupSessionMdContext | null;
  teamMdContext?: WeekSetupSessionMdContext | null;
  plannedFocusMdContext?: WeekSetupSessionMdContext | null;
  previewMdContext?: WeekSetupSessionMdContext | null;
}): { mdContext: WeekSetupSessionMdContext; source: "WEEK_SETUP" | "ROW_MD" | "TEAM_MD" | "PLANNED_FOCUS" | "PREVIEW_MD" | "FALLBACK_UNKNOWN" } {
  const weekSetupMd = mapWeekSetupDayToMdContext({
    doseFinal: params.weekSetupDay?.dose_final ?? null,
    dayTypeFinal: params.weekSetupDay?.day_type_final ?? null,
  });
  if (weekSetupMd) return { mdContext: weekSetupMd, source: "WEEK_SETUP" };
  if (params.rowMdContext) return { mdContext: params.rowMdContext, source: "ROW_MD" };
  if (params.teamMdContext) return { mdContext: params.teamMdContext, source: "TEAM_MD" };
  if (params.plannedFocusMdContext) return { mdContext: params.plannedFocusMdContext, source: "PLANNED_FOCUS" };
  if (params.previewMdContext) return { mdContext: params.previewMdContext, source: "PREVIEW_MD" };
  return { mdContext: "UNKNOWN", source: "FALLBACK_UNKNOWN" };
}
