/**
 * videoLink — parse a pasted video URL (YouTube or other) into a provider, id, thumbnail and embed URL.
 * Pure, no IO. YouTube thumbnails come straight from img.youtube.com (no API key), so a link alone is
 * enough to show a playable card. Used by the scouting page and the PDF.
 */
export type VideoLink = { provider: "youtube" | "other"; id: string | null; thumb: string | null; embed: string | null };

export function parseVideoLink(url: string | null | undefined): VideoLink {
  const u = String(url ?? "").trim();
  const m = /(?:youtube\.com\/(?:watch\?[^#]*\bv=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(u);
  if (m) {
    const id = m[1];
    return { provider: "youtube", id, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, embed: `https://www.youtube.com/embed/${id}` };
  }
  return { provider: "other", id: null, thumb: null, embed: null };
}
