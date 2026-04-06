import type { CoachRule, RuleFieldKey, RuleEffect } from "@/lib/micropulse/rulesEngine";
import type { EditableRuleForm } from "./types";

export function mapCoachRuleToForm(rule: CoachRule): EditableRuleForm {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    scope: rule.scope,
    severity: rule.severity,
    enabled: rule.enabled,
    priority: rule.priority,
    conditions: rule.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value ?? null })),
    effects: rule.effects.map((e) => ({ type: e.type, value: e.value })),
    appliesToPlayerIds: rule.appliesToPlayerIds ?? [],
    appliesToTeamIds: rule.appliesToTeamIds ?? [],
    appliesToTags: rule.appliesToTags ?? [],
  };
}

export function mapFormToCoachRule(form: EditableRuleForm): CoachRule {
  const normalizedId = String(form.id ?? "").trim() || `custom-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return {
    id: normalizedId,
    name: form.name,
    description: form.description,
    scope: form.scope,
    severity: form.severity,
    enabled: !!form.enabled,
    priority: Number.isFinite(form.priority) ? form.priority : 0,
    conditions: form.conditions.map((c) => ({ field: c.field as RuleFieldKey, operator: c.operator, value: c.value })),
    effects: form.effects.map((e) => ({ type: e.type as RuleEffect["type"], value: e.value })),
    appliesToPlayerIds: form.appliesToPlayerIds?.filter(Boolean) ?? [],
    appliesToTeamIds: form.appliesToTeamIds?.filter(Boolean) ?? [],
    appliesToTags: form.appliesToTags?.filter(Boolean) ?? [],
    updatedAt: new Date().toISOString(),
  };
}

export function buildRulePreviewText(form: EditableRuleForm): string {
  const conditionText = form.conditions
    .slice(0, 2)
    .map((c) => `${c.field} ${c.operator}${c.value != null ? ` ${Array.isArray(c.value) ? c.value.join(",") : c.value}` : ""}`)
    .join(" · ");
  const effectText = form.effects
    .slice(0, 2)
    .map((e) => `${e.type}${e.value != null ? `(${Array.isArray(e.value) ? e.value.join(",") : String(e.value)})` : ""}`)
    .join(" · ");

  return `${conditionText || "No conditions"} → ${effectText || "No effects"}`;
}

export function createEmptyEditableRuleForm(): EditableRuleForm {
  return {
    name: "",
    description: "",
    scope: "TEAM",
    severity: "SOFT",
    enabled: true,
    priority: 50,
    conditions: [{ field: "dayType", operator: "EQ", value: "training" }],
    effects: [{ type: "setAction", value: "MODIFIED" }],
    appliesToPlayerIds: [],
    appliesToTeamIds: [],
    appliesToTags: [],
  };
}
