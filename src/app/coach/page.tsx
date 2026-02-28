"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TrainingAction = "FULL" | "REDUCED" | "RECOVERY";
type FinalColor = "red" | "yellow" | "green";
type FinalFlag = "RED" | "YELLOW" | "GREEN";
type Filter = "all" | FinalColor;

type PlanPreview = {
  team_id: string | null;
  md_day: string | null;
  source?: string | null;
  confidence?: number | string | null;
  readiness_level: "GREEN" | "YELLOW" | "RED" | null;
  is_locked: boolean | null;
  template_title: string | null;
  template_description: string | null;
  template_structure: any | null;
};

// ✅ Team Intelligence row (from v_coach_team_intelligence_today)
type TeamIntel = {
  team_id: string;
  entry_date: string;
  n_players: number | null;
  n_red: number | null;
  n_yellow: number | null;
  n_green: number | null;
  n_green_plus: number | null;
  pct_red: number | null;
  pct_yellow: number | null;
  pct_green: number | null;
  pct_green_plus: number | null;
  n_volatile: number | null;
  volatility_pct: number | null;
  n_low_baseline: number | null;
  baseline_low_pct: number | null;
  baseline_maturity: string | null; // STABLE / BUILDING / ...
  team_status: string | null; // OK / CAUTION / ALERT
  recommendation: string | null;
};

type Row = {
  readiness_entry_id: string | null;

  entry_date: string;
  created_at: string;

  player_id: string;
  full_name: string;
  team: string | null;
  team_id?: string | null;
  position: string | null;

  readiness: number | null;
  sleep: number | null;
  soreness: number | null;
  fatigue_energy?: number | null;
  sleep_quality?: number | null;
  sleep_duration?: number | null;
  stress_mood?: number | null;
  muscle_soreness?: number | null;
  total_score: number | null;
  notes: string | null;

  planned_day_type?: string | null;
  planned_focus?: string | null;

  // ✅ UI shows Stage4 final
  training_action: TrainingAction | null; // final_decision
  coach_message: string | null; // coach_note
  is_locked: boolean;

  final_color?: FinalColor | null;
  final_reason?: string | null;
  final_flag?: FinalFlag | null;

  md_day?: string | null;

  // ✅ Stage4 debug (from v7 directly)
  system_decision?: TrainingAction | null;
  coach_decision?: TrainingAction | null;
  final_decision?: TrainingAction | null;
  final_source?: string | null;
  stage4_updated_at?: string | null;

  ui_key?: string;
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function prettyMd(md: string | null | undefined) {
  const v = (md ?? "").trim();
  if (!v) return { md: "GENERIC", label: "Microdose" };
  const U = v.toUpperCase();
  if (U === "MD") return { md: "MD", label: "GAME" };
  if (U === "MD+1") return { md: "MD+1", label: "POST" };
  return { md: v, label: v };
}

// ✅ Extract "MD-3"/"MD+1"/"MD" from planned_focus when md_day column isn't available
function mdFromPlannedFocus(focus: string | null | undefined) {
  const s = String(focus ?? "").toUpperCase();
  const m = s.match(/\bMD[+-]?\d*\b/);
  return m?.[0] ?? null;
}

/**
 * ✅ Hide debug reason in the main row + keep it short.
 * (We still show the full debug in the expanded section.)
 */
function shortReason(reason?: string | null) {
  const s = String(reason ?? "").trim();
  if (!s) return null;

  // Hide hybrid debug in main row
  if (s.toLowerCase().startsWith("hybrid:")) return null;

  // Keep it short
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

/**
 * ✅ Fallback rule:
 * Downgrade one step if soreness >= 4
 */
function applySorenessDowngrade(input: {
  flag: FinalFlag | null;
  color: FinalColor | null;
  reason: string | null;
  soreness: number | null;
}) {
  const soreness = input.soreness ?? 0;

  if (soreness < 4 || !input.flag || !input.color) {
    return {
      final_flag: input.flag,
      final_color: input.color,
      final_reason: input.reason,
    };
  }

  const final_flag: FinalFlag = input.flag === "GREEN" ? "YELLOW" : input.flag === "YELLOW" ? "RED" : "RED";
  const final_color: FinalColor = input.color === "green" ? "yellow" : input.color === "yellow" ? "red" : "red";

  const final_reason =
    input.flag === "GREEN"
      ? "YELLOW: High soreness. Adjust load."
      : "RED: High soreness. Recovery/very light day.";

  return { final_flag, final_color, final_reason };
}

// ✅ Display helper for confidence
function formatConfidence(v: PlanPreview["confidence"]) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (Number.isFinite(v)) {
    if (v <= 1) return `${Math.round(v * 100)}%`;
    if (v <= 100) return `${Math.round(v)}%`;
    return String(v);
  }
  return "—";
}

const colorMeta = (c?: string | null) => {
  const C = (c || "").toUpperCase();
  if (C === "RED") return { label: "RED", dot: "bg-red-500", pill: "bg-red-50 text-red-700 border-red-200" };
  if (C === "YELLOW")
    return { label: "YELLOW", dot: "bg-yellow-400", pill: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  return { label: "GREEN", dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200" };
};

function v(n: number | null | undefined) {
  return typeof n === "number" ? n : "—";
}

// ✅ Team status styling
function teamStatusMeta(status: string | null | undefined) {
  const s = String(status ?? "").toUpperCase();
  if (s === "ALERT") return { label: "ALERT", border: "border-red-200", bg: "bg-red-50", text: "text-red-800" };
  if (s === "CAUTION")
    return { label: "CAUTION", border: "border-yellow-200", bg: "bg-yellow-50", text: "text-yellow-900" };
  return { label: "OK", border: "border-green-200", bg: "bg-green-50", text: "text-green-800" };
}

function CoachHubCards() {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Messages</CardTitle>
          <CardDescription>Stjórna coach skilaboðum og templates.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/coach/messages">Opna Messages</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Week setup</CardTitle>
          <CardDescription>Æfingavika, match-plan og álag.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/coach/week-setup">Opna Week setup</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Match minutes</CardTitle>
          <CardDescription>Mínútur, byrjun/varamaður og “load context”.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/coach/match-minutes">Opna Match minutes</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">TV view</CardTitle>
          <CardDescription>Sýnir 4 uppsetningar á skjá (fyrir sal/sjónvarp).</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/coach/display?refresh=15" target="_blank" rel="noreferrer">
              Opna TV view
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CoachPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>("");

  const [draftAction, setDraftAction] = useState<Record<string, TrainingAction>>({});
  const [draftMessage, setDraftMessage] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  const PAGE_SIZE = 15;
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [weekGrid, setWeekGrid] = useState<any[]>([]);
  const [coachName, setCoachName] = useState<string>("");
  const [coachVerified, setCoachVerified] = useState(false);
  const [mdContextToday, setMdContextToday] = useState<string | null>(null);

  // ✅ Team intelligence
  const [teamIntel, setTeamIntel] = useState<TeamIntel | null>(null);

  // generate decisions
  const [genLoading, setGenLoading] = useState(false);
  const [genToast, setGenToast] = useState<string>("");

  const today = useMemo(() => todayISO(), []);
  const mdDayToday = useMemo(() => {
    const t = todayISO();
    const row = (weekGrid ?? []).find((x: any) => String(x.day_date) === t) ?? null;
    const src = mdContextToday ?? row?.md_day ?? planPreview?.md_day ?? "GENERIC";
    return prettyMd(src).md;
  }, [weekGrid, planPreview?.md_day, mdContextToday]);

  async function ensureCoachAccess() {
    setError("");

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error("auth.getUser error:", authErr.message);

    const uid = auth?.user?.id;
    if (!uid) {
      router.replace(`/login?next=${encodeURIComponent("/coach")}`);
      return false;
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role, display_name")
      .eq("id", uid)
      .maybeSingle();

    if (profErr) {
      console.error("profiles load error:", profErr.message);
      setError(profErr.message);
      return false;
    }

    const role = (prof as any)?.role ?? null;
    const name = (prof as any)?.display_name ?? auth?.user?.email ?? "";
    setCoachName(name);

    if (String(role ?? "").toLowerCase() !== "coach") {
      router.replace(`/login?next=${encodeURIComponent("/coach")}`);
      return false;
    }

    return true;
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const ok = await ensureCoachAccess();
        if (!ok) return;
        setCoachVerified(true);
        await loadToday();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!coachVerified) return;
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, teamFilter, filter, search, coachVerified]);

  useEffect(() => {
    if (!coachVerified) return;
    setPage(0);

    // ✅ Clear drafts when context changes (avoids stale UI)
    setDraftAction({});
    setDraftMessage({});
    setSaved({});
  }, [teamFilter, filter, search, coachVerified]);

  async function loadPlanPreview() {
    try {
      const { data, error } = await supabase.from("v_coach_plan_preview_today").select("*").maybeSingle();
      if (error) {
        console.error("Plan preview error:", error.message);
        setPlanPreview(null);
        return;
      }
      setPlanPreview((data as any) ?? null);
    } catch (e) {
      console.error("Plan preview error (catch):", e);
      setPlanPreview(null);
    }
  }

  async function loadWeekGrid() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const teamId = (prof as any)?.team_id;
      if (!teamId) return;

      const { data: ws } = await supabase
        .from("week_setups")
        .select("id")
        .eq("team_id", teamId)
        .order("week_start", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const weekSetupId = (ws as any)?.id;
      if (!weekSetupId) {
        setWeekGrid([]);
        return;
      }

      const { data: grid, error } = await supabase
        .from("v_week_plan_grid")
        .select("day_date, md_day, day_type_final, dose_final")
        .eq("week_setup_id", weekSetupId)
        .order("day_date", { ascending: true });

      if (error) {
        console.error("Week grid error:", error.message);
        setWeekGrid([]);
        return;
      }

      setWeekGrid((grid as any[]) ?? []);
    } catch (e) {
      console.error("Week grid error (catch):", e);
      setWeekGrid([]);
    }
  }

  // ✅ fetch team intelligence for today
  async function loadTeamIntelligenceToday() {
    try {
      const { data, error } = await supabase.from("v_coach_team_intelligence_today").select("*").maybeSingle();
      if (error) {
        console.error("Team intel error:", error.message);
        setTeamIntel(null);
        return;
      }
      setTeamIntel((data as any) ?? null);
    } catch (e) {
      console.error("Team intel error (catch):", e);
      setTeamIntel(null);
    }
  }

  async function generateTodayDecisionsForTeam() {
    try {
      setGenToast("");
      setError("");
      setGenLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Ekki innskráður.");

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", uid)
        .maybeSingle();

      if (pErr) throw new Error(pErr.message);

      const teamId = (prof as any)?.team_id ?? null;
      if (!teamId) throw new Error("Vantar team_id á profile.");

      const day = todayISO();

      const { data, error } = await supabase.rpc("stage4_generate_today_decisions", {
        p_team_id: teamId,
        p_entry_date: day,
      });

      if (error) throw new Error(error.message);

      const row = Array.isArray(data) ? data[0] : data;
      const processed = row?.processed ?? "?";
      const inserted = row?.inserted ?? "?";
      const updated = row?.updated ?? "?";

      setGenToast(`✅ Decisions generated: processed ${processed} · inserted ${inserted} · updated ${updated}`);

      await loadToday();
    } catch (e: any) {
      setGenToast("");
      setError(e?.message ?? "Generate decisions mistókst.");
    } finally {
      setGenLoading(false);
    }
  }

  async function loadToday() {
    try {
      setError("");
      setLoading(true);

      const entryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();

      // Ensure Stage4 rows exist for today's date before reading views
      await supabase.rpc("stage4_bootstrap_for_date", { p_date: entryDate });

      // Fetch md_day context directly for today (per team) to avoid GENERIC fallback
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
          const teamId = (prof as any)?.team_id ?? null;
          if (teamId) {
            const { data: ctxRow } = await supabase
              .from("v_training_day_context_team")
              .select("md_day")
              .eq("team_id", teamId)
              .eq("date", entryDate)
              .maybeSingle();
            setMdContextToday((ctxRow as any)?.md_day ?? null);
          } else {
            setMdContextToday(null);
          }
        } else {
          setMdContextToday(null);
        }
      } catch {
        setMdContextToday(null);
      }

      // ✅ load PI layer for today (Team Intelligence)
      await loadTeamIntelligenceToday();

      await loadPlanPreview();
      await loadWeekGrid();

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // ✅ Single source of truth: v7 (includes Stage4 columns)
      let q = supabase
        .from("v_coach_readiness_today_v7")
        .select("*", { count: "exact" })
        .eq("entry_date", entryDate) // ✅ IMPORTANT: v7 is not scoped; force today-only in UI
        .order("total_score", { ascending: true })
        .order("full_name", { ascending: true })
        .range(from, to);

      if (teamFilter && teamFilter !== "all") q = q.eq("team", teamFilter);
      if (filter !== "all") q = q.eq("final_color", filter);
      if (search.trim().length > 0) q = q.ilike("full_name", `%${search.trim()}%`);

      const { data, error, count } = await q;

      if (error) {
        setError(error.message);
        setRows([]);
        setTotal(0);
        return;
      }

      const raw: any[] = (data ?? []) as any[];

      const list: Row[] = raw.map((r) => {
        const playerId = String(r.player_id);
        const entryId: string | null = (r.readiness_entry_id ?? null) as string | null;

        // ✅ Use v7 final_* only (no fallback to old columns)
        const baseColor = (String(r.final_color ?? "").toLowerCase() as FinalColor) || null;
        const baseFlag = (String(r.final_flag ?? "").toUpperCase() as FinalFlag) || null;
        const baseReason = (r.final_reason ?? null) as string | null;

        const downgraded = applySorenessDowngrade({
          flag: baseFlag,
          color: baseColor,
          reason: baseReason,
          soreness: r.soreness ?? null,
        });

        const finalColor = (downgraded.final_color ?? baseColor ?? "green") as FinalColor;
        const finalFlag = (downgraded.final_flag ?? baseFlag ?? "GREEN") as FinalFlag;
        const finalReason = downgraded.final_reason ?? baseReason ?? null;

        const plannedFocus = r.planned_focus ?? null;
        const perPlayerMd = mdFromPlannedFocus(plannedFocus);
        const viewMd = (r.md_day ?? null) as string | null;

        return {
          readiness_entry_id: entryId,

          entry_date: String(r.entry_date ?? entryDate).trim() || entryDate,
          created_at: String(r.created_at),

          player_id: playerId,
          full_name: String(r.full_name ?? ""),
          team: r.team ?? null,
          position: r.position ?? null,
          team_id: (r as any).team_id ?? null,

          readiness: r.readiness ?? null,
          sleep: r.sleep ?? null,
          soreness: r.soreness ?? null,
          fatigue_energy: (r as any).fatigue_energy ?? null,
          sleep_quality: (r as any).sleep_quality ?? null,
          sleep_duration: (r as any).sleep_duration ?? null,
          stress_mood: (r as any).stress_mood ?? null,
          muscle_soreness: (r as any).muscle_soreness ?? null,
          total_score: r.total_score ?? null,
          notes: r.notes ?? null,

          planned_focus: plannedFocus,
          planned_day_type: r.planned_day_type ?? null,

          // ✅ Stage4 truth comes directly from view
          training_action: (r.final_decision ?? "FULL") as TrainingAction,
          coach_message: (r.coach_note ?? null) as string | null,
          is_locked: !!(r.locked ?? false),

          final_color: finalColor,
          final_flag: finalFlag,
          final_reason: finalReason,

          md_day: viewMd ?? mdContextToday ?? perPlayerMd ?? mdDayToday,

          system_decision: (r.system_decision ?? null) as TrainingAction | null,
          coach_decision: (r.coach_decision ?? null) as TrainingAction | null,
          final_decision: (r.final_decision ?? null) as TrainingAction | null,
          final_source: (r.final_source ?? null) as string | null,
          stage4_updated_at: (r.stage4_updated_at ?? null) as string | null,

          ui_key: `${playerId}_${String(r.entry_date ?? entryDate)}`,
        };
      });

      setRows(list);
      setTotal(count ?? 0);

      // ✅ Always sync drafts to DB after reload
      setDraftAction(() => {
        const next: Record<string, TrainingAction> = {};
        for (const r of list) {
          const pid = String(r.player_id);
          next[pid] = (r.training_action ?? "FULL") as TrainingAction;
        }
        return next;
      });

      setDraftMessage(() => {
        const next: Record<string, string> = {};
        for (const r of list) {
          const pid = String(r.player_id);
          next[pid] = r.coach_message ?? "";
        }
        return next;
      });

      setSaved({});
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    const acc: Record<FinalColor, number> = { red: 0, yellow: 0, green: 0 };
    for (const r of rows) {
      const c = (String(r.final_color ?? "").toLowerCase() as FinalColor) || null;
      if (c === "red" || c === "yellow" || c === "green") acc[c] += 1;
    }
    return acc;
  }, [rows]);

  // ✅ Coach override flow: Stage4 only (+ optional plan lock refresh)
  async function saveOverride(r: Row) {
    // ✅ Production behavior: never allow editing if locked
    if (r.is_locked) return;

    const playerId = String(r.player_id);
    const action = draftAction[playerId] ?? r.training_action ?? "FULL";
    const message = (draftMessage[playerId] ?? r.coach_message ?? "").trim();
    const entryDate = r.entry_date && String(r.entry_date).trim().length > 0 ? String(r.entry_date).trim() : todayISO();

    setSaving((p) => ({ ...p, [playerId]: true }));
    setSaved((p) => ({ ...p, [playerId]: false }));
    setError("");

    try {
      // 1) Stage4 override via RPC
      const { error: sErr } = await supabase.rpc("stage4_set_coach_override", {
        p_player_id: playerId,
        p_entry_date: entryDate,
        p_coach_decision: action,
        p_coach_note: message.length ? message : null,
      });
      if (sErr) throw new Error(`Stage4 RPC failed: ${sErr.message}`);

      // 2) Optional: plan lock refresh (legacy). We warn but don't block the save.
      const { error: lockErr } = await supabase.rpc("coach_override_microdose_plan", {
        p_player_id: playerId,
        p_entry_date: entryDate,
        p_variant_id: null,
        p_source: "COACH",
      });
      if (lockErr) {
        console.warn("coach_override_microdose_plan failed payload:", { playerId, entryDate, action, r });
      }

      setSaved((p) => ({ ...p, [playerId]: true }));
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Save mistókst.");
    } finally {
      setSaving((p) => ({ ...p, [playerId]: false }));
    }
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  if (loading) return <div className="py-6 text-sm text-muted-foreground">Hleð...</div>;

  const confidenceLabel = formatConfidence(planPreview?.confidence);

  // ✅ LOCKED behavior: disable pills when locked
  const renderActionPills = (pid: string, locked: boolean) => {
    const current = draftAction[pid] ?? "FULL";
    const pill = (value: TrainingAction, label: string) => {
      const active = current === value;
      return (
        <button
          key={value}
          type="button"
          disabled={locked}
          onClick={() => setDraftAction((p) => ({ ...p, [pid]: value }))}
          className={[
            "rounded-full border px-3 py-1 text-xs font-semibold",
            locked ? "opacity-50 cursor-not-allowed" : "",
            active ? "bg-black text-white border-black" : "bg-white text-gray-800 hover:bg-gray-50",
          ].join(" ")}
        >
          {label}
        </button>
      );
    };

    return (
      <div className="flex items-center gap-2">
        {pill("FULL", "FULL")}
        {pill("REDUCED", "REDUCED")}
        {pill("RECOVERY", "RECOVERY")}
      </div>
    );
  };

  const renderRow = (r: Row) => {
    const pid = String(r.player_id);
    const isSaving = !!saving[pid];
    const isOpen = expandedPlayerId === pid;

    const cm = colorMeta(r.final_color ?? "green");
    const isOverride = String(r.final_source ?? "").toUpperCase() === "COACH";

    // ✅ Main row should NOT show "Hybrid: abs=..." debug
    const mainReason = r.planned_focus || shortReason(r.final_reason) || "—";

    return (
      <React.Fragment key={r.ui_key ?? r.readiness_entry_id ?? pid}>
        <div className="rounded-lg border bg-white px-3 py-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,1.4fr)_auto_auto_1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="font-medium leading-snug truncate">{r.full_name}</div>
              <div className="text-xs text-gray-500 truncate">{[r.team, r.position].filter(Boolean).join(" • ")}</div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cm.pill}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${cm.dot}`} />
                {cm.label}
              </span>

              <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800">
                {r.md_day ?? mdDayToday}
              </span>

              {/* ✅ (3) Locked pill on main row */}
              {r.is_locked ? (
                <span className="inline-flex items-center rounded-full border bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  Locked
                </span>
              ) : null}

              {isOverride ? (
                <span className="inline-flex items-center rounded-full border bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Override
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-start md:justify-center">
              <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-sm font-semibold tabular-nums text-gray-800">
                {r.total_score ?? "—"}
              </span>
            </div>

            <div className="min-w-0 text-sm text-gray-700">
              <span className="block truncate" title={String(mainReason)}>
                {mainReason}
              </span>
            </div>

            <div className="flex items-center gap-2 justify-end">
              {/* ✅ (2A) disable pills when locked */}
              {renderActionPills(pid, r.is_locked)}

              {/* ✅ (2B) disable Save when locked */}
              <button
                onClick={async () => {
                  await saveOverride(r);
                }}
                disabled={isSaving || r.is_locked}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              >
                {r.is_locked ? "Locked" : isSaving ? "Saving..." : saved[pid] ? "Saved" : "Save"}
              </button>

              <button
                type="button"
                className="h-10 w-10 rounded-md border text-gray-600 hover:bg-gray-50"
                aria-label="Sýna nánar"
                onClick={() => setExpandedPlayerId((prev) => (prev === pid ? null : pid))}
              >
                {isOpen ? "▴" : "▾"}
              </button>
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="mt-2 rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                ⚡ Fatigue/Energy: <span className="font-medium tabular-nums">{v(r.fatigue_energy)}</span>
              </div>
              <div>
                😴 Sleep quality: <span className="font-medium tabular-nums">{v(r.sleep_quality)}</span>
              </div>
              <div>
                ⏱ Sleep duration: <span className="font-medium tabular-nums">{v(r.sleep_duration)}</span>
              </div>
              <div>
                🧠 Stress/Mood: <span className="font-medium tabular-nums">{v(r.stress_mood)}</span>
              </div>
              <div>
                💪 Muscle soreness: <span className="font-medium tabular-nums">{v(r.muscle_soreness)}</span>
              </div>
              <div className="min-w-[220px]">
                📝 Notes:{" "}
                <span className="font-medium">{r.notes && r.notes.trim().length ? r.notes : "—"}</span>
              </div>
              <div>
                Skráð:{" "}
                <span className="font-medium">
                  {new Date(r.created_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">Coach message (Stage4)</div>
              <textarea
                className="w-full rounded-md border bg-white p-2 text-sm"
                rows={2}
                value={draftMessage[pid] ?? ""}
                onChange={(e) => setDraftMessage((p) => ({ ...p, [pid]: e.target.value }))}
                disabled={isSaving || r.is_locked} // ✅ (2B) lock textarea too
                placeholder="Skrifaðu coach skilaboð…"
              />
              <div className="text-xs text-gray-500">
                Þetta vistast í <code>stage4_decisions.coach_note</code> þegar þú ýtir á Save — og birtist á player-síðunni.
              </div>
            </div>

            {/* ✅ Keep full auto debug here (NOT in main row) */}
            <div className="text-xs text-gray-600">
              <div>
                Auto reason: <span className="font-mono">{r.final_reason ?? "—"}</span>
              </div>
            </div>

            <div className="text-xs text-gray-600 space-y-1">
              <div>
                Stage4: system=<span className="font-mono">{r.system_decision ?? "—"}</span> · coach=
                <span className="font-mono">{r.coach_decision ?? "—"}</span> · final=
                <span className="font-mono">{r.final_decision ?? "—"}</span> · source=
                <span className="font-mono">{r.final_source ?? "—"}</span>
              </div>
              <div>
                Readiness id: <span className="font-mono">{r.readiness_entry_id ?? "—"}</span>
              </div>
              <div>
                Stage4 updated: <span className="font-mono">{r.stage4_updated_at ?? "—"}</span>
              </div>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  const tm = teamStatusMeta(teamIntel?.team_status);

  return (
    <div className="space-y-5">
      <CoachHubCards />

      {/* ✅ Performance Intelligence (Team) */}
      <Card className={`shadow-sm border ${tm.border}`}>
        <CardHeader className={`${tm.bg}`}>
          <CardTitle className={`text-base ${tm.text}`}>Performance Intelligence — Team</CardTitle>
          <CardDescription className={`${tm.text}`}>
            Status: <span className="font-semibold">{teamIntel?.team_status ?? "—"}</span> · Baseline:{" "}
            <span className="font-semibold">{teamIntel?.baseline_maturity ?? "—"}</span> · Players:{" "}
            <span className="font-semibold">{teamIntel?.n_players ?? "—"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!teamIntel ? (
            <div className="text-sm text-muted-foreground">Engin team intelligence færsla fannst í dag.</div>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-md border bg-white p-3">
                  <div className="text-xs text-gray-500">Volatility</div>
                  <div className="text-lg font-semibold tabular-nums">{teamIntel.volatility_pct ?? 0}%</div>
                  <div className="text-xs text-gray-500">volatile: {teamIntel.n_volatile ?? 0}</div>
                </div>

                <div className="rounded-md border bg-white p-3">
                  <div className="text-xs text-gray-500">RED</div>
                  <div className="text-lg font-semibold tabular-nums">{teamIntel.pct_red ?? 0}%</div>
                  <div className="text-xs text-gray-500">n: {teamIntel.n_red ?? 0}</div>
                </div>

                <div className="rounded-md border bg-white p-3">
                  <div className="text-xs text-gray-500">YELLOW</div>
                  <div className="text-lg font-semibold tabular-nums">{teamIntel.pct_yellow ?? 0}%</div>
                  <div className="text-xs text-gray-500">n: {teamIntel.n_yellow ?? 0}</div>
                </div>

                <div className="rounded-md border bg-white p-3">
                  <div className="text-xs text-gray-500">GREEN (+)</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    green: {teamIntel.n_green ?? 0} · green+: {teamIntel.n_green_plus ?? 0}
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-white p-3">
                <div className="text-xs font-semibold text-gray-700">Recommendation</div>
                <div className="text-sm text-gray-800">{teamIntel.recommendation ?? "—"}</div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Readiness Today</CardTitle>
          <CardDescription>
            Coach: <span className="font-medium">{coachName || "—"}</span> · Date:{" "}
            <span className="font-medium">{today}</span> · MD-day: <span className="font-medium">{mdDayToday}</span> ·
            Source: <span className="font-medium">{planPreview?.source ?? "—"}</span> · Confidence:{" "}
            <span className="font-medium">{confidenceLabel}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
                All
              </Button>
              <Button variant={filter === "red" ? "default" : "outline"} onClick={() => setFilter("red")}>
                Red ({counts.red})
              </Button>
              <Button variant={filter === "yellow" ? "default" : "outline"} onClick={() => setFilter("yellow")}>
                Yellow ({counts.yellow})
              </Button>
              <Button variant={filter === "green" ? "default" : "outline"} onClick={() => setFilter("green")}>
                Green ({counts.green})
              </Button>
            </div>

            <div className="flex gap-2 items-center">
              <Input
                placeholder="Leita að leikmanni…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[220px]"
              />

              <Button variant="outline" onClick={() => loadToday()} disabled={loading || genLoading}>
                {loading ? "Hleð..." : "Refresh"}
              </Button>

              <Button onClick={generateTodayDecisionsForTeam} disabled={genLoading || loading}>
                {genLoading ? "Generating…" : "Generate Today Decisions"}
              </Button>
            </div>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {genToast ? <div className="text-sm text-green-700">{genToast}</div> : null}

          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Engin readiness gögn í dag.</div>
          ) : (
            <div className="space-y-2">{rows.map((r) => renderRow(r))}</div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Page {page + 1} / {totalPages} · Total {total}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={!canPrev} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Prev
                </Button>
                <Button variant="outline" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-4 text-sm">
          <span className="font-semibold">Workflow:</span> Byrja á 🔴/🟡 → staðfesta með GPS/CMJ → velja minnsta virka skammt.
        </CardContent>
      </Card>
    </div>
  );
}
