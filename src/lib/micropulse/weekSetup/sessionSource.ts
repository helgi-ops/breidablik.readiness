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
  if (token.includes("GAME")) return "MD1";
  if (token.includes("FORCE")) return "MD3";
  if (token.includes("NEURAL") && token.includes("VELOCITY")) return "MD1";
  if (token.includes("VELOCITY")) return "MD2";
  if (token.includes("ACTIVATION") || token.includes("POLISH") || token.includes("CALM")) return "MD1";
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
