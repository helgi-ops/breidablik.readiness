"use client";

/**
 * /coach/win-factors — "How this league is won" (basketball, league-level).
 * Explainability-first: verdict → plain facts → details. Sourced from the league's
 * FIBA LiveStats team boxes. Descriptive — never touches the readiness colour.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import WinFactorsCard from "@/components/coach/WinFactorsCard";

export default function WinFactorsPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900">{is ? "Hvað vinnur deildina" : "League Win Factors"}</h1>
      <PagePurpose
        en="see what actually wins games in a league — and turn it into a game plan."
        is="sjá hvað vinnur í raun leiki í deild — og breyta því í leikáætlun."
      />
      <div className="mt-4">
        <WinFactorsCard />
      </div>
    </div>
  );
}
