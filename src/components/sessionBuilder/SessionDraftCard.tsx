"use client";

import type { SessionDraft } from "@/lib/micropulse/autoSessionBuilder";

type Props = {
  draft: SessionDraft;
  compact?: boolean;
};

export default function SessionDraftCard({ draft, compact = false }: Props) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-gray-800">Auto Session Draft</div>
        <div className="text-[10px] uppercase tracking-wide text-gray-500">
          {draft.sessionType} · {draft.draftAction}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-gray-700">{draft.draftSummary}</div>
      {!compact ? <div className="mt-1 text-[11px] text-gray-600">{draft.coachInstruction}</div> : null}
    </div>
  );
}
