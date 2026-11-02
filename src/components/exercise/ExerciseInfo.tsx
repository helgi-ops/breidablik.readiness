"use client";

/**
 * ExerciseInfo — a small info-icon button that toggles a popover with the
 * exercise's explanation (execution + key points + target). Language-aware:
 * shows the Icelandic description when the UI is in IS, English otherwise,
 * falling back to whichever exists. Renders nothing when there is no text.
 *
 * Reused on both the trainer (PlanBuilder) and client (today session) surfaces.
 */

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { useLang } from "@/lib/lang";
import { splitDescription } from "@/lib/exercise/descriptionBullets";

/** Only allow well-formed http(s) links (e.g. a YouTube demo). */
function safeHttpUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

/** Extract a YouTube video id from watch / youtu.be / shorts / embed URLs.
 *  Returns null for non-YouTube URLs (then we fall back to a plain link). */
function youtubeId(u: string): string | null {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const m = url.pathname.match(/^\/(?:embed|shorts|v)\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  } catch { return null; }
}

export default function ExerciseInfo({
  name,
  description,
  descriptionIs,
  videoUrl,
  className = "",
}: {
  name?: string;
  description?: string | null;
  descriptionIs?: string | null;
  videoUrl?: string | null;
  className?: string;
}) {
  const [lang] = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const text = (lang === "IS" ? descriptionIs : description) || description || descriptionIs || null;
  const video = safeHttpUrl(videoUrl);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!text && !video) return null;

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        aria-label={lang === "IS" ? "Útskýring á æfingu" : "Exercise explanation"}
        aria-expanded={open}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          className={`absolute left-1/2 top-7 z-50 ${video ? "w-72" : "w-64"} -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl`}
          onClick={(e) => e.stopPropagation()}
        >
          {name && <div className="mb-1 text-xs font-semibold text-slate-900">{name}</div>}
          {text && (() => {
            const bullets = splitDescription(text);
            return bullets.length > 1
              ? <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-slate-600">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
              : <div className="text-xs leading-relaxed text-slate-600">{text}</div>;
          })()}
          {video && (() => {
            const id = youtubeId(video);
            if (id) {
              // Embedded player (16:9). youtube-nocookie + lazy; only mounts when
              // the popover is open, so it's not loaded for every exercise.
              return (
                <div className={`${text ? "mt-2" : ""} aspect-video w-full overflow-hidden rounded-md bg-black`}>
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
                    title={name ?? (lang === "IS" ? "Myndband" : "Video")}
                    className="h-full w-full"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                  />
                </div>
              );
            }
            // Non-YouTube URL → keep the plain link.
            return (
              <a
                href={video}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 ${text ? "mt-2" : ""}`}
              >
                ▶ {lang === "IS" ? "Horfa á myndband" : "Watch video"}
              </a>
            );
          })()}
        </div>
      )}
    </span>
  );
}
