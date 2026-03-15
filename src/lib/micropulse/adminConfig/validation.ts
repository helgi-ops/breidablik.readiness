import type { EditableRuleForm, MatchdayTemplateConfig, ProtectedPlayerConfig, TeamPolicyConfig } from "./types";

export type ValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
};

function ok(): ValidationResult {
  return { valid: true, errors: {} };
}

export function validateEditableRuleForm(form: EditableRuleForm): ValidationResult {
  const out = ok();
  if (!String(form.name ?? "").trim()) out.errors.name = "Rule name is required.";
  if (!Number.isFinite(form.priority)) out.errors.priority = "Priority must be numeric.";
  if (!form.conditions.length) out.errors.conditions = "At least one condition is required.";
  if (!form.effects.length) out.errors.effects = "At least one effect is required.";

  for (const [idx, c] of form.conditions.entries()) {
    if (!String(c.field ?? "").trim()) out.errors[`conditions.${idx}.field`] = "Condition field is required.";
    if (["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "CONTAINS"].includes(c.operator) && c.value == null) {
      out.errors[`conditions.${idx}.value`] = "Condition value is required for this operator.";
    }
  }

  for (const [idx, e] of form.effects.entries()) {
    if (!String(e.type ?? "").trim()) out.errors[`effects.${idx}.type`] = "Effect type is required.";
  }

  out.valid = Object.keys(out.errors).length === 0;
  return out;
}

export function validateProtectedPlayerConfig(config: ProtectedPlayerConfig): ValidationResult {
  const out = ok();
  if (!String(config.playerId ?? "").trim()) out.errors.playerId = "Player id is required.";
  if (config.enabled && !config.tags?.length) out.errors.tags = "Add at least one tag for protected players.";
  out.valid = Object.keys(out.errors).length === 0;
  return out;
}

export function validateTeamPolicyConfig(config: TeamPolicyConfig): ValidationResult {
  const out = ok();
  const bias = ["LOW", "NORMAL", "HIGH"];
  if (!bias.includes(config.mdMinus1ProtectionBias)) out.errors.mdMinus1ProtectionBias = "Invalid md-1 protection bias.";
  if (!bias.includes(config.mdPlus1RecoveryBias)) out.errors.mdPlus1RecoveryBias = "Invalid md+1 recovery bias.";
  if (!bias.includes(config.congestedWeekProtectionBias)) out.errors.congestedWeekProtectionBias = "Invalid congestion bias.";
  if (!bias.includes(config.protectedPlayerBias)) out.errors.protectedPlayerBias = "Invalid protected player bias.";
  out.valid = Object.keys(out.errors).length === 0;
  return out;
}

export function validateMatchdayTemplateConfig(config: MatchdayTemplateConfig): ValidationResult {
  const out = ok();
  if (!String(config.dayType ?? "").trim()) out.errors.dayType = "Day type is required.";
  if (!String(config.defaultActionBias ?? "").trim()) out.errors.defaultActionBias = "Action bias is required.";
  if (!String(config.defaultIntensityBias ?? "").trim()) out.errors.defaultIntensityBias = "Intensity bias is required.";
  out.valid = Object.keys(out.errors).length === 0;
  return out;
}
