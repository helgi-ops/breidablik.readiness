"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client/authFetch";
import type { ActualDay } from "@/lib/micropulse/sessionEnough/weekEnough";

export type WeekEnoughActualsState = { state: "idle" | "loading" | "ok" | "not_available" | "error"; days: ActualDay[] };

const IDLE: WeekEnoughActualsState = { state: "idle", days: [] };

/**
 * The squad's per-day medians over [from, to] (GET /api/coach/week-enough) — the done side of "Did we do enough?" for
 * a week or a block. One read per range; a range that starts after today is not read (nothing has happened yet).
 * `null` = don't read (player scope, pre-season, no plan).
 */
export function useWeekEnoughActuals(from: string | null, to: string | null): WeekEnoughActualsState {
  const [res, setRes] = useState<{ key: string; value: WeekEnoughActualsState } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const key = from && to && from <= today ? `${from}|${to}` : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const [f, t] = key.split("|");
    (async () => {
      try {
        const r = await authFetch(`/api/coach/week-enough?from=${f}&to=${t}`);
        const j = (await r.json().catch(() => null)) as { ok?: boolean; state?: "ok" | "not_available"; days?: ActualDay[] } | null;
        const value: WeekEnoughActualsState = r.ok && j?.ok ? { state: j.state === "not_available" ? "not_available" : "ok", days: j.days ?? [] } : { state: "error", days: [] };
        if (alive) setRes({ key, value });
      } catch {
        if (alive) setRes({ key, value: { state: "error", days: [] } });
      }
    })();
    return () => { alive = false; };
  }, [key]);

  if (!key) return IDLE;
  return res?.key === key ? res.value : { state: "loading", days: [] };
}
