"use client";

/**
 * CoachTutorialButton — a self-contained "How to use" trigger: holds its own open
 * state and renders CoachTutorialModal. Used where there's no PagePurpose to hang
 * the link on (e.g. the Today tab bar). Styling defaults to a pill matching the
 * surrounding header actions; override via `className`.
 */

import { useState } from "react";
import { useLang } from "@/lib/lang";
import CoachTutorialModal from "./CoachTutorialModal";
import type { TutorialSlug } from "./tutorialCopy";

const DEFAULT_CLASS =
  "mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";

export default function CoachTutorialButton({
  slug,
  className,
  label,
  icon = "❓",
}: {
  slug: TutorialSlug;
  className?: string;
  /** Override the default "How to use" label — e.g. "How MicroPulse works". */
  label?: { en: string; is: string };
  /** Leading glyph (default ❓). */
  icon?: string;
}) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? DEFAULT_CLASS}>
        <span aria-hidden>{icon}</span>
        {label ? (IS ? label.is : label.en) : IS ? "Hvernig á að nota" : "How to use"}
      </button>
      {open ? <CoachTutorialModal slug={slug} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
