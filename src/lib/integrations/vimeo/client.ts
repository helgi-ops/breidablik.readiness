/**
 * Vimeo read client — pulls a clip's METADATA (title, duration, chapters, description) through the
 * official Vimeo API with the account token. Text only: no video is downloaded, nothing is scraped,
 * and the footage is never interpreted (no computer vision). Used to "read" a scouting clip the coach
 * links, so chapter markers can pre-fill tagged clips. Descriptive scouting — never touches readiness.
 */

/** The account token, under any of the conventional names (set one on Vercel). */
export function vimeoToken(): string | null {
  return process.env.VIMEO_ACCESS_TOKEN || process.env.VIMEO_TOKEN || process.env.VIMEO_API_KEY || null;
}

/** Pull the video id (+ private hash for unlisted videos) out of any Vimeo URL form. */
export function parseVimeoRef(url: string): { id: string; hash: string | null } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname.replace(/^www\./, "") !== "vimeo.com" && u.hostname !== "player.vimeo.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | null = null, hash: string | null = u.searchParams.get("h");
  const vIdx = parts.indexOf("video"); if (vIdx >= 0 && parts[vIdx + 1]) id = parts[vIdx + 1];
  const mIdx = parts.indexOf("videos"); if (mIdx >= 0 && parts[mIdx + 1]) { id = parts[mIdx + 1]; if (parts[mIdx + 2]) hash = parts[mIdx + 2]; }
  if (!id && parts[0]) {
    const m = parts[0].match(/^(\d+)(?::([a-z0-9]+))?$/i);           // vimeo.com/<id> or /<id>:<hash>
    if (m) { id = m[1]; if (m[2]) hash = hash ?? m[2]; else if (/^[a-z0-9]+$/i.test(parts[1] ?? "")) hash = hash ?? parts[1] ?? null; } // /<id>/<hash>
  }
  if (id && id.includes(":")) { const [a, b] = id.split(":"); id = a; hash = hash ?? b ?? null; } // player.vimeo.com/video/<id>:<hash>
  if (!id || !/^\d+$/.test(id)) return null;
  return { id, hash };
}

export type VimeoChapter = { title: string; seconds: number };
export type VimeoClip = { id: string; title: string; description: string | null; durationSec: number | null; thumbnail: string | null; chapters: VimeoChapter[] };

const API = "https://api.vimeo.com";
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" });

/** Read one clip's metadata + chapters. `ref` is an id, or "id:hash" for an unlisted video. */
export async function fetchVimeoClip(ref: { id: string; hash: string | null }, token: string): Promise<VimeoClip | null> {
  const key = ref.hash ? `${ref.id}:${ref.hash}` : ref.id;
  const vRes = await fetch(`${API}/videos/${key}?fields=name,description,duration,pictures.sizes`, { headers: headers(token), cache: "no-store" });
  if (!vRes.ok) return null;
  const v = await vRes.json() as { name?: string; description?: string | null; duration?: number | null; pictures?: { sizes?: { link: string }[] } };

  let chapters: VimeoChapter[] = [];
  try {
    const cRes = await fetch(`${API}/videos/${key}/chapters?fields=title,timecode&per_page=100`, { headers: headers(token), cache: "no-store" });
    if (cRes.ok) {
      const c = await cRes.json() as { data?: { title?: string; timecode?: number }[] };
      chapters = (c.data ?? []).map((x) => ({ title: String(x.title ?? "").trim(), seconds: Math.max(0, Math.round(Number(x.timecode) || 0)) }));
    }
  } catch { /* chapters are optional */ }

  const sizes = v.pictures?.sizes ?? [];
  return {
    id: ref.id,
    title: String(v.name ?? "").trim(),
    description: v.description ? String(v.description).trim() : null,
    durationSec: typeof v.duration === "number" ? v.duration : null,
    thumbnail: sizes.length ? sizes[sizes.length - 1].link : null,
    chapters,
  };
}
