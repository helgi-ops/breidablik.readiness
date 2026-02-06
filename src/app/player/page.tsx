"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { flagUi, normalizeFlag, type Flag } from "@/lib/flagUi";

type ProfileRow = {
  id: string;
  display_name: string | null;
  player_id: string | null;
  role: string | null;
  team_id?: string | null;
};

type PlayerRow = {
  id: string;
  full_name: string | null;
  position: string | null;
  team: string | null;
};

type MetricsRow =
  | {
      readiness: number | null;
      sleep: number | null;
      soreness: number | null;
      total_score: number | null;
      created_at: string | null;
    }
  | null;

type GenericMsg =
  | {
      title?: string | null;
      message: string;
      why?: string | null;
    }
  | null;

/**
 * Plan row from our NEW canonical view (snapshot-first + template override).
 * Source of truth: v_player_today_microdose_locked
 */
type LockedPlanRow =
  | {
      player_id: string;
      entry_date: string; // date
      readiness_level: string; // GREEN / GREEN_PLUS / YELLOW / RED / UNKNOWN
      md_day: string; // MD-4 / MD-3 / MD-2 / MD-1 / MD+1 / GENERIC

      training_system: string; // FORCE / NEURAL_VELOCITY / POLISH_CALM / ACTIVATION_PRIMER

      plan_title: string | null;
      plan_description: string | null;
      plan_structure: any; // jsonb array

      locked_at: string | null;
      is_locked: boolean;
    }
  | null;

type DecisionRow =
  | {
      planned_focus: string | null; // e.g. "POLISH / CALM"
      final_planned_day_type: string | null; // TRAIN / RECOVERY / OFF / FULL ...
      readiness_flag: string | null; // GREEN / YELLOW / RED / UNKNOWN
    }
  | null;

/**
 * ✅ Session row from v_player_session_today
 * ATH: planned_day_type er EKKI til í view-inu hjá þér -> NOTAUM EKKI.
 * ATH: system_key er EKKI til í view-inu hjá þér -> NOTAUM EKKI.
 */
type PlayerSessionTodayRow =
  | {
      player_id: string;
      team_id: string | null;
      day_date: string; // date
      planned_focus: string | null; // "POLISH / CALM" o.s.frv.
      readiness_flag: string | null; // GREEN/YELLOW/RED/UNKNOWN
      session_type: string | null; // t.d. POLISH_CALM / ACTIVATION_PRIMER
      md_day_resolved: string | null; // t.d. MD-2
    }
  | null;

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function isArray(x: any): x is any[] {
  return Array.isArray(x);
}

function norm(x: string | null | undefined) {
  return (x ?? "").trim().toUpperCase();
}

/**
 * System -> flag mapping (for UI color/message).
 * NOTE: We keep it simple:
 * - POLISH/CALM, ACTIVATION/PRIMER => GREEN
 * - FORCE, NEURAL/VELOCITY => GREEN (still "good") but you can change later
 * Readiness overrides system if present (since it’s user state).
 */
function systemToFlag(system: string | null | undefined): Flag {
  const s = norm(system);
  if (s === "POLISH_CALM") return "GREEN";
  if (s === "ACTIVATION_PRIMER") return "GREEN";
  if (s === "NEURAL_VELOCITY") return "GREEN";
  if (s === "FORCE") return "GREEN";
  return "GREEN";
}

function readinessToFlag(level: string | null | undefined): Flag {
  const l = norm(level);
  if (l === "RED") return "RED";
  if (l === "YELLOW") return "YELLOW";
  return "GREEN";
}

export default function PlayerPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // Link UI (ef profile.player_id vantar)
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  // Player meta
  const [playerMeta, setPlayerMeta] = useState<PlayerRow | null>(null);

  // Plan + metrics
  const [plan, setPlan] = useState<LockedPlanRow>(null);
  const [metrics, setMetrics] = useState<MetricsRow>(null);

  // Decision (optional debug/context)
  const [decision, setDecision] = useState<DecisionRow>(null);

  // ✅ Session (optional - useful for “Session type”)
  const [session, setSession] = useState<PlayerSessionTodayRow>(null);

  // Optional: generic messages per flag
  const [genericMsg, setGenericMsg] = useState<GenericMsg>(null);

  async function loadGenericMessage(teamId: string | null, flag: Flag) {
    if (teamId) {
      const { data: teamMsg } = await supabase
        .from("player_flag_messages")
        .select("title, message, why")
        .eq("team_id", teamId)
        .eq("flag", flag)
        .eq("lang", "is")
        .eq("is_active", true)
        .maybeSingle();

      if (teamMsg?.message) return teamMsg as any;
    }

    const { data: globalMsg } = await supabase
      .from("player_flag_messages")
      .select("title, message, why")
      .is("team_id", null)
      .eq("flag", flag)
      .eq("lang", "is")
      .eq("is_active", true)
      .maybeSingle();

    return (globalMsg as any) ?? null;
  }

  // ====== Initial load ======
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      setPlan(null);
      setMetrics(null);
      setGenericMsg(null);
      setPlayerMeta(null);
      setDecision(null);
      setSession(null);

      // Auth
      const { data: auth, error: aErr } = await supabase.auth.getUser();
      if (aErr) {
        setError(aErr.message);
        setLoading(false);
        return;
      }
      const userId = auth?.user?.id;
      if (!userId) {
        setError("Ekki innskráður.");
        setLoading(false);
        return;
      }

      // Profile
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, player_id, role, team_id")
        .eq("id", userId)
        .maybeSingle();

      if (pErr) {
        setError(pErr.message);
        setLoading(false);
        return;
      }

      setProfile((prof as any) ?? null);

      // Link UI
      if (!prof?.player_id) {
        const { data: list, error: lErr } = await supabase
          .from("players")
          .select("id, full_name, position, team")
          .order("full_name", { ascending: true });

        if (lErr) {
          setError(lErr.message);
          setLoading(false);
          return;
        }

        setPlayers((list as PlayerRow[]) ?? []);
        setLoading(false);
        return;
      }

      const today = todayISO();

      // Player meta
      const { data: pm, error: pmErr } = await supabase
        .from("players")
        .select("id, full_name, position, team")
        .eq("id", prof.player_id)
        .maybeSingle();

      if (pmErr) console.error("players meta error:", pmErr.message);
      setPlayerMeta((pm as any) ?? null);

      // Decision row (optional debug)
      const { data: drow, error: dErr } = await supabase
        .from("v_player_daily_decision_v3")
        .select("planned_focus, final_planned_day_type, readiness_flag")
        .eq("player_id", prof.player_id)
        .eq("day_date", today)
        .maybeSingle();

      if (dErr) console.error("decision error:", dErr.message);
      setDecision((drow as any) ?? null);

      // ✅ Session row (system_key removed)
      const { data: srow, error: sErr } = await supabase
        .from("v_player_session_today")
        .select(
          "player_id,team_id,day_date,planned_focus,readiness_flag,session_type,md_day_resolved"
        )
        .eq("player_id", prof.player_id)
        .eq("day_date", today)
        .maybeSingle();

      if (sErr) {
        // Ekki brjóta síðuna ef session view er ekki tilbúið
        console.error("v_player_session_today error:", sErr.message);
      }
      setSession((srow as any) ?? null);

      // ✅ Plan from canonical view (NO order/limit needed)
      const { data: planRow, error: planErr } = await supabase
        .from("v_player_today_microdose_locked")
        .select(
          "player_id,entry_date,readiness_level,md_day,training_system,plan_title,plan_description,plan_structure,locked_at,is_locked"
        )
        .eq("player_id", prof.player_id)
        .eq("entry_date", today)
        .maybeSingle();

      if (planErr) {
        setError(planErr.message);
        setLoading(false);
        return;
      }

      setPlan((planRow as any) ?? null);

      // Metrics (optional)
      const { data: mrow, error: mErr } = await supabase
        .from("readiness_entries")
        .select("readiness, sleep, soreness, total_score, created_at")
        .eq("player_id", prof.player_id)
        .eq("entry_date", today)
        .maybeSingle();

      if (mErr) console.error("readiness_entries metrics error:", mErr.message);
      setMetrics((mrow as any) ?? null);

      setLoading(false);
    };

    run();
  }, [supabase]);

  // ====== Flag for UI (readiness first, fallback to system)
  const flag: Flag = useMemo(() => {
    const byReadiness = readinessToFlag(plan?.readiness_level);
    if (!plan?.readiness_level) return systemToFlag(plan?.training_system);
    return byReadiness;
  }, [plan?.readiness_level, plan?.training_system]);

  const ui = useMemo(
    () => flagUi(normalizeFlag(flag)),
    [flag]
  ) as ReturnType<typeof flagUi>;

  // ====== Generic message layer
  useEffect(() => {
    const run = async () => {
      if (!profile) return;
      const teamId = (profile as any)?.team_id ?? null;
      const msg = await loadGenericMessage(teamId, flag);
      setGenericMsg(msg);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, flag]);

  const message = useMemo(() => {
    return genericMsg?.message || ui.playerMessage;
  }, [genericMsg, ui.playerMessage]);

  const why = useMemo(() => {
    return genericMsg?.why || ui.why;
  }, [genericMsg, ui.why]);

  async function linkPlayer() {
    try {
      setError("");
      if (!profile?.id) return;

      if (!selectedPlayerId) {
        setError("Veldu leikmann fyrst.");
        return;
      }

      const { error: uErr } = await supabase
        .from("profiles")
        .update({ player_id: selectedPlayerId })
        .eq("id", profile.id);

      if (uErr) {
        setError(uErr.message);
        return;
      }

      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? "Óþekkt villa.");
    }
  }

  // ================= UI STATES =================

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
            <div className="mt-3 h-3 w-80 animate-pulse rounded bg-zinc-200" />
            <div className="mt-6 h-24 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-red-700">Villa</div>
            <div className="mt-2 text-sm text-zinc-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  // Link UI
  if (profile && !profile.player_id) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-xs font-medium text-zinc-500">
              Player · Setup
            </div>
            <div className="mt-2 text-xl font-semibold text-zinc-900">
              Tengja notanda við leikmann
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              Þetta er til að þú getir prófað player-síðuna. Seinna getum við
              gert auto-link.
            </div>

            <div className="mt-6 rounded-xl border bg-zinc-50 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Veldu leikmann
              </label>

              <select
                className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
              >
                <option value="">— Veldu —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? "Ónefndur"}{" "}
                    {p.position ? `(${p.position})` : ""}{" "}
                    {p.team ? `· ${p.team}` : ""}
                  </option>
                ))}
              </select>

              <button
                onClick={linkPlayer}
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Vista tengingu
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Empty-state: No locked plan yet (healthy state)
  if (!plan) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-base font-semibold">
              Engin æfing hefur verið læst enn í dag
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              Þetta er eðlilegt ef þú ert ekki búinn að checka inn eða ef
              dagsplan er ekki “locked” enn. Prófaðu að fara í{" "}
              <b>/player/checkin</b> og skrá þig.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const name = playerMeta?.full_name ?? "Leikmaður";
  const position = (playerMeta?.position ?? "").toUpperCase();
  const team = playerMeta?.team ?? "";

  const showStructure =
    isArray(plan.plan_structure) && plan.plan_structure.length > 0;

  // Debug string (NO hooks)
  const debugLine =
    `today=${todayISO()} | ` +
    `decision_focus=${decision?.planned_focus ?? "-"} | ` +
    `decision_day_type=${decision?.final_planned_day_type ?? "-"} | ` +
    `md_day=${plan.md_day ?? "-"} | ` +
    `session_type=${session?.session_type ?? "-"} | ` +
    `system=${plan.training_system ?? "-"} | ` +
    `title=${plan.plan_title ?? "-"}`;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className={`rounded-2xl border bg-white p-6 shadow-sm ${ui.panel}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-zinc-500">
                Player · Dagsæfing
              </div>
              <div className="mt-2 text-xl font-semibold text-zinc-900">
                {name}
              </div>
              <div className="mt-1 text-sm text-zinc-600">
                {position}
                {team ? ` · ${team}` : ""}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {plan.is_locked ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-semibold text-zinc-900">
                  🔒 LÆST
                  <span className="text-xs font-medium text-zinc-500">
                    {plan.locked_at
                      ? new Date(plan.locked_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-semibold text-zinc-900">
                  ⏳ Ólæst
                </div>
              )}

              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${ui.pill}`}
              >
                <span className={`h-2 w-2 rounded-full ${ui.dot}`} />
                {ui.label}
              </div>
            </div>
          </div>

          {/* Debug (comment out later) */}
          <div className="mt-4 rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-700">
            {debugLine}
          </div>

          {/* Header stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Dagsetning" value={plan.entry_date} />
            <Stat label="Readiness" value={plan.readiness_level} />
            <Stat label="Kerfi" value={plan.training_system} />
            <Stat label="Session type" value={session?.session_type ?? "—"} />
          </div>

          {/* Message */}
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Skilaboð til þín
            </div>
            <div className="mt-2 rounded-xl border bg-zinc-50 p-4 text-sm text-zinc-800">
              {message}
            </div>
          </div>

          {/* Why */}
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Af hverju?
            </div>
            <div className="mt-2 rounded-xl border bg-white p-4 text-sm text-zinc-700">
              {why}
            </div>
          </div>

          {/* Plan card */}
          <div className="mt-6 rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Æfing dagsins
                </div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">
                  {plan.plan_title ?? "Microdose plan"}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {plan.plan_description ?? "—"}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-medium text-zinc-500">Staða</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {plan.is_locked ? "Læst" : "Ólæst"}
                </div>
              </div>
            </div>

            {showStructure ? (
              <div className="mt-4 space-y-3">
                {plan.plan_structure.map((b: any, idx: number) => (
                  <div key={idx} className="rounded-xl border bg-zinc-50 p-3">
                    <div className="text-sm font-semibold text-zinc-900">
                      {b?.block ?? `Block ${idx + 1}`}
                    </div>

                    {isArray(b?.items) && b.items.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                        {b.items.map((it: any, j: number) => (
                          <li key={j}>{String(it)}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-sm text-zinc-600">
                        Engin atriði skilgreind.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-zinc-600">
                Engin “structure” skilgreind (template vantar eða er tóm).
              </div>
            )}
          </div>

          {/* Metrics */}
          <details className="mt-6 rounded-xl border bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900">
              Mælingar dagsins{" "}
              <span className="ml-2 text-xs font-medium text-zinc-500">
                (Readiness · Svefn · Stífleiki)
              </span>
            </summary>

            <div className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Readiness" value={metrics?.readiness ?? "—"} />
                <Stat label="Svefn" value={metrics?.sleep ?? "—"} />
                <Stat label="Stífleiki" value={metrics?.soreness ?? "—"} />
              </div>

              <div className="mt-3 text-xs text-zinc-500">
                Skráð:{" "}
                {metrics?.created_at
                  ? new Date(metrics.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
