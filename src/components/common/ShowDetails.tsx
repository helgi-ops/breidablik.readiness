"use client";

import type { ReactNode } from "react";
import { useLang } from "@/lib/lang";

type TX = { EN: string; IS: string };

/**
 * Progressive-disclosure wrapper. Keeps raw numbers / tables / jargon OPT-IN
 * behind a native <details> toggle so the default view stays answer-first (a
 * coach reads the verdict; the data waits until they ask). Bilingual.
 *
 * Uses native <details> — zero JS, keyboard-accessible, works in print.
 */
export default function ShowDetails({
  children,
  label,
  hint,
  className = "",
}: {
  children: ReactNode;
  label?: TX;
  hint?: TX;
  className?: string;
}) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const summaryText = label ? (IS ? label.IS : label.EN) : IS ? "Sýna gögn" : "Show details";
  return (
    <details className={`mt-3 rounded-xl border border-slate-200 bg-white ${className}`}>
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-slate-700">
        {summaryText} ▾
        {hint ? <span className="ml-1.5 text-xs font-normal text-slate-400">{IS ? hint.IS : hint.EN}</span> : null}
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}
