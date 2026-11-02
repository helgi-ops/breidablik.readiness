"use client";

/**
 * ExerciseVideo — a demo clip embedded directly on the screen, for places where
 * one exercise fills the view. YouTube plays inline; any other link becomes a
 * plain link; no video renders nothing.
 */

import { safeHttpUrl, youtubeId } from "./ExerciseInfo";

export default function ExerciseVideo({ name, url, lang }: { name: string; url?: string | null; lang: "IS" | "EN" }) {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  const id = youtubeId(safe);
  if (!id) {
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-sm font-medium text-primary">
        {lang === "IS" ? "Horfa á myndband" : "Watch video"}
      </a>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`}
        title={name}
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
