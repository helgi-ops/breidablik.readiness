"use client";
/**
 * Citation text with each "Author Year" made tappable: a tap opens the full reference (authors, title, journal,
 * DOI / PubMed link), or says why the citation is not confirmed. The text itself reads as before.
 *
 * The reference registry (references/ruleRefs.ts) is large, so it loads only when a coach opens a citation.
 */
import { Fragment, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { citationMatches } from "@/lib/micropulse/references/citationScan";
import type { GoalRef } from "@/lib/micropulse/goalPlan/types";

type RefsModule = typeof import("@/lib/micropulse/references/ruleRefs");
let refsModule: Promise<RefsModule> | null = null;
const loadRefs = () => (refsModule ??= import("@/lib/micropulse/references/ruleRefs"));

type Lookup = { ref: GoalRef | null; unresolved: { en: string; is: string } | null };

function links(cite: string): Array<{ label: string; href: string }> {
  const out: Array<{ label: string; href: string }> = [];
  const doi = cite.match(/doi:\s*(10\.\S+?)(?=[\s;,]|\.?$)/i)?.[1];
  const pmid = cite.match(/PMID:?\s*(\d+)/)?.[1];
  if (doi) out.push({ label: "DOI", href: `https://doi.org/${doi}` });
  if (pmid) out.push({ label: "PubMed", href: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` });
  return out;
}

function CiteChip({ short, label, is }: { short: string; label: string; is: boolean }) {
  const [found, setFound] = useState<Lookup | null>(null);
  const T = (en: string, isText: string) => (is ? isText : en);
  const open = (o: boolean) => {
    if (!o || found) return;
    loadRefs()
      .then((m) => {
        const ref = m.findRefByShort(short);
        setFound({ ref, unresolved: ref ? null : m.unresolvedReason(short) });
      })
      .catch(() => setFound({ ref: null, unresolved: null }));
  };
  return (
    <Popover onOpenChange={open}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-[var(--primary,#2740e6)]"
          aria-label={T(`Full reference for ${short}`, `Full heimild fyrir ${short}`)}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[90vw] p-3 text-xs leading-relaxed" align="start">
        {!found ? (
          <p className="text-slate-500">{T("Loading reference…", "Sæki heimild…")}</p>
        ) : found.ref ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{T("Reference", "Heimild")}</p>
            <p className="text-slate-800">{found.ref.cite.replace(/\s*(doi:\s*\S+|PMID:?\s*\d+)/gi, "").trim()}</p>
            <div className="flex flex-wrap items-center gap-3">
              {links(found.ref.cite).map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--primary,#2740e6)] underline">
                  {l.label}
                </a>
              ))}
              <span className="text-slate-500">
                {found.ref.verifiedFrom === "full_text"
                  ? T("Checked against the full paper", "Borið saman við alla greinina")
                  : found.ref.verifiedFrom === "record"
                    ? T("Checked against the record (no abstract)", "Borið saman við skráningu (ekkert ágrip)")
                    : T("Checked against the abstract", "Borið saman við ágripið")}
              </span>
            </div>
          </div>
        ) : found.unresolved ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">{T("Not confirmed", "Óstaðfest")}</p>
            <p className="text-slate-700">{is ? found.unresolved.is : found.unresolved.en}</p>
          </div>
        ) : (
          <p className="text-slate-600">{T("This citation is not in the reference list yet.", "Þessi tilvísun er ekki enn í heimildaskránni.")}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Renders `text` with each citation tappable; text without a citation renders unchanged. */
export function CiteRefs({ text, is, className }: { text: string | null | undefined; is: boolean; className?: string }): ReactNode {
  if (!text) return null;
  const hits = citationMatches(text);
  if (hits.length === 0) return className ? <span className={className}>{text}</span> : text;
  const parts: ReactNode[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    if (h.index > at) parts.push(<Fragment key={`t${i}`}>{text.slice(at, h.index)}</Fragment>);
    parts.push(<CiteChip key={`c${i}`} short={h.short} label={text.slice(h.index, h.index + h.length)} is={is} />);
    at = h.index + h.length;
  });
  if (at < text.length) parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <span className={className}>{parts}</span>;
}
