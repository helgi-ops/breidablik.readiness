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
import { getSupabaseClient } from "@/lib/supabaseClient";
import PagePurpose from "@/components/coach/PagePurpose";
import PageCrossRef from "@/components/coach/PageCrossRef";
import TotalPlayerProfile from "@/components/coach/TotalPlayerProfile";
import FormVsStatePanel from "@/components/coach/FormVsStatePanel";
import BasketballTotalPlayerAnalysis from "@/components/coach/BasketballTotalPlayerAnalysis";

export default function TotalPlayerAnalysisPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  // The profile owns the player picker; the Form vs State section below follows the same selection.
  const [selPlayer, setSelPlayer] = React.useState<string>("");
  const [sport, setSport] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token; if (!tok) return;
      const res = await fetch("/api/coach/player-stats/config", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) { const j = await res.json(); setSport(j.sport); }
    })();
  }, []);
  const isBasketball = String(sport ?? "").toLowerCase() === "basketball";
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Heildar leikmannagreining" : "Total Player Analysis"}</h1>
      <PagePurpose
        tutorial="total-player-analysis"
        en={isBasketball
          ? "One player, two reads — production (box-score percentiles vs the squad) and style (how they generate offence) — never blended, plus an archetype. Descriptive context; it never changes the readiness verdict."
          : "One player, two reads — as a footballer and as an athlete — never blended. Strengths, weaknesses and how they translate onto the pitch, plus how to improve the gaps. Descriptive context; it never changes the readiness verdict."}
        is={isBasketball
          ? "Einn leikmaður, tveir lestrar — framlag (box-score percentílar vs liðið) og stíll (hvernig hann/hún skapar sókn) — aldrei blandað, plús erkitýpa. Lýsandi samhengi; breytir aldrei readiness-dómnum."
          : "Einn leikmaður, tveir lestrar — sem fótboltamaður og sem íþróttamaður — aldrei blandað. Styrkleikar, veikleikar og hvernig þeir skila sér á völlinn, ásamt hvernig má bæta götin. Lýsandi samhengi; breytir aldrei readiness-dómnum."}
      />
      {!isBasketball ? (
        <PageCrossRef
          en="This page: the whole player — footballer AND athlete (two radars, never blended) + how to improve the gaps. For just his season match-stats vs the squad → Player Season Analysis. For one game in depth → Single Match Analysis."
          is="Þessi síða: allur leikmaðurinn — fótboltamaður OG íþróttamaður (tveir radarar, aldrei blandað) + hvernig má bæta götin. Fyrir bara tímabils-tölfræðina vs liðið → Leikmanna-tímabilsgreining. Fyrir einn leik í dýpt → Stakur leikur."
        />
      ) : null}
      <div className="mt-4">
        {isBasketball ? <BasketballTotalPlayerAnalysis /> : <TotalPlayerProfile onPlayerChange={setSelPlayer} />}
      </div>
      {/* Form vs State — football temporal + attribution read; basketball has its own two-axis read above. */}
      {!isBasketball ? <FormVsStatePanel playerId={selPlayer || undefined} /> : null}
    </div>
  );
}
