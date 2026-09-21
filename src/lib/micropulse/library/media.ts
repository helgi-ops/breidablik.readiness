/**
 * Coaching Library — media (video / image / doc) helpers + loader.
 *
 * Pure helpers (kind detection, YouTube id, filtering) plus an I/O loader that resolves
 * an uploaded object's storage_path → a short-lived signed URL (mirrors
 * movementScreen/loader.ts). external_url links pass through untouched.
 *
 * Content/knowledge surface — nothing here reads or writes the readiness colour, the
 * load target, or the daily decision. Signed URLs expire (3600 s) and are never logged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const COACH_LIBRARY_BUCKET = "coach-library-media";
const SIGNED_URL_TTL_SECONDS = 3600;

export type MediaKind = "video" | "image" | "doc";
export type MediaOwnerType = "coach" | "team";

/** A coach_media row as stored. */
export interface CoachMediaRow {
  id: string;
  owner_type: MediaOwnerType;
  owner_coach_id: string | null;
  team_id: string | null;
  title: string;
  kind: MediaKind;
  external_url: string | null;
  storage_path: string | null;
  tags: string[];
  drill_id: string | null;
  note: string | null;
  created_at: string;
}

/** A media row resolved for display — a playable/openable URL, whatever the source. */
export interface ResolvedMedia extends Omit<CoachMediaRow, "storage_path"> {
  /** Signed URL (uploaded) or the external link. Null if an uploaded object could not be signed. */
  url: string | null;
  /** True when the URL is a private, expiring signed URL (uploaded object). */
  uploaded: boolean;
  /** For a YouTube/Vimeo link, the id for a thumbnail/embed; null otherwise. */
  youtubeId: string | null;
}

/** Extract a YouTube video id from the common URL shapes; null if not YouTube. Pure. */
export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ??
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ??
    url.match(/youtube\.com\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Best-guess media kind from an external URL (used to pre-fill the add-by-link form). Pure. */
export function detectMediaKindFromUrl(url: string | null | undefined): MediaKind {
  if (!url) return "video";
  const u = url.toLowerCase();
  if (youTubeId(url) || /vimeo\.com|\.(mp4|mov|webm|m4v)(\?|$)/.test(u)) return "video";
  if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(u)) return "image";
  if (/\.(pdf|docx?|pptx?|xlsx?|csv|txt)(\?|$)/.test(u)) return "doc";
  return "video";
}

/**
 * Filter a media list by a free-text query, kind, tag, and/or linked drill. Pure —
 * powers the Videos view search and the cross-tab library search. Case-insensitive.
 */
/** The fields filterMedia/collectTags read — satisfied by both CoachMediaRow and ResolvedMedia. */
export type MediaFilterable = { title: string; note: string | null; tags: string[]; kind: MediaKind; drill_id: string | null };

export function filterMedia<T extends MediaFilterable>(
  rows: T[],
  opts: { q?: string; kind?: MediaKind | "all"; tag?: string | null; drillId?: string | null } = {},
): T[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  const tag = (opts.tag ?? "").trim().toLowerCase();
  return (rows ?? []).filter((r) => {
    if (opts.kind && opts.kind !== "all" && r.kind !== opts.kind) return false;
    if (opts.drillId && r.drill_id !== opts.drillId) return false;
    if (tag && !(r.tags ?? []).some((x) => x.toLowerCase() === tag)) return false;
    if (q) {
      const hay = `${r.title} ${r.note ?? ""} ${(r.tags ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** All distinct tags across a media list, sorted — for the filter chips. Pure. */
export function collectTags(rows: Array<{ tags: string[] }>): string[] {
  const set = new Set<string>();
  for (const r of rows ?? []) for (const tRaw of r.tags ?? []) { const x = tRaw.trim(); if (x) set.add(x); }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Resolve a single uploaded object path → a short-lived signed URL. Null on any failure. */
export async function signMediaPath(sb: SupabaseClient, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await sb.storage.from(COACH_LIBRARY_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Resolve stored rows for display: sign uploaded objects, pass links through. */
export async function resolveMediaRows(sb: SupabaseClient, rows: CoachMediaRow[]): Promise<ResolvedMedia[]> {
  return Promise.all(
    (rows ?? []).map(async (r) => {
      const uploaded = !r.external_url && !!r.storage_path;
      const url = uploaded ? await signMediaPath(sb, r.storage_path) : r.external_url ?? null;
      const { storage_path: _drop, ...rest } = r;
      void _drop;
      return { ...rest, url, uploaded, youtubeId: youTubeId(r.external_url) };
    }),
  );
}
