"use client";

/**
 * /coach/basketball-stats — Hudl / InStat basketball ingestion.
 *
 * Upload the free InStat Game Report PDF (team totals + per-quarter + Four
 * Factors, both sides) and/or the InStat CSV/Excel table (per-player box score +
 * advanced). InStat is a descriptive SOURCE (source='instat') — box-score
 * baskethotel stays canonical. Nothing here touches the readiness colour, load,
 * or the daily decision.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import InstatBasketballUpload from "@/components/coach/InstatBasketballUpload";
import { useLang } from "@/lib/lang";

export default function BasketballStatsPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-bold text-slate-800">{is ? "Körfubolti — InStat tölur" : "Basketball — InStat stats"}</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
        {is
          ? "Bættu InStat/Hudl gögnum við box-score-inn: advanced tölur, Four Factors og leikhluta. Lýsandi dýpt fyrir Season / Player / Opponent greininguna — aldrei readiness-merki."
          : "Layer InStat/Hudl data on top of the box score: advanced metrics, Four Factors and per-quarter splits. Descriptive depth for Season / Player / Opponent analysis — never a readiness signal."}
      </p>
      <div className="mt-5">
        <InstatBasketballUpload />
      </div>
    </div>
  );
}
