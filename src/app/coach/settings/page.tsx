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
import AutoSendRecoveryMessageSettings from "@/components/settings/AutoSendRecoveryMessageSettings";
import CatapultDataTierSettings from "@/components/settings/CatapultDataTierSettings";
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
  // Operating mode: Full Suite (wellness + GPS) vs GPS Intelligence Only
  // (GPS / IMA / external load only — no check-in, RPE, wearables, decision card).
  // Default true matches the DB default; existing teams are unaffected.
  const [usesWellnessFeatures, setUsesWellnessFeatures] = useState<boolean>(true);
  const [wellnessModeLoading, setWellnessModeLoading] = useState(false);
  const [wellnessModeError, setWellnessModeError] = useState("");
  const [wellnessConfirmOpen, setWellnessConfirmOpen] = useState<null | boolean>(null);
  // Ternary load pipeline override (auto/indoor/outdoor). Maps onto
  // teams.training_mode_default and supersedes the binary indoor_mode
  // toggle for verdict-pipeline purposes — existing indoor_mode flag
  // stays in sync (true when 'indoor', false otherwise) for any legacy
  // consumers.
  const [trainingMode, setTrainingMode] = useState<"auto" | "indoor" | "outdoor">("auto");
  const [sportType, setSportType] = useState<"football" | "basketball">("football");
  const [sportTypeLoading, setSportTypeLoading] = useState(false);

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
          setSportType(json.sport_type === "basketball" ? "basketball" : "football");
          const tm = String(json.training_mode_default ?? "auto").toLowerCase();
          if (tm === "indoor" || tm === "outdoor" || tm === "auto") setTrainingMode(tm);
          setUsesWellnessFeatures(json.uses_wellness_features ?? true);
        }
      } catch { /* silently fail */ }
    };
    fetchIndoorMode();
  }, [teamId, supabase]);

  const setTrainingModeRemote = useCallback(async (next: "auto" | "indoor" | "outdoor") => {
    if (!teamId) return;
    setIndoorModeLoading(true);
    setIndoorModeError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ team_id: teamId, training_mode_default: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to update");
      }
      setTrainingMode(next);
      // Keep legacy boolean indoor_mode in sync so any other consumers
      // (TV display, indoor-only UI features) reflect the active mode.
      if (next === "indoor") setIndoorMode(true);
      else if (next === "outdoor") setIndoorMode(false);
    } catch (err) {
      setIndoorModeError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIndoorModeLoading(false);
    }
  }, [teamId, supabase]);

  const setWellnessMode = useCallback(async (next: boolean) => {
    if (!teamId) return;
    setWellnessModeLoading(true);
    setWellnessModeError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ team_id: teamId, uses_wellness_features: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to update");
      }
      setUsesWellnessFeatures(next);
      setWellnessConfirmOpen(null);
    } catch (err) {
      setWellnessModeError(err instanceof Error ? err.message : "Failed");
    } finally {
      setWellnessModeLoading(false);
    }
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

  const changeSportType = useCallback(async (next: "football" | "basketball") => {
    if (!teamId) return;
    setSportTypeLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ team_id: teamId, sport_type: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to update");
      }
      const data = await res.json();
      setSportType(next);
      // Basketball auto-sets indoor mode
      if (next === "basketball") setIndoorMode(true);
      else setIndoorMode(data.indoor_mode ?? false);
    } catch (err) {
      setIndoorModeError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSportTypeLoading(false);
    }
  }, [teamId, supabase]);

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

      {/* ── Sport Type ────────────────────────────────────────────────── */}
      {teamId && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sport / Íþrótt</div>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">
            {sportType === "basketball" ? "Körfubolti / Basketball" : "Fótbolti / Football"}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            {sportType === "basketball"
              ? "Basketball signal weights: PlayerLoad 30%, IMA 28%, Dynamic High 24%, Dynamic Med 14%, Running High 4%. Always indoor mode."
              : "Football uses GPS outdoors or FMP indoors. Signal weights optimized for football movement patterns."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={sportTypeLoading}
              onClick={() => changeSportType("football")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                sportType === "football"
                  ? "bg-zinc-900 text-white"
                  : "border bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
              } ${sportTypeLoading ? "opacity-50 cursor-wait" : ""}`}
            >
              Fótbolti
            </button>
            <button
              type="button"
              disabled={sportTypeLoading}
              onClick={() => changeSportType("basketball")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                sportType === "basketball"
                  ? "bg-orange-600 text-white"
                  : "border bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
              } ${sportTypeLoading ? "opacity-50 cursor-wait" : ""}`}
            >
              Körfubolti
            </button>
          </div>
          {sportType === "basketball" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">PlayerLoad 30%</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">IMA Total 28%</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">Dynamic High 24%</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">Dynamic Med 14%</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">Running High 4%</span>
            </div>
          )}
        </section>
      )}

      {/* ── Operating Mode: Full Suite vs GPS Intelligence Only ─────── */}
      {teamId && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Operating mode / Rekstrarmáti</div>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">
              {usesWellnessFeatures ? "Full Intelligence Suite" : "GPS Intelligence Only"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              {usesWellnessFeatures
                ? "Wellness (check-in, RPE, wearables) er virkur með GPS og IMA gögnum. AI ákvarðanir reiknast út frá öllu saman."
                : "Bara GPS og IMA gögn — check-in, RPE og wearable kröfur eru faldar fyrir leikmenn. ACWR og Foster nota external load (player_load) í staðinn fyrir sRPE."}
            </p>
            {wellnessModeError && (
              <div className="mt-2 text-sm text-red-600">{wellnessModeError}</div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Card 1 — Full Suite */}
            <button
              type="button"
              disabled={wellnessModeLoading}
              onClick={() => {
                if (usesWellnessFeatures) return;
                setWellnessConfirmOpen(true);
              }}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                usesWellnessFeatures
                  ? "border-emerald-600 bg-emerald-50 shadow-sm"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
              } ${wellnessModeLoading ? "opacity-60 cursor-wait" : ""}`}
            >
              {usesWellnessFeatures && (
                <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Active</span>
              )}
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">🧠</span>
                <div className="text-base font-semibold text-zinc-900">Full Intelligence Suite</div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                Wellness check-in, session RPE, wearable sync (Polar/Whoop), daglegar AI ákvarðanir, Foster og ACWR á sRPE × duration, og full GPS + IMA Intelligence.
              </p>
              <ul className="mt-3 space-y-1 text-[11px] text-zinc-700">
                <li>✓ Daglegt wellness check-in</li>
                <li>✓ Session RPE með AI ákvörðunum</li>
                <li>✓ Wearable HRV + svefn sync</li>
                <li>✓ Foster / ACWR á sRPE</li>
                <li>✓ Allt GPS + IMA</li>
              </ul>
              <p className="mt-3 text-[10px] italic text-zinc-500">Best fyrir lið sem vilja byggja inn wellness í daglegri þjálfun.</p>
            </button>

            {/* Card 2 — GPS Only */}
            <button
              type="button"
              disabled={wellnessModeLoading}
              onClick={() => {
                if (!usesWellnessFeatures) return;
                setWellnessConfirmOpen(false);
              }}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                !usesWellnessFeatures
                  ? "border-emerald-600 bg-emerald-50 shadow-sm"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
              } ${wellnessModeLoading ? "opacity-60 cursor-wait" : ""}`}
            >
              {!usesWellnessFeatures && (
                <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Active</span>
              )}
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">📊</span>
                <div className="text-base font-semibold text-zinc-900">GPS Intelligence Only</div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                Allir GPS-driven kort (Sprint, Decel, Stride, IMA, HSR vs MD), Foster og ACWR á external load. Engin check-in, engin RPE, engin wearable krafa frá leikmönnum.
              </p>
              <ul className="mt-3 space-y-1 text-[11px] text-zinc-700">
                <li>✓ Allt GPS + IMA Intelligence</li>
                <li>✓ Foster / ACWR á player_load</li>
                <li>✓ Catapult / STATSports upload</li>
                <li>✗ Wellness check-in (falinn)</li>
                <li>✗ RPE og wearable (falin)</li>
              </ul>
              <p className="mt-3 text-[10px] italic text-zinc-500">Best fyrir lið með Catapult/STATSports sem vilja ekki krefjast wellness frá leikmönnum.</p>
            </button>
          </div>

          <p className="mt-3 text-[11px] text-zinc-500">
            Þú getur skipt um mode hvenær sem er. Söguleg gögn haldast óbreytt — bara sýnileiki á UI breytist. Notifications fyrir check-in/RPE eru sjálfvirkt slökkt í GPS-only mode.
          </p>

          {/* Confirm dialog */}
          {wellnessConfirmOpen !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-base font-semibold text-zinc-900">
                  {wellnessConfirmOpen
                    ? "Skipta yfir í Full Intelligence Suite?"
                    : "Skipta yfir í GPS Intelligence Only?"}
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  {wellnessConfirmOpen
                    ? "Þetta virkjar wellness check-in, RPE, wearable sync, og daglegar AI ákvarðanir fyrir alla leikmenn. Söguleg gögn haldast óbreytt — bara sýnileiki á UI breytist."
                    : "Þetta felur check-in, RPE, wearable og decision card fyrir alla leikmenn í liðinu. Notifications fyrir check-in/RPE slökkva. GPS, IMA og external-load kort virka eins og venjulega. Þú getur skipt aftur til baka hvenær sem er."}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setWellnessConfirmOpen(null)}
                    disabled={wellnessModeLoading}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Hætta við
                  </button>
                  <button
                    type="button"
                    onClick={() => setWellnessMode(wellnessConfirmOpen)}
                    disabled={wellnessModeLoading}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {wellnessModeLoading ? "Vista…" : "Staðfesta"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Load monitoring mode (Auto / Indoor / Outdoor) ───────────── */}
      {teamId && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Load monitoring mode</div>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                {trainingMode === "auto" ? "Auto-detect"
                  : trainingMode === "indoor" ? "Indoor (FMP)"
                  : "Outdoor (GPS)"}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-zinc-600">
                {trainingMode === "auto" ? "System picks Indoor or Outdoor pipeline per player based on recent session activity. Use this when the team flips between modes mid-week."
                  : trainingMode === "indoor" ? "Forces FMP / PlayerLoad / IMA pipeline (höll-mode). GPS metrics ignored. Best for hall season or indoor sports."
                  : "Forces GPS pipeline (HIR, velocity bands, sprint count). FMP indoor metrics ignored. Best for outdoor pitch season."}
              </p>
              {sportType === "basketball" && (
                <div className="mt-2 text-xs text-indigo-600">Körfubolti notar alltaf indoor mode / Basketball always uses indoor mode</div>
              )}
              {indoorModeError && (
                <div className="mt-2 text-sm text-red-600">{indoorModeError}</div>
              )}
            </div>
            {/* 3-state segmented control */}
            <div className={`inline-flex w-fit rounded-xl border border-zinc-200 bg-zinc-50 p-1 ${indoorModeLoading || sportType === "basketball" ? "opacity-50 pointer-events-none" : ""}`}>
              {(["auto", "indoor", "outdoor"] as const).map((mode) => {
                const active = trainingMode === mode;
                const label = mode === "auto" ? "🤖 Auto" : mode === "indoor" ? "🏟️ Indoor" : "🌿 Outdoor";
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={indoorModeLoading || sportType === "basketball"}
                    onClick={() => setTrainingModeRemote(mode)}
                    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? mode === "indoor" ? "bg-indigo-600 text-white shadow-sm"
                          : mode === "outdoor" ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {/* Two-layer composite breakdown.
                Indoor & outdoor pipelines both have:
                  · top-level composite (the verdict input)
                  · NBS sub-layer (per-signal spike-ratio weights)
                Both shown so coach can see the full chain from raw
                Catapult signal → NBS subscore → top composite verdict. */}
            {trainingMode === "indoor" && (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900/70">Top composite (verdict input)</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">Player Load 40%</span>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">FMP Dynamic High % 33%</span>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">IMA Total 27%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">HMLD and Decel B2-3 → session context, not composite (Catapult derives them with GPS context, noisy indoors). McBurnie indoor ratio still uses Decel B2-3.</p>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900/70">Indoor NBS sub-layer (dashboard signals)</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">FMP Dynamic High 34%</span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">PlayerLoad Spike 26%</span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">IMA Total Spike 20%</span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">FMP Dynamic Med 14%</span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">FMP Running High 6%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">Each signal becomes a today/28d-baseline ratio, normalised 0–1 against an alert threshold, then weighted into the NBS subscore (0–1). Drives the dashboard external-load chip + feeds outdoor-mode composite.</p>
                </div>
              </div>
            )}
            {trainingMode === "outdoor" && (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/70">Top composite (verdict input)</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">RPE ACWR 40%</span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">GPS NBS 35%</span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Metabolic Load Score 25%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">Safety nets bump concern up when triggered: Residual MLI (3d mechanical), Residual Decel (3d eccentric), Decel Burden (today), HID% fatigue trend (Harper 2019), Accel:Decel ratio.</p>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/70">GPS NBS sub-layer</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">HIR Spike 34%</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Decel Spike 26%</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Density Stress 20%</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Max Velocity Exposure 14%</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Band 6 (sprint) Distance 6%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">Each signal becomes a today/28d-baseline ratio, normalised 0–1 against an alert threshold, then weighted into the NBS subscore (0–1) that feeds the top composite at 35%.</p>
                </div>
              </div>
            )}
            {trainingMode === "auto" && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">Per-player heuristic picks Indoor or Outdoor pipeline based on recent session counts</span>
            )}
          </div>
        </section>
      )}

      {/* ── Elite: Club branding for PWA ──────────────────────────────────── */}
      {effectivePlan === "ELITE" && (
        <ClubBrandingSettings />
      )}

      {/* ── Elite: Auto-send AI recovery messages (Stig 2) ─────────────── */}
      {effectivePlan === "ELITE" && teamId && (
        <AutoSendRecoveryMessageSettings teamId={teamId} />
      )}

      {/* ── Catapult data tier (Lite Mode) — visible to all teams ──────── */}
      {teamId && (
        <CatapultDataTierSettings teamId={teamId} />
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
