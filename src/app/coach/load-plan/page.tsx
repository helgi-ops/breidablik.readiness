"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import LoadPlanCard from "@/components/coach/LoadPlanCard";

export default function LoadPlanPage() {
  const [date, setDate] = useState<string>("");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Today&apos;s Load Target</h1>
          <p className="text-sm text-slate-500">
            What the session should be — recommended type (mechanical / locomotive / mixed) and per-KPI targets
            anchored to your match demand, with acute:chronic context.
          </p>
        </div>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          title="Pick a day (empty = today)"
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
        />
      </div>
      <LoadPlanCard date={date || undefined} />
    </div>
  );
}
