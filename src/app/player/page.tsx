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

// ✅ Stage-4 decision row (normalized for UI)
type Stage4PlanRow =
  | {
      decision_id: string | null;

      team_id: string | null;
      player_id: string;
      entry_date: string; // date
      md_day: string | null;
      readiness_level: string | null; // GREEN / GREEN_PLUS / YELLOW / RED
      chosen_variant_id: string | null;
      locked: boolean | null;
      source: string | null; // SYSTEM / COACH_OVERRIDE / RESOLVED_VIEW
      confidence: number | null;
      why: string | null;
      inputs: any; // jsonb

      // joined from microdose_template_variants (or fetched as fallback)
      variant: string | null; // A/B/C
      title: string | null;
      description: string | null;
      structure: any; // jsonb array
    }
  | null;

type DecisionRow =
  | {
      planned_focus: string | null;
      final_planned_day_type: string | null;
      recommended_day_type: string | null; // ✅ NEW
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

// ============================
// ✅ Stage-4 audit: overrides
// ============================
type MicrodoseOverrideRow = {
  id: string;
  decision_id: string;
  coach_profile_id: string | null;
  overrode_to_readiness_level: string | null;
  override_to_variant_id: string | null;
  reason_code: string | null;
  reason_test: string | null;
  risk_level: string | null;
  created_at: string;
};

type VariantOption = { id: string; variant: string; title: string | null; description: string | null };

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
  // local date (not UTC)
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

function readinessToFlag(level: string | null | undefined): Flag {
  const l = norm(level);
  if (l === "RED") return "RED";
  if (l === "YELLOW") return "YELLOW";
  return "GREEN";
}

type DecisionType = "FULL" | "REDUCED" | "RECOVERY";

// ✅ NOW prefers recommended_day_type (what v_player_daily_decision_v3 computes)
function inferDecisionType(decision: DecisionRow, _plan: Stage4PlanRow): DecisionType {
  const dt = norm(decision?.recommended_day_type || decision?.final_planned_day_type);
  if (dt.includes("OFF") || dt.includes("REST") || dt.includes("RECOVER")) return "RECOVERY";
  if (dt.includes("MOD") || dt.includes("REDUCED") || dt.includes("LIGHT")) return "REDUCED";
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

  // ✅ Stage-4 plan
  const [plan, setPlan] = useState<Stage4PlanRow>(null);

  // ✅ whether we are showing "latest available" (fallback), not necessarily today's
  const [planIsFallback, setPlanIsFallback] = useState(false);

  const [metrics, setMetrics] = useState<MetricsRow>(null);

  const [decision, setDecision] = useState<DecisionRow>(null);
  const [session, setSession] = useState<PlayerSessionTodayRow>(null);

  const [genericMsg, setGenericMsg] = useState<GenericMsg>(null);

  const [postTraining, setPostTraining] = useState<PostTrainingTemplateRow[]>([]);
  const [postTrainingErr, setPostTrainingErr] = useState<string>("");

  const [fixRow, setFixRow] = useState<FixRow | null>(null);
  const [fixErr, setFixErr] = useState<string>("");

  const staffMode = useMemo(() => isStaffRole(profile?.role), [profile?.role]);

  // ✅ Coach override (Stage-4)
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideVariantId, setOverrideVariantId] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideErr, setOverrideErr] = useState("");
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);

  // ✅ Stage-4 audit list (last overrides)
  const [overrideAudit, setOverrideAudit] = useState<MicrodoseOverrideRow[]>([]);
  const [overrideAuditErr, setOverrideAuditErr] = useState<string>("");

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

  async function loadOverrideAudit(decisionId: string) {
    try {
      setOverrideAuditErr("");

      const { data, error } = await supabase
        .from("microdose_overrides")
        .select(
          "id, decision_id, coach_profile_id, overrode_to_readiness_level, override_to_variant_id, reason_code, reason_test, risk_level, created_at"
        )
        .eq("decision_id", decisionId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw new Error(error.message);

      setOverrideAudit(((data as any) ?? []) as MicrodoseOverrideRow[]);
    } catch (e: any) {
      console.error("override audit load error:", e?.message ?? e);
      setOverrideAuditErr(e?.message ?? "Villa við að sækja override audit.");
      setOverrideAudit([]);
    }
  }

  // ✅ Stage-4 plan loader:
  // ✅ FINAL plan MUST come from v_player_today_microdose_resolved
  //    (it resolves md_day + picks template based on readiness_flag / planned_focus / final_planned_day_type)
  async function fetchStage4Plan(playerId: string, day: string) {
    // Helper: decision row for EXACT day (gives us id/team_id/etc.)
    async function fetchDecisionForDay() {
      const { data, error } = await supabase
        .from("microdose_decisions")
        .select("id, team_id, player_id, entry_date, md_day, readiness_level, chosen_variant_id, locked, source, confidence, why, inputs")
        .eq("player_id", playerId)
        .eq("entry_date", day)
        .maybeSingle();

      if (error) {
        console.error("microdose_decisions (day) error:", error);
        throw new Error(error.message);
      }
      return (data as any) ?? null;
    }

    // ✅ Helper: RESOLVED plan view for day
    async function fetchResolvedPlanForDay() {
      const { data, error } = await supabase
        .from("v_player_today_microdose_resolved")
        .select(
          [
            "player_id",
            "entry_date",
            "md_day_raw",
            "planned_focus",
            "final_planned_day_type",
            "readiness_flag",
            "md_day_resolved",
            "training_system",
            "plan_title",
            "plan_description",
            "plan_structure",
            "locked_at",
            "is_locked",
          ].join(",")
        )
        .eq("player_id", playerId)
        .eq("entry_date", day)
        .maybeSingle();

      if (error) {
        console.error("v_player_today_microdose_resolved error:", error);
        throw new Error(error.message);
      }
      return (data as any) ?? null;
    }

    // ---- 1) RESOLVED plan (source of truth for Player page)
    const resolved = await fetchResolvedPlanForDay();

    // ---- 2) Attach decision row (for decision_id + audit). May be null.
    const drowExact = await fetchDecisionForDay();

    if (resolved) {
      setPlanIsFallback(false);

      const merged: any = {
        decision_id: drowExact?.id ?? null,
        team_id: drowExact?.team_id ?? null,
        player_id: resolved.player_id,
        entry_date: resolved.entry_date,

        // ✅ prefer resolved md-day
        md_day: resolved.md_day_resolved ?? resolved.md_day_raw ?? null,

        // ✅ readiness_level for UI: use readiness_flag from decision view
        readiness_level: resolved.readiness_flag ?? drowExact?.readiness_level ?? null,

        chosen_variant_id: drowExact?.chosen_variant_id ?? null,
        locked: resolved.is_locked ?? drowExact?.locked ?? null,
        source: drowExact?.source ?? "RESOLVED_VIEW",
        confidence: drowExact?.confidence ?? null,
        why: drowExact?.why ?? null,
        inputs: drowExact?.inputs ?? null,

        variant: null,
        title: resolved.plan_title ?? null,
        description: resolved.plan_description ?? null,
        structure: resolved.plan_structure ?? null,
      };

      return merged as Stage4PlanRow;
    }

    // ---- 3) fallback: latest decision (<= day) + fetch variant details
    const { data: drow, error: dErr } = await supabase
      .from("microdose_decisions")
      .select("id, team_id, player_id, entry_date, md_day, readiness_level, chosen_variant_id, locked, source, confidence, why, inputs")
      .eq("player_id", playerId)
      .lte("entry_date", day)
      .order("entry_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dErr) {
      console.error("microdose_decisions fallback error:", dErr);
      throw new Error(dErr.message);
    }

    if (!drow?.id) {
      setPlanIsFallback(false);
      return null;
    }

    const variantId = (drow as any)?.chosen_variant_id ?? null;

    let variantRow: any = null;
    if (variantId) {
      const { data: vr, error: vrErr } = await supabase
        .from("microdose_template_variants")
        .select("id, variant, title, description, structure")
        .eq("id", variantId)
        .maybeSingle();

      if (vrErr) {
        console.error("microdose_template_variants error:", vrErr);
        throw new Error(vrErr.message);
      }
      variantRow = vr ?? null;
    }

    setPlanIsFallback((drow as any)?.entry_date !== day);

    const merged: any = {
      decision_id: (drow as any).id ?? null,
      team_id: (drow as any).team_id ?? null,
      player_id: (drow as any).player_id,
      entry_date: (drow as any).entry_date,
      md_day: (drow as any).md_day ?? null,
      readiness_level: (drow as any).readiness_level ?? null,
      chosen_variant_id: (drow as any).chosen_variant_id ?? null,
      locked: (drow as any).locked ?? null,
      source: (drow as any).source ?? null,
      confidence: (drow as any).confidence ?? null,
      why: (drow as any).why ?? null,
      inputs: (drow as any).inputs ?? null,

      variant: variantRow?.variant ?? null,
      title: variantRow?.title ?? null,
      description: variantRow?.description ?? null,
      structure: variantRow?.structure ?? null,
    };

    return merged as Stage4PlanRow;
  }

  async function reloadPlan(playerId: string, day: string) {
    try {
      const p = await fetchStage4Plan(playerId, day);
      setPlan((p as any) ?? null);

      const did = (p as any)?.decision_id ?? null;
      if (did && staffMode) {
        await loadOverrideAudit(String(did));
      }
    } catch (e: any) {
      console.error("reloadPlan error:", e);
      setError(e?.message ?? "Villa við að endurhlaða plan.");
    }
  }

  async function loadPostTrainingRecommendations(ctx: PostTrainingContext) {
    try {
      setPostTrainingErr("");

      const { data: rules, error: rErr } = await supabase
        .from("post_training_rules")
        .select("id, priority, is_active, when_clause, then_clause")
        .eq("is_active", true);

      if (rErr) throw new Error(rErr.message);

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

      if (tErr) throw new Error(tErr.message);

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

      if (fErr) throw new Error(fErr.message);

      setFixRow((data as any) ?? null);
    } catch (e: any) {
      console.error("fix modules load error:", e?.message ?? e);
      setFixErr(e?.message ?? "Villa við að sækja ráðlagðar æfingar.");
      setFixRow(null);
    }
  }

  // ✅ Coach override submit (calls Next API route)
  async function submitOverride() {
    if (!profile?.player_id) return;
    if (!plan?.entry_date) return;

    const to_variant_id = overrideVariantId;
    const reason = overrideReason.trim();

    if (!to_variant_id) {
      setOverrideErr("Veldu variant.");
      return;
    }
    if (!reason) {
      setOverrideErr("Skrifaðu ástæðu (stutt).");
      return;
    }

    try {
      setOverrideSaving(true);
      setOverrideErr("");

      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Vantar session token.");

      const res = await fetch("/api/microdose/override", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          player_id: profile.player_id,
          entry_date: plan.entry_date,
          to_variant_id,
          reason,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Override mistókst.");

      await reloadPlan(profile.player_id, todayISO());

      setOverrideOpen(false);
      setOverrideReason("");
    } catch (e: any) {
      setOverrideErr(e?.message ?? "Óþekkt villa.");
    } finally {
      setOverrideSaving(false);
    }
  }

  // ====== Initial load (try/catch + finally) ======
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      setPlan(null);
      setPlanIsFallback(false);
      setMetrics(null);
      setGenericMsg(null);
      setPlayerMeta(null);
      setDecision(null);
      setSession(null);
      setPostTraining([]);
      setPostTrainingErr("");

      setFixRow(null);
      setFixErr("");

      setOverrideOpen(false);
      setOverrideReason("");
      setOverrideVariantId("");
      setOverrideSaving(false);
      setOverrideErr("");
      setVariantOptions([]);

      setOverrideAudit([]);
      setOverrideAuditErr("");

      try {
        const { data: auth, error: aErr } = await supabase.auth.getUser();
        if (aErr) throw new Error(aErr.message);

        const userId = auth?.user?.id;
        if (!userId) throw new Error("Ekki innskráður.");

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name, player_id, role, team_id")
          .eq("id", userId)
          .maybeSingle();

        if (pErr) throw new Error(pErr.message);

        setProfile((prof as any) ?? null);

        if (!prof?.player_id) {
          const { data: list, error: lErr } = await supabase
            .from("players")
            .select("id, full_name, position, team")
            .order("full_name", { ascending: true });

          if (lErr) throw new Error(lErr.message);

          setPlayers((list as PlayerRow[]) ?? []);
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
          .select("planned_focus, final_planned_day_type, recommended_day_type, readiness_flag")
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

        // ✅ Stage-4 plan (RESOLVED view + decision_id merge)
        const p = await fetchStage4Plan(prof.player_id, today);
        setPlan((p as any) ?? null);

        // ✅ staff-only: load audit overrides
        if (isStaffRole(prof?.role)) {
          const did = (p as any)?.decision_id ?? null;
          if (did) await loadOverrideAudit(String(did));
          else setOverrideAudit([]);
        }

        const { data: mrow, error: mErr } = await supabase
          .from("readiness_entries")
          .select("readiness, sleep, soreness, total_score, created_at")
          .eq("player_id", prof.player_id)
          .eq("entry_date", today)
          .maybeSingle();

        if (mErr) console.error("readiness_entries metrics error:", mErr.message);
        setMetrics((mrow as any) ?? null);

        await loadFixModulesForPlayer(prof.player_id);
      } catch (e: any) {
        console.error("PlayerPage load error:", e);
        setError(e?.message ?? "Óþekkt villa.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [supabase]);

  // ✅ Load variant options (staff only)
  useEffect(() => {
    const run = async () => {
      try {
        if (!staffMode) return;
        if (!profile?.player_id) return;
        if (!plan?.md_day || !plan?.readiness_level) return;

        const { data, error } = await supabase
          .from("microdose_template_variants")
          .select("id, variant, title, description")
          .eq("md_day", plan.md_day)
          .eq("readiness_level", plan.readiness_level)
          .order("variant", { ascending: true });

        if (error) throw new Error(error.message);

        const list = (data ?? []) as any[];
        setVariantOptions(list);

        if (!overrideVariantId) {
          const current = plan.chosen_variant_id ? list.find((x) => x.id === plan.chosen_variant_id) : null;
          const a = list.find((x) => String(x.variant).toUpperCase() === "A");
          setOverrideVariantId((current?.id || a?.id || list[0]?.id || "") as string);
        }
      } catch (e: any) {
        console.error("variantOptions load error:", e?.message ?? e);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffMode, profile?.player_id, plan?.md_day, plan?.readiness_level, plan?.chosen_variant_id]);

  // ✅ Reload audit when decision_id changes (staff only)
  useEffect(() => {
    const run = async () => {
      if (!staffMode) return;
      const did = plan?.decision_id ?? null;
      if (!did) {
        setOverrideAudit([]);
        return;
      }
      await loadOverrideAudit(String(did));
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffMode, plan?.decision_id]);

  const flag: Flag = useMemo(() => readinessToFlag(plan?.readiness_level), [plan?.readiness_level]);
  const ui = useMemo(() => flagUi(normalizeFlag(flag)), [flag]);

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

  const message = useMemo(() => genericMsg?.message || (ui as any).playerMessage, [genericMsg, ui]);
  const whyText = useMemo(() => plan?.why || genericMsg?.why || (ui as any).why, [plan?.why, genericMsg?.why, ui]);

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
            <div className="text-base font-semibold">Engin Stage-4 microdose ákvörðun fannst</div>
            <div className="mt-2 text-sm text-zinc-600">
              Þetta gerist ef Stage-4 decision-engine hefur ekki verið keyrð í dag og engin “resolved/final” view skilar gögnum.
              Farðu í <b>/player/checkin</b> og vertu viss um að Stage-4 keyrsla hafi verið framkvæmd.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const today = todayISO();
  const name = playerMeta?.full_name ?? "Leikmaður";
  const position = (playerMeta?.position ?? "").toUpperCase();
  const team = playerMeta?.team ?? "";

  const structureBlocks = Array.isArray(plan?.structure) ? plan.structure : [];
  const showStructure = structureBlocks.length > 0;

  const decisionType = inferDecisionType(decision, plan);
  const mdLabel = mdContextLabel(plan.md_day || session?.md_day_resolved || null);

  const lockedBool = !!plan.locked;
  const lockLabel = lockedBool ? "Læst" : "Ólæst";
  const sourceLabel = plan.source ? String(plan.source).toUpperCase() : "—";
  const confidenceLabel = plan.confidence != null ? `${plan.confidence}%` : "—";
  const variantLabel = plan.variant ? `Variant ${plan.variant}` : "Variant —";

  const debugLine =
    `today=${today} | ` +
    `plan_entry_date=${plan.entry_date ?? "-"} | ` +
    `decision_focus=${decision?.planned_focus ?? "-"} | ` +
    `decision_day_type=${decision?.final_planned_day_type ?? "-"} | ` +
    `decision_recommended=${decision?.recommended_day_type ?? "-"} | ` +
    `md_day=${plan.md_day ?? "-"} | ` +
    `session_type=${session?.session_type ?? "-"} | ` +
    `source=${sourceLabel} | ` +
    `confidence=${confidenceLabel} | ` +
    `decision_id=${plan.decision_id ?? "-"} | ` +
    `chosen_variant_id=${plan.chosen_variant_id ?? "-"} | ` +
    `variant=${plan.variant ?? "-"}`;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className={`rounded-2xl border bg-white p-6 shadow-sm ${(ui as any).panel}`}>
          {planIsFallback && plan.entry_date !== today ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Stage-4 ákvörðun fannst ekki fyrir <b>{today}</b>. Sýni síðustu tiltæku ákvörðun: <b>{plan.entry_date}</b>.
            </div>
          ) : null}

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

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm font-semibold text-zinc-900">
                🔒 {lockLabel}
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm font-semibold text-zinc-900">
                {decisionToText(decisionType)}
              </div>

              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${(ui as any).pill}`}>
                <span className={`h-2 w-2 rounded-full ${(ui as any).dot}`} />
                {mdLabel}
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm font-semibold text-zinc-900">
                {variantLabel}
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
              <Stat label="Source" value={sourceLabel} />
              <Stat label="Confidence" value={confidenceLabel} />
            </div>

            <div className="mt-3 rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Decision basis</div>
              <div className="mt-1 text-sm text-zinc-700">{whyText}</div>
            </div>
          </div>

          {/* ✅ Staff-only: Coach override (Stage-4) */}
          {staffMode ? (
            <div className="mt-6 rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Coach override</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Override uppfærir Stage-4 decision (source=COACH_OVERRIDE) og læsir dagsákvörðun.
                  </div>
                </div>

                <button
                  onClick={() => {
                    setOverrideErr("");
                    setOverrideOpen((v) => !v);
                  }}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  {overrideOpen ? "Loka" : "Override"}
                </button>
              </div>

              {overrideOpen ? (
                <div className="mt-4 rounded-2xl border bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">Veldu variant og ástæðu</div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Variant</div>
                      <select
                        className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                        value={overrideVariantId}
                        onChange={(e) => setOverrideVariantId(e.target.value)}
                      >
                        {variantOptions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {String(v.variant).toUpperCase()} — {v.title ?? "Microdose"}
                          </option>
                        ))}
                      </select>

                      <div className="mt-2 text-xs text-zinc-600">
                        Núverandi: {plan.variant ? `Variant ${plan.variant}` : "—"} · Source: {sourceLabel} · Locked:{" "}
                        {lockedBool ? "YES" : "NO"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ástæða</div>
                      <input
                        className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                        placeholder="t.d. hamstring tightness, travel fatigue, coach decision..."
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                      />
                      <div className="mt-2 text-xs text-zinc-600">Skráist sem audit + why í decision.</div>
                    </div>
                  </div>

                  {overrideErr ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{overrideErr}</div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      onClick={() => {
                        setOverrideOpen(false);
                        setOverrideErr("");
                      }}
                      className="inline-flex items-center justify-center rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Hætta við
                    </button>

                    <button
                      disabled={overrideSaving}
                      onClick={submitOverride}
                      className={`inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 ${
                        overrideSaving ? "opacity-60" : ""
                      }`}
                    >
                      {overrideSaving ? "Vistar…" : "Staðfesta override"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ✅ Stage-4 Audit (Overrides) */}
          {staffMode ? (
            <details className="mt-6 rounded-xl border bg-white">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900">
                Stage-4 Audit (Overrides)
                <span className="ml-2 text-xs font-medium text-zinc-500">({overrideAudit.length} síðustu)</span>
              </summary>

              <div className="px-4 pb-4">
                {overrideAuditErr ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{overrideAuditErr}</div>
                ) : null}

                {!overrideAuditErr && overrideAudit.length === 0 ? (
                  <div className="rounded-lg border bg-zinc-50 p-3 text-sm text-zinc-700">
                    Engin overrides skráð (fyrir þessa decision_id).
                  </div>
                ) : null}

                {overrideAudit.length > 0 ? (
                  <div className="space-y-3">
                    {overrideAudit.map((o) => (
                      <div key={o.id} className="rounded-xl border bg-zinc-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-900">
                            Override → {o.overrode_to_readiness_level ?? "—"} · variant_id:{" "}
                            {o.override_to_variant_id ? o.override_to_variant_id.slice(0, 8) + "…" : "—"}
                          </div>
                          <div className="text-xs text-zinc-600">
                            {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                          </div>
                        </div>

                        <div className="mt-1 text-xs text-zinc-600">
                          coach_profile_id: {o.coach_profile_id ?? "—"} · risk_level: {o.risk_level ?? "—"}
                        </div>

                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div className="rounded-lg border bg-white p-2">
                            <div className="text-xs font-semibold text-zinc-500">Reason code</div>
                            <div className="mt-1 text-sm text-zinc-800">{o.reason_code ?? "—"}</div>
                          </div>
                          <div className="rounded-lg border bg-white p-2">
                            <div className="text-xs font-semibold text-zinc-500">Reason text</div>
                            <div className="mt-1 text-sm text-zinc-800">{o.reason_test ?? "—"}</div>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-zinc-600">decision_id: {o.decision_id}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}

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

              <div className="mt-3 text-xs text-zinc-500">Flokkun (internal): {plan.readiness_level ?? "—"}</div>
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

            {!fixErr && fixModules.length > 0 ? (
              <div className={`mt-4 grid gap-3 ${fixModules.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
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

          {/* ✅ ÆFING DAGSINS */}
          <div className="mt-6 rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Æfing dagsins</div>
                <div className="mt-2 text-lg font-semibold text-zinc-900">{plan.title ?? "Dagsæfing"}</div>
                <div className="mt-1 text-sm text-zinc-600">{plan.description ?? "—"}</div>
              </div>

              <div className="text-right">
                <div className="text-xs font-medium text-zinc-500">Staða</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{lockLabel}</div>
              </div>
            </div>

            {showStructure ? (
              <div className="mt-4 space-y-3">
                {structureBlocks.map((b: any, idx: number) => (
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

          {/* ✅ EFTIR ÆFINGU */}
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

            {postTraining.length > 0 ? (
              <div className={`mt-4 grid gap-3 ${postTraining.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
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
