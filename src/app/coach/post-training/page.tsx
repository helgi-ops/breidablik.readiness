"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import PostTrainingCard from "@/components/coach/PostTrainingCard";
import PagePurpose from "@/components/coach/PagePurpose";

export default function PostTrainingPage() {
  const [date, setDate] = useState<string>("");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Post-Training Report</h1>
          <PagePurpose
            en="review how today's session compared to what was planned"
            is="fara yfir hvernig æfing dagsins var miðað við áætlun"
          />
          <p className="text-sm text-slate-500">
            Did the session land where the plan asked? This reads the captured session and diffs it against the
            pre-session targets — at squad level and per player — so you can review on screen without downloading.
            The PDF report is still available from the dashboard for consulting or sending to a team.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            title="Pick a day (empty = most recent session)"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
          />
        </div>
      </div>
      <PostTrainingCard date={date || undefined} />
    </div>
  );
}
