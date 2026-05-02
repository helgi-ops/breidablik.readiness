"use client";

/**
 * CatapultDataTierSettings — admin-facing card on /coach/settings that
 * shows the team's currently detected Catapult data tier, the manual
 * override (if any), and an upgrade CTA. Lets admins force 'full' to
 * unlock features early (e.g. brand new team where data hasn't arrived
 * yet but we know they're FULL) or 'lite' to hide features even when
 * data exists (rarely useful — mostly for QA).
 *
 * Sees both the override AND the auto-detected value so admins can spot
 * mismatches (e.g. override='full' but data says 'lite' — intervention
 * either failed or the contract was downgraded).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Override = "auto" | "full" | "lite";
type DetectedTier = "full" | "lite" | "unknown";

type Props = { teamId: string };

export default function CatapultDataTierSettings({ teamId }: Props) {
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [override, setOverride] = React.useState<Override | null>(null);
  const [detected, setDetected] = React.useState<DetectedTier>("unknown");
  const [b23RowCount, setB23RowCount] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load both the override (from teams.catapult_data_tier_override) and
  // the live detection (from RPC) so we can show both side-by-side.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: team } = await supabase
          .from("teams")
          .select("catapult_data_tier_override")
          .eq("id", teamId)
          .maybeSingle();
        if (alive) {
          const ov = (team as { catapult_data_tier_override?: string } | null)?.catapult_data_tier_override;
          setOverride((ov === "full" || ov === "lite" || ov === "auto") ? ov : "auto");
        }

        const { data: tierData } = await supabase.rpc("get_catapult_data_tier", { p_team_id: teamId });
        if (!alive) return;
        const t = String(tierData ?? "").toLowerCase();
        setDetected(t === "full" ? "full" : t === "lite" ? "lite" : "unknown");

        // Quick stat: how many rows in last 30d have B2-3 efforts. Helps
        // explain WHY we detected lite/full without needing a SQL session.
        const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        const { count } = await supabase
          .from("player_external_load_daily")
          .select("date", { count: "exact", head: true })
          .eq("team_id", teamId)
          .gte("date", sinceIso)
          .or("accel_b2_3_tot_effs_gen2.gt.0,decel_b2_3_tot_effs_gen2.gt.0");
        if (alive) setB23RowCount(count ?? 0);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => { alive = false; };
  }, [supabase, teamId]);

  async function changeOverride(next: Override) {
    if (next === override) return;
    setSaving(true);
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from("teams")
        .update({ catapult_data_tier_override: next })
        .eq("id", teamId);
      if (upErr) throw new Error(upErr.message);
      setOverride(next);
      // Re-detect so the displayed tier updates immediately.
      const { data: tierData } = await supabase.rpc("get_catapult_data_tier", { p_team_id: teamId });
      const t = String(tierData ?? "").toLowerCase();
      setDetected(t === "full" ? "full" : t === "lite" ? "lite" : "unknown");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const tierBadge = detected === "full"
    ? { label: "FULL", color: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    : detected === "lite"
    ? { label: "LITE", color: "bg-amber-100 text-amber-800 border-amber-300" }
    : { label: "—",   color: "bg-slate-100 text-slate-600 border-slate-300" };

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Catapult data tier
          </div>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-950">Active tier</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${tierBadge.color}`}>
              {tierBadge.label}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            {detected === "full"
              ? "Your Catapult plan exposes B2-3 acceleration/deceleration efforts. Full feature set is unlocked: McBurnie Decel Intelligence, Indoor Load, Quadrant view."
              : detected === "lite"
              ? "Your Catapult plan does not expose B2-3 efforts. Decel Intelligence, Indoor Load and Quadrant view are hidden from the sidebar — they'd produce empty/misleading output without that data."
              : "Tier could not be determined. Defaults to Lite to avoid surfacing broken features."}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Detected from <code className="rounded bg-zinc-100 px-1 py-0.5">player_external_load_daily</code>:{" "}
            {b23RowCount === null
              ? "checking…"
              : b23RowCount > 0
              ? `${b23RowCount} rows in the last 30 days have B2-3 efforts populated (≥5 needed for FULL).`
              : "No rows in the last 30 days have B2-3 efforts. Either no Catapult data has been uploaded yet, or your plan doesn't include this metric."}
          </p>
        </div>
      </div>

      {/* Manual override — admin escape hatch */}
      <div className="mt-4 border-t border-zinc-200 pt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Manual override
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          Use only when auto-detection is wrong (e.g. brand new team where Catapult data hasn&apos;t synced yet but you know the contract is FULL). Leave on Auto in normal operation — the tier auto-promotes when B2-3 rows arrive.
        </p>
        <div className="mt-3 inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          {(["auto", "full", "lite"] as const).map((opt) => {
            const active = override === opt;
            const label = opt === "auto" ? "🤖 Auto" : opt === "full" ? "🚀 Full" : "⚠️ Lite";
            return (
              <button
                key={opt}
                type="button"
                disabled={saving}
                onClick={() => changeOverride(opt)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? opt === "full"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : opt === "lite"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-zinc-100"
                } ${saving ? "opacity-50 cursor-wait" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {error && (
          <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">
            {error}
          </div>
        )}
      </div>

      {/* Upgrade CTA when on Lite */}
      {detected === "lite" && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <strong>Want McBurnie Decel Intelligence?</strong> Contact Catapult and ask to enable
          {" "}<em>Acceleration B2-3 Total Efforts (Gen 2)</em>, <em>Deceleration B2-3 Total Efforts (Gen 2)</em>,
          and the IMA-band reporting parameters. As soon as that data starts flowing, MicroPulse auto-promotes
          your team to FULL — no setup needed on your side.
        </div>
      )}
    </section>
  );
}
