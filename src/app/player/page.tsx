"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { flagUi, normalizeFlag, type Flag } from "@/lib/flagUi";

type ProfileRow = {
  id: string;
  display_name: string | null;
  player_id: string | null;
  role: string | null;
  team_id?: string | null; // ✅ til að ná í team message ef þú ert með team_id í profiles
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
 * ✅ Plan row from LOCKED view
 * Þetta er eina sem player UI á að nota til að birta æfinguna.
 */
type LockedPlanRow =
  | {
      player_id: string;
      entry_date: string; // date
      readiness_level: string; // GREEN / GREEN_PLUS / YELLOW / RED
      md_day: string; // MD-4 / MD-3 / ... eða GENERIC

      plan_title: string | null;
      plan_description: string | null;
      plan_structure: any; // jsonb array

      locked_at: string | null;
      is_locked: boolean;
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

function readinessToFlag(level: string | null | undefined): Flag {
  const l = (level ?? "").toUpperCase();
  if (l === "RED") return "RED";
  if (l === "YELLOW") return "YELLOW";
  // GREEN_PLUS + GREEN -> GREEN
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

  // Optional: generic messages per flag
  const [genericMsg, setGenericMsg] = useState<GenericMsg>(null);

  async function loadGenericMessage(teamId: string | null, flag: Flag) {
    // team-specific
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

    // global fallback
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

      // Profile (include team_id if exists)
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

      // ✅ 1) Plan from LOCKED view (snapshot-first)
      const { data: planRow, error: planErr } = await supabase
        .from("v_player_microdose_plan_today_locked")
        .select(
          "player_id,entry_date,readiness_level,md_day,plan_title,plan_description,plan_structure,locked_at,is_locked"
        )
        .eq("player_id", prof.player_id)
        .maybeSingle();

      if (planErr) {
        setError(planErr.message);
        setLoading(false);
        return;
      }

      setPlan((planRow as any) ?? null);

      // 2) Metrics (optional) - today
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

  // ====== Flag: frá plan.readiness_level (ekki daily_workout)
  const flag: Flag = useMemo(() => readinessToFlag(plan?.readiness_level), [plan?.readiness_level]);

  // ✅ UI “source of truth” — skýrt týpað
  const ui = useMemo(() => flagUi(normalizeFlag(flag)), [flag]) as ReturnType<typeof flagUi>;

  // ====== Generic message layer (valfrjálst)
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

  // ✅ Message: override frá DB ef til, annars `flagUi(...).playerMessage`
  const message = useMemo(() => {
    // þú getur líka valið að sýna plan_title sem “message”
    return genericMsg?.message || ui.playerMessage;
  }, [genericMsg, ui.playerMessage]);

  const why = useMemo(() => {
    // why er “reglur/af hverju”; plan_description er “hvað á að gera”
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
            <div className="text-xs font-medium text-zinc-500">Player · Setup</div>
            <div className="mt-2 text-xl font-semibold text-zinc-900">Tengja notanda við leikmann</div>
            <div className="mt-2 text-sm text-zinc-600">
              Þetta er til að þú getir prófað player-síðuna. Seinna getum við gert auto-link.
            </div>

            <div className="mt-6 rounded-xl border bg-zinc-50 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Veldu leikmann</label>

              <select
                className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
              >
                <option value="">— Veldu —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? "Ónefndur"} {p.position ? `(${p.position})` : ""} {p.team ? `· ${p.team}` : ""}
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

  // ✅ Ef ekkert plan finnst fyrir today
  if (!plan) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-base font-semibold">Engin dagsæfing í dag</div>
            <div className="mt-2 text-sm text-zinc-600">
              Þetta gerist ef <b>week-setup</b> vantar fyrir liðið í dag eða ef template vantar fyrir{" "}
              <code>(md_day, readiness_level)</code>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const name = playerMeta?.full_name ?? "Leikmaður";
  const position = (playerMeta?.position ?? "").toUpperCase();
  const team = playerMeta?.team ?? "";

  const showStructure = isArray(plan.plan_structure) && plan.plan_structure.length > 0;

  // ================= MAIN =================
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className={`rounded-2xl border bg-white p-6 shadow-sm ${ui.panel}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-zinc-500">Player · Dagsæfing</div>
              <div className="mt-2 text-xl font-semibold text-zinc-900">{name}</div>
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
                      ? new Date(plan.locked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-semibold text-zinc-900">
                  ⏳ Ólæst
                </div>
              )}

              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${ui.pill}`}>
                <span className={`h-2 w-2 rounded-full ${ui.dot}`} />
                {ui.label}
              </div>
            </div>
          </div>

          {/* Header stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Dagsetning" value={plan.entry_date} />
            <Stat label="Readiness" value={plan.readiness_level} />
            <Stat label="MD" value={plan.md_day} />
            <Stat label="Check-in" value={metrics ? "Skráð" : "Vantar"} />
          </div>

          {/* Message */}
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Skilaboð til þín</div>
            <div className="mt-2 rounded-xl border bg-zinc-50 p-4 text-sm text-zinc-800">{message}</div>
          </div>

          {/* Why */}
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Af hverju?</div>
            <div className="mt-2 rounded-xl border bg-white p-4 text-sm text-zinc-700">{why}</div>
          </div>

          {/* Plan card */}
          <div className="mt-6 rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Æfing dagsins</div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">{plan.plan_title ?? "Microdose plan"}</div>
                <div className="mt-1 text-sm text-zinc-600">{plan.plan_description ?? "—"}</div>
              </div>

              <div className="text-right">
                <div className="text-xs font-medium text-zinc-500">Staða</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{plan.is_locked ? "Læst" : "Ólæst"}</div>
              </div>
            </div>

            {showStructure ? (
              <div className="mt-4 space-y-3">
                {plan.plan_structure.map((b: any, idx: number) => (
                  <div key={idx} className="rounded-xl border bg-zinc-50 p-3">
                    <div className="text-sm font-semibold text-zinc-900">{b?.block ?? `Block ${idx + 1}`}</div>

                    {isArray(b?.items) && b.items.length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                        {b.items.map((it: any, j: number) => (
                          <li key={j}>{String(it)}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-sm text-zinc-600">Engin atriði skilgreind.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-zinc-600">Engin “structure” skilgreind (template vantar eða er tóm).</div>
            )}
          </div>

          {/* Metrics */}
          <details className="mt-6 rounded-xl border bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900">
              Mælingar dagsins{" "}
              <span className="ml-2 text-xs font-medium text-zinc-500">(Readiness · Svefn · Stífleiki)</span>
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
                  ? new Date(metrics.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
