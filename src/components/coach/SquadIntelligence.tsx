"use client";

/**
 * Squad Intelligence — the readiness/engine-trust lens for the squad, mounted as the
 * first tab of the Load Intelligence hub. It is the S&C drill-down counterpart to the
 * Today command center's squad verdict: "how is the decision engine doing?" (verdict
 * accuracy) + "where have I overridden it?" (override history).
 *
 * Readiness-based — NO GPS — so the hub renders it for every team, including no-GPS /
 * Lite (it is exempt from the hub's tier-gating). Both cards are self-contained: they
 * resolve their own team from auth and take only `lang`. Descriptive review surface —
 * never writes or re-derives the readiness colour.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";
import OverrideHistoryCard from "@/components/coach/OverrideHistoryCard";
import VerdictAccuracyCard from "@/components/coach/VerdictAccuracyCard";

export default function SquadIntelligence() {
  const [lang] = useLang();
  const isEN = lang !== "IS";

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-slate-900">
          {isEN ? "Squad Intelligence" : "Liðsgreining"}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {isEN
            ? "How the readiness engine is performing for your squad, and where you've overridden it — the review behind today's verdicts. Readiness-based, so it's here for every team."
            : "Hvernig readiness-vélin stendur sig fyrir hópinn þinn, og hvar þú hefur yfirstýrt henni — rýnin á bak við mat dagsins. Byggt á readiness, svo það er hér fyrir öll lið."}
        </p>
      </header>

      <VerdictAccuracyCard lang={isEN ? "EN" : "IS"} />
      <OverrideHistoryCard lang={isEN ? "EN" : "IS"} />
    </div>
  );
}
