import type {
  AutomationActionExecutionRecord,
  AutomationHistoryEntry,
  AutomationRule,
  EscalationRecord,
  SmartAlertRecord,
} from "./types";
import { DEFAULT_AUTOMATION_RULES } from "./rules";

const RULES_KEY = "micropulse.automation.rules.v1";
const ALERTS_KEY = "micropulse.automation.alerts.v1";
const ACTIONS_KEY = "micropulse.automation.actions.v1";
const ESCALATIONS_KEY = "micropulse.automation.escalations.v1";
const HISTORY_KEY = "micropulse.automation.history.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Persistence boundary for automation rules/alerts/actions/escalations/history. */
export function saveAutomationRule(rule: AutomationRule): AutomationRule {
  const all = loadAutomationRules();
  writeJson(RULES_KEY, [rule, ...all.filter((item) => item.id !== rule.id)]);
  return rule;
}

export function loadAutomationRules(): AutomationRule[] {
  const existing = readJson<AutomationRule[]>(RULES_KEY, []);
  if (existing.length) return existing;
  return DEFAULT_AUTOMATION_RULES;
}

export function saveSmartAlert(alert: SmartAlertRecord): SmartAlertRecord {
  const all = loadSmartAlerts();
  writeJson(ALERTS_KEY, [alert, ...all.filter((item) => item.id !== alert.id)].slice(0, 3000));
  return alert;
}

export function loadSmartAlerts(limit = 500): SmartAlertRecord[] {
  return readJson<SmartAlertRecord[]>(ALERTS_KEY, [])
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, limit);
}

export function saveAutomationActionExecution(record: AutomationActionExecutionRecord): AutomationActionExecutionRecord {
  const all = loadAutomationActionExecutions();
  writeJson(ACTIONS_KEY, [record, ...all.filter((item) => item.id !== record.id)].slice(0, 5000));
  return record;
}

export function loadAutomationActionExecutions(limit = 500): AutomationActionExecutionRecord[] {
  return readJson<AutomationActionExecutionRecord[]>(ACTIONS_KEY, [])
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, limit);
}

export function saveEscalationRecord(record: EscalationRecord): EscalationRecord {
  const all = loadEscalationRecords();
  writeJson(ESCALATIONS_KEY, [record, ...all.filter((item) => item.id !== record.id)].slice(0, 3000));
  return record;
}

export function loadEscalationRecords(limit = 500): EscalationRecord[] {
  return readJson<EscalationRecord[]>(ESCALATIONS_KEY, [])
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, limit);
}

export function saveAutomationHistoryEntry(entry: AutomationHistoryEntry): AutomationHistoryEntry {
  const all = loadAutomationHistory();
  writeJson(HISTORY_KEY, [entry, ...all.filter((item) => item.id !== entry.id)].slice(0, 6000));
  return entry;
}

export function loadAutomationHistory(limit = 500): AutomationHistoryEntry[] {
  return readJson<AutomationHistoryEntry[]>(HISTORY_KEY, [])
    .sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")))
    .slice(0, limit);
}

