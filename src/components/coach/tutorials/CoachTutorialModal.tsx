"use client";

/**
 * CoachTutorialModal — the "How to use this page" overlay. Opened from a page's
 * header (PagePurpose) or the Today tab bar. Renders one tutorial from
 * tutorialCopy in the coach's current language: title → intro → optional overview
 * video (iframe) → sections. Same overlay shell as MovementNarrativeModal
 * (backdrop-click + ESC + ✕ to close). Content only — no data fetching.
 */

import { useEffect } from "react";
import { useLang } from "@/lib/lang";
import { TUTORIALS, type TutorialSlug } from "./tutorialCopy";

export default function CoachTutorialModal({ slug, onClose }: { slug: TutorialSlug; onClose: () => void }) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const t = TUTORIALS[slug];

  // ESC closes (mirrors HomeVideo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!t) return null;
  const pick = (b: { en: string; is: string }) => (IS ? b.is : b.en);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {IS ? "Hvernig á að nota" : "How to use"}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{pick(t.title)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={IS ? "Loka" : "Close"}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {t.intro ? <p className="mb-4 text-sm leading-relaxed text-slate-600">{pick(t.intro)}</p> : null}

        {t.videoEmbedUrl ? (
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-200" style={{ position: "relative", paddingTop: "56.25%" }}>
            <iframe
              src={t.videoEmbedUrl}
              title={pick(t.title)}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : null}

        <div className="space-y-4">
          {t.sections.map((s, i) => (
            <section key={i}>
              <h3 className="text-sm font-semibold text-slate-800">{pick(s.heading)}</h3>
              <div className="mt-1 space-y-1.5">
                {s.body.map((p, j) => (
                  <p key={j} className="text-[13px] leading-relaxed text-slate-600">{pick(p)}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {IS ? "Loka" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
