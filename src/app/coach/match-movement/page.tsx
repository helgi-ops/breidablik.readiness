"use client";

import { useState } from "react";
import MatchMovementComparison from "@/components/coach/MatchMovementComparison";
import PagePurpose from "@/components/coach/PagePurpose";
import { useLang } from "@/lib/lang";

export default function MatchMovementPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  // The comparison owns the selected player; the 1st-vs-2nd-half fade card moved to
  // Season Match Analysis (it's a season-wide aggregate, not a match-to-match read).
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">{is ? "Leikmanna-hreyfing" : "Player Match Movement"}</h1>
        <PagePurpose
          en="compare how a player moved across matches — his movement signature, match to match (IMA driver on Pro, GPS movement on Lite)"
          is="berðu saman hvernig leikmaður hreyfði sig milli leikja — hreyfi-einkenni hans (IMA driver á Pro, GPS-hreyfing á Lite)"
          tutorial="match-movement"
        />
        <p className="mt-1 text-xs text-slate-500">Buchheit 2014 · McBurnie 2022 · di Prampero 2015</p>
      </div>
      <MatchMovementComparison
        selectedPlayerId={selectedPlayerId}
        onSelectPlayer={setSelectedPlayerId}
      />
    </div>
  );
}
