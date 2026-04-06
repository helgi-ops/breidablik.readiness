import type { AutomationRuleCondition } from "./types";

function getValue(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/** Evaluates one rule condition against deterministic event/state context payload. */
export function evaluateAutomationCondition(
  condition: AutomationRuleCondition,
  context: Record<string, unknown>,
): boolean {
  const left = getValue(context, condition.field);
  const right = condition.value;
  switch (condition.operator) {
    case "EQ":
      return left === right;
    case "NEQ":
      return left !== right;
    case "GT":
      return Number(left) > Number(right);
    case "GTE":
      return Number(left) >= Number(right);
    case "LT":
      return Number(left) < Number(right);
    case "LTE":
      return Number(left) <= Number(right);
    case "IN":
      return asArray(right).includes(left);
    case "NOT_IN":
      return !asArray(right).includes(left);
    case "CONTAINS":
      if (Array.isArray(left)) return left.includes(right);
      return String(left ?? "").includes(String(right ?? ""));
    case "TRUE":
      return Boolean(left) === true;
    case "FALSE":
      return Boolean(left) === false;
    default:
      return false;
  }
}

/** Evaluates all conditions in rule with AND semantics for deterministic matching. */
export function evaluateAutomationConditions(
  conditions: AutomationRuleCondition[],
  context: Record<string, unknown>,
): boolean {
  if (!conditions.length) return true;
  return conditions.every((condition) => evaluateAutomationCondition(condition, context));
}

export function summarizeConditionMatch(args: {
  matched: boolean;
  conditionCount: number;
}): string {
  if (args.matched) return `Matched ${args.conditionCount} condition(s).`;
  return `Did not match ${args.conditionCount} condition(s).`;
}

