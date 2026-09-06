"use client";

/**
 * Movement Screen card for Total Player Analysis. Surfaces the player's latest
 * movement screen as an athlete-axis input using the shared layered report
 * (verdict → facts + confidence → behind the numbers). Self-contained (fetches
 * by playerId), additive, silent until a screen exists. Descriptive — never the
 * readiness colour; pain / red flags route to a clinician.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { SEED_MOVEMENT_TESTS } from "@/lib/micropulse/movementScreen/registry";
import type { ScreenContext, ScreenFinding, ScreenResult } from "@/lib/micropulse/movementScreen/interpret";
import { buildScreenReport } from "@/lib/micropulse/movementScreen/report";
import { prescribeCorrectives } from "@/lib/micropulse/movementScreen/correctives/mapping";
import MovementScreenReport from "@/components/movement/MovementScreenReport";
import CorrectivePlan from "@/components/movement/CorrectivePlan";

type ScreenRow = {
  id: string; testSlug: string; screenDate: string;
  findings: ScreenFinding[]; context: ScreenContext; result: ScreenResult | null;
};
const TEST_BY_SLUG = Object.fromEntries(SEED_MOVEMENT_TESTS.map((t) => [t.slug, t]));

export default function MovementScreenTpaCard({ playerId, isEN }: { playerId: string; isEN: boolean }) {
  const [row, setRow] = React.useState<ScreenRow | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    if (!playerId) { setRow(null); setLoaded(true); return; }
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
        const res = await fetch(`/api/coach/movement-screen?player_id=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (alive) { setRow(res.ok && j.screens?.[0] ? (j.screens[0] as ScreenRow) : null); setLoaded(true); }
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (!loaded || !row) return null; // silent until a screen exists for this player
  const test = TEST_BY_SLUG[row.testSlug];
  if (!test || !row.result) return null;

  const report = buildScreenReport(test, row.findings ?? [], row.context ?? {}, row.result);
  const prescription = prescribeCorrectives(report.readings);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <MovementScreenReport
          report={report}
          isEN={isEN}
          title={isEN ? "Movement Screen" : "Hreyfiskimun"}
          subtitle={`${row.testSlug.replace(/_/g, " ")} · ${row.screenDate}`}
        />
        <p className="mt-2 text-[9px] text-slate-400">
          {isEN ? "Feeds the athlete axis + corrective focus. Never the readiness colour." : "Fæðir íþrótta-ásinn + leiðréttingar-áherslu. Aldrei readiness-liturinn."}
        </p>
      </div>
      {prescription && <CorrectivePlan prescription={prescription} isEN={isEN} compact />}
    </div>
  );
}
