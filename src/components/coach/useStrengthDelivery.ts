"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client/authFetch";
import type { StrengthDelivery } from "@/lib/micropulse/strengthProgramming/deliveryView";

/** The read (null = not loaded, or it failed — the pages then show what they showed before). */
async function fetchStrengthDelivery(from: string, to: string, teamId: string | null): Promise<StrengthDelivery | null> {
  try {
    const qs = new URLSearchParams({ from, to });
    if (teamId) qs.set("team_id", teamId);
    const r = await authFetch(`/api/coach/strength-delivery?${qs.toString()}`);
    const j = (await r.json().catch(() => null)) as (StrengthDelivery & { ok?: boolean }) | null;
    if (!r.ok || !j?.ok) return null;
    // Another team's read (a team switch in flight) is never shown.
    if (teamId && j.teamId !== teamId) return null;
    return { teamId: j.teamId, mode: j.mode, isBasketball: j.isBasketball, weeks: j.weeks ?? [] };
  } catch {
    return null;
  }
}

/**
 * How the team's strength is delivered for the weeks [from, to] (deliveryView.ts): the send mode and, in standard
 * mode, the Custom Programme per week. `teamId` null = the coach's own team. `from` null = don't read.
 */
export function useStrengthDelivery(from: string | null, to: string | null, teamId: string | null = null): StrengthDelivery | null {
  const [state, setState] = useState<{ team: string; data: StrengthDelivery | null } | null>(null);

  useEffect(() => {
    if (!from) return;
    let alive = true;
    (async () => {
      const data = await fetchStrengthDelivery(from, to ?? from, teamId);
      if (alive) setState({ team: teamId ?? "", data });
    })();
    return () => { alive = false; };
  }, [from, to, teamId]);

  // While the next range loads the last read stays (the mode is the team's; weeks are looked up by their Monday, so a
  // week outside the last read simply shows nothing yet). Another team's read is never returned.
  return state && state.team === (teamId ?? "") ? state.data : null;
}
