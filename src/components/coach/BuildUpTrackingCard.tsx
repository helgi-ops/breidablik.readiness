"use client";

/**
 * Coach build-up tracking card — actual accrued weekly training load vs the
 * planned periodization ramp, for the selected player, on the Periodization Hub's
 * Players tab. The plan (CalendarBlock) is computed client-side by the hub; this
 * card fetches the actuals + chronic maturity from /api/coach/build-up-tracking,
 * runs the pure `computeBuildUpAdherence`, and renders the shared
 * `BuildUpAdherenceView` (same story the player sees). Never the readiness colour.
 */
import React from "react";
import type { CalendarBlock } from "@/lib/micropulse/periodization";
import {
  computeBuildUpAdherence,
  type BuildUpAdherence,
  type WeekActual,
  type BuildUpAcwr,
} from "@/lib/micropulse/buildUpTracking";
import BuildUpAdherenceView from "@/components/BuildUpAdherenceView";

type Props = {
  playerId: string;
  playerName: string;
  block: CalendarBlock;
  planConfidence: "high" | "medium" | "low";
  authHeader: () => Promise<string>;
  isEN: boolean;
};

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The block's planned match dates (day.type === "match"), reconstructed from
 *  each week's Monday + day index — the hub's CalDay has no date field. */
function blockMatchDates(block: CalendarBlock): string[] {
  const out: string[] = [];
  for (const wk of block.weeks) {
    wk.days.forEach((d, i) => {
      if (d.type === "match") out.push(addDaysIso(wk.weekStart, i));
    });
  }
  return out;
}

export default function BuildUpTrackingCard({ playerId, playerName, block, planConfidence, authHeader, isEN }: Props) {
  const [state, setState] = React.useState<{ loading: boolean; error: string | null; adh: BuildUpAdherence | null }>({
    loading: true,
    error: null,
    adh: null,
  });

  const startDate = block.startDate;
  const numWeeks = block.numWeeks;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ loading: true, error: null, adh: null });
      try {
        const asOf = new Date().toISOString().slice(0, 10);
        const from = startDate;
        const to = asOf < from ? from : asOf;
        const matchDates = blockMatchDates(block);
        const qs = new URLSearchParams({ playerId, from, to, matchDates: matchDates.join(",") });
        const res = await fetch(`/api/coach/build-up-tracking?${qs.toString()}`, {
          headers: { Authorization: await authHeader() },
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          weeks?: WeekActual[];
          daysObserved?: number;
          acwr?: BuildUpAcwr;
        };
        if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const adh = computeBuildUpAdherence({
          block,
          actualWeeks: json.weeks ?? [],
          asOf,
          daysObserved: json.daysObserved ?? 0,
          planConfidence,
          acwr: json.acwr ?? null,
        });
        if (!cancelled) setState({ loading: false, error: null, adh });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : "Error", adh: null });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch when the player or the plan window changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, startDate, numWeeks]);

  const T = (en: string, is: string) => (isEN ? en : is);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      {state.loading && (
        <>
          <h2 className="text-sm font-semibold text-slate-900">{T("Build-up tracking", "Uppbyggingar-eftirlit")}</h2>
          <p className="mt-2 text-[12px] text-slate-400">{T("Loading actuals…", "Sæki raungögn…")}</p>
        </>
      )}
      {state.error && (
        <>
          <h2 className="text-sm font-semibold text-slate-900">{T("Build-up tracking", "Uppbyggingar-eftirlit")}</h2>
          <p className="mt-2 text-[12px] text-amber-700">
            {T("Could not load actuals", "Náði ekki í raungögn")}: {state.error}
          </p>
        </>
      )}
      {state.adh && (
        <BuildUpAdherenceView
          adh={state.adh}
          isEN={isEN}
          title={T("Build-up tracking", "Uppbyggingar-eftirlit")}
          subtitle={playerName}
        />
      )}
    </section>
  );
}
