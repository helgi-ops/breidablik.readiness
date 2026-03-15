"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { SessionDraft, SessionIntensityBand } from "@/lib/micropulse/autoSessionBuilder";
import { buildSessionDraftDiff, summarizeSessionDraftDiff, type SessionBlockEdit } from "@/lib/micropulse/sessionWorkflow";

type Props = {
  originalDraft: SessionDraft;
  workingDraft: SessionDraft;
  editable?: boolean;
  onSaveDraft: (nextDraft: SessionDraft, reason?: string | null, edits?: SessionBlockEdit[]) => void;
};

const INTENSITY_OPTIONS: Array<SessionIntensityBand | ""> = ["", "LOW", "MODERATE", "HIGH"];

function toNumOrNull(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function SessionDraftEditor({ originalDraft, workingDraft, editable = true, onSaveDraft }: Props) {
  const [localDraft, setLocalDraft] = useState<SessionDraft>(workingDraft);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setLocalDraft(workingDraft);
  }, [workingDraft]);

  const edits = useMemo(() => buildSessionDraftDiff(originalDraft, localDraft), [originalDraft, localDraft]);

  return (
    <div className="space-y-3 rounded-xl border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Working Draft Editor</div>
          <div className="text-xs text-gray-500">{summarizeSessionDraftDiff(edits)}</div>
        </div>
      </div>

      <div className="space-y-2">
        {localDraft.blocks.map((block) => (
          <div key={block.id} className="rounded-lg border bg-gray-50/60 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={block.included}
                  disabled={!editable}
                  onChange={(e) => {
                    const included = e.target.checked;
                    setLocalDraft((prev) => ({
                      ...prev,
                      blocks: prev.blocks.map((b) => (b.id === block.id ? { ...b, included } : b)),
                    }));
                  }}
                />
                {block.title}
              </label>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">{block.type}</div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
              <input
                className="rounded border px-2 py-1 text-xs"
                disabled={!editable}
                value={block.durationMin ?? ""}
                onChange={(e) => {
                  const durationMin = toNumOrNull(e.target.value);
                  setLocalDraft((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((b) => (b.id === block.id ? { ...b, durationMin } : b)),
                  }));
                }}
                placeholder="Duration"
              />
              <input
                className="rounded border px-2 py-1 text-xs"
                disabled={!editable}
                value={block.sets ?? ""}
                onChange={(e) => {
                  const sets = toNumOrNull(e.target.value);
                  setLocalDraft((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((b) => (b.id === block.id ? { ...b, sets } : b)),
                  }));
                }}
                placeholder="Sets"
              />
              <input
                className="rounded border px-2 py-1 text-xs"
                disabled={!editable}
                value={block.reps ?? ""}
                onChange={(e) => {
                  const reps = e.target.value || null;
                  setLocalDraft((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((b) => (b.id === block.id ? { ...b, reps } : b)),
                  }));
                }}
                placeholder="Reps"
              />
              <select
                className="rounded border px-2 py-1 text-xs"
                disabled={!editable}
                value={block.intensity ?? ""}
                onChange={(e) => {
                  const intensity = (e.target.value || null) as SessionIntensityBand | null;
                  setLocalDraft((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((b) => (b.id === block.id ? { ...b, intensity } : b)),
                  }));
                }}
              >
                {INTENSITY_OPTIONS.map((option) => (
                  <option key={option || "unset"} value={option}>
                    {option || "Intensity"}
                  </option>
                ))}
              </select>
              <input
                className="rounded border px-2 py-1 text-xs"
                disabled={!editable}
                value={block.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setLocalDraft((prev) => ({
                    ...prev,
                    blocks: prev.blocks.map((b) => (b.id === block.id ? { ...b, title } : b)),
                  }));
                }}
                placeholder="Title"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          className="rounded border px-2 py-1 text-xs"
          placeholder="Reason for edits (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={!editable}
        />
        <button
          type="button"
          disabled={!editable}
          onClick={() => onSaveDraft(localDraft, reason || null, edits)}
          className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save Draft
        </button>
      </div>
    </div>
  );
}
