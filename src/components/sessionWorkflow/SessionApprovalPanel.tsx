"use client";

import React from "react";
import type { SessionApprovalDecision, SessionDraftRecord, SessionPublishDecision } from "@/lib/micropulse/sessionWorkflow";

type Props = {
  record: SessionDraftRecord;
  approvalDecision: SessionApprovalDecision;
  publishDecision: SessionPublishDecision;
};

function Warnings({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
      <div className="font-semibold">{title}</div>
      <ul className="mt-1 list-disc pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function SessionApprovalPanel({ record, approvalDecision, publishDecision }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Approval & Publish</div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="rounded border bg-gray-50 p-2">
          <div className="font-semibold">Approval</div>
          <div className="mt-1">{approvalDecision.summary}</div>
          <div className="mt-1 text-[11px] text-gray-500">
            Approved by: {record.approvedBy || "-"} {record.approvedAt ? `· ${new Date(record.approvedAt).toLocaleString()}` : ""}
          </div>
        </div>
        <div className="rounded border bg-gray-50 p-2">
          <div className="font-semibold">Publish</div>
          <div className="mt-1">{publishDecision.summary}</div>
          <div className="mt-1 text-[11px] text-gray-500">
            Published by: {record.publishedBy || "-"} {record.publishedAt ? `· ${new Date(record.publishedAt).toLocaleString()}` : ""}
          </div>
        </div>
      </div>

      <Warnings title="Approval warnings" items={approvalDecision.approvalWarnings} />
      <Warnings title="Publish warnings" items={publishDecision.publishWarnings} />
    </div>
  );
}
