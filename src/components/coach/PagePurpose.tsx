"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang";
import CoachTutorialModal from "@/components/coach/tutorials/CoachTutorialModal";
import type { TutorialSlug } from "@/components/coach/tutorials/tutorialCopy";

/**
 * PagePurpose — a one-line "use this to …" subtitle that sits directly under a
 * coach page's title.
 *
 * Operationalises the explainability-first manifesto: a coach facing ~40 sidebar
 * items should be able to tell, in plain language, what question each page
 * answers — without opening it. The `en`/`is` props complete the sentence
 * "Use this to {…}", e.g. en="see who is absorbing the most braking load".
 *
 * Optionally pass `tutorial` (a TutorialSlug) to render a small "How to use this
 * page" link beside the subtitle that opens the page's tutorial overlay. The link
 * only appears when a slug is given, so existing call sites are unaffected.
 */
export default function PagePurpose({
  en,
  is,
  tutorial,
}: {
  en: string;
  is: string;
  tutorial?: TutorialSlug;
}) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <p className="text-[13px] leading-snug text-slate-500">
        <span className="text-slate-400">{IS ? "Notaðu þetta til að " : "Use this to "}</span>
        {IS ? is : en}
      </p>
      {tutorial ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[12px] font-medium text-[#2740e6] hover:underline"
          >
            {IS ? "Hvernig á að nota þessa síðu →" : "How to use this page →"}
          </button>
          {open ? <CoachTutorialModal slug={tutorial} onClose={() => setOpen(false)} /> : null}
        </>
      ) : null}
    </div>
  );
}
