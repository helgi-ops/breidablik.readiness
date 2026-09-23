/**
 * Meeting PDF read schema + normalizer — pure.
 *
 * A coach uploads a PDF (an agenda, notes, a plan) to a meeting; a multimodal model reads it and
 * proposes the meeting's title / type / agenda / attendees / summary as an AI DRAFT the coach confirms.
 * This normalizer accepts ONLY those text fields — the read never invents anything structural — and
 * clamps the meeting type to the known enum. Pure, no I/O. Descriptive; never a readiness signal.
 */

export const MEETING_TYPES = ["staff", "team", "1to1", "video-review", "other"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export interface MeetingPdfRead {
  title: string | null;
  meetingType: MeetingType | null;
  agenda: string | null;
  attendees: string | null;
  summary: string | null;      // → prefill Minutes when empty
  confidence: "high" | "moderate" | "low";
}

const asStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const orNull = (s: string): string | null => (s.length ? s : null);

export function normalizeMeetingPdfRead(raw: unknown): MeetingPdfRead {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const typeRaw = asStr(o.meetingType).toLowerCase();
  const meetingType = (MEETING_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as MeetingType) : null;
  const conf = asStr(o.confidence).toLowerCase();
  return {
    title: orNull(asStr(o.title)),
    meetingType,
    agenda: orNull(asStr(o.agenda)),
    attendees: orNull(asStr(o.attendees)),
    summary: orNull(asStr(o.summary)),
    confidence: conf === "high" || conf === "low" ? (conf as "high" | "low") : "moderate",
  };
}
