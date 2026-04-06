import type { PlayerPublishedSessionView, SessionDraftRecord } from "./types";

/** Maps internal published workflow snapshot into player-facing clean session view. */
export function buildPlayerPublishedSessionView(record: SessionDraftRecord): PlayerPublishedSessionView | null {
  const source = record.publishedDraft;
  if (!source || record.status !== "PUBLISHED") return null;

  const includedBlocks = source.blocks.filter((b) => b.included);

  return {
    playerId: record.playerId,
    playerName: record.playerName,
    date: record.date,
    sessionType: source.sessionType,
    title: `${source.sessionType} session`,
    summary: source.draftSummary,
    blocks: includedBlocks.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      durationMin: b.durationMin,
      sets: b.sets,
      reps: b.reps,
      intensity: b.intensity,
    })),
    notes: source.explanationLines.slice(0, 3),
    publishedAt: record.publishedAt ?? null,
  };
}
