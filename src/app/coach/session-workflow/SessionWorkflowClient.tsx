"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  approveSessionDraft,
  buildEditWorkflowEvent,
  buildPlayerPublishedSessionView,
  buildSessionApprovalDecision,
  buildSessionPublishDecision,
  buildTeamWorkflowSummary,
  buildWorkflowEvent,
  buildSessionDraftDiff,
  getNextWorkflowStatus,
  loadAllSessionDraftRecords,
  loadSessionWorkflowEvents,
  publishSessionDraft,
  saveSessionDraftRecord,
  saveSessionWorkflowEvent,
  unpublishSessionDraft,
  type SessionDraftRecord,
} from "@/lib/micropulse/sessionWorkflow";
import type { SessionDraft } from "@/lib/micropulse/autoSessionBuilder";
import TeamWorkflowSummary from "@/components/sessionWorkflow/TeamWorkflowSummary";
import SessionWorkflowToolbar from "@/components/sessionWorkflow/SessionWorkflowToolbar";
import SessionApprovalPanel from "@/components/sessionWorkflow/SessionApprovalPanel";
import SessionChangeLog from "@/components/sessionWorkflow/SessionChangeLog";
import SessionDraftEditor from "@/components/sessionWorkflow/SessionDraftEditor";
import PublishedSessionView from "@/components/sessionWorkflow/PublishedSessionView";
import SessionDraftCard from "@/components/sessionBuilder/SessionDraftCard";
import SessionDraftDetails from "@/components/sessionBuilder/SessionDraftDetails";
import {
  addSessionComment,
  assignPublishedSession,
  buildCommentSummary,
  buildNotificationEventsForAssignment,
  buildReviewRequestSummary,
  buildTeamDeliverySummary,
  cancelSessionAssignment,
  createReviewRequest,
  declineReviewRequest,
  listAssignmentsForTeam,
  listNotificationEventsForWorkflow,
  listReviewRequestsForWorkflow,
  listSessionCommentsForWorkflow,
  loadAssignmentByWorkflowId,
  resolveReviewRequest,
  saveAssignmentRecord,
  saveNotificationEvent,
  saveReviewRequest,
  saveSessionComment,
  type ReviewRequestRecord,
  type SessionAssignmentRecord,
  type SessionCommentRecord,
  type SessionNotificationEvent,
} from "@/lib/micropulse/sessionDelivery";
import SessionAssignmentPanel from "@/components/sessionDelivery/SessionAssignmentPanel";
import ReviewRequestPanel from "@/components/sessionDelivery/ReviewRequestPanel";
import SessionCommentsPanel from "@/components/sessionDelivery/SessionCommentsPanel";
import TeamDeliverySummary from "@/components/sessionDelivery/TeamDeliverySummary";
import NotificationHistoryPanel from "@/components/sessionDelivery/NotificationHistoryPanel";
import { useTeamRealtime, useWorkflowRealtime } from "@/lib/micropulse/realtime";
import LiveStatusBanner from "@/components/realtime/LiveStatusBanner";
import LiveTeamUpdatesPanel from "@/components/realtime/LiveTeamUpdatesPanel";
import ActivityFeedPanel from "@/components/realtime/ActivityFeedPanel";

function refreshRecords(): SessionDraftRecord[] {
  return loadAllSessionDraftRecords().sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}

export default function SessionWorkflowClient() {
  const [records, setRecords] = useState<SessionDraftRecord[]>(() => refreshRecords());
  const [selectedId, setSelectedId] = useState<string | null>(() => refreshRecords()[0]?.id ?? null);

  useEffect(() => {
    const onStorage = () => {
      const next = refreshRecords();
      setRecords(next);
      setSelectedId((current) => (current && next.some((record) => record.id === current) ? current : next[0]?.id ?? null));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const selected = useMemo(() => records.find((r) => r.id === selectedId) ?? null, [records, selectedId]);
  const activeTeamId = selected?.teamId ?? records[0]?.teamId ?? null;
  const teamRealtime = useTeamRealtime(activeTeamId, "coach");
  const workflowRealtime = useWorkflowRealtime(activeTeamId, selected?.id ?? null, "coach");
  const events = useMemo(() => (selected ? loadSessionWorkflowEvents(selected.id) : []), [selected]);
  const summary = useMemo(() => buildTeamWorkflowSummary(records), [records]);
  const deliveryMaps = useMemo(() => {
    const assignMap = new Map<string, SessionAssignmentRecord>();
    const reviewMap = new Map<string, ReviewRequestRecord[]>();
    const commentMap = new Map<string, SessionCommentRecord[]>();
    const notifyMap = new Map<string, SessionNotificationEvent[]>();
    const teamId = records[0]?.teamId ?? null;
    const allAssignments = listAssignmentsForTeam(teamId);
    for (const workflow of records) {
      const assignment = allAssignments.find((a) => a.workflowId === workflow.id) ?? null;
      if (assignment) assignMap.set(workflow.id, assignment);
      reviewMap.set(workflow.id, listReviewRequestsForWorkflow(workflow.id));
      commentMap.set(workflow.id, listSessionCommentsForWorkflow(workflow.id));
      notifyMap.set(workflow.id, listNotificationEventsForWorkflow(workflow.id));
    }
    return { assignMap, reviewMap, commentMap, notifyMap };
  }, [records]);
  const assignmentByWorkflow = deliveryMaps.assignMap;
  const reviewByWorkflow = deliveryMaps.reviewMap;
  const commentsByWorkflow = deliveryMaps.commentMap;
  const notificationsByWorkflow = deliveryMaps.notifyMap;
  const selectedAssignment = selected ? assignmentByWorkflow.get(selected.id) ?? null : null;
  const selectedReviewRequests = selected ? reviewByWorkflow.get(selected.id) ?? [] : [];
  const selectedComments = selected ? commentsByWorkflow.get(selected.id) ?? [] : [];
  const selectedNotifications = selected ? notificationsByWorkflow.get(selected.id) ?? [] : [];
  const deliverySummary = useMemo(
    () =>
      buildTeamDeliverySummary(
        Array.from(assignmentByWorkflow.values()),
        Array.from(reviewByWorkflow.values()).flat(),
      ),
    [assignmentByWorkflow, reviewByWorkflow],
  );
  const approvalDecision = useMemo(
    () => (selected ? buildSessionApprovalDecision(selected) : { canApprove: false, approvalWarnings: ["No draft selected."], summary: "No draft selected." }),
    [selected],
  );
  const publishDecision = useMemo(
    () => (selected ? buildSessionPublishDecision(selected) : { canPublish: false, publishWarnings: ["No draft selected."], summary: "No draft selected." }),
    [selected],
  );
  const publishedView = useMemo(() => (selected ? buildPlayerPublishedSessionView(selected) : null), [selected]);

  function syncRecords(nextRecord?: SessionDraftRecord) {
    const next = refreshRecords();
    setRecords(next);
    if (nextRecord?.id) {
      setSelectedId(nextRecord.id);
      return;
    }
    setSelectedId((current) => current ?? next[0]?.id ?? null);
  }

  function saveEditedDraft(nextDraft: SessionDraft, reason?: string | null) {
    if (!selected) return;

    const edits = buildSessionDraftDiff(selected.workingDraft, nextDraft);
    const actionType = edits.length > 0 ? "EDITED" : "SAVED";
    const nextStatus = getNextWorkflowStatus(selected.status, actionType);

    const nextRecord: SessionDraftRecord = {
      ...selected,
      workingDraft: nextDraft,
      status: nextStatus,
      version: selected.version + 1,
      updatedAt: new Date().toISOString(),
      lastEditedBy: "coach",
    };

    saveSessionDraftRecord(nextRecord);
    saveSessionWorkflowEvent(
      edits.length
        ? buildEditWorkflowEvent({ workflowId: selected.id, actorId: "coach", actorName: "Coach", changes: edits, reason })
        : buildWorkflowEvent({ workflowId: selected.id, actionType: "SAVED", actorId: "coach", actorName: "Coach", reason, summary: "Draft saved." }),
    );

    syncRecords(nextRecord);
  }

  function submitForReview() {
    if (!selected) return;
    const nextRecord: SessionDraftRecord = {
      ...selected,
      status: getNextWorkflowStatus(selected.status, "SUBMITTED_FOR_REVIEW"),
      updatedAt: new Date().toISOString(),
    };
    saveSessionDraftRecord(nextRecord);
    saveSessionWorkflowEvent(
      buildWorkflowEvent({
        workflowId: selected.id,
        actionType: "SUBMITTED_FOR_REVIEW",
        actorId: "coach",
        actorName: "Coach",
        summary: "Draft submitted for review.",
      }),
    );
    syncRecords(nextRecord);
  }

  function approve() {
    if (!selected) return;
    const result = approveSessionDraft(selected, { id: "coach", name: "Coach" });
    syncRecords(result.record);
  }

  function publish() {
    if (!selected) return;
    const result = publishSessionDraft(selected, { id: "coach", name: "Coach" });
    const published = buildPlayerPublishedSessionView(result.record);
    if (published) {
      const previousAssignment = loadAssignmentByWorkflowId(result.record.id);
      const nextAssignment = assignPublishedSession({
        workflowId: result.record.id,
        publishedSessionView: published,
        playerId: result.record.playerId,
        playerName: result.record.playerName,
        teamId: result.record.teamId,
        assignedBy: "coach",
        deliveryChannels: ["IN_APP"],
        previous: previousAssignment,
      });
      saveAssignmentRecord(nextAssignment);
      const notificationEvents = buildNotificationEventsForAssignment({
        record: nextAssignment,
        includeUpdate: !!previousAssignment,
      });
      for (const event of notificationEvents) {
        saveNotificationEvent(event);
      }
    }
    syncRecords(result.record);
  }

  function unpublish() {
    if (!selected) return;
    const next = unpublishSessionDraft(selected, { id: "coach", name: "Coach" }, "Returned for updates.");
    syncRecords(next);
  }

  function assignSelected() {
    if (!selected) return;
    const published = buildPlayerPublishedSessionView(selected);
    if (!published) return;
    const previous = loadAssignmentByWorkflowId(selected.id);
    const nextAssignment = assignPublishedSession({
      workflowId: selected.id,
      publishedSessionView: published,
      playerId: selected.playerId,
      playerName: selected.playerName,
      teamId: selected.teamId,
      assignedBy: "coach",
      deliveryChannels: ["IN_APP"],
      previous,
    });
    saveAssignmentRecord(nextAssignment);
    for (const event of buildNotificationEventsForAssignment({ record: nextAssignment, includeUpdate: !!previous })) {
      saveNotificationEvent(event);
    }
    syncRecords(selected);
  }

  function cancelAssignment() {
    if (!selectedAssignment) return;
    const next = cancelSessionAssignment(selectedAssignment);
    saveAssignmentRecord(next);
    syncRecords(selected ?? undefined);
  }

  function markDelivered() {
    if (!selectedAssignment) return;
    const ts = new Date().toISOString();
    const next: SessionAssignmentRecord = {
      ...selectedAssignment,
      assignmentStatus: selectedAssignment.assignmentStatus === "ASSIGNED" ? "DELIVERED" : selectedAssignment.assignmentStatus,
      deliveredAt: selectedAssignment.deliveredAt ?? ts,
      version: selectedAssignment.version + 1,
    };
    saveAssignmentRecord(next);
    syncRecords(selected ?? undefined);
  }

  function createReview(args: { requestedToName: string; reason?: string | null }) {
    if (!selected) return;
    const { request, notifications } = createReviewRequest({
      workflowId: selected.id,
      requestedBy: "coach",
      requestedByName: "Coach",
      requestedToName: args.requestedToName,
      reason: args.reason,
    });
    saveReviewRequest(request);
    for (const event of notifications) saveNotificationEvent(event);
    syncRecords(selected);
  }

  function resolveReview(id: string) {
    if (!selected) return;
    const found = listReviewRequestsForWorkflow(selected.id).find((r) => r.id === id);
    if (!found) return;
    saveReviewRequest(resolveReviewRequest(found));
    syncRecords(selected);
  }

  function declineReview(id: string) {
    if (!selected) return;
    const found = listReviewRequestsForWorkflow(selected.id).find((r) => r.id === id);
    if (!found) return;
    saveReviewRequest(declineReviewRequest(found));
    syncRecords(selected);
  }

  function addComment(args: { message: string; scope: "STAFF_ONLY" | "PLAYER_VISIBLE" }) {
    if (!selected) return;
    const comment = addSessionComment({
      workflowId: selected.id,
      authorId: "coach",
      authorName: "Coach",
      scope: args.scope,
      message: args.message,
    });
    saveSessionComment(comment);
    syncRecords(selected);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Session Workflow</h1>
          <p className="text-sm text-gray-600">Review, approve, and publish session drafts. Generated, working, approved, and published snapshots are all preserved.</p>
        </div>
        <Link href="/coach/dev-coach-dashboard" className="rounded border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Back to coach dashboard
        </Link>
      </div>

      <LiveStatusBanner health={teamRealtime.summary} label="Live team workflow updates" />
      <TeamWorkflowSummary summary={summary} />
      <TeamDeliverySummary summary={deliverySummary} />
      <LiveTeamUpdatesPanel teamId={activeTeamId} items={teamRealtime.activity} />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Drafts</div>
          <div className="mt-2 space-y-2">
            {records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelectedId(record.id)}
                className={`w-full rounded border px-2 py-2 text-left text-xs ${record.id === selectedId ? "border-black bg-gray-50" : "border-gray-200 bg-white"}`}
              >
                <div className="font-semibold text-gray-900">{record.playerName || record.playerId || "Unknown player"}</div>
                <div className="text-gray-600">{record.date || "No date"}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{record.status}</div>
              </button>
            ))}
            {!records.length ? <div className="text-xs text-gray-500">No session workflow records found yet. Open the dev coach dashboard first to generate drafts.</div> : null}
          </div>
        </div>

        {selected ? (
          <div className="space-y-4">
            <SessionWorkflowToolbar
              status={selected.status}
              onSubmitForReview={submitForReview}
              onApprove={approve}
              onPublish={publish}
              onUnpublish={unpublish}
              approvalDecision={approvalDecision}
              publishDecision={publishDecision}
            />

            <SessionApprovalPanel record={selected} approvalDecision={approvalDecision} publishDecision={publishDecision} />

            <SessionAssignmentPanel
              assignment={selectedAssignment}
              onAssign={assignSelected}
              onCancel={cancelAssignment}
              onMarkDelivered={markDelivered}
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <SessionDraftCard draft={selected.workingDraft} />
                <SessionDraftDetails draft={selected.workingDraft} />
              </div>
              <PublishedSessionView view={publishedView} />
            </div>

            <SessionDraftEditor
              originalDraft={selected.originalGeneratedDraft}
              workingDraft={selected.workingDraft}
              editable={selected.status !== "ARCHIVED"}
              onSaveDraft={saveEditedDraft}
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <ReviewRequestPanel
                requests={selectedReviewRequests}
                onCreate={createReview}
                onResolve={resolveReview}
                onDecline={declineReview}
              />
              <SessionCommentsPanel comments={selectedComments} onAddComment={addComment} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Delivery notes</div>
                <div className="mt-2">{buildReviewRequestSummary(selectedReviewRequests)}</div>
                <div className="mt-1">{buildCommentSummary(selectedComments)}</div>
              </div>
              <NotificationHistoryPanel events={selectedNotifications} />
            </div>

            <ActivityFeedPanel items={workflowRealtime.activity} title="Live workflow activity" />
            <SessionChangeLog events={events} />
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">No workflow record selected.</div>
        )}
      </div>
    </div>
  );
}
