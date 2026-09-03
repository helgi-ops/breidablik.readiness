"use client";

/**
 * A one-line "this page vs the others" orienting note, for surfaces coaches confuse
 * (Power Curve Intelligence / Player Match Movement / Player Game Report). Muted, sits under
 * the page title. Descriptive only.
 */

import { useLang } from "@/lib/lang";

export default function PageCrossRef({ en, is, className = "" }: { en: string; is: string; className?: string }) {
  const [lang] = useLang();
  return (
    <p className={`mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-500 ${className}`}>
      {lang === "IS" ? is : en}
    </p>
  );
}
