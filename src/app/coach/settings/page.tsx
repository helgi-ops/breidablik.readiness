"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { CoachRule } from "@/lib/micropulse/rulesEngine";
import {
  buildAdminSystemSummary,
  buildRuntimeRulesFromAdminConfig,
  createDefaultAdminConfigSnapshot,
  loadAdminConfigSnapshotFromStorage,
  saveAdminConfigSnapshotToStorage,
  type AdminConfigSnapshot,
  type RecommendationAuditView,
} from "@/lib/micropulse/adminConfig";
import ClubBrandingSettings from "@/components/settings/ClubBrandingSettings";
import GpsProviderSettings from "@/components/settings/GpsProviderSettings";
import RulesManager from "@/components/admin/RulesManager";
import ProtectedPlayersManager from "@/components/admin/ProtectedPlayersManager";
import TeamPolicySettings from "@/components/admin/TeamPolicySettings";
import MatchdayTemplateSettings from "@/components/admin/MatchdayTemplateSettings";
import RecommendationLogicViewer from "@/components/admin/RecommendationLogicViewer";
import OverrideHistoryPanel from "@/components/admin/OverrideHistoryPanel";
import SystemPolicySummary from "@/components/admin/SystemPolicySummary";
import {
  ORDERED_PLAN_DEFINITIONS,
  getPlanDefinition,
  getPlanFeatures,
  getFeatureLabel,
  getUpgradeMessageForFeature,
  resolveEffectivePlan,
  summarizePlanAssignment,
  type MicroPulsePlanKey,
  type OrganizationPlanAssignment,
} from "@/lib/micropulse/product";

type ProfileRow = { id: string; role: string | null; team_id: string | null };
type PlayerRow = { id: string; full_name: string | null; team_id: string | null };
const PLAN_ASSIGNMENTS_STORAGE_KEY = "micropulse.product.planAssignments.v1";
const DEFAULT_ORGANIZATION_ID = "default-org";

function loadPlanAssignmentsFromStorage(): OrganizationPlanAssignment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PLAN_ASSIGNMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OrganizationPlanAssignment[]) : [];
  } catch {
    return [];
  }
}

function savePlanAssignmentsToStorage(assignments: OrganizationPlanAssignment[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAN_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
}

export default function CoachSettingsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<AdminConfigSnapshot>(() =>
    typeof window === "undefined" ? createDefaultAdminConfigSnapshot() : loadAdminConfigSnapshotFromStorage(),
  );
  const [teamId, setTeamId] = useState<string | null>(null);
  const [planAssignments, setPlanAssignments] = useState<OrganizationPlanAssignment[]>([]);
  const [players, setPlayers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAudit, setSelectedAudit] = useState<RecommendationAuditView | null>(null);
  const [indoorMode, setIndoorMode] = useState<boolean | null>(null);
  const [indoorModeLoading, setIndoorModeLoading] = useState(false);
  const [indoorModeError, setIndoorModeError] = useState("");

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key) {
        setSnapshot(loadAdminConfigSnapshotFromStorage());
        if (event.key === PLAN_ASSIGNMENTS_STORAGE_KEY) setPlanAssignments(loadPlanAssignmentsFromStorage());
      }
    };

    const hydrateTimer = window.setTimeout(() => setPlanAssignments(loadPlanAssignmentsFromStorage()), 0);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    saveAdminConfigSnapshotToStorage(snapshot);
  }, [snapshot]);

  useEffect(() => {
    savePlanAssignmentsToStorage(planAssignments);
  }, [planAssignments]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setError("Missing auth.");
        setLoading(false);
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, team_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      const profile = profileRow as ProfileRow | null;
      const role = String(profile?.role ?? "").toLowerCase();
      if (!(role.includes("coach") || role.includes("admin"))) {
        setError("Coach/Admin access required.");
        setLoading(false);
        return;
      }

      if (!profile?.team_id) {
        setTeamId(null);
        setPlayers([]);
        setLoading(false);
        return;
      }
      setTeamId(profile.team_id);

      const { data: playerRows, error: playerError } = await supabase
        .from("players")
        .select("id, full_name, team_id")
        .eq("team_id", profile.team_id)
        .order("full_name", { ascending: true });

      if (playerError) {
        setError(playerError.message);
      } else {
        setPlayers(
          ((playerRows ?? []) as PlayerRow[]).map((row) => ({
            id: row.id,
            name: row.full_name ?? row.id,
          })),
        );
      }

      setLoading(false);
    };

    run();
  }, [supabase]);

  // ── Indoor Mode ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!teamId) return;
    const fetchIndoorMode = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/team/settings?team_id=${teamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setIndoorMode(json.indoor_mode ?? false);
        }
      } catch { /* silently fail */ }
    };
    fetchIndoorMode();
  }, [teamId, supabase]);

  const toggleIndoorMode = useCallback(async () => {
    if (!teamId) return;
    setIndoorModeLoading(true);
    setIndoorModeError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const next = !indoorMode;
      const res = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ team_id: teamId, indoor_mode: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to update");
      }
      setIndoorMode(next);
    } catch (err) {
      setIndoorModeError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIndoorModeLoading(false);
    }
  }, [teamId, indoorMode, supabase]);

  const runtimeRules = useMemo(() => buildRuntimeRulesFromAdminConfig(snapshot), [snapshot]);
  const summary = useMemo(() => buildAdminSystemSummary({ snapshot, recommendationDecisions: [] }), [snapshot]);
  const effectivePlan = useMemo(
    () =>
      resolveEffectivePlan({
        assignments: planAssignments,
        organizationId: DEFAULT_ORGANIZATION_ID,
        teamId,
        allowTeamOverride: true,
      }),
    [planAssignments, teamId],
  );
  const effectivePlanDef = useMemo(() => getPlanDefinition(effectivePlan), [effectivePlan]);

  const updateRules = (nextRules: CoachRule[]) => {
    setSnapshot((prev) => ({ ...prev, rules: nextRules }));
  };

  const onPlanChange = (nextPlan: MicroPulsePlanKey) => {
    setPlanAssignments((prev) => {
      const nextTeamAssignment: OrganizationPlanAssignment = {
        organizationId: DEFAULT_ORGANIZATION_ID,
        teamId,
        activePlan: nextPlan,
        status: "ACTIVE",
        assignedAt: new Date().toISOString(),
      };
      const withoutCurrent = prev.filter((assignment) => !(assignment.teamId === teamId && assignment.organizationId === DEFAULT_ORGANIZATION_ID));
      return [nextTeamAssignment, ...withoutCurrent];
    });
  };

  const sections = [
    { id: "overview", label: "Overview" },
    { id: "plan", label: "Plan" },
    { id: "policies", label: "Policies" },
    { id: "rules", label: "Rules" },
    { id: "protected", label: "Protected players" },
    { id: "audit", label: "Audit" },
  ] as const;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm text-sm text-zinc-600">Loading settings workspace…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">

      {/* ── Elite: Club branding for PWA ──────────────────────────────────── */}
      {/* ── GPS Provider ───────────────────────────────────────────────── */}
      <GpsProviderSettings teamId={teamId} />

      {/* ── Indoor Mode (FMP) ─────────────────────────────────────────── */}
      {teamId && indoorMode !== null && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Load monitoring mode</div>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                {indoorMode ? "Indoor Mode (FMP)" : "Outdoor Mode (GPS)"}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-zinc-600">
                {indoorMode
                  ? "Using Football Movement Profile (inertial sensors) + PlayerLoad + IMA for load monitoring. No GPS required."
                  : "Using GPS-based metrics (HIR, velocity bands, max speed) for load monitoring."}
              </p>
              {indoorModeError && (
                <div className="mt-2 text-sm text-red-600">{indoorModeError}</div>
              )}
            </div>
            <button
              type="button"
              disabled={indoorModeLoading}
              onClick={toggleIndoorMode}
              className={`relative mt-1 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                indoorMode
                  ? "bg-indigo-600 focus:ring-indigo-500"
                  : "bg-zinc-300 focus:ring-zinc-400"
              } ${indoorModeLoading ? "opacity-50 cursor-wait" : ""}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  indoorMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {indoorMode ? (
              <>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">FMP Dynamic High 34%</span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">PlayerLoad 26%</span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">IMA Total 20%</span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">FMP Dynamic Med 14%</span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">FMP Running High 6%</span>
              </>
            ) : (
              <>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">HIR Distance 34%</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Decel Load 26%</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Density Stress 20%</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Max Velocity 14%</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Band 6 Distance 6%</span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Elite: Club branding for PWA ──────────────────────────────────── */}
      {effectivePlan === "ELITE" && (
        <ClubBrandingSettings />
      )}

      <section className="rounded-2xl border bg-gradient-to-b from-white to-zinc-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Coach settings</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">MicroPulse Configuration Workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Configure decision rules, team policy, protected-player controls, and override visibility. Operational dashboard behavior remains unchanged.
            </p>
          </div>
          <div className="rounded-xl border bg-white px-3 py-2 text-right shadow-sm">
            <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Current plan</div>
            <div className="text-sm font-semibold text-zinc-900">{effectivePlanDef.displayName}</div>
            <div className="text-xs text-zinc-600">{effectivePlanDef.monthlyPriceLabel}</div>
          </div>
        </div>
        {error ? <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
      </section>

      <section className="rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-lg border bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              {section.label}
            </a>
          ))}
        </div>
      </section>

      <section id="overview" className="scroll-mt-24 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Overview</div>
        <SystemPolicySummary value={summary} />
      </section>

      <section id="plan" className="scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Product plan</div>
        <div className="mt-1 text-lg font-semibold text-zinc-950">Current plan: {effectivePlanDef.displayName}</div>
        <div className="text-sm text-zinc-700">{effectivePlanDef.monthlyPriceLabel}</div>
        <div className="mt-1 text-sm text-zinc-600">{effectivePlanDef.summary}</div>
        <div className="mt-1 text-xs text-zinc-500">{summarizePlanAssignment(effectivePlan, "ACTIVE")}</div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="plan-select" className="text-xs font-medium text-zinc-600">
            Team plan assignment
          </label>
          <select
            id="plan-select"
            className="rounded-lg border bg-white px-2.5 py-1.5 text-sm"
            value={effectivePlan}
            onChange={(event) => onPlanChange(event.target.value as MicroPulsePlanKey)}
          >
            {ORDERED_PLAN_DEFINITIONS.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {getPlanFeatures(effectivePlan).map((feature) => (
            <div key={feature} className="rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              {getFeatureLabel(feature)}
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-zinc-500">{getUpgradeMessageForFeature("ORG_DASHBOARDS")}</div>
      </section>

      <section id="policies" className="scroll-mt-24 space-y-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Policy configuration</div>
          <div className="mt-1 text-sm text-zinc-600">
            Set recommendation preferences first, then review day-type defaults in a full-length workspace.
          </div>
        </div>

        <TeamPolicySettings value={snapshot.teamPolicy} onChange={(next) => setSnapshot((prev) => ({ ...prev, teamPolicy: next }))} />

        <MatchdayTemplateSettings
          value={snapshot.matchdayTemplates}
          onChange={(next) => setSnapshot((prev) => ({ ...prev, matchdayTemplates: next }))}
        />
      </section>

      <section id="rules" className="scroll-mt-24">
        <RulesManager rules={snapshot.rules} onChange={updateRules} />
      </section>

      <section id="protected" className="scroll-mt-24">
        <ProtectedPlayersManager
          players={players}
          value={snapshot.protectedPlayers}
          onChange={(next) => setSnapshot((prev) => ({ ...prev, protectedPlayers: next }))}
        />
      </section>

      <section id="audit" className="scroll-mt-24 grid gap-4 lg:grid-cols-2">
        <RecommendationLogicViewer value={selectedAudit} />
        <OverrideHistoryPanel value={snapshot.overrideHistory} />
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Runtime status</div>
        <div className="mt-1 text-sm text-zinc-700">
          Runtime rules currently generated: <span className="font-semibold">{runtimeRules.length}</span>
        </div>
        <div className="mt-1 text-sm text-zinc-600">
          Includes default policy-derived rules and custom rules. Persistence currently uses localStorage and is ready for API/DB wiring.
        </div>
      </section>

      <section className="sticky bottom-3 z-20 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-zinc-600">You can safely reset defaults or save the current settings snapshot.</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              onClick={() => {
                setSnapshot(createDefaultAdminConfigSnapshot());
                setSelectedAudit(null);
              }}
            >
              Reset to defaults
            </button>
            <button
              type="button"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white"
              onClick={() => saveAdminConfigSnapshotToStorage(snapshot)}
            >
              Save settings
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
