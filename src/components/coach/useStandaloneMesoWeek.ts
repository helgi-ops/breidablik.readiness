"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client/authFetch";
import { assumedWeekMove, mesoSeedFromEcho, mesoWeekFor, type PeriodizationEcho, type StandaloneMesoSeed } from "@/lib/micropulse/periodization/mesoSeed";
import type { MesoWeekSeed } from "@/lib/micropulse/periodization/mesoWeek";

/** The plan read + the seed (null = no plan, another team, or the read failed). */
async function fetchMesoSeed(tid: string): Promise<StandaloneMesoSeed | null> {
  try {
    const [pr, br, cr] = await Promise.all([authFetch("/api/coach/periodization"), authFetch("/api/coach/team/breaks"), authFetch("/api/coach/team/camps")]);
    const pj = (await pr.json().catch(() => null)) as (PeriodizationEcho & { ok?: boolean; teamId?: string }) | null;
    const bj = (br.ok ? await br.json().catch(() => null) : null) as { ok?: boolean; breaks?: Array<{ start_date: string; end_date: string }> } | null;
    const cj = (cr.ok ? await cr.json().catch(() => null) : null) as { ok?: boolean; camps?: Array<{ start_date: string; end_date: string; load_pct: number; two_a_day: boolean }> } | null;
    if (!pr.ok || !pj?.ok || pj.teamId !== tid || !pj.plan?.phases?.length) return null;
    return mesoSeedFromEcho(pj, {
      today: new Date().toISOString().slice(0, 10),
      teamBreaks: (bj?.ok ? bj.breaks ?? [] : []).map((b) => ({ start_date: b.start_date, end_date: b.end_date })),
      camps: (cj?.ok ? cj.camps ?? [] : []).map((c) => ({ start: c.start_date, end: c.end_date, loadPct: c.load_pct, twoADay: c.two_a_day })),
    });
  } catch {
    return null;
  }
}

/**
 * The standalone /coach/week-setup page's Meso week: the same data the Periodization Hub loads (the periodization
 * echo + team breaks + camps), turned into the same seed (periodization/mesoSeed) — so the page shows the week the
 * Meso pages show, like the hub's Micro tab. `ready` = the read finished (with or without a plan); the week waits for it.
 * Only for the coach's own team (the plan's team must be the team the page edits).
 */
export function useStandaloneMesoWeek(enabled: boolean, teamId: string | null): {
  ready: boolean;
  weekFor: ((weekStart: string) => MesoWeekSeed | null) | null;
  onAssumedGame: (weekStart: string, date: string, action: "friendly" | "none") => Promise<void>;
} {
  const [seed, setSeed] = useState<StandaloneMesoSeed | null>(null);
  const [ready, setReady] = useState(false);
  const tid = (teamId ?? "").trim();

  useEffect(() => {
    if (!enabled || !tid) return;
    let alive = true;
    (async () => {
      const next = await fetchMesoSeed(tid);
      if (alive) { setSeed(next); setReady(true); }
    })();
    return () => { alive = false; };
  }, [enabled, tid]);

  const weekFor = useMemo(() => (seed ? (ws: string) => mesoWeekFor(seed.ctx, ws) : null), [seed]);

  // The banner's two actions, as on the hub: enter the game as a friendly, or take the game out of the week (saved on
  // the pre-season's season row + the week re-flowed and written to week_plans). Then re-read the plan.
  const onAssumedGame = useCallback(async (ws: string, date: string, action: "friendly" | "none") => {
    if (!seed) return;
    const post = (body: unknown) => authFetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (action === "friendly") {
      await post({ fixture: { op: "upsert", date, force: false, isFriendly: true } });
    } else {
      const next = { ...seed.assumedGames, [ws]: null };
      await post({ seasonYear: seed.preYear, overrides: { preAssumedGames: next } });
      const mv = assumedWeekMove(seed.preInput, ws, next);
      if (mv) await post({ applyWeekSetup: [mv.week] });
    }
    setSeed(await fetchMesoSeed(tid));
  }, [seed, tid]);

  return { ready: !enabled || ready, weekFor, onAssumedGame };
}
