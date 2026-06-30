"use client";

import { useLang } from "@/lib/lang";

/**
 * PagePurpose — a one-line "use this to …" subtitle that sits directly under a
 * coach page's title.
 *
 * Operationalises the explainability-first manifesto: a coach facing ~40 sidebar
 * items should be able to tell, in plain language, what question each page
 * answers — without opening it. The `en`/`is` props complete the sentence
 * "Use this to {…}", e.g. en="see who is absorbing the most braking load".
 */
export default function PagePurpose({ en, is }: { en: string; is: string }) {
  const [lang] = useLang();
  const IS = lang === "IS";
  return (
    <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
      <span className="text-slate-400">{IS ? "Notaðu þetta til að " : "Use this to "}</span>
      {IS ? is : en}
    </p>
  );
}
