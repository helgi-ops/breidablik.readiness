"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import LoadPlanCard from "@/components/coach/LoadPlanCard";

export default function LoadPlanPage() {
  const [date, setDate] = useState<string>("");
  const [restDay, setRestDay] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pre-Session Report</h1>
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
            <input type="checkbox" checked={restDay} onChange={(e) => setRestDay(e.target.checked)} className="h-4 w-4 accent-slate-700" />
            Rest day
          </label>
        </div>
      </div>
      <LoadPlanCard date={date || undefined} restDay={restDay} />
    </div>
  );
}
