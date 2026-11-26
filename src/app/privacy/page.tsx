"use client";

/**
 * /privacy — the full-text version of the data-processing summary a player
 * consents to at app open. Same source (DataProcessingSummary) so the two never
 * drift. Public + linkable (opened from the consent prompt).
 *
 * Two audiences: players at a club (default) and clients of a personal trainer
 * (?for=client — the /client app's consent prompt links here). Trainers and
 * practices have their own notice at /privacy/practices.
 */

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/lang";
import { DataProcessingSummary } from "@/components/legal/DataProcessingSummary";
import { CURRENT_POLICY_VERSION } from "@/lib/legal/policyVersion";
import { OPERATOR, OPERATOR_DETAILS_FILLED, PT_SELF_SERVE_PUBLIC } from "@/lib/legal/operator";

export default function PrivacyPage() {
  return (
    <Suspense fallback={null}>
      <PrivacyInner />
    </Suspense>
  );
}

function PrivacyInner() {
  const [lang, setLang] = useLang();
  const isIS = lang === "IS";
  const router = useRouter();
  const audience = useSearchParams().get("for") === "client" ? "pt" : "club";
  const setAudience = (a: "club" | "pt") => router.replace(a === "pt" ? "/privacy?for=client" : "/privacy", { scroll: false });
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {isIS ? "Friðhelgi" : "Privacy"}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900">
            {isIS ? "Persónuvernd og gagnavinnsla" : "Privacy & data processing"}
          </h1>
          <div className="mt-1 text-[11px] text-zinc-400">
            {isIS ? "Útgáfa" : "Version"} {CURRENT_POLICY_VERSION}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLang(isIS ? "EN" : "IS")}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
        >
          {isIS ? "EN" : "IS"}
        </button>
      </div>

      <div role="tablist" aria-label={isIS ? "Fyrir hvern" : "Who this is for"} className="mb-4 flex gap-1 rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
        {([
          ["club", isIS ? "Leikmenn félaga" : "Club players"],
          ["pt", isIS ? "Viðskiptavinir einkaþjálfara" : "Personal-trainer clients"],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={audience === k} onClick={() => setAudience(k)}
            className={`flex-1 rounded-lg px-3 py-2 ${audience === k ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"}`}>
            {label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm leading-relaxed text-zinc-600">
        {isIS
          ? "Þetta er yfirlit yfir hvaða gögn appið vinnur, til hvers, hverjir sjá þau og hver réttindi þín eru. Þú gefur samþykki við fyrstu opnun og getur afturkallað það hvenær sem er undir „Friðhelgi“ í appinu."
          : "This summarises what data the app processes, why, who can see it, and what your rights are. You give consent at first open and can revoke it at any time under “Privacy” in the app."}
      </p>

      <DataProcessingSummary lang={isIS ? "IS" : "EN"} variant={audience} />

      <p className="mt-6 border-t border-zinc-200 pt-4 text-[12px] leading-relaxed text-zinc-400">
        {isIS
          ? "Vinnslan fer fram samkvæmt lögum nr. 90/2018 um persónuvernd og reglugerð (ESB) 2016/679 (GDPR). Hafðu samband við liðið þitt eða rekstraraðila MicroPulse vegna nánari upplýsinga eða beiðna um gögnin þín."
          : "Processing is carried out under Icelandic Act 90/2018 and Regulation (EU) 2016/679 (GDPR). Contact your club or the MicroPulse operator for further information or data requests."}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
        {/* Company name + address only once filled in (no "[…]" placeholders on a public page). */}
        {OPERATOR_DETAILS_FILLED ? (
          <>{isIS ? "Rekstraraðili MicroPulse" : "MicroPulse is operated by"}: {OPERATOR.name}, {OPERATOR.address} ·{" "}</>
        ) : (
          <>{isIS ? "Hafðu samband" : "Contact"}:{" "}</>
        )}
        <span className="select-all">{OPERATOR.supportEmail}</span>
      </p>
      {PT_SELF_SERVE_PUBLIC && (
        <p className="mt-2 text-[12px] text-zinc-500">
          {isIS ? "Ertu þjálfari eða rekur stofu?" : "Are you a trainer or run a practice?"}{" "}
          <Link href="/privacy/practices" className="font-semibold text-primary hover:underline">
            {isIS ? "Persónuvernd og vinnsla fyrir stofur →" : "Privacy and data processing for practices →"}
          </Link>
        </p>
      )}
    </main>
  );
}
