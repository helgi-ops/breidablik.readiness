import { buildPublishWorkflowEvent, buildWorkflowEvent } from "./audit";
import { canTransitionWorkflowStatus, getNextWorkflowStatus, isWorkflowPublishable } from "./status";
import { saveSessionDraftRecord, saveSessionWorkflowEvent } from "./persistence";
import type { SessionDraftRecord, SessionPublishDecision } from "./types";

/** Builds deterministic publish gating summary for staff. */
export function buildSessionPublishDecision(record: SessionDraftRecord): SessionPublishDecision {
  const warnings: string[] = [];
  if (!isWorkflowPublishable(record.status)) warnings.push(`Status ${record.status} is not publishable.`);
  if (!record.approvedDraft) warnings.push("Approved draft snapshot is missing.");
  if (!record.approvedDraft?.blocks.some((b) => b.included) && record.approvedDraft?.sessionType !== "OFF") {
    warnings.push("Approved draft has no included blocks.");
  }

  return {
    canPublish: warnings.length === 0,
    publishWarnings: warnings,
    summary: warnings.length ? `Publish blocked: ${warnings[0]}` : "Draft is ready to publish.",
  };
}

export function publishSessionDraft(
  record: SessionDraftRecord,
  actor: { id?: string; name?: string },
  reason?: string | null,
): { record: SessionDraftRecord; decision: SessionPublishDecision } {
  const decision = buildSessionPublishDecision(record);
  if (!decision.canPublish) return { record, decision };

  const nextStatus = getNextWorkflowStatus(record.status, "PUBLISHED");
  if (!canTransitionWorkflowStatus(record.status, nextStatus)) {
    return {
      record,
      decision: {
        canPublish: false,
        publishWarnings: [`Cannot transition ${record.status} -> ${nextStatus}.`],
        summary: "Publish transition invalid.",
      },
    };
  }

  const publishedAt = new Date().toISOString();
  const next: SessionDraftRecord = {
    ...record,
    publishedDraft: structuredClone(record.approvedDraft ?? record.workingDraft),
    status: nextStatus,
    version: record.version + 1,
    publishedBy: actor.id ?? null,
    publishedAt,
    updatedAt: publishedAt,
  };

  saveSessionDraftRecord(next);
  saveSessionWorkflowEvent(
    buildPublishWorkflowEvent({
      workflowId: next.id,
      actorId: actor.id,
      actorName: actor.name,
      reason,
    }),
  );

  return { record: next, decision };
}

export function unpublishSessionDraft(
  record: SessionDraftRecord,
  actor: { id?: string; name?: string },
  reason?: string | null,
): SessionDraftRecord {
  const next: SessionDraftRecord = {
    ...record,
    status: "DRAFT_SAVED",
    version: record.version + 1,
    updatedAt: new Date().toISOString(),
  };
  saveSessionDraftRecord(next);
  saveSessionWorkflowEvent(
    buildWorkflowEvent({
      workflowId: next.id,
      actionType: "UNPUBLISHED",
      actorId: actor.id,
      actorName: actor.name,
      reason,
      summary: "Session unpublished and returned to saved draft state.",
    }),
  );
  return next;
}
