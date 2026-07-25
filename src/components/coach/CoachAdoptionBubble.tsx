"use client";

/**
 * CoachAdoptionBubble — the "are you getting the most out of MicroPulse?" bubble.
 *
 * A quiet chat-bubble on the coach shell. It fetches /api/coach/adoption (the pure
 * classifier decides the nudge; this only renders it), badges ONLY when a real nudge
 * exists, and shows at most one nudge: the why, the signal it's based on, a
 * counterfactual, a real outcome tie-in when present, a deep-link next step, and the
 * confidence. Dismiss / snooze are honoured client-side.
 *
 * Why snooze lives in localStorage, not coach_notifications: that table is
 * player-readiness-shaped (player_id FK, parameter=acwr/hsr, acknowledged_at — no
 * snooze, no coach-level nudge kind) and is driven by the readiness detect RPC we
 * must not touch. The nudge here is COMPUTED live each load (nothing to persist), so
 * only the per-coach dismiss/snooze state is stored — client-side, keyed by nudge —
 * which adds no new server notification channel.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { AdoptionVerdict, AdoptionNudge } from "@/lib/micropulse/adoption/coachAdoption";

const SNOOZE_KEY = "mp_adoption_snooze";

type SnoozeMap = Record<string, string>; // nudgeKey → ISO datetime until

function readSnooze(): SnoozeMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(SNOOZE_KEY) || "{}") as SnoozeMap; }
  catch { return {}; }
}
function writeSnooze(m: SnoozeMap) {
  try { window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(m)); } catch { /* private mode */ }
}

export default function CoachAdoptionBubble() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState<AdoptionVerdict | null>(null);
  const [snoozeTick, setSnoozeTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { if (alive) setLoading(false); return; }
        const res = await fetch("/api/coach/adoption", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => null);
        if (alive && json?.ok) setVerdict(json.verdict as AdoptionVerdict);
      } catch { /* soft — a bubble that can't load just stays quiet */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // The active nudge, unless the coach has snoozed this exact one.
  const nudge: AdoptionNudge | null = (() => {
    const n = verdict?.topNudge ?? null;
    if (!n) return null;
    void snoozeTick; // re-evaluate after a dismiss
    const until = readSnooze()[n.key];
    if (until && new Date(until).getTime() > Date.now()) return null;
    return n;
  })();

  const snooze = useCallback((days: number, key: string) => {
    const until = new Date(Date.now() + days * 86_400_000).toISOString();
    const m = readSnooze(); m[key] = until; writeSnooze(m);
    setSnoozeTick((t) => t + 1);
    setOpen(false);
  }, []);

  const pick = (b: { en: string; is: string }) => (IS ? b.is : b.en);
  const conf = verdict?.confidence;
  const confLabel = conf === "high" ? (IS ? "hátt öryggi" : "high confidence")
    : conf === "medium" ? (IS ? "miðlungs öryggi" : "medium confidence")
    : (IS ? "lágt öryggi" : "low confidence");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={IS ? "MicroPulse aðstoð" : "MicroPulse assistant"}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <span aria-hidden className="text-[15px]">💬</span>
        {nudge && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#2740e6] ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {IS ? "MicroPulse aðstoð" : "MicroPulse assistant"}
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label={IS ? "Loka" : "Close"}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
          </div>

          {loading ? (
            <p className="py-2 text-sm text-slate-400">{IS ? "Hleð…" : "Loading…"}</p>
          ) : nudge ? (
            <>
              <p className="text-sm font-medium leading-snug text-slate-900">{pick(nudge.why)}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {IS ? "Byggt á" : "Based on"}: {pick(nudge.signalLabel)} · {confLabel}
              </p>
              {nudge.counterfactual && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">↑ {pick(nudge.counterfactual)}</p>
              )}
              {nudge.outcomeTieIn && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{pick(nudge.outcomeTieIn)}</p>
              )}
              <Link
                href={nudge.nextStep.href}
                onClick={() => setOpen(false)}
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#2740e6] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                {pick(nudge.nextStep.label)} <span aria-hidden>→</span>
              </Link>
              <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px]">
                <button type="button" onClick={() => snooze(3, nudge.key)}
                  className="text-slate-500 hover:text-slate-800">{IS ? "Seinna" : "Later"}</button>
                <button type="button" onClick={() => snooze(14, nudge.key)}
                  className="text-slate-500 hover:text-slate-800">{IS ? "Vísa frá" : "Dismiss"}</button>
              </div>
            </>
          ) : (
            <p className="py-1 text-sm leading-snug text-slate-500">
              {IS
                ? "Allt í góðu — þú ert að nýta MicroPulse vel. Ég læt vita ef eitthvað fer að vanta."
                : "All good — you're getting the most out of MicroPulse. I'll flag it if something starts to slip."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
