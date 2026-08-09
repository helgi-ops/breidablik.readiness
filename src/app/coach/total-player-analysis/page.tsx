"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/total-player-analysis — the footballer + athlete hub, its own page.
 *
 * Two SEPARATE labelled reads (never blended): as a footballer (per-90 percentiles) and
 * as an athlete (GPS/VALD/VBT position-percentiles), plus the cross-links, a written
 * coach read (AI-labelled), "how to improve the weak areas", and a downloadable PDF.
 * Performance-only — nothing here touches the readiness colour, load, or the daily
 * decision. Hidden for no-GPS / basketball teams (both axes would be empty).
 */

import * as React from "react";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import TotalPlayerProfile from "@/components/coach/TotalPlayerProfile";

export default function TotalPlayerAnalysisPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Heildar leikmannagreining" : "Total Player Analysis"}</h1>
      <PagePurpose
        tutorial="total-player-analysis"
        en="One player, two reads — as a footballer and as an athlete — never blended. Strengths, weaknesses and how they translate onto the pitch, plus how to improve the gaps. Descriptive context; it never changes the readiness verdict."
        is="Einn leikmaður, tveir lestrar — sem fótboltamaður og sem íþróttamaður — aldrei blandað. Styrkleikar, veikleikar og hvernig þeir skila sér á völlinn, ásamt hvernig má bæta götin. Lýsandi samhengi; breytir aldrei readiness-dómnum."
      />
      <div className="mt-4">
        <TotalPlayerProfile />
      </div>
    </div>
  );
}
