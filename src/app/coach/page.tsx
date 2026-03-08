"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CheckinReminderStatusCard from "@/components/coach/CheckinReminderStatusCard";

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

type TemplateLite = {
  id: string;
  title: string | null;
  code: string | null;
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

type TeamSignal = {
  n_players: number;
  n_full: number;
  n_reduced: number;
  n_recovery: number;
  avg_confidence?: number | null;
};

type DayState = "NORMAL_DAY" | "OFF_DAY" | "NO_INPUT_EXPECTED" | "MISSING_INPUT";

function computeTeamRisk(signal: TeamSignal | null) {
  if (!signal || !signal.n_players) {
    return {
      level: "UNKNOWN" as const,
      label: "No data",
      why: "Engin team-samantekt tiltæk fyrir daginn.",
      recommendation: "Refresh eða keyrðu Generate Today Decisions.",
    };
  }

  const n = signal.n_players;
  const reducedPct = (signal.n_reduced / n) * 100;
  const recoveryPct = (signal.n_recovery / n) * 100;

  // Weighted impact score: RECOVERY vegur meira en REDUCED
  const impactScore = recoveryPct * 1.5 + reducedPct * 1.0;

  // Pragmatískar þröskuldar
  if (impactScore > 30) {
    return {
      level: "HIGH" as const,
      label: "HIGH RISK",
      why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
      recommendation:
        "Breytðu æfingu: minnkaðu heildarálag (volume/intensity), forðastu mikla eccentrics/contacts, aukið recovery blocks. Haltu gæðum á lykilatriðum en skera niður magn.",
    };
  }

  if (impactScore >= 15) {
    return {
      level: "CAUTION" as const,
      label: "CAUTION",
      why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
      recommendation:
        "Aðlaga daginn: halda gæðum en lækka magn (t.d. -20–30% sets/reps), velja minni árekstra, lengri hvíld, og fylgjast með þeim sem eru REDUCED/RECOVERY.",
    };
  }

  return {
    level: "STABLE" as const,
    label: "STABLE",
    why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
    recommendation: "Keyra plan að mestu: normal session, með sértækri áherslu á þá sem eru REDUCED/RECOVERY (individual mods).",
  };
}

function riskUi(level: "UNKNOWN" | "STABLE" | "CAUTION" | "HIGH") {
  switch (level) {
    case "HIGH":
      return { border: "border-red-200", bg: "bg-red-50", text: "text-red-800", pill: "bg-red-600 text-white" };
    case "CAUTION":
      return {
        border: "border-yellow-200",
        bg: "bg-yellow-50",
        text: "text-yellow-900",
        pill: "bg-yellow-600 text-white",
      };
    case "STABLE":
      return { border: "border-green-200", bg: "bg-green-50", text: "text-green-800", pill: "bg-green-600 text-white" };
    default:
      return { border: "border-gray-200", bg: "bg-gray-50", text: "text-gray-800", pill: "bg-gray-600 text-white" };
  }
}

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

  _confidence_num?: number | null;
  _needs_review?: boolean;
  _sten?: number | null;
  _neural_load_state?: string | null;
  _readiness_trajectory?: string | null;
  _next_day_risk?: string | null;
  _neural_summary?: string | null;
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
  if (!v) return { md: "—", label: "No MD set" }; // ✅ do NOT show GENERIC as MD-day
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

// ✅ Only accept real MD tokens (avoid OTHER/day_type etc.)
function isValidMdToken(x: string | null | undefined) {
  const s = String(x ?? "").trim().toUpperCase();
  if (!s) return false;
  return /^MD([+-]\d+)?$/.test(s);
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

function truncateLine(value: string | null | undefined, max = 92) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * ✅ Fallback rule:
 * Downgrade one step if soreness >= 4
 *
 * IMPORTANT: This should ONLY be used as a fallback if DB final_* is missing.
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
    input.flag === "GREEN" ? "YELLOW: High soreness. Adjust load." : "RED: High soreness. Recovery/very light day.";

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

function isOffLikeToken(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "OFF" || v === "REST" || v === "DAY_OFF" || v === "DAY OFF";
}

function isNoInputExpectedToken(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "OTHER" || v === "NO_INPUT" || v === "NO INPUT";
}

function getProductionDayState(args: {
  readinessCount: number;
  mdDay: string | null | undefined;
  plannedDayTypes: Array<string | null | undefined>;
  expectedPlayers: number;
}) {
  const md = String(args.mdDay ?? "").trim().toUpperCase();
  const dayTypes = args.plannedDayTypes.map((x) => String(x ?? "").trim().toUpperCase()).filter(Boolean);

  // 1) OFF_DAY
  if (isOffLikeToken(md) || (dayTypes.length > 0 && dayTypes.every((d) => isOffLikeToken(d)))) {
    return "OFF_DAY" as DayState;
  }

  // 2) NORMAL_DAY
  if (args.readinessCount > 0) {
    return "NORMAL_DAY" as DayState;
  }

  // 3) NO_INPUT_EXPECTED
  if (isNoInputExpectedToken(md) || (dayTypes.length > 0 && dayTypes.every((d) => isNoInputExpectedToken(d))) || args.expectedPlayers === 0) {
    return "NO_INPUT_EXPECTED" as DayState;
  }

  // 4) MISSING_INPUT
  return "MISSING_INPUT" as DayState;
}

const confNum = (v: any) => {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

const flagRank = (flag: any) => {
  const f = String(flag ?? "").toUpperCase();
  if (f === "RED") return 0;
  if (f === "YELLOW") return 1;
  return 2; // GREEN / annað
};

const needsReview = (confidence: any) => {
  const c = confNum(confidence);
  return c == null || c < 60;
};

const flagToAction = (flag: string | null | undefined): TrainingAction => {
  const f = String(flag ?? "").toUpperCase();
  if (f === "RED") return "RECOVERY";
  if (f === "YELLOW") return "REDUCED";
  return "FULL";
};

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
  const [teamSignal, setTeamSignal] = useState<TeamSignal | null>(null);
  const [unitAlerts, setUnitAlerts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);

  // ✅ Team intelligence
  const [teamIntel, setTeamIntel] = useState<TeamIntel | null>(null);

  // generate decisions
  const [genLoading, setGenLoading] = useState(false);
  const [genToast, setGenToast] = useState<string>("");

  // ✅ Role (coach/admin) — admin bypasses auto-lock + can unlock
  const [coachRole, setCoachRole] = useState<string>("coach");

  // ✅ Auto-lock run guard
  const [autoLockRan, setAutoLockRan] = useState(false);

  const today = useMemo(() => todayISO(), []);

  // ✅ Header MD-day remains as-is (team-level display)
  const mdDayToday = useMemo(() => {
    const t = todayISO();
    const row = (weekGrid ?? []).find((x: any) => String(x.day_date) === t) ?? null;
    const src = mdContextToday ?? row?.md_day ?? planPreview?.md_day ?? null;
    return prettyMd(src).md;
  }, [weekGrid, planPreview?.md_day, mdContextToday]);

  const isAdmin = useMemo(() => String(coachRole ?? "").toLowerCase() === "admin", [coachRole]);

  // ✅ Auto-lock settings (you can change these without touching DB)
  const AUTO_LOCK_MINUTES_BEFORE = 30;
  const DEFAULT_SESSION_START = { hour: 16, minute: 0 };

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
      .select("role, display_name, team_id")
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
    setCoachRole(String(role ?? "coach"));

    const r = String(role ?? "").toLowerCase();
    if (r !== "coach" && r !== "admin") {
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
    (async () => {
      const { data } = await supabase
        .from("workout_templates")
        .select("id, title, code")
        .eq("is_active", true)
        .order("title");
      setTemplates((data ?? []) as any);
    })();
  }, []);

  useEffect(() => {
    if (!coachVerified) return;
    setPage(0);

    setDraftAction({});
    setDraftMessage({});
    setSaved({});
  }, [teamFilter, filter, search, coachVerified]);

  // ✅ Return pp so loadToday can use it without setState timing issues
  async function loadPlanPreview(): Promise<PlanPreview | null> {
    try {
      const { data, error } = await supabase.from("v_coach_plan_preview_today").select("*").maybeSingle();
      if (error) {
        console.error("Plan preview error:", error.message);
        setPlanPreview(null);
        return null;
      }
      const row = (data as any) ?? null;
      setPlanPreview(row);
      return row;
    } catch (e) {
      console.error("Plan preview error (catch):", e);
      setPlanPreview(null);
      return null;
    }
  }

  // ✅ Return grid so loadToday can use it without setState timing issues
  async function loadWeekGrid(): Promise<any[]> {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return [];

      const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const teamId = (prof as any)?.team_id;
      if (!teamId) return [];

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
        return [];
      }

      const { data: grid, error } = await supabase
        .from("v_week_plan_grid")
        .select("day_date, md_day, day_type_final, dose_final")
        .eq("week_setup_id", weekSetupId)
        .order("day_date", { ascending: true });

      if (error) {
        console.error("Week grid error:", error.message);
        setWeekGrid([]);
        return [];
      }

      const rows = (grid as any[]) ?? [];
      setWeekGrid(rows);
      return rows;
    } catch (e) {
      console.error("Week grid error (catch):", e);
      setWeekGrid([]);
      return [];
    }
  }

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

      const { data: prof, error: pErr } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
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

  async function assignTemplate(playerId: string, entryDate: string, templateId: string, teamId?: string | null) {
    const { error } = await supabase
      .from("player_template_assignments")
      .upsert(
        {
          player_id: playerId,
          entry_date: entryDate,
          template_id: templateId,
          team_id: teamId ?? null,
        },
        { onConflict: "player_id,entry_date" }
      );

    if (error) {
      console.error(error);
      alert("Tókst ekki að úthluta template.");
    }
  }

  function parseSessionStartFromPlanPreview(pp: PlanPreview | null): { hour: number; minute: number } | null {
    try {
      const raw = (pp as any)?.template_structure?.session_start ?? null;
      if (!raw) return null;
      const s = String(raw).trim();
      const m = s.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const hour = Math.max(0, Math.min(23, Number(m[1])));
      const minute = Math.max(0, Math.min(59, Number(m[2])));
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
      return { hour, minute };
    } catch {
      return null;
    }
  }

  function shouldAutoLockNow(entryDate: string, pp: PlanPreview | null): boolean {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();
    if (String(entryDate) !== String(today)) return false;

    const start = parseSessionStartFromPlanPreview(pp) ?? DEFAULT_SESSION_START;

    const now = new Date();
    const year = Number(entryDate.slice(0, 4));
    const month = Number(entryDate.slice(5, 7));
    const day = Number(entryDate.slice(8, 10));

    const sessionStart = new Date(year, month - 1, day, start.hour, start.minute, 0, 0);
    const lockTime = new Date(sessionStart.getTime() - AUTO_LOCK_MINUTES_BEFORE * 60 * 1000);

    return now.getTime() >= lockTime.getTime();
  }

  async function lockAllForTodayIfNeeded(entryDate: string, list: Row[]) {
    if (isAdmin) return;
    if (autoLockRan) return;

    // ✅ IMPORTANT: use latest planPreview state (OK for auto-lock)
    if (!shouldAutoLockNow(entryDate, planPreview)) return;

    const unlocked = list.filter((r) => !r.is_locked).map((r) => String(r.player_id));
    if (unlocked.length === 0) {
      setAutoLockRan(true);
      return;
    }

    try {
      setError("");
      const { error } = await supabase
        .from("stage4_decisions_final")
        .update({ locked: true })
        .eq("entry_date", entryDate)
        .in("player_id", unlocked);

      if (error) throw new Error(error.message);

      setAutoLockRan(true);
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Auto-lock mistókst.");
      setAutoLockRan(true);
    }
  }

  async function loadToday() {
    try {
      setError("");
      setLoading(true);

      const entryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();

      // ✅ local ctx var (avoid setState timing mismatch)
      let ctxMd: string | null = null;

      // Ensure Stage4 rows exist for today's date before reading views
      await supabase.rpc("stage4_bootstrap_for_date", { p_date: entryDate });

      // md_day context for today (per team)
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
            ctxMd = (ctxRow as any)?.md_day ?? null;
            setMdContextToday(ctxMd);
          } else {
            ctxMd = null;
            setMdContextToday(null);
          }
        } else {
          ctxMd = null;
          setMdContextToday(null);
        }
      } catch {
        ctxMd = null;
        setMdContextToday(null);
      }

      await loadTeamIntelligenceToday();

      // ✅ IMPORTANT: get pp + grid locally for this load (prevents “OTHER”/stale state)
      const pp = await loadPlanPreview();
      const grid = await loadWeekGrid();

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("v_coach_readiness_today_v7")
        .select("*", { count: "exact" })
        .eq("entry_date", entryDate)
        .order("total_score", { ascending: true })
        .order("full_name", { ascending: true })
        .range(from, to);

      if (teamFilter && teamFilter !== "all") q = q.eq("team", teamFilter);
      if (filter !== "all") q = q.eq("final_color", filter);
      if (search.trim().length > 0) q = q.ilike("full_name", `%${search.trim()}%`);

      const { data, error, count } = await q;

      // Team readiness signal
      try {
        let teamIdForSignal: string | null = null;
        if (teamFilter && teamFilter !== "all") {
          teamIdForSignal = teamFilter;
        } else {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth?.user?.id;
          if (uid) {
            const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
            teamIdForSignal = (prof as any)?.team_id ?? null;
          }
        }

        if (teamIdForSignal) {
          const { data: signal } = await supabase
            .from("v_team_readiness_today")
            .select("*")
            .eq("team_id", teamIdForSignal)
            .eq("entry_date", entryDate)
            .maybeSingle();
          setTeamSignal((signal as TeamSignal) ?? null);
        } else {
          setTeamSignal(null);
        }
      } catch {
        setTeamSignal(null);
      }

      // Unit alerts
      try {
        const teamId =
          teamFilter && teamFilter !== "all"
            ? teamFilter
            : (
                await supabase
                  .from("profiles")
                  .select("team_id")
                  .eq("id", (await supabase.auth.getUser()).data?.user?.id ?? "")
                  .maybeSingle()
              ).data?.team_id ?? null;

        if (teamId) {
          const { data: ua } = await supabase
            .from("v_team_unit_alerts_today")
            .select("*")
            .eq("team_id", teamId)
            .eq("entry_date", entryDate)
            .order("unit_order", { ascending: true });
          setUnitAlerts(ua ?? []);
        } else {
          setUnitAlerts([]);
        }
      } catch {
        setUnitAlerts([]);
      }

      if (error) {
        setError(error.message);
        setRows([]);
        setTotal(0);
        return;
      }

      const raw: any[] = (data ?? []) as any[];

      // ✅ Team-level MD truth (computed once)
      const gridRowToday = (grid ?? []).find((x: any) => String(x.day_date) === String(entryDate)) ?? null;
      const teamMdDay =
        (isValidMdToken(ctxMd) ? String(ctxMd).toUpperCase() : null) ??
        (isValidMdToken(gridRowToday?.md_day) ? String(gridRowToday.md_day).toUpperCase() : null) ??
        (isValidMdToken(pp?.md_day) ? String(pp?.md_day).toUpperCase() : null) ??
        null;

      const list: Row[] = raw.map((r) => {
        const playerId = String(r.player_id);
        const entryId: string | null = (r.readiness_entry_id ?? null) as string | null;

        const confidenceNum = confNum((r as any).system_confidence ?? null);
        const reviewNeeded = needsReview((r as any).system_confidence ?? null);

        // ✅ Base final_* from DB/view
        const baseColor = (String(r.final_color ?? "").toLowerCase() as FinalColor) || null;
        const baseFlag = (String(r.final_flag ?? "").toUpperCase() as FinalFlag) || null;
        const baseReason = (r.final_reason ?? null) as string | null;

        // ✅ Trust DB final_* when present. Only apply soreness downgrade if DB final_* is missing.
        let finalColor: FinalColor = (baseColor ?? "green") as FinalColor;
        let finalFlag: FinalFlag = (baseFlag ?? "GREEN") as FinalFlag;
        let finalReason: string | null = baseReason ?? null;

        const hasDbFinal = !!baseFlag && !!baseColor;
        if (!hasDbFinal) {
          const downgraded = applySorenessDowngrade({
            flag: baseFlag,
            color: baseColor,
            reason: baseReason,
            soreness: r.soreness ?? null,
          });

          finalColor = (downgraded.final_color ?? finalColor) as FinalColor;
          finalFlag = (downgraded.final_flag ?? finalFlag) as FinalFlag;
          finalReason = downgraded.final_reason ?? finalReason;
        }

        const plannedFocus = r.planned_focus ?? null;

        const perPlayerMdRaw = mdFromPlannedFocus(plannedFocus);
        const perPlayerMd = isValidMdToken(perPlayerMdRaw) ? perPlayerMdRaw : null;

        const viewMdRaw = (r.md_day ?? null) as string | null;
        const viewMd = isValidMdToken(viewMdRaw) ? viewMdRaw : null;

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

          training_action: (r.final_decision ?? "FULL") as TrainingAction,
          coach_message: (r.coach_note ?? null) as string | null,
          is_locked: !!(r.locked ?? false),

          final_color: finalColor,
          final_flag: finalFlag,
          final_reason: finalReason,

          // ✅ IMPORTANT: row MD uses safe chain and never shows OTHER
          md_day: viewMd ?? perPlayerMd ?? teamMdDay ?? "—",

          system_decision: (r.system_decision ?? null) as TrainingAction | null,
          coach_decision: (r.coach_decision ?? null) as TrainingAction | null,
          final_decision: (r.final_decision ?? null) as TrainingAction | null,
          final_source: (r.final_source ?? null) as string | null,
          stage4_updated_at: (r.stage4_updated_at ?? null) as string | null,

          ui_key: `${playerId}_${String(r.entry_date ?? entryDate)}`,

          _confidence_num: confidenceNum,
          _needs_review: reviewNeeded,
          _sten: typeof (r as any).sten === "number" ? (r as any).sten : null,
          _neural_load_state:
            (r as any).neural_load_state ??
            (r as any).neuralLoadState ??
            null,
          _readiness_trajectory:
            (r as any).readiness_trajectory ??
            (r as any).readinessTrajectory ??
            null,
          _next_day_risk:
            (r as any).next_day_risk ??
            (r as any).nextDayRisk ??
            null,
          _neural_summary:
            (r as any).neural_summary ??
            (r as any).neural_summary_text ??
            (r as any).neuralSummary ??
            null,
        };
      });

      list.sort((a: any, b: any) => {
        if (a._needs_review !== b._needs_review) return a._needs_review ? -1 : 1;

        const as = a.total_score ?? 9999;
        const bs = b.total_score ?? 9999;
        if (as !== bs) return as - bs;

        const ar = flagRank(a.final_flag);
        const br = flagRank(b.final_flag);
        if (ar !== br) return ar - br;

        return String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""));
      });

      setRows(list);
      setTotal(count ?? 0);

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

      await lockAllForTodayIfNeeded(entryDate, list);
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

  const needsReviewCount = useMemo(() => rows.filter((r) => !!r._needs_review).length, [rows]);

  const teamSten = useMemo(() => {
    const values = rows
      .map((r) => (typeof r._sten === "number" ? r._sten : null))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!values.length) return { avg: null as number | null, coverage: `0/${rows.length}` };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { avg, coverage: `${values.length}/${rows.length}` };
  }, [rows]);

  const teamNeuralIntel = useMemo(() => {
    const norm = (v: string | null | undefined) => String(v ?? "").trim().toUpperCase();
    const pickByText = (txt: string) => {
      const t = norm(txt);
      const state =
        t.includes("CRITICAL") ? "CRITICAL" : t.includes("HIGH") ? "HIGH" : t.includes("RISING") ? "RISING" : t.includes("STABLE") ? "STABLE" : "";
      const trajectory = t.includes("DECLINING")
        ? "DECLINING"
        : t.includes("IMPROVING")
        ? "IMPROVING"
        : t.includes("FLAT")
        ? "FLAT"
        : "";
      const risk = t.includes("RISK HIGH") || t.includes("HIGH RISK")
        ? "HIGH"
        : t.includes("RISK MODERATE") || t.includes("MODERATE RISK")
        ? "MODERATE"
        : t.includes("RISK LOW") || t.includes("LOW RISK")
        ? "LOW"
        : "";
      return { state, trajectory, risk };
    };

    const inferredFromText = rows.map((r) => {
      const blob = [r.final_reason, r.planned_focus, r._neural_summary].filter(Boolean).join(" | ");
      return pickByText(blob);
    });

    const hasAny = rows.some(
      (r) =>
        norm(r._neural_load_state).length > 0 ||
        norm(r._readiness_trajectory).length > 0 ||
        norm(r._next_day_risk).length > 0 ||
        norm(r._neural_summary).length > 0
    );

    const countTop = (values: string[]) => {
      const m = new Map<string, number>();
      for (const v of values) {
        const k = norm(v);
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      let best = "—";
      let bestN = -1;
      for (const [k, n] of m) {
        if (n > bestN) {
          best = k;
          bestN = n;
        }
      }
      return best;
    };

    const states = rows.map((r, i) => r._neural_load_state ?? inferredFromText[i]?.state ?? "");
    const trajectories = rows.map((r, i) => r._readiness_trajectory ?? inferredFromText[i]?.trajectory ?? "");
    const risks = rows.map((r, i) => r._next_day_risk ?? inferredFromText[i]?.risk ?? "");
    const highRiskCount = risks.filter((x) => norm(x) === "HIGH").length;
    let dominantState = countTop(states);
    let trajectory = countTop(trajectories);
    let nextDayRisk = countTop(risks);
    const firstSummary =
      rows.map((r) => String(r._neural_summary ?? "").trim()).find((s) => s.length > 0) ?? "";

    // Production-safe proxy fallback from existing team signals when neural fields are absent.
    if (!hasAny) {
      const risk = computeTeamRisk(teamSignal);
      dominantState = risk.level === "HIGH" ? "HIGH" : risk.level === "CAUTION" ? "RISING" : "STABLE";
      trajectory = risk.level === "HIGH" ? "DECLINING" : "FLAT";
      nextDayRisk = risk.level === "HIGH" ? "HIGH" : risk.level === "CAUTION" ? "MODERATE" : "LOW";
    }

    const computedSummary =
      !hasAny && !firstSummary
        ? "Derived from current team readiness signals; neural feed unavailable."
        : "";

    return {
      hasData: hasAny || rows.length > 0,
      dominantState,
      trajectory,
      nextDayRisk,
      highRiskCount,
      summaryText:
        firstSummary ||
        computedSummary ||
        `Team neural load is ${dominantState.toLowerCase()}, trajectory ${trajectory.toLowerCase()}, next-day risk ${nextDayRisk.toLowerCase()}.`,
    };
  }, [rows, teamSignal]);

  async function saveConfirmed(r: Row) {
    if (r.is_locked && !isAdmin) return;

    const playerId = String(r.player_id);
    const action = draftAction[playerId] ?? r.training_action ?? "FULL";
    const message = (draftMessage[playerId] ?? r.coach_message ?? "").trim();
    const entryDate = r.entry_date && String(r.entry_date).trim().length > 0 ? String(r.entry_date).trim() : todayISO();
    const systemDecision = flagToAction(r.final_flag ?? (r.final_color ? String(r.final_color).toUpperCase() : null));

    setSaving((p) => ({ ...p, [playerId]: true }));
    setSaved((p) => ({ ...p, [playerId]: false }));
    setError("");

    try {
      const payload: any = {
        player_id: playerId,
        entry_date: entryDate,
        system_decision: systemDecision,
        coach_decision: action,
        coach_note: message.length ? message : null,
        locked: false,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("stage4_decisions_final").upsert(payload, {
        onConflict: "player_id,entry_date",
      });
      if (upErr) throw new Error(`Save failed: ${upErr.message}`);

      const { error: lockErr } = await supabase.rpc("coach_override_microdose_plan", {
        p_player_id: playerId,
        p_entry_date: entryDate,
        p_variant_id: null,
        p_source: "COACH",
      });
      if (lockErr) console.warn("coach_override_microdose_plan failed payload:", { playerId, entryDate, action, r });

      setSaved((p) => ({ ...p, [playerId]: true }));
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Save mistókst.");
    } finally {
      setSaving((p) => ({ ...p, [playerId]: false }));
    }
  }

  async function lockForDay(r: Row) {
    if (r.is_locked) return;

    const playerId = String(r.player_id);
    const action = draftAction[playerId] ?? r.training_action ?? "FULL";
    const message = (draftMessage[playerId] ?? r.coach_message ?? "").trim();
    const entryDate = r.entry_date && String(r.entry_date).trim().length > 0 ? String(r.entry_date).trim() : todayISO();
    const systemDecision = flagToAction(r.final_flag ?? (r.final_color ? String(r.final_color).toUpperCase() : null));

    setSaving((p) => ({ ...p, [playerId]: true }));
    setError("");

    try {
      const payload: any = {
        player_id: playerId,
        entry_date: entryDate,
        system_decision: systemDecision,
        coach_decision: action,
        coach_note: message.length ? message : null,
        locked: true,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("stage4_decisions_final").upsert(payload, {
        onConflict: "player_id,entry_date",
      });
      if (upErr) throw new Error(`Lock failed: ${upErr.message}`);

      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Lock mistókst.");
    } finally {
      setSaving((p) => ({ ...p, [playerId]: false }));
    }
  }

  async function unlockForDay(r: Row) {
    if (!isAdmin) return;
    if (!r.is_locked) return;

    const playerId = String(r.player_id);
    const entryDate = r.entry_date && String(r.entry_date).trim().length > 0 ? String(r.entry_date).trim() : todayISO();

    setSaving((p) => ({ ...p, [playerId]: true }));
    setError("");

    try {
      const { error } = await supabase
        .from("stage4_decisions_final")
        .update({ locked: false, updated_at: new Date().toISOString() })
        .eq("player_id", playerId)
        .eq("entry_date", entryDate);

      if (error) throw new Error(`Unlock failed: ${error.message}`);

      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Unlock mistókst.");
    } finally {
      setSaving((p) => ({ ...p, [playerId]: false }));
    }
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  if (loading) return <div className="py-6 text-sm text-muted-foreground">Hleð...</div>;

  const confidenceLabel = formatConfidence(planPreview?.confidence);

  const renderActionPills = (pid: string, locked: boolean) => {
    const current = draftAction[pid] ?? "FULL";
    const pill = (value: TrainingAction, label: string) => {
      const active = current === value;
      const disabled = locked && !isAdmin;
      return (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => setDraftAction((p) => ({ ...p, [pid]: value }))}
          className={[
            "rounded-full border px-3 py-1 text-xs font-semibold",
            disabled ? "opacity-50 cursor-not-allowed" : "",
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

    // ✅ FIX: COACH_OVERRIDE / COACH / etc.
    const isOverride = String(r.final_source ?? "").toUpperCase().includes("COACH");

    const mainReason = r.planned_focus || shortReason(r.final_reason) || "—";
    const lockedForCoach = r.is_locked && !isAdmin;
    const selectedAction: TrainingAction =
      draftAction[pid] ?? (r.final_decision as TrainingAction | null) ?? flagToAction(r.final_flag);

    const callTone =
      selectedAction === "RECOVERY"
        ? "border-red-200 bg-red-50 text-red-800"
        : selectedAction === "REDUCED"
        ? "border-yellow-200 bg-yellow-50 text-yellow-800"
        : "border-green-200 bg-green-50 text-green-800";

    const whySummary = truncateLine(mainReason, 82) || "—";
    const actionSummary = truncateLine(
      selectedAction === "RECOVERY"
        ? "Recovery-focused training and reduced load exposure."
        : selectedAction === "REDUCED"
        ? "Reduced volume/intensity with targeted modifications."
        : "Standard team load with individual adjustments as needed.",
      82
    );

    return (
      <React.Fragment key={r.ui_key ?? r.readiness_entry_id ?? pid}>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm md:text-base font-semibold max-w-[520px]">{r.full_name}</div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${callTone}`}>
                  {selectedAction}
                </span>
                {r._needs_review ? (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">Needs review</span>
                ) : null}
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cm.pill}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${cm.dot}`} />
                  <span className="tabular-nums">{cm.label} · {r.total_score ?? "—"}</span>
                </span>
                <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800">
                  {prettyMd(r.md_day ?? mdDayToday).md}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="text-xs text-gray-500 truncate">{[r.team, r.position].filter(Boolean).join(" • ")}</div>
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
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">{renderActionPills(pid, r.is_locked)}</div>

              <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
                <select
                  className="h-9 w-40 rounded-md border px-2 py-1 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    const tid = e.target.value;
                    if (!tid) return;
                    assignTemplate(r.player_id, r.entry_date, tid, r.team_id ?? null);
                  }}
                >
                  <option value="">Template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title ?? t.code}
                    </option>
                  ))}
                </select>

                <button
                  onClick={async () => {
                    await saveConfirmed(r);
                  }}
                  disabled={isSaving || lockedForCoach}
                  className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                  title={lockedForCoach ? "Locked fyrir daginn" : "Save (editable)"}
                >
                  {lockedForCoach ? "Locked" : isSaving ? "Saving..." : saved[pid] ? "Saved" : "Save"}
                </button>

                {!r.is_locked ? (
                  <button
                    onClick={async () => {
                      await lockForDay(r);
                    }}
                    disabled={isSaving}
                    className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                    title="Lock (endanlegt fyrir daginn)"
                  >
                    Lock
                  </button>
                ) : isAdmin ? (
                  <button
                    onClick={async () => {
                      await unlockForDay(r);
                    }}
                    disabled={isSaving}
                    className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                    title="Admin: Unlock"
                  >
                    Unlock
                  </button>
                ) : null}

                <button
                  type="button"
                  className="h-9 w-9 rounded-md border text-gray-600 hover:bg-gray-50"
                  aria-label="Sýna nánar"
                  onClick={() => setExpandedPlayerId((prev) => (prev === pid ? null : pid))}
                >
                  {isOpen ? "▴" : "▾"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border bg-gray-50/70 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Why</div>
              <div className="mt-0.5 truncate text-sm text-gray-800" title={whySummary}>
                {whySummary}
              </div>
            </div>
            <div className="rounded-lg border bg-gray-50/70 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Action</div>
              <div className="mt-0.5 truncate text-sm text-gray-800" title={actionSummary}>
                {actionSummary}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2.5">
            <div className="inline-flex w-fit items-center gap-4 rounded-md border bg-gray-50 px-3 py-2">
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Readiness score</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900">{r.total_score ?? "—"}</div>
              </div>
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Date</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900">{r.entry_date}</div>
              </div>
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
                📝 Notes: <span className="font-medium">{r.notes && r.notes.trim().length ? r.notes : "—"}</span>
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
                disabled={isSaving || (r.is_locked && !isAdmin)}
                placeholder="Skrifaðu coach skilaboð…"
              />
              <div className="text-xs text-gray-500">
                Save = confirmed (editable). Lock = endanlegt fyrir daginn. Auto-lock: {AUTO_LOCK_MINUTES_BEFORE} mín fyrir session start.
              </div>
            </div>

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
              <div>
                Role: <span className="font-mono">{coachRole}</span>
              </div>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  const tm = teamStatusMeta(teamIntel?.team_status);
  const expectedPlayers = teamSignal?.n_players ?? teamIntel?.n_players ?? 0;
  const dayState = getProductionDayState({
    readinessCount: rows.length,
    mdDay: mdDayToday,
    plannedDayTypes: rows.map((r) => r.planned_day_type ?? null),
    expectedPlayers,
  });

  const dayStateMessage =
    dayState === "OFF_DAY"
      ? "Off day. No readiness check-in expected."
      : dayState === "NO_INPUT_EXPECTED"
      ? "No player input expected today."
      : dayState === "MISSING_INPUT"
      ? "Readiness input appears to be missing for today."
      : "";

  const teamIntelFallbackMessage =
    dayState === "OFF_DAY"
      ? "No team intelligence generated today because no readiness check-in was expected."
      : dayState === "NO_INPUT_EXPECTED"
      ? "Team intelligence is not generated on no-input days."
      : dayState === "MISSING_INPUT"
      ? "Team intelligence is unavailable because readiness input appears to be missing."
      : "Engin team intelligence færsla fannst í dag.";

  const complianceStateMessage =
    dayState === "OFF_DAY"
      ? "Check-in not required today."
      : dayState === "NO_INPUT_EXPECTED"
      ? "No check-in expected today."
      : dayState === "MISSING_INPUT"
      ? "Operational note: check-in input appears missing."
      : "Daily compliance tracking active.";

  const playerQueueEmptyMessage =
    dayState === "OFF_DAY"
      ? "No player review queue today. Off day detected."
      : dayState === "NO_INPUT_EXPECTED"
      ? "No player review queue today. No readiness input expected."
      : dayState === "MISSING_INPUT"
      ? "No player review queue yet. Readiness input appears missing."
      : "Engin readiness gögn í dag.";

  return (
    <div className="space-y-6">
      <CoachHubCards />

      {/* Production Command Center */}
      <Card className="border border-slate-200 shadow-md">
        <CardHeader className="bg-gradient-to-r from-slate-100 via-white to-slate-50 pb-3">
          <CardTitle className="text-base font-semibold tracking-tight text-slate-900">Today Command Center</CardTitle>
          <CardDescription className="text-xs text-slate-500">Daily team state, coaching action and review queue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const risk = computeTeamRisk(teamSignal);
            const ui = riskUi(risk.level);
            const totalPlayers = teamSignal?.n_players ?? 0;
            const nFull = teamSignal?.n_full ?? 0;
            const nReduced = teamSignal?.n_reduced ?? 0;
            const nRecovery = teamSignal?.n_recovery ?? 0;
            const dominantMix =
              (teamIntel?.pct_red ?? -1) >= (teamIntel?.pct_yellow ?? -1) && (teamIntel?.pct_red ?? -1) >= ((teamIntel?.pct_green ?? 0) + (teamIntel?.pct_green_plus ?? 0))
                ? "RED"
                : (teamIntel?.pct_yellow ?? -1) >= ((teamIntel?.pct_green ?? 0) + (teamIntel?.pct_green_plus ?? 0))
                ? "YELLOW"
                : "GREEN";

            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${ui.pill}`}>{risk.label}</div>
                  <div className="text-xs text-gray-500">
                    Coach: <span className="font-semibold">{coachName || "—"}</span> · MD {mdDayToday}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Total players</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">{totalPlayers}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Needs review</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">{needsReviewCount}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Team status</div>
                    <div className="mt-1 text-xl font-semibold">{teamIntel?.team_status ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Dominant mix</div>
                    <div className="mt-1 text-xl font-semibold">{teamIntel ? dominantMix : "—"}</div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-emerald-700">Full</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-800">{nFull}</div>
                  </div>
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-yellow-700">Reduced</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-yellow-800">{nReduced}</div>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-red-700">Recovery</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-red-800">{nRecovery}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Volatility</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{teamIntel?.volatility_pct ?? "—"}{teamIntel?.volatility_pct != null ? "%" : ""}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Source</div>
                    <div className="mt-1 text-lg font-semibold">{planPreview?.source ?? "—"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Confidence</div>
                    <div className="mt-1 text-lg font-semibold">{confidenceLabel}</div>
                  </div>
                </div>

                <div className={`rounded-xl border border-slate-200 bg-white p-3 text-sm ${ui.text}`}>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Coach recommendation</div>
                  <div className="mt-1 font-medium text-slate-800">{dayStateMessage || risk.recommendation}</div>
                  {dayStateMessage ? <div className="mt-1 text-xs text-slate-500">{risk.recommendation}</div> : null}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      <CheckinReminderStatusCard />
      <div className="mt-[-10px] text-xs text-slate-500">{complianceStateMessage}</div>

      <section className="space-y-3">
        <Card className="border border-slate-200 bg-slate-50/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold tracking-tight text-slate-900">Team intelligence</CardTitle>
            <CardDescription className="text-xs text-slate-500">Executive team context that supports daily coaching decisions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 xl:grid-cols-12">
              {/* ✅ Performance Intelligence (Team) */}
              <Card className={`shadow-sm border ${tm.border} xl:col-span-7`}>
                <CardHeader className={`${tm.bg}`}>
                  <CardTitle className={`text-base font-semibold tracking-tight ${tm.text}`}>Performance Intelligence — Team</CardTitle>
                  <CardDescription className={`text-xs ${tm.text}`}>
                    Status: <span className="font-semibold">{teamIntel?.team_status ?? "—"}</span> · Baseline:{" "}
                    <span className="font-semibold">{teamIntel?.baseline_maturity ?? "—"}</span> · Players:{" "}
                    <span className="font-semibold">{teamIntel?.n_players ?? "—"}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!teamIntel ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">{teamIntelFallbackMessage}</div>
                  ) : (
                    <>
                      <div className="grid gap-3 lg:grid-cols-12">
                        <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm lg:col-span-4">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Volatility (hero)</div>
                          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{teamIntel.volatility_pct ?? 0}%</div>
                          <div className="mt-1 text-xs text-slate-500">volatile players: {teamIntel.n_volatile ?? 0}</div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Readiness mix</div>
                          <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                            {teamIntel.pct_red ?? 0}% / {teamIntel.pct_yellow ?? 0}% / {(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%
                          </div>
                          <div className="mt-1 text-xs text-slate-500">RED / YELLOW / GREEN(+)</div>
                          <div className="mt-1 text-xs text-slate-500 tabular-nums">
                            n: {teamIntel.n_red ?? 0} / {teamIntel.n_yellow ?? 0} / {(teamIntel.n_green ?? 0) + (teamIntel.n_green_plus ?? 0)}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Status snapshot</div>
                          <div className="mt-1 text-base font-semibold text-slate-900">{teamIntel.team_status ?? "—"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            baseline: <span className="font-medium text-slate-700">{teamIntel.baseline_maturity ?? "—"}</span> · players:{" "}
                            <span className="font-medium text-slate-700">{teamIntel.n_players ?? "—"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-red-700">Red</div>
                          <div className="text-lg font-semibold tabular-nums text-red-800">{teamIntel.pct_red ?? 0}%</div>
                          <div className="text-xs text-red-700">n: {teamIntel.n_red ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-yellow-700">Yellow</div>
                          <div className="text-lg font-semibold tabular-nums text-yellow-800">{teamIntel.pct_yellow ?? 0}%</div>
                          <div className="text-xs text-yellow-700">n: {teamIntel.n_yellow ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-emerald-700">Green (+)</div>
                          <div className="text-lg font-semibold tabular-nums text-emerald-800">
                            {(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%
                          </div>
                          <div className="text-xs text-emerald-700">
                            n: {(teamIntel.n_green ?? 0) + (teamIntel.n_green_plus ?? 0)}
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg STEN</div>
                          <div className="text-lg font-semibold tabular-nums text-slate-900">
                            {teamSten.avg == null ? "—" : teamSten.avg.toFixed(1)}
                          </div>
                          <div className="text-xs text-slate-500">coverage: {teamSten.coverage}</div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-300 bg-gradient-to-r from-slate-100 to-white p-3 shadow-sm">
                        <div className="text-[10px] uppercase tracking-wide text-slate-600">Team plan recommendation</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{teamIntel.recommendation ?? "—"}</div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border border-slate-200 xl:col-span-5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold tracking-tight text-slate-900">Team Intelligence</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Dominant neural context for daily coaching decisions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!teamNeuralIntel.hasData ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">
                      {dayState === "NORMAL_DAY" ? teamNeuralIntel.summaryText : teamIntelFallbackMessage}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Dominant state</div>
                          <div className="mt-1 text-lg font-semibold">{teamNeuralIntel.dominantState}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Trajectory</div>
                          <div className="mt-1 text-lg font-semibold">{teamNeuralIntel.trajectory}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Next-day risk</div>
                          <div className="mt-1 text-lg font-semibold">{teamNeuralIntel.nextDayRisk}</div>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-amber-700">High-risk count</div>
                          <div className="mt-1 text-lg font-semibold tabular-nums text-amber-800">{teamNeuralIntel.highRiskCount}</div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Summary</div>
                        <div className="mt-1 text-sm text-slate-800">{teamNeuralIntel.summaryText}</div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">Players needing review today</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {needsReviewCount} players flagged by the system · Date: <span className="font-medium">{today}</span> · MD-day:{" "}
            <span className="font-medium">{mdDayToday}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {teamSignal
            ? (() => {
                const risk = computeTeamRisk(teamSignal);
                const ui = riskUi(risk.level);
                return (
                  <div className={`rounded-xl border ${ui.border} bg-white p-4 shadow-sm`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Team state context</div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Operational summary</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 text-sm">
                      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${ui.pill}`}>
                        {risk.label}
                      </div>
                      <div>
                        <div className="font-semibold">Total</div>
                        <div>{teamSignal.n_players}</div>
                      </div>
                      <div className="text-green-600">
                        <div className="font-semibold">FULL</div>
                        <div>{teamSignal.n_full}</div>
                      </div>
                      <div className="text-yellow-600">
                        <div className="font-semibold">REDUCED</div>
                        <div>{teamSignal.n_reduced}</div>
                      </div>
                      <div className="text-red-600">
                        <div className="font-semibold">RECOVERY</div>
                        <div>{teamSignal.n_recovery}</div>
                      </div>
                      <div>
                        <div className="font-semibold">Avg Confidence</div>
                        <div>{teamSignal.avg_confidence ?? "-"}</div>
                      </div>
                      <div>
                        <div className="font-semibold">Needs Review</div>
                        <div>{needsReviewCount}</div>
                      </div>
                      <div>
                        <div className="font-semibold">Auto-lock</div>
                        <div className="text-xs text-gray-600">
                          {AUTO_LOCK_MINUTES_BEFORE} mín fyrir session start (default {String(DEFAULT_SESSION_START.hour).padStart(2, "0")}:
                          {String(DEFAULT_SESSION_START.minute).padStart(2, "0")})
                        </div>
                      </div>
                    </div>
                    <div className={`mt-3 text-xs ${ui.text}`}>
                      <div className="font-semibold">Why</div>
                      <div>{risk.why}</div>
                      <div className="mt-1 font-semibold">Recommendation</div>
                      <div>{risk.recommendation}</div>
                    </div>
                  </div>
                );
              })()
            : null}

          {unitAlerts?.length > 0 && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm font-semibold">Unit alerts</div>

              <div className="mt-3 grid gap-2">
                {unitAlerts
                  .filter((u) => u.unit !== "unknown")
                  .map((u) => (
                    <div
                      key={`${u.unit}-${u.sport}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                    >
                      <div className="font-medium">
                        {u.unit_label} <span className="text-slate-500">({u.sport})</span>
                      </div>

                      <div className="text-slate-700">
                        {u.n_recovery + u.n_reduced}/{u.n_players} affected ({u.affected_pct}%)
                      </div>

                      <div
                        className={[
                          "rounded-full border px-2 py-0.5 font-semibold",
                          u.alert_level === "HIGH"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : u.alert_level === "CAUTION"
                            ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                            : "border-green-200 bg-green-50 text-green-800",
                        ].join(" ")}
                      >
                        {u.alert_level}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Review context</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Needs review</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums">{needsReviewCount}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Red</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums">{counts.red}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Yellow</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums">{counts.yellow}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Green</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums">{counts.green}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Filters</div>
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
              </div>

              <div className="lg:col-span-5">
                <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Actions</div>
                <div className="flex gap-2 items-center justify-start lg:justify-end flex-wrap">
                  <Input placeholder="Leita að leikmanni…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px]" />

                  <Button variant="outline" onClick={() => loadToday()} disabled={loading || genLoading}>
                    {loading ? "Hleð..." : "Refresh"}
                  </Button>

                  <Button onClick={generateTodayDecisionsForTeam} disabled={genLoading || loading}>
                    {genLoading ? "Generating…" : "Generate Today Decisions"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {genToast ? <div className="text-sm text-green-700">{genToast}</div> : null}

          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">{playerQueueEmptyMessage}</div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-gray-50/40 p-3 md:p-4 space-y-4">{rows.map((r) => renderRow(r))}</div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Page {page + 1} / {totalPages} · Total {total}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Prev
                </Button>
                <Button variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
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
