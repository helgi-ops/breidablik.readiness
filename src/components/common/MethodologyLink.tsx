"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang";

/**
 * "Why this number? →" — links a threshold to its basis on /methodology.
 * Optional caveat renders a one-line honesty note (e.g. the ACWR debate).
 * Keeps the manifesto promise: every threshold is one tap from its source.
 */
export default function MethodologyLink({ caveat }: { caveat?: { EN: string; IS: string } }) {
  const [lang] = useLang();
  const IS = lang === "IS";
  return (
    <span className="mt-1 block text-[11px] leading-snug text-slate-400">
      {caveat ? <span className="text-amber-700">{IS ? caveat.IS : caveat.EN} </span> : null}
      <Link href="/methodology" className="underline decoration-dotted hover:text-slate-600">
        {IS ? "Af hverju þessi tala? →" : "Why this number? →"}
      </Link>
    </span>
  );
}
