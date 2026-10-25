"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import LoadPlanCard from "@/components/coach/LoadPlanCard";
import OwenTaperCard from "@/components/coach/OwenTaperCard";
import PagePurpose from "@/components/coach/PagePurpose";
import { readRestDayPref, writeRestDayPref } from "@/lib/coach/restDayPref";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function LoadPlanPage() {
  const [date, setDate] = useState<string>("");
  const [restDay, setRestDay] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const effectiveDate = date || today;

  // The Owen-2017 GPS volume/intensity taper is GPS-specific — hide it for a basketball (no-GPS) team.
  const [isBasketball, setIsBasketball] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        if (tok) { const res = await fetch("/api/coach/player-stats/config", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } }); if (res.ok) setIsBasketball(String((await res.json()).sport ?? "").toLowerCase() === "basketball"); }
      } catch { /* default football */ }
    })();
  }, []);

  // Restore the saved rest-day choice for the selected date (persists across
  // navigation and is shared with the Today dashboard download button).
  useEffect(() => {
    setRestDay(readRestDayPref(effectiveDate));
  }, [effectiveDate]);

  const toggleRestDay = (on: boolean) => {
    setRestDay(on);
    writeRestDayPref(effectiveDate, on);
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pre-Session Report</h1>
          <PagePurpose
            en="plan each day's target load for the week around the next match"
            is="skipuleggja markálag hvers dags vikunnar í kringum næsta leik"
          />
          <p className="text-sm text-slate-500">
            One detailed, sendable briefing for today: top attention (from check-ins), the recommended session type
            (mechanical / locomotive / mixed) and per-KPI load targets anchored to your match demand, acute:chronic
            context, per-player targets, an AI summary and a PDF to send to the team.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            title="Pick a day (empty = today)"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
          />
          <label className="flex h-9 cursor-pointer select-none items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700">
            <input type="checkbox" checked={restDay} onChange={(e) => toggleRestDay(e.target.checked)} className="h-4 w-4 accent-slate-700" />
            Rest day
          </label>
        </div>
      </div>
      <LoadPlanCard date={date || undefined} restDay={restDay} />
      {!isBasketball && <OwenTaperCard date={date || undefined} />}
    </div>
  );
}
