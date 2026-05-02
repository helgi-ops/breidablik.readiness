"use client";

/**
 * Stig 2 — toggle that opts a team into auto-sending AI player recovery
 * messages instead of letting the coach review each draft.
 *
 * The server still enforces ELITE + the toggle on every fire path, so
 * this component is a UX surface only — even if a coach somehow flips
 * the bit on a non-ELITE team, no auto-send will actually happen.
 *
 * Bilingual IS/EN for parity with the rest of /coach/settings.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Props = {
  teamId: string;
};

export default function AutoSendRecoveryMessageSettings({ teamId }: Props) {
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Initial fetch.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/team/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setEnabled(Boolean(json.auto_send_player_recovery_messages));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { alive = false; };
  }, [supabase, teamId]);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ auto_send_player_recovery_messages: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              ELITE · AI auto-send
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
              ELITE
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">
            Senda AI recovery skilaboð sjálfvirkt til leikmanns
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Þegar leikmaður er flaggaður (svefn, sárindi, ACWR, HSR, …) skrifar AI strax
            recovery skilaboð úr deterministic guidance library MicroPulse og sendir í app
            leikmannsins + push á síma — án þess að bíða eftir að þjálfari samþykki.
          </p>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500">
            When a player is flagged, MicroPulse drafts and delivers an AI recovery
            message straight to the player&apos;s app + phone push, without waiting for
            coach approval. The coach still sees the notification and can read the sent
            message in the modal. Toggle off to require coach review (Stig 1 default).
          </p>
          {error && (
            <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">
              {error}
            </div>
          )}
          {enabled && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Auto-send virkt.</strong> Ný flögg fá AI skilaboð sjálfvirkt eftir Catapult sync (~1 mín) og næturkeyrslu kl 23:00.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={enabled === null || saving}
          aria-pressed={!!enabled}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-amber-600" : "bg-zinc-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
