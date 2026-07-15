"use client";

/**
 * /privacy — the full-text version of the data-processing summary a player
 * consents to at app open. Same source (DataProcessingSummary) so the two never
 * drift. Public + linkable (opened from the consent prompt).
 */

import { useLang } from "@/lib/lang";
import { DataProcessingSummary } from "@/components/legal/DataProcessingSummary";

export default function PrivacyPage() {
  const [lang, setLang] = useLang();
  const isIS = lang === "IS";
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
        </div>
        <button
          type="button"
          onClick={() => setLang(isIS ? "EN" : "IS")}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
        >
          {isIS ? "EN" : "IS"}
        </button>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-zinc-600">
        {isIS
          ? "Þetta er yfirlit yfir hvaða gögn appið vinnur, til hvers, hverjir sjá þau og hver réttindi þín eru. Þú gefur samþykki við fyrstu opnun og getur afturkallað það hvenær sem er undir „Friðhelgi“ í appinu."
          : "This summarises what data the app processes, why, who can see it, and what your rights are. You give consent at first open and can revoke it at any time under “Privacy” in the app."}
      </p>

      <DataProcessingSummary lang={isIS ? "IS" : "EN"} />

      <p className="mt-6 border-t border-zinc-200 pt-4 text-[12px] leading-relaxed text-zinc-400">
        {isIS
          ? "Vinnslan fer fram samkvæmt lögum nr. 90/2018 um persónuvernd og reglugerð (ESB) 2016/679 (GDPR). Hafðu samband við liðið þitt eða rekstraraðila MicroPulse vegna nánari upplýsinga eða beiðna um gögnin þín."
          : "Processing is carried out under Icelandic Act 90/2018 and Regulation (EU) 2016/679 (GDPR). Contact your club or the MicroPulse operator for further information or data requests."}
      </p>
    </main>
  );
}
