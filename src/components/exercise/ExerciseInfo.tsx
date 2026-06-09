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

/** Only allow well-formed http(s) links (e.g. a YouTube demo). */
function safeHttpUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
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
          className="absolute left-1/2 top-7 z-50 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {name && <div className="mb-1 text-xs font-semibold text-slate-900">{name}</div>}
          {text && <div className="text-xs leading-relaxed text-slate-600">{text}</div>}
          {video && (
            <a
              href={video}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 ${text ? "mt-2" : ""}`}
            >
              ▶ {lang === "IS" ? "Horfa á myndband" : "Watch video"}
            </a>
          )}
        </div>
      )}
    </span>
  );
}
