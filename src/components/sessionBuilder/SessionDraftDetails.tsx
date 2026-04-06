"use client";

import type { SessionDraft } from "@/lib/micropulse/autoSessionBuilder";

type Props = {
  draft: SessionDraft;
};

export default function SessionDraftDetails({ draft }: Props) {
  return (
    <div className="rounded-lg border bg-gray-50/60 p-3 text-[11px] text-gray-700">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Blocks</div>
          <ul className="mt-0.5 list-disc pl-4">
            {draft.blocks.slice(0, 8).map((b) => (
              <li key={b.id}>
                {b.title}
                {b.intensity ? ` · ${b.intensity.toLowerCase()}` : ""}
                {b.durationMin ? ` · ${b.durationMin} min` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Adjustments</div>
          <ul className="mt-0.5 list-disc pl-4">
            {draft.explanationLines.slice(0, 4).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      {(draft.removedBlocks.length || draft.modifiedBlocks.length || draft.addedBlocks.length) && (
        <div className="mt-2 text-[10px] text-gray-600">
          Modified: {draft.modifiedBlocks.length} · Removed: {draft.removedBlocks.length} · Added: {draft.addedBlocks.length}
        </div>
      )}
    </div>
  );
}
