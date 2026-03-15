import type { SessionDraft } from "@/lib/micropulse/autoSessionBuilder";
import type { SessionBlockEdit } from "./types";

function blockMap(draft: SessionDraft) {
  return new Map(draft.blocks.map((b) => [b.id, b]));
}

/** Builds block-level editable diff between original and updated drafts. */
export function buildSessionDraftDiff(original: SessionDraft, updated: SessionDraft): SessionBlockEdit[] {
  const edits: SessionBlockEdit[] = [];
  const from = blockMap(original);
  const to = blockMap(updated);

  const ids = new Set<string>([...from.keys(), ...to.keys()]);

  for (const id of ids) {
    const a = from.get(id);
    const b = to.get(id);
    if (!a || !b) continue;

    if (a.included !== b.included) edits.push({ blockId: id, field: "included", from: a.included, to: b.included });
    if ((a.durationMin ?? null) !== (b.durationMin ?? null)) edits.push({ blockId: id, field: "durationMin", from: a.durationMin ?? null, to: b.durationMin ?? null });
    if ((a.sets ?? null) !== (b.sets ?? null)) edits.push({ blockId: id, field: "sets", from: a.sets ?? null, to: b.sets ?? null });
    if ((a.reps ?? null) !== (b.reps ?? null)) edits.push({ blockId: id, field: "reps", from: a.reps ?? null, to: b.reps ?? null });
    if ((a.intensity ?? null) !== (b.intensity ?? null)) edits.push({ blockId: id, field: "intensity", from: a.intensity ?? null, to: b.intensity ?? null });
    if ((a.title ?? "") !== (b.title ?? "")) edits.push({ blockId: id, field: "title", from: a.title ?? "", to: b.title ?? "" });
    if ((a.description ?? null) !== (b.description ?? null)) edits.push({ blockId: id, field: "description", from: a.description ?? null, to: b.description ?? null });
  }

  return edits;
}

export function summarizeSessionDraftDiff(edits: SessionBlockEdit[]): string {
  if (!edits.length) return "No draft changes.";
  const includeEdits = edits.filter((e) => e.field === "included").length;
  const durationEdits = edits.filter((e) => e.field === "durationMin").length;
  const loadEdits = edits.filter((e) => e.field === "sets" || e.field === "reps" || e.field === "intensity").length;
  return `${edits.length} changes · ${includeEdits} include/exclude · ${durationEdits} duration · ${loadEdits} load/intensity.`;
}
