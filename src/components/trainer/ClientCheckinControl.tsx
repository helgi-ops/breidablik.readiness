"use client";

/**
 * ClientCheckinControl — per-client daily check-in switch for the trainer.
 *
 * A personal-trainer practice defaults to check-in OFF (clients just track
 * load/strength). This control lets the trainer turn the daily wellness
 * check-in on or off for ONE client, overriding the practice-wide default.
 *
 * Tri-state (players.uses_wellness_features):
 *   - "team"  → null  (inherit the practice default)
 *   - "on"    → true  (check-in on for this client)
 *   - "off"   → false (check-in off for this client)
 *
 * Writes PATCH /api/trainer/client/[id]/wellness and calls onChanged so the
 * dashboard refetches (the row re-renders with load vs readiness accordingly).
 */

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Override = boolean | null;

export default function ClientCheckinControl({
  clientId,
  value,
  teamDefault,
  lang,
  onChanged,
}: {
  clientId: string;
  /** Current override: true / false / null (inherit). */
  value: Override;
  /** Practice-wide resolved check-in state — what "Team default" means here. */
  teamDefault: boolean;
  lang: "IS" | "EN";
  onChanged?: (next: Override) => void;
}) {
  const isIS = lang === "IS";
  const [current, setCurrent] = useState<Override>(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function set(next: Override) {
    if (busy || next === current) return;
    setBusy(true);
    setErr(null);
    const prev = current;
    setCurrent(next); // optimistic
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/trainer/client/${clientId}/wellness`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ usesWellnessFeatures: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `${res.status}`);
      }
      onChanged?.(next);
    } catch (e) {
      setCurrent(prev); // roll back
      setErr(e instanceof Error ? e.message : (isIS ? "Villa" : "Error"));
    } finally {
      setBusy(false);
    }
  }

  const effectiveOn = current === null ? teamDefault : current;
  const teamLabel = isIS
    ? `Sjálfgefið (${teamDefault ? "á" : "af"})`
    : `Team default (${teamDefault ? "on" : "off"})`;

  const options: Array<{ key: string; v: Override; label: string }> = [
    { key: "off", v: false, label: isIS ? "Af" : "Off" },
    { key: "on", v: true, label: isIS ? "Á" : "On" },
    { key: "team", v: null, label: teamLabel },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
        {isIS ? "Daglegt check-in" : "Daily check-in"}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {isIS
          ? "Hvort þessi viðskiptavinur skrái líðan (svefn, þreytu, bólgu) daglega."
          : "Whether this client logs daily wellness (sleep, fatigue, soreness)."}
      </p>

      <div className="mt-2 inline-flex rounded-md border border-slate-200 p-0.5">
        {options.map((o) => {
          const active = current === o.v;
          return (
            <button
              key={o.key}
              type="button"
              disabled={busy}
              onClick={() => set(o.v)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                active ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 text-[11px] text-slate-500">
        {effectiveOn
          ? (isIS ? "Check-in er kveikt fyrir þennan viðskiptavin." : "Check-in is on for this client.")
          : (isIS ? "Check-in er slökkt — álag (ACWR/sRPE) er merkið." : "Check-in is off — load (ACWR/sRPE) is the signal.")}
      </div>

      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
    </div>
  );
}
