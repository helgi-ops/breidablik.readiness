"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import ProgressiveOverloadCard from "@/components/coach/ProgressiveOverloadCard";

export default function ProgressiveOverloadPage() {
  const [date, setDate] = useState<string>("");
  const [weeks, setWeeks] = useState<number>(5);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Progressive Overload — Build Plan</h1>
          <p className="text-sm text-slate-500">
            A preparation-phase ramp for every load KPI: a safe week-by-week build from the squad&apos;s current
            baseline toward match demand. Volume ramps faster than high-speed/sprint, every week is capped so the
            projected acute:chronic ratio stays ≤ 1.3, and no session is pushed past match load.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[11px] text-slate-500">
            Weeks
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="mt-0.5 h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
            >
              {[3, 4, 5, 6, 8].map((w) => <option key={w} value={w}>{w} weeks</option>)}
            </select>
          </label>
          <label className="flex flex-col text-[11px] text-slate-500">
            Anchor day
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              title="Anchor day (empty = today)"
              className="mt-0.5 h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            />
          </label>
        </div>
      </div>
      <ProgressiveOverloadCard date={date || undefined} weeks={weeks} />
    </div>
  );
}
