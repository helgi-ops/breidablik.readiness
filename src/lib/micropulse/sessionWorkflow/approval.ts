import { buildApprovalWorkflowEvent } from "./audit";
import { buildSessionDraftDiff } from "./diff";
import { canTransitionWorkflowStatus, getNextWorkflowStatus, isWorkflowApprovable } from "./status";
import { saveSessionDraftRecord, saveSessionWorkflowEvent } from "./persistence";
import type { SessionApprovalDecision, SessionDraftRecord } from "./types";

/** Builds deterministic approval gating summary for staff. */
export function buildSessionApprovalDecision(record: SessionDraftRecord): SessionApprovalDecision {
  const warnings: string[] = [];
  if (!isWorkflowApprovable(record.status)) warnings.push(`Status ${record.status} is not approvable.`);
  if (!record.workingDraft.blocks.some((b) => b.included) && record.workingDraft.sessionType !== "OFF") {
    warnings.push("Working draft has no included blocks.");
  }

  const edits = buildSessionDraftDiff(record.originalGeneratedDraft, record.workingDraft);
  if (edits.length >= 8) warnings.push("Large draft edits detected; verify intent before approval.");
  if (record.workingDraft.removedBlocks.length >= 3) warnings.push("Multiple blocks removed from original draft.");

  return {
    canApprove: warnings.length === 0,
    approvalWarnings: warnings,
    summary: warnings.length ? `Approval blocked: ${warnings[0]}` : "Draft is ready for approval.",
  };
}

export function approveSessionDraft(
  record: SessionDraftRecord,
  actor: { id?: string; name?: string },
  reason?: string | null,
): { record: SessionDraftRecord; decision: SessionApprovalDecision } {
  const decision = buildSessionApprovalDecision(record);
  if (!decision.canApprove) return { record, decision };

  const nextStatus = getNextWorkflowStatus(record.status, "APPROVED");
  if (!canTransitionWorkflowStatus(record.status, nextStatus)) {
    return {
      record,
      decision: {
        canApprove: false,
        approvalWarnings: [`Cannot transition ${record.status} -> ${nextStatus}.`],
        summary: "Approval transition invalid.",
      },
    };
  }

  const next: SessionDraftRecord = {
    ...record,
    approvedDraft: structuredClone(record.workingDraft),
    status: nextStatus,
    version: record.version + 1,
    approvedBy: actor.id ?? null,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveSessionDraftRecord(next);
  saveSessionWorkflowEvent(
    buildApprovalWorkflowEvent({
      workflowId: next.id,
      actorId: actor.id,
      actorName: actor.name,
      reason,
    }),
  );

  return { record: next, decision };
}
