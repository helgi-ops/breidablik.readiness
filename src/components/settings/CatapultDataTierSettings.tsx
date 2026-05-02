"use client";

/**
 * CatapultDataTierSettings — admin card on /coach/settings for managing
 * which MicroPulse features a team can see based on their Catapult plan.
 *
 * Three layers (resolved in this priority by get_catapult_data_tier RPC):
 *
 *   1. MANUAL OVERRIDE (advanced — escape hatch for QA / data fix-ups)
 *      teams.catapult_data_tier_override = 'lite' | 'full' | 'auto'
 *
 *   2. DECLARED PLAN (the right knob for normal use)
 *      teams.catapult_plan_type = 'lite' | 'pro' | 'premium' | 'unknown'
 *      Wins over heuristic so a Lite team can't accidentally auto-promote
 *      when bogus B2-3 data arrives — the bug that caused the Afturedling
 *      fiasco before Stage 5 landed.
 *
 *   3. HEURISTIC (fallback when plan is 'unknown')
 *      Counts B2-3 efforts rows in player_external_load_daily, last 30d
 *
 * The card surfaces all three so admins understand WHY a tier resolved
 * the way it did, and flags mismatches between declared plan and what's
 * actually flowing in (e.g. declared PRO but no B2-3 data → contact
 * Catapult to enable the Reporting Parameters).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Override = "auto" | "full" | "lite";
type Plan     = "unknown" | "lite" | "pro" | "premium";
type Resolved = "full" | "lite";

type Props = { teamId: string };

const PLAN_OPTIONS: Array<{
  value: Plan;
  label: string;
  desc: string;
  icon: string;
  cls: string;
}> = [
  {
    value: "unknown",
    label: "Auto-detect",
    icon: "🤖",
    desc: "Let MicroPulse decide based on the data flowing in. Falls back to LITE when uncertain.",
    cls: "border-zinc-300",
  },
  {
    value: "lite",
    label: "Lite",
    icon: "🟢",
    desc: "Standard Catapult Activity Reports — Total/HSR/Sprint Distance, Velocity bands, Player Load, Max Velocity. Unlocks Quadrant view (Gabbett 2016), HSR Intelligence (Malone 2017), Foster Monotony, MD HSR Comparison.",
    cls: "border-blue-300",
  },
  {
    value: "pro",
    label: "Pro",
    icon: "🟡",
    desc: "Adds Acceleration & Deceleration Reporting (Gen 2) — B2-3 effort counts. Unlocks Decel Intelligence (McBurnie 2022) and Quadrant view's Gabbett 2017 B2-3 axis on top of all Lite features.",
    cls: "border-amber-300",
  },
  {
    value: "premium",
    label: "Premium",
    icon: "🟣",
    desc: "Adds IMA Free Running stride bands + Metabolic Power + #MPE recovery time. Unlocks Indoor Load (FMP-driven) and Sharp Cut + MPE chips on Decel Intelligence.",
    cls: "border-purple-300",
  },
];

export default function CatapultDataTierSettings({ teamId }: Props) {
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [override, setOverride] = React.useState<Override>("auto");
  const [plan, setPlan]         = React.useState<Plan>("unknown");
  const [resolvedTier, setResolvedTier] = React.useState<Resolved>("lite");
  const [b23RowCount, setB23RowCount]   = React.useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [saving, setSaving] = React.useState<"plan" | "override" | null>(null);
  const [error, setError]   = React.useState<string | null>(null);

  // Initial load — pull both knobs + the resolved tier in parallel
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: team } = await supabase
          .from("teams")
          .select("catapult_data_tier_override, catapult_plan_type")
          .eq("id", teamId)
          .maybeSingle();
        if (alive) {
          const t = team as { catapult_data_tier_override?: string; catapult_plan_type?: string } | null;
          const ov = t?.catapult_data_tier_override;
          const pl = t?.catapult_plan_type;
          setOverride(ov === "full" || ov === "lite" || ov === "auto" ? ov : "auto");
          setPlan(pl === "lite" || pl === "pro" || pl === "premium" ? pl : "unknown");
        }

        const { data: tierData } = await supabase.rpc("get_catapult_data_tier", { p_team_id: teamId });
        if (!alive) return;
        const t = String(tierData ?? "").toLowerCase();
        setResolvedTier(t === "full" ? "full" : "lite");

        // B2-3 diagnostic — same query the heuristic uses, surfaced for transparency
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

  // Re-resolve tier after any change to plan or override
  async function reResolveTier() {
    const { data: tierData } = await supabase.rpc("get_catapult_data_tier", { p_team_id: teamId });
    const t = String(tierData ?? "").toLowerCase();
    setResolvedTier(t === "full" ? "full" : "lite");
  }

  async function changePlan(next: Plan) {
    if (next === plan) return;
    setSaving("plan");
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from("teams")
        .update({ catapult_plan_type: next })
        .eq("id", teamId);
      if (upErr) throw new Error(upErr.message);
      setPlan(next);
      await reResolveTier();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function changeOverride(next: Override) {
    if (next === override) return;
    setSaving("override");
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from("teams")
        .update({ catapult_data_tier_override: next })
        .eq("id", teamId);
      if (upErr) throw new Error(upErr.message);
      setOverride(next);
      await reResolveTier();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  // Mismatch diagnostic — declared plan says PRO/PREMIUM but heuristic
  // sees no B2-3 data, OR declared LITE but B2-3 data is flowing in.
  const heuristicWouldSay: Resolved | null = b23RowCount == null
    ? null
    : (b23RowCount >= 5 ? "full" : "lite");
  const declaredImplies: Resolved | null = plan === "lite"
    ? "lite"
    : (plan === "pro" || plan === "premium")
    ? "full"
    : null;
  const showMismatchWarning = declaredImplies != null
    && heuristicWouldSay != null
    && declaredImplies !== heuristicWouldSay;

  // Resolution source — explains WHY this tier was picked
  const resolutionSource: "override" | "plan" | "heuristic" =
    override !== "auto" ? "override"
    : plan !== "unknown" ? "plan"
    : "heuristic";

  const tierBadge = resolvedTier === "full"
    ? { label: "FULL", color: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    : { label: "LITE", color: "bg-amber-100 text-amber-800 border-amber-300" };

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      {/* Header — active tier + resolution source */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Catapult data tier
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-zinc-950">Active tier</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${tierBadge.color}`}>
              {tierBadge.label}
            </span>
            <span className="text-[11px] text-zinc-500">
              {resolutionSource === "override"
                ? "from manual override"
                : resolutionSource === "plan"
                ? "from declared plan"
                : "from data heuristic"}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            {resolvedTier === "full"
              ? "Premium feature set is unlocked: McBurnie Decel Intelligence, Indoor Load, Quadrant view's B2-3 axis."
              : "Lite feature set is active: Quadrant (volume axis), HSR Intelligence, Foster Monotony, MD HSR Comparison. Decel Intelligence and Indoor Load are hidden — they need data your current plan doesn't include."}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Detected from <code className="rounded bg-zinc-100 px-1 py-0.5">player_external_load_daily</code>:{" "}
            {b23RowCount === null
              ? "checking…"
              : b23RowCount > 0
              ? `${b23RowCount} rows in the last 30 days have B2-3 efforts populated (≥5 needed for Pro auto-detection).`
              : "No rows in the last 30 days have B2-3 efforts."}
          </p>
        </div>
      </div>

      {/* Mismatch warning — declared vs detected disagree */}
      {showMismatchWarning && (
        <div className="mt-4 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <strong>⚠️ Declared plan and data don&apos;t match.</strong>{" "}
          {declaredImplies === "full" && heuristicWouldSay === "lite" ? (
            <>
              You declared <strong>{plan.toUpperCase()}</strong> but no B2-3 efforts data is flowing in (need 5+ rows in 30 days).
              Check OpenField → Reporting Parameters for &quot;Acceleration B2-3 Total Efforts (Gen 2)&quot; and &quot;Deceleration B2-3 Total Efforts (Gen 2)&quot;.
              Premium features may not work properly until the data arrives.
            </>
          ) : (
            <>
              You declared <strong>LITE</strong> but B2-3 efforts data IS flowing in. If your Catapult plan was upgraded recently,
              switch the declared plan to <strong>Pro</strong> or <strong>Premium</strong> to unlock the matching features.
            </>
          )}
        </div>
      )}

      {/* Declared plan selector — primary control */}
      <div className="mt-4 border-t border-zinc-200 pt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Declared Catapult plan
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          Pick the Catapult subscription you have. This drives which MicroPulse features your team sees.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PLAN_OPTIONS.map((opt) => {
            const active = plan === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={saving !== null}
                onClick={() => changePlan(opt.value)}
                className={`text-left rounded-lg border-2 p-3 transition-colors ${
                  active
                    ? `${opt.cls} bg-white shadow-sm`
                    : "border-zinc-200 bg-zinc-50 hover:bg-white"
                } ${saving !== null ? "opacity-50 cursor-wait" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{opt.icon}</span>
                  <span className="text-sm font-semibold text-zinc-900">{opt.label}</span>
                  {active && (
                    <span className="ml-auto rounded-full bg-zinc-900 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-600">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced — manual override (collapsed by default) */}
      <div className="mt-4 border-t border-zinc-200 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-xs font-medium uppercase tracking-wide text-zinc-500 hover:text-zinc-700"
        >
          {showAdvanced ? "▾" : "▸"} Advanced — manual override
        </button>
        {showAdvanced && (
          <div className="mt-3">
            <p className="max-w-2xl text-xs text-zinc-600">
              Hard override of the resolved tier — wins over the declared plan above. Use only when the declared plan is
              right but data is wrong (e.g. forced LITE on a Pro team while waiting for Catapult to fix a parameter,
              or forced FULL on a brand-new Pro team before B2-3 data has arrived). Leave on Auto in normal operation.
            </p>
            <div className="mt-3 inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
              {(["auto", "full", "lite"] as const).map((opt) => {
                const active = override === opt;
                const label = opt === "auto" ? "🤖 Auto" : opt === "full" ? "🚀 Force Full" : "⚠️ Force Lite";
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={saving !== null}
                    onClick={() => changeOverride(opt)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? opt === "full"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : opt === "lite"
                          ? "bg-amber-600 text-white shadow-sm"
                          : "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-600 hover:bg-zinc-100"
                    } ${saving !== null ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Lite-tier upgrade CTA — only when actually on Lite via declared plan */}
      {resolvedTier === "lite" && (plan === "lite" || plan === "unknown") && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <strong>Want to unlock Decel Intelligence + Indoor Load?</strong> Contact Catapult and ask to upgrade to a
          plan that includes <em>Acceleration B2-3 Total Efforts (Gen 2)</em>, <em>Deceleration B2-3 Total Efforts (Gen 2)</em>,
          and the IMA-band reporting parameters. Once your plan is upgraded, switch the declared plan above to{" "}
          <strong>Pro</strong> or <strong>Premium</strong>.
        </div>
      )}
    </section>
  );
}
