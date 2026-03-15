import type { SessionDraftRecord, SessionWorkflowEvent, SessionWorkflowStatus } from "./types";
import { buildWorkflowStatusChangedEvent, publishRealtimeEvent } from "@/lib/micropulse/realtime";

const WORKFLOW_RECORDS_KEY = "micropulse.sessionWorkflow.records.v1";
const WORKFLOW_EVENTS_KEY = "micropulse.sessionWorkflow.events.v1";

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

/** Persistence boundary: swap localStorage with API/DB services in future phase. */
export function loadAllSessionDraftRecords(): SessionDraftRecord[] {
  return readJson<SessionDraftRecord[]>(WORKFLOW_RECORDS_KEY, []);
}

export function saveAllSessionDraftRecords(records: SessionDraftRecord[]): void {
  writeJson(WORKFLOW_RECORDS_KEY, records);
}

export function loadSessionDraftRecord(id: string): SessionDraftRecord | null {
  return loadAllSessionDraftRecords().find((r) => r.id === id) ?? null;
}

export function saveSessionDraftRecord(record: SessionDraftRecord): SessionDraftRecord {
  const records = loadAllSessionDraftRecords();
  const next = [record, ...records.filter((r) => r.id !== record.id)];
  saveAllSessionDraftRecords(next);
  return record;
}

export function loadSessionDraftRecordByPlayerDate(playerId: string, date: string): SessionDraftRecord | null {
  return loadAllSessionDraftRecords().find((r) => r.playerId === playerId && r.date === date) ?? null;
}

export function updateSessionWorkflowStatus(id: string, status: SessionWorkflowStatus): SessionDraftRecord | null {
  const current = loadSessionDraftRecord(id);
  if (!current) return null;
  const next: SessionDraftRecord = { ...current, status, updatedAt: new Date().toISOString() };
  saveSessionDraftRecord(next);
  return next;
}

export function loadAllSessionWorkflowEvents(): SessionWorkflowEvent[] {
  return readJson<SessionWorkflowEvent[]>(WORKFLOW_EVENTS_KEY, []);
}

export function loadSessionWorkflowEvents(workflowId: string): SessionWorkflowEvent[] {
  return loadAllSessionWorkflowEvents().filter((e) => e.workflowId === workflowId).sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));
}

export function saveSessionWorkflowEvent(event: SessionWorkflowEvent): SessionWorkflowEvent {
  const events = loadAllSessionWorkflowEvents();
  const next = [event, ...events.filter((e) => e.id !== event.id)].slice(0, 2000);
  writeJson(WORKFLOW_EVENTS_KEY, next);
  const typeSummary = String(event.actionType ?? "").toUpperCase();
  publishRealtimeEvent(
    buildWorkflowStatusChangedEvent({
      workflowId: event.workflowId,
      summary: `Workflow ${typeSummary.toLowerCase().replaceAll("_", " ")}.`,
      payload: {
        actionType: event.actionType,
        actorName: event.actorName ?? null,
        reason: event.reason ?? null,
      },
      severity:
        event.actionType === "REJECTED"
          ? "WARNING"
          : event.actionType === "PUBLISHED"
            ? "NOTICE"
            : "INFO",
    }),
  );
  return event;
}
