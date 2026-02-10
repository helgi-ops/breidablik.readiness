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
      planned_focus: string | null;
      final_planned_day_type: string | null;
      readiness_flag: string | null;
    }
  | null;

type PlayerSessionTodayRow =
  | {
      player_id: string;
      team_id: string | null;
      day_date: string; // date
      planned_focus: string | null;
      readiness_flag: string | null;
      session_type: string | null;
      md_day_resolved: string | null;
    }
  | null;

type VariantRow = {
  id: string;
  md_day: string;
  readiness_level: string;
  variant: string; // A/B/C
  title: string | null;
  description: string | null;
  structure: any;
};

// ============================
// ✅ Post-training types (DB)
// ============================
type PostTrainingRuleRow = {
  id: string;
  priority: number;
  is_active: boolean;
  when_clause: any; // jsonb
  then_clause: any; // jsonb
};

type PostTrainingTemplateRow = {
  id: string;
  title: string;
  duration_min: number;
  tags: string[];
  structure: any; // jsonb
  is_active: boolean;
};

// ============================
// ✅ Fix modules (from check-in notes)
// ============================
type FixModule = {
  tag: string;
  title: string;
  structure: any; // jsonb
};

type FixRow = {
  player_id: string;
  checkin_id: string;
  created_at: string;
  fix_modules: FixModule[];
};

// ✅ Dedupe helper (top-level; safe for hooks rules)
function dedupeFixModulesByTag(input: FixModule[] | null | undefined): FixModule[] {
  const list = Array.isArray(input) ? input : [];
  const map = new Map<string, FixModule>();

  for (const m of list) {
    const tag = (m?.tag ?? "").trim();
    if (!tag) continue;
    if (!map.has(tag)) map.set(tag, m); // keep first occurrence
  }
  return Array.from(map.values());
}

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

function isStaffRole(role: string | null | undefined) {
  const r = norm(role);
  return r === "COACH" || r === "ADMIN" || r === "STAFF";
}

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

type DecisionType = "FULL" | "REDUCED" | "RECOVERY";

function inferDecisionType(decision: DecisionRow, plan: LockedPlanRow): DecisionType {
  const dt = norm(decision?.final_planned_day_type);
  if (dt.includes("OFF") || dt.includes("REST") || dt.includes("RECOVER")) return "RECOVERY";
  if (dt.includes("REDUCED") || dt.includes("LIGHT") || dt.includes("MOD")) return "REDUCED";
  return "FULL";
}

function decisionToText(d: DecisionType) {
  if (d === "FULL") return "FULL";
  if (d === "REDUCED") return "REDUCED";
  return "RECOVERY";
}

function decisionSubtitle(d: DecisionType) {
  if (d === "FULL") return "Framkvæmdu æfinguna eins og hún er sett upp.";
  if (d === "REDUCED") return "Framkvæmdu aðeins það sem er hér fyrir neðan (engin viðbót).";
  return "Endurheimt í dag. Fylgdu leiðbeiningunum hér fyrir neðan.";
}

function mdContextLabel(mdDay: string | null | undefined) {
  const md = norm(mdDay);
  if (!md) return "—";
  return md;
}

// =======================================
// ✅ Post-training rule evaluation (client)
// =======================================
type SessionLoad = "LOW" | "MODERATE" | "HIGH" | null;

type PostTrainingContext = {
  mdDay: string | null;
  sessionLoad: SessionLoad;
  sprintExposure: boolean;
  matchLike: boolean;
};

function matchesWhenClause(ctx: PostTrainingContext, whenClause: any): boolean {
  if (!whenClause || typeof whenClause !== "object") return false;

  if (Array.isArray(whenClause.md_day_in)) {
    if (!ctx.mdDay) return false;
    return whenClause.md_day_in.includes(ctx.mdDay);
  }

  if (Array.isArray(whenClause.or)) {
    return whenClause.or.some((cond: any) => matchesWhenClause(ctx, cond));
  }

  if (typeof whenClause.session_load === "string") {
    return ctx.sessionLoad === whenClause.session_load;
  }

  if (typeof whenClause.sprint_exposure === "boolean") {
    return ctx.sprintExposure === whenClause.sprint_exposure;
  }

  if (typeof whenClause.match_like === "boolean") {
    return ctx.matchLike === whenClause.match_like;
  }

  return false;
}

function evaluatePostTrainingTemplateIds(
  ctx: PostTrainingContext,
  rules: PostTrainingRuleRow[],
  alwaysInclude: string[] = ["daily_neural_reset"]
): string[] {
  const out: string[] = [...alwaysInclude];

  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const r of sorted) {
    if (!r?.is_active) continue;
    if (!matchesWhenClause(ctx, r.when_clause)) continue;

    const append: string[] = Array.isArray(r?.then_clause?.append) ? r.then_clause.append : [];
    for (const id of append) {
      if (!out.includes(id)) out.push(id);
    }
  }

  return out;
}

// =======================================
// ✅ Session type heuristics (best effort)
// =======================================
function inferMatchLike(sessionTypeRaw: string | null | undefined) {
  const s = norm(sessionTypeRaw);
  return s.includes("MATCH") || s.includes("LEIKUR") || s.includes("GAME");
}

function inferSprintExposure(sessionTypeRaw: string | null | undefined) {
  const s = norm(sessionTypeRaw);
  return s.includes("SPRINT") || s.includes("SPEED") || s.includes("HSS");
}

export default function PlayerPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  const [playerMeta, setPlayerMeta] = useState<PlayerRow | null>(null);

  const [plan, setPlan] = useState<LockedPlanRow>(null);
  const [metrics, setMetrics] = useState<MetricsRow>(null);

  const [decision, setDecision] = useState<DecisionRow>(null);
  const [session, setSession] = useState<PlayerSessionTodayRow>(null);

  const [genericMsg, setGenericMsg] = useState<GenericMsg>(null);

  const [variantOptions, setVariantOptions] = useState<VariantRow[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [savingVariant, setSavingVariant] = useState<boolean>(false);

  const [lockedVariantId, setLockedVariantId] = useState<string>("");

  const [postTraining, setPostTraining] = useState<PostTrainingTemplateRow[]>([]);
  const [postTrainingErr, setPostTrainingErr] = useState<string>("");

  const [fixRow, setFixRow] = useState<FixRow | null>(null);
  const [fixErr, setFixErr] = useState<string>("");

  const staffMode = useMemo(() => isStaffRole(profile?.role), [profile?.role]);

  // ✅ MUST be above early returns (Rules of Hooks)
  const fixModules = useMemo(() => dedupeFixModulesByTag(fixRow?.fix_modules), [fixRow?.fix_modules]);

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

  async function reloadPlan(playerId: string, day: string) {
    const { data: planRow, error: planErr } = await supabase
      .from("v_player_today_microdose_locked")
      .select(
        "player_id,entry_date,readiness_level,md_day,training_system,plan_title,plan_description,plan_structure,locked_at,is_locked"
      )
      .eq("player_id", playerId)
      .eq("entry_date", day)
      .maybeSingle();

    if (planErr) throw planErr;
    setPlan((planRow as any) ?? null);
  }

  async function loadLockedVariantId(playerId: string, day: string) {
    const { data: lockRow, error: lErr } = await supabase
      .from("player_microdose_plan_locks")
      .select("variant_id")
      .eq("player_id", playerId)
      .eq("entry_date", day)
      .maybeSingle();

    if (lErr) {
      console.error("loadLockedVariantId error:", lErr.message);
      setLockedVariantId("");
      return;
    }

    const vid = (lockRow as any)?.variant_id ?? "";
    setLockedVariantId(vid || "");
  }

  async function loadVariantsForToday(playerId: string, mdDay: string, readinessLevel: string) {
    const { data: opts, error: oErr } = await supabase
      .from("microdose_template_variants")
      .select("id, md_day, readiness_level, variant, title, description, structure")
      .eq("md_day", mdDay)
      .eq("readiness_level", readinessLevel)
      .order("variant", { ascending: true })
      .limit(3);

    if (oErr) throw oErr;

    const options = ((opts as any) ?? []) as VariantRow[];
    setVariantOptions(options);

    if (lockedVariantId) {
      const found = options.find((x) => x.id === lockedVariantId);
      if (found) {
        setSelectedVariantId(found.id);
        return;
      }
    }

    const a = options.find((x) => norm(x.variant) === "A");
    if (a) setSelectedVariantId(a.id);
    else if (options[0]?.id) setSelectedVariantId(options[0].id);
  }

  async function chooseVariantStaffOnly(v: VariantRow) {
    if (!profile?.player_id) return;
    if (!staffMode) return;

    const playerId = profile.player_id;
    const day = todayISO();

    try {
      setSavingVariant(true);
      setError("");

      const mdDay = plan?.md_day ?? v.md_day;
      const readinessLevel = plan?.readiness_level ?? v.readiness_level;

      if (!mdDay || !readinessLevel) throw new Error("Vantar md_day eða readiness_level til að vista.");
      if (!v.structure) throw new Error("Valin uppsetning vantar structure (plan_structure).");

      const teamId = session?.team_id ?? (profile as any)?.team_id ?? null;

      const payload: any = {
        player_id: playerId,
        entry_date: day,
        team_id: teamId,
        md_day: mdDay,
        readiness_level: readinessLevel,
        plan_title: v.title ?? null,
        plan_description: v.description ?? null,
        plan_structure: v.structure,
        variant_id: v.id,
        source: "staff_override",
      };

      const { error: upErr } = await supabase
        .from("player_microdose_plan_locks")
        .upsert(payload, { onConflict: "player_id,entry_date" });

      if (upErr) throw upErr;

      setLockedVariantId(v.id);
      setSelectedVariantId(v.id);

      await reloadPlan(playerId, day);
    } catch (e: any) {
      setError(e?.message ?? "Óþekkt villa við að velja uppsetningu.");
    } finally {
      setSavingVariant(false);
    }
  }

  async function loadPostTrainingRecommendations(ctx: PostTrainingContext) {
    try {
      setPostTrainingErr("");

      const { data: rules, error: rErr } = await supabase
        .from("post_training_rules")
        .select("id, priority, is_active, when_clause, then_clause")
        .eq("is_active", true);

      if (rErr) throw rErr;

      const ruleRows = ((rules as any) ?? []) as PostTrainingRuleRow[];

      const ids = evaluatePostTrainingTemplateIds(ctx, ruleRows, ["daily_neural_reset"]);
      if (!ids.length) {
        setPostTraining([]);
        return;
      }

      const { data: tmpls, error: tErr } = await supabase
        .from("post_training_templates")
        .select("id, title, duration_min, tags, structure, is_active")
        .in("id", ids)
        .eq("is_active", true);

      if (tErr) throw tErr;

      const list = ((tmpls as any) ?? []) as PostTrainingTemplateRow[];
      const map = new Map(list.map((t) => [t.id, t]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as PostTrainingTemplateRow[];

      setPostTraining(ordered);
    } catch (e: any) {
      console.error("post-training load error:", e?.message ?? e);
      setPostTrainingErr(e?.message ?? "Villa við að sækja post-training tillögur.");
      setPostTraining([]);
    }
  }

  async function loadFixModulesForPlayer(playerId: string) {
    try {
      setFixErr("");

      const { data, error: fErr } = await supabase
        .from("v_player_fix_modules_latest")
        .select("player_id, checkin_id, created_at, fix_modules")
        .eq("player_id", playerId)
        .maybeSingle();

      if (fErr) throw fErr;

      setFixRow((data as any) ?? null);
    } catch (e: any) {
      console.error("fix modules load error:", e?.message ?? e);
      setFixErr(e?.message ?? "Villa við að sækja ráðlagðar æfingar.");
      setFixRow(null);
    }
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
      setVariantOptions([]);
      setSelectedVariantId("");
      setLockedVariantId("");
      setPostTraining([]);
      setPostTrainingErr("");

      setFixRow(null);
      setFixErr("");

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

      const { data: pm, error: pmErr } = await supabase
        .from("players")
        .select("id, full_name, position, team")
        .eq("id", prof.player_id)
        .maybeSingle();

      if (pmErr) console.error("players meta error:", pmErr.message);
      setPlayerMeta((pm as any) ?? null);

      const { data: drow, error: dErr } = await supabase
        .from("v_player_daily_decision_v3")
        .select("planned_focus, final_planned_day_type, readiness_flag")
        .eq("player_id", prof.player_id)
        .eq("day_date", today)
        .maybeSingle();

      if (dErr) console.error("decision error:", dErr.message);
      setDecision((drow as any) ?? null);

      const { data: srow, error: sErr } = await supabase
        .from("v_player_session_today")
        .select("player_id,team_id,day_date,planned_focus,readiness_flag,session_type,md_day_resolved")
        .eq("player_id", prof.player_id)
        .eq("day_date", today)
        .maybeSingle();

      if (sErr) console.error("v_player_session_today error:", sErr.message);
      setSession((srow as any) ?? null);

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

      await loadLockedVariantId(prof.player_id, today);

      const { data: mrow, error: mErr } = await supabase
        .from("readiness_entries")
        .select("readiness, sleep, soreness, total_score, created_at")
        .eq("player_id", prof.player_id)
        .eq("entry_date", today)
        .maybeSingle();

      if (mErr) console.error("readiness_entries metrics error:", mErr.message);
      setMetrics((mrow as any) ?? null);

      await loadFixModulesForPlayer(prof.player_id);

      setLoading(false);
    };

    run();
  }, [supabase]);

  useEffect(() => {
    const run = async () => {
      try {
        if (!profile?.player_id) return;
        if (!plan?.md_day || !plan?.readiness_level) return;

        const mdDay = norm(plan.md_day);
        const rl = norm(plan.readiness_level);
        if (!mdDay || !rl) return;

        await loadVariantsForToday(profile.player_id, mdDay, rl);
      } catch (e: any) {
        console.error("variants load error:", e?.message ?? e);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.player_id, plan?.md_day, plan?.readiness_level, lockedVariantId]);

  const flag: Flag = useMemo(() => {
    const byReadiness = readinessToFlag(plan?.readiness_level);
    if (!plan?.readiness_level) return systemToFlag(plan?.training_system);
    return byReadiness;
  }, [plan?.readiness_level, plan?.training_system]);

  const ui = useMemo(() => flagUi(normalizeFlag(flag)), [flag]) as ReturnType<typeof flagUi>;

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

  const message = useMemo(() => genericMsg?.message || ui.playerMessage, [genericMsg, ui.playerMessage]);
  const why = useMemo(() => genericMsg?.why || ui.why, [genericMsg, ui.why]);

  useEffect(() => {
    const run = async () => {
      if (!plan) return;

      const mdDay = norm(plan.md_day || session?.md_day_resolved || null);
      const sprintExposure = inferSprintExposure(session?.session_type ?? null);
      const matchLike = inferMatchLike(session?.session_type ?? null);

      const ctx: PostTrainingContext = {
        mdDay: mdDay || null,
        sessionLoad: null,
        sprintExposure,
        matchLike,
      };

      await loadPostTrainingRecommendations(ctx);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.md_day, session?.session_type, session?.md_day_resolved]);

  useEffect(() => {
    if (!profile?.player_id) return;
    loadFixModulesForPlayer(profile.player_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.player_id]);

  async function linkPlayer() {
    try {
      setError("");
      if (!profile?.id) return;

      if (!selectedPlayerId) {
        setError("Veldu leikmann fyrst.");
        return;
      }

      const { error: uErr } = await supabase.from("profiles").update({ player_id: selectedPlayerId }).eq("id", profile.id);

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

  if (profile && !profile.player_id) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-xs font-medium text-zinc-500">Player · Setup</div>
            <div className="mt-2 text-xl font-semibold text-zinc-900">Tengja notanda við leikmann</div>
            <div className="mt-2 text-sm text-zinc-600">Þetta er til að prófa player-síðuna. Seinna má auto-linka þetta.</div>

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

  if (!plan) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-base font-semibold">Engin dagsákvörðun/æfing er komin í dag</div>
            <div className="mt-2 text-sm text-zinc-600">
              Farðu í <b>/player/checkin</b> til að klára check-in.
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

  const decisionType = inferDecisionType(decision, plan);
  const mdLabel = mdContextLabel(plan.md_day || session?.md_day_resolved || null);

  const debugLine =
    `today=${todayISO()} | ` +
    `decision_focus=${decision?.planned_focus ?? "-"} | ` +
    `decision_day_type=${decision?.final_planned_day_type ?? "-"} | ` +
    `md_day=${plan.md_day ?? "-"} | ` +
    `session_type=${session?.session_type ?? "-"} | ` +
    `system=${plan.training_system ?? "-"} | ` +
    `title=${plan.plan_title ?? "-"} | ` +
    `locked_variant_id=${lockedVariantId || "-"}`;

  const showVariantChooserForStaff = staffMode && variantOptions.length > 0;
  const canChooseVariantStaff = staffMode && !plan.is_locked;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className={`rounded-2xl border bg-white p-6 shadow-sm ${ui.panel}`}>
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-zinc-500">Player · Dagsákvörðun</div>
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

              <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm font-semibold text-zinc-900">
                <span className="h-2 w-2 rounded-full bg-zinc-900" />
                {decisionToText(decisionType)}
              </div>

              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${ui.pill}`}>
                <span className={`h-2 w-2 rounded-full ${ui.dot}`} />
                {mdLabel}
              </div>
            </div>
          </div>

          {/* Decision card */}
          <div className="mt-6 rounded-xl border bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Í dag</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">Ákvörðun: {decisionToText(decisionType)}</div>
            <div className="mt-1 text-sm text-zinc-700">{decisionSubtitle(decisionType)}</div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Dagsetning" value={plan.entry_date} />
              <Stat label="MD context" value={mdLabel} />
              <Stat label="Session type" value={session?.session_type ?? "—"} />
              <Stat label="Staða" value={plan.is_locked ? "Læst" : "Ólæst"} />
            </div>

            <div className="mt-3 rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Decision basis</div>
              <div className="mt-1 text-sm text-zinc-700">{why}</div>
            </div>
          </div>

          {/* Measurements */}
          <details className="mt-6 rounded-xl border bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900">
              Mælingar dagsins <span className="ml-2 text-xs font-medium text-zinc-500">(aðeins til upplýsinga)</span>
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

              <div className="mt-3 text-xs text-zinc-500">
                Flokkun (internal): {plan.readiness_level ?? "—"} · Kerfi: {plan.training_system ?? "—"}
              </div>
            </div>
          </details>

          {/* Fix modules */}
          <div className="mt-6 rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ráðlagðar æfingar</div>
                <div className="mt-1 text-sm text-zinc-600">Byggt á síðasta check-in. Þetta breytir ekki dagsæfingunni.</div>
              </div>
              <div className="text-right text-xs text-zinc-500">{fixModules.length ? `${fixModules.length} rútína` : ""}</div>
            </div>

            {fixErr ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fixErr}</div>
            ) : null}

            {!fixErr && fixModules.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-600">
                Engar sérstakar ráðleggingar í dag — ef þú finnur fyrir stífleika eða eymslum, skrifaðu það í skilaboðin.
              </div>
            ) : null}

            {/* ✅ UPDATED: grid columns when >1 */}
            {!fixErr && fixModules.length > 0 ? (
              <div
                className={`mt-4 grid gap-3 ${
                  fixModules.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
                }`}
              >
                {fixModules.map((m) => {
                  const items = m?.structure?.blocks?.[0]?.items ?? [];
                  const duration = m?.structure?.duration_min ?? null;

                  return (
                    <div key={m.tag} className="rounded-xl border bg-zinc-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">{m.title}</div>
                          {duration ? <div className="mt-1 text-xs text-zinc-600">⏱ {duration} mín</div> : null}
                        </div>
                      </div>

                      {Array.isArray(items) && items.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                          {items.slice(0, 6).map((it: any, idx: number) => (
                            <li key={idx}>
                              • {it?.name ?? "Æfing"} — {it?.dose ?? "—"}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 text-sm text-zinc-600">Engin atriði skilgreind.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Player message */}
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Framkvæmd</div>
            <div className="mt-2 rounded-xl border bg-zinc-50 p-4 text-sm text-zinc-800">
              {message}
              <div className="mt-3 rounded-lg border bg-white p-3 text-sm text-zinc-800">
                <div className="font-semibold">Regla</div>
                <div className="mt-1">Engin viðbótarvinna er nauðsynleg í dag. Framkvæmdu aðeins það sem stendur hér fyrir neðan.</div>
              </div>
            </div>
          </div>

          {/* Staff-only: variant override */}
          {showVariantChooserForStaff ? (
            <div className="mt-6 rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Staff override (A/B/C)</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Þetta er aðeins fyrir staff/test. Leikmenn eiga ekki að velja variant í Stage-4.
                    {plan.is_locked ? " (Læst – ekki hægt að breyta í dag.)" : ""}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2">
                {variantOptions.map((v) => {
                  const isSelected = v.id === selectedVariantId;
                  return (
                    <div
                      key={v.id}
                      className={`min-w-[320px] snap-start rounded-2xl border p-4 ${
                        isSelected ? "border-zinc-900" : "border-zinc-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Variant {v.variant}</div>
                          <div className="mt-2 text-base font-semibold text-zinc-900">{v.title ?? "Microdose variant"}</div>
                          <div className="mt-1 text-sm text-zinc-600">{v.description ?? "—"}</div>
                        </div>
                        {isSelected ? (
                          <div className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">Valin</div>
                        ) : null}
                      </div>

                      {isArray(v.structure) && v.structure.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {v.structure.slice(0, 2).map((b: any, bi: number) => (
                            <div key={bi} className="rounded-xl border bg-zinc-50 p-3">
                              <div className="text-sm font-semibold text-zinc-900">{b?.block ?? `Block ${bi + 1}`}</div>
                              {isArray(b?.items) && b.items.length > 0 ? (
                                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                                  {b.items.slice(0, 4).map((it: any, ii: number) => (
                                    <li key={ii}>{String(it)}</li>
                                  ))}
                                  {b.items.length > 4 ? <li className="list-none text-xs text-zinc-500">…meira</li> : null}
                                </ul>
                              ) : (
                                <div className="mt-2 text-sm text-zinc-600">Engin atriði.</div>
                              )}
                            </div>
                          ))}
                          {v.structure.length > 2 ? <div className="text-xs text-zinc-500">…fleiri blokkir</div> : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-sm text-zinc-600">Engin structure skilgreind.</div>
                      )}

                      <button
                        disabled={savingVariant || !canChooseVariantStaff}
                        onClick={() => {
                          if (!canChooseVariantStaff) return;
                          chooseVariantStaffOnly(v);
                        }}
                        className={`mt-4 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold ${
                          isSelected
                            ? "bg-zinc-900 text-white"
                            : "bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50"
                        } ${savingVariant || !canChooseVariantStaff ? "opacity-60" : ""}`}
                      >
                        {plan.is_locked
                          ? isSelected
                            ? "Valin (læst)"
                            : "Læst – ekki hægt að breyta"
                          : savingVariant
                          ? "Vistar…"
                          : isSelected
                          ? "Valin uppsetning"
                          : "Velja (staff)"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ✅ ÆFING DAGSINS / Execution session */}
          <div className="mt-6 rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Æfing dagsins</div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">{plan.plan_title ?? "Dagsæfing"}</div>
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
              <div className="mt-4 text-sm text-zinc-600">Engin “structure” skilgreind.</div>
            )}

            <div className="mt-4 rounded-lg border bg-white p-3 text-sm text-zinc-800">
              <div className="font-semibold">Rules</div>
              <div className="mt-1">Stoppaðu snemma ef þarf. Markmið: líða betur eftir en fyrir.</div>
            </div>
          </div>

          {/* ✅ EFTIR ÆFINGU / Post-training */}
          <div className="mt-6 rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Eftir æfingu – mælt með</div>
                <div className="mt-1 text-sm text-zinc-600">5–10 mínútur til að styðja sinar og taugakerfi eftir æfingu.</div>
              </div>
              <div className="text-right text-xs text-zinc-500">{postTraining.length ? `${postTraining.length} rútína` : ""}</div>
            </div>

            {postTrainingErr ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{postTrainingErr}</div>
            ) : null}

            {!postTrainingErr && postTraining.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-600">Engar tillögur fundust.</div>
            ) : null}

            {/* ✅ UPDATED: grid columns when >1 */}
            {postTraining.length > 0 ? (
              <div
                className={`mt-4 grid gap-3 ${
                  postTraining.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                }`}
              >
                {postTraining.map((t) => (
                  <div key={t.id} className="rounded-xl border bg-zinc-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{t.title}</div>
                        <div className="mt-1 text-xs text-zinc-600">⏱ {t.duration_min} mín</div>
                      </div>
                    </div>

                    {isArray(t?.structure?.steps) && t.structure.steps.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {t.structure.steps.map((s: any, idx: number) => (
                          <div key={idx} className="rounded-lg border bg-white p-2">
                            <div className="text-sm font-medium text-zinc-900">
                              {idx + 1}. {s?.title ?? "Step"}
                            </div>

                            <div className="mt-1 text-xs text-zinc-600">
                              {s?.time_sec ? `${s.time_sec}s` : ""}
                              {s?.sets ? ` • ${s.sets} sett` : ""}
                              {s?.hold_sec ? ` • hold ${s.hold_sec}s` : ""}
                              {s?.rest_sec ? ` • hvíld ${s.rest_sec}s` : ""}
                              {s?.intensity ? ` • ${s.intensity}` : ""}
                            </div>

                            {Array.isArray(s?.cues) && s.cues.length > 0 ? (
                              <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600">
                                {s.cues.slice(0, 3).map((c: string, i: number) => (
                                  <li key={i}>{c}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-zinc-600">Engin steps skilgreind.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Staff-only debug */}
          {staffMode ? (
            <details className="mt-6 rounded-xl border bg-white">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900">
                Tæknilegar upplýsingar (staff)
              </summary>
              <div className="px-4 pb-4">
                <div className="rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-700">{debugLine}</div>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
