// src/lib/postTraining/evaluatePostTraining.ts

export type SessionLoad = "LOW" | "MODERATE" | "HIGH" | null;

export type PostTrainingContext = {
  mdDay: string | null; // t.d. "MD-4", "MD-3", "MD-1", "POST"
  sessionLoad: SessionLoad; // "HIGH" o.s.frv.
  sprintExposure: boolean;
  matchLike: boolean;
};

export type RuleRow = {
  id: string;
  priority: number;
  when_clause: any; // jsonb
  then_clause: any; // jsonb
  // (ATH: is_active er síað út í query hjá ykkur, en ef það bætist inn seinna er þetta harmless)
  is_active?: boolean;
};

// ✅ Rotation pool (endur-notar MD templates) — EKKI tendon
const DAILY_ROTATION_POOL = ["md1_priming", "md2_maintenance", "md3_speed_reset", "md4_neural_reset"] as const;

// ✅ hvað á að vera “daily” þegar þetta er match-like
// (þú ert að sjá "Post Match Reset" í UI → id líklega post_match_downreg)
const POST_MATCH_DAILY_ID = "post_match_downreg";

// ✅ Daily picker sem tekur TILLIT til matchLike (til að MD-1 birtist EKKI á leikdegi)
function pickDailyFromContext(ctx: PostTrainingContext): string {
  const md = String(ctx.mdDay ?? "").toUpperCase();

  // 0) Ef þetta er leikur / match-like → override ALLT (ekki sýna MD-1 priming)
  if (ctx.matchLike) return POST_MATCH_DAILY_ID;

  // 1) venjuleg MD mapping
  if (md === "MD") return "md_neural_priming";
  if (md === "MD-1") return "md1_priming";
  if (md === "MD-2") return "md2_maintenance";
  if (md === "MD-3") return "md3_speed_reset";
  if (md === "MD-4") return "md4_neural_reset";

  // 2) POST / MD+1 / MD+2 mapping (breyttu ef þú vilt)
  if (md === "POST") return POST_MATCH_DAILY_ID;
  if (md === "MD+1") return "md2_maintenance";
  if (md === "MD+2") return "md3_speed_reset";

  // fallback
  return DAILY_ROTATION_POOL[0];
}

function matchesWhenClause(ctx: PostTrainingContext, whenClause: any): boolean {
  if (!whenClause || typeof whenClause !== "object") return false;

  // 1) md_day_in: ["MD-4","MD-3"]
  if (Array.isArray(whenClause.md_day_in)) {
    if (!ctx.mdDay) return false;
    return whenClause.md_day_in.includes(ctx.mdDay);
  }

  // 2) or: [...]
  if (Array.isArray(whenClause.or)) {
    return whenClause.or.some((cond: any) => matchesWhenClause(ctx, cond));
  }

  // ✅ 2b) and: [...]
  if (Array.isArray(whenClause.and)) {
    return whenClause.and.every((cond: any) => matchesWhenClause(ctx, cond));
  }

  // ✅ 2c) not: {...}
  if (whenClause.not && typeof whenClause.not === "object") {
    return !matchesWhenClause(ctx, whenClause.not);
  }

  // 3) session_load: "HIGH"
  if (typeof whenClause.session_load === "string") {
    return ctx.sessionLoad === whenClause.session_load;
  }

  // 4) sprint_exposure: true/false
  if (typeof whenClause.sprint_exposure === "boolean") {
    return ctx.sprintExposure === whenClause.sprint_exposure;
  }

  // 5) match_like: true/false
  if (typeof whenClause.match_like === "boolean") {
    return ctx.matchLike === whenClause.match_like;
  }

  return false;
}

export function evaluatePostTrainingTemplateIds(
  ctx: PostTrainingContext,
  rules: RuleRow[],
  alwaysInclude: string[] = [] // <-- ekki hardcode daily hér
): string[] {
  const out: string[] = [];

  // ✅ Daily rotation / selection
  const dailyId = pickDailyFromContext(ctx);
  out.push(dailyId);

  // ✅ Aðrar alwaysInclude (ef þú vilt)
  for (const id of alwaysInclude) {
    if (!out.includes(id)) out.push(id);
  }

  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of sorted) {
    // extra safe ef is_active kemst inn í array-ið seinna
    if (rule?.is_active === false) continue;

    if (!matchesWhenClause(ctx, rule.when_clause)) continue;

    const thenClause = rule.then_clause;
    const append: string[] = Array.isArray(thenClause?.append) ? thenClause.append : [];

    for (const id of append) {
      if (!out.includes(id)) out.push(id);
    }
  }

  return out;
}