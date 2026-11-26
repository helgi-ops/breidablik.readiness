"use client";

/**
 * A legal text page (terms, privacy for practices): EN/IS, numbered sections,
 * version line, operator contact at the end. Sections are plain data so the
 * texts stay easy for a lawyer to read and edit.
 */

import Link from "next/link";
import { useLang, type Lang } from "@/lib/lang";
import { OPERATOR } from "@/lib/legal/operator";

export type LegalSection = { h: string; p?: string[]; list?: string[] };
export type LegalText = { eyebrow: string; title: string; intro: string; sections: LegalSection[] };

export default function LegalDocument({
  text, version, related,
}: {
  text: Record<Lang, LegalText>;
  version: string;
  related: Array<{ href: string; label: Record<Lang, string> }>;
}) {
  const [lang, setLang] = useLang();
  const t = text[lang];
  const is = lang === "IS";
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.eyebrow}</div>
            <h1 className="mt-0.5 text-balance font-display text-3xl font-extrabold tracking-tight text-slate-900">{t.title}</h1>
            <div className="mt-1 text-[12px] text-slate-500">{is ? "Útgáfa" : "Version"} {version}</div>
          </div>
          <div role="group" aria-label={is ? "Tungumál" : "Language"} className="flex shrink-0 rounded-lg bg-slate-200/70 p-0.5 text-xs font-semibold">
            {(["EN", "IS"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`min-h-7 rounded-md px-2 ${lang === l ? "bg-card text-slate-900" : "text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </div>

        <p className="text-[15px] leading-relaxed text-slate-700">{t.intro}</p>

        <ol className="mt-6 space-y-6">
          {t.sections.map((s, i) => (
            <li key={s.h} className="min-w-0">
              <h2 className="font-display text-lg font-bold text-slate-900">{i + 1}. {s.h}</h2>
              {s.p?.map((para) => <p key={para} className="mt-1.5 text-[15px] leading-relaxed text-slate-700">{para}</p>)}
              {s.list && (
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-slate-700">
                  {s.list.map((li) => <li key={li}>{li}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-xl border border-slate-200 bg-card p-4 text-[13px] leading-relaxed text-slate-600">
          <div className="font-semibold text-slate-900">{OPERATOR.name}</div>
          <div>{is ? "Kennitala" : "Company ID"}: {OPERATOR.companyId} · {OPERATOR.address}</div>
          <div><span className="select-all">{OPERATOR.supportEmail}</span></div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
          {related.map((r) => (
            <Link key={r.href} href={r.href} className="font-semibold text-primary hover:underline">{r.label[lang]} →</Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
