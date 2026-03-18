"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TeamDecisionResponse } from "@/lib/micropulse/coachCommand";
import TeamStatusOverview from "./TeamStatusOverview";
import CriticalAlertsPanel from "./CriticalAlertsPanel";
import TeamRecommendationCard from "./TeamRecommendationCard";
import PlayerDecisionTable from "./PlayerDecisionTable";

type Props = {
  date: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
};

export default function CoachCommandCenter({ date, getAuthHeaders }: Props) {
  const [data, setData] = useState<TeamDecisionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/team/decisions?date=${encodeURIComponent(date)}`, {
        method: "GET",
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json) throw new Error(json?.error ?? "Failed to load coach command center.");
      setData(json as TeamDecisionResponse);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load coach command center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [date]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">MicroPulse</div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Coach Command Center</h2>
          <p className="mt-1 text-sm text-slate-600">Operational team view for {date}.</p>
        </div>
        <Button type="button" variant="outline" className="rounded-full" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="px-5 py-5 text-sm text-rose-900">{error}</CardContent>
        </Card>
      ) : null}

      {!loading && !error && data && data.players.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="px-5 py-6 text-sm text-slate-700">
            No player decisions available for this date.
          </CardContent>
        </Card>
      ) : null}

      {loading && !data ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="px-5 py-6 text-sm text-slate-700">Loading coach command center…</CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <TeamStatusOverview data={data.teamStatusOverview} />
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <CriticalAlertsPanel alerts={data.alerts} />
            <TeamRecommendationCard recommendation={data.teamRecommendation} />
          </div>
          <PlayerDecisionTable players={data.players} />
        </>
      ) : null}
    </section>
  );
}
