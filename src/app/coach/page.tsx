"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Color = "green_plus" | "green" | "yellow" | "red";
type FlagStatus = "RED" | "YELLOW" | "GREEN";
type TrainingAction = "FULL" | "REDUCED" | "RECOVERY";
type Flag = "GREEN" | "YELLOW" | "RED";
type FinalColor = "red" | "yellow" | "green";
type FinalFlag = "RED" | "YELLOW" | "GREEN";
type Filter = "all" | FinalColor;

type PlanPreview = {
  team_id: string | null;
  md_day: string | null;
  readiness_level: "GREEN" | "YELLOW" | "RED" | null;
  is_locked: boolean | null;
  template_title: string | null;
  template_description: string | null;
  template_structure: any | null;
};

type Row = {
  readiness_entry_id: string;
  id?: string;
  entry_date: string;
  created_at: string;

  player_id: string;
  full_name: string;
  team: string | null;
  position: string | null;

  readiness: number | null;
  sleep: number | null;
  soreness: number | null;
  total_score: number | null;
  notes: string | null;

  computed_auto_flag: string | null;
  computed_auto_reason: string | null;
  auto_color: string | null;

  coach_color?: FinalColor | null;
  coach_reason?: string | null;
  coach_message: string | null;
  training_action: TrainingAction | null;

  is_locked: boolean;
  locked_at: string | null;
  locked_by?: string | null;

  // ✅ MD-day (team/day) – kemur úr Plan Preview / Week Grid
  md_day?: string | null;

  final_color: FinalColor;
  final_reason: string | null;
  final_flag: FinalFlag;

  // backwards compat
  color?: any;
  flag_status?: any;
  flag?: any;
  auto_reason?: string | null;
  coach_locked?: boolean | null;
  coach_locked_at?: string | null;
  is_time_locked?: boolean | null;

  // optional helper column from view (if exists)
  color_rank?: number | null;
};

type AuditRow = {
  id: string;
  readiness_entry_id: string;
  actor_user_id: string | null;
  old_training_action: string | null;
  new_training_action: string | null;
  old_coach_message: string | null;
  new_coach_message: string | null;
  created_at: string;
};

function flagLabel(s: FlagStatus | null) {
  if (!s) return "—";
  if (s === "RED") return "🔴 RED";
  if (s === "YELLOW") return "🟡 YELLOW";
  return "🟢 GREEN";
}

function getFlag(totalScore: number): Flag {
  if (totalScore <= 9) return "RED";
  if (totalScore <= 14) return "YELLOW";
  return "GREEN";
}

const colorMeta = (c?: string | null) => {
  const C = (c || "").toUpperCase();
  if (C === "RED") return { label: "RED", dot: "bg-red-500", pill: "bg-red-50 text-red-700 border-red-200" };
  if (C === "YELLOW")
    return { label: "YELLOW", dot: "bg-yellow-400", pill: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  return { label: "GREEN", dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200" };
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

function CoachHubCards() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
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

  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<Record<string, AuditRow[]>>({});

  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  // ✅ Lock button state
  const [locking, setLocking] = useState(false);
  const [lockToast, setLockToast] = useState<string>("");

  // ✅ Plan Preview state
  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);

  // ✅ Week grid mapping
  const [weekGrid, setWeekGrid] = useState<any[]>([]);

  // ✅ Coach name
  const [coachName, setCoachName] = useState<string>("");

  // ✅ Coach gate
  const [coachVerified, setCoachVerified] = useState(false);

  // ✅ TODAY
  const today = useMemo(() => todayISO(), []);

  // ✅ WeekGrid row for today (SOURCE OF TRUTH for md_day)
  const weekToday = useMemo(() => {
    const t = todayISO();
    const row = (weekGrid ?? []).find((x: any) => String(x.day_date) === t) ?? null;
    return row;
  }, [weekGrid]);

  // ✅ Derived MD-day chip
  // IMPORTANT: use weekGrid first, planPreview only as fallback
  const mdDayToday = useMemo(() => {
    const src = weekToday?.md_day ?? planPreview?.md_day ?? "GENERIC";
    return prettyMd(src).md;
  }, [weekToday?.md_day, planPreview?.md_day]);

  const mdLabelToday = useMemo(() => {
    const src = weekToday?.md_day ?? planPreview?.md_day ?? "GENERIC";
    return prettyMd(src).label;
  }, [weekToday?.md_day, planPreview?.md_day]);

  // ✅ 1) Gate: ensure user is logged in AND is coach
  async function ensureCoachAccess() {
    setError("");

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.error("auth.getUser error:", authErr.message);
    }

    const uid = auth?.user?.id;
    if (!uid) {
      router.replace(`/login?next=${encodeURIComponent("/coach")}`);
      return false;
    }

    // ✅ profile role check (DB: profiles has display_name, not full_name)
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

    if (role !== "coach") {
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
        await loadToday(); // first load
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
      // 1) finna coach team_id
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const teamId = (prof as any)?.team_id;
      if (!teamId) return;

      // 2) active week_setup (nýjasta)
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

      // 3) sækja mapping (FINAL)
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

  async function loadToday() {
    try {
      setError("");
      setLoading(true);

      // load context first
      await loadPlanPreview();
      await loadWeekGrid();

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("v_coach_readiness_today_v5")
        .select("*", { count: "exact" })
        // ✅ betra en stafróf: red(1) -> green+(4)
        .order("color_rank", { ascending: true })
        .order("total_score", { ascending: true })
        .range(from, to);

      if (teamFilter && teamFilter !== "all") q = q.eq("team", teamFilter);
      if (filter !== "all") q = q.eq("color", filter);
      if (search.trim().length > 0) q = q.ilike("full_name", `%${search.trim()}%`);

      const { data, error, count } = await q;

      if (error) {
        setError(error.message);
        setRows([]);
        setTotal(0);
        return;
      }

      // ✅ FIX: TypeScript “rauða” villan — cast í 2 skrefum
      const raw: Row[] = ((data ?? []) as unknown) as Row[];

      // ✅ FIX: primary litur kemur úr v5 `color`, ekki computed_auto_flag
      const list = raw.map((r) => {
        const id = (r.readiness_entry_id as string) || String(r.player_id);

        // PRIMARY color frá view (v5) — 'red' | 'yellow' | 'green'
        const statusColor = (String((r as any).color ?? "").toLowerCase() as FinalColor) || null;

        const color: Color | null =
          statusColor === "red"
            ? "red"
            : statusColor === "yellow"
            ? "yellow"
            : statusColor === "green"
            ? "green"
            : null;

        // Primary readiness flag (ekki warning)
        const rl = String((r as any).readiness_level ?? "").toUpperCase();
        const readinessFlag: FlagStatus | null =
          rl === "RED" ? "RED" : rl === "YELLOW" ? "YELLOW" : rl === "GREEN" || rl === "GREEN_PLUS" ? "GREEN" : null;

        const reason = r.computed_auto_reason ?? null;

        return {
          ...r,
          id,
          flag_status: readinessFlag,
          color,
          auto_reason: reason,
          // ✅ ALWAYS show same md_day as Week setup (team/day)
          md_day: mdDayToday,
        };
      });

      list.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "is"));

      setRows(list);
      setTotal(count ?? 0);

      setDraftAction((prev) => {
        const next = { ...prev };
        for (const r of list) {
          const pid = String(r.player_id);
          if (!next[pid]) next[pid] = (r.training_action ?? "FULL") as TrainingAction;
        }
        return next;
      });

      setDraftMessage((prev) => {
        const next = { ...prev };
        for (const r of list) {
          const pid = String(r.player_id);
          if (next[pid] === undefined) next[pid] = r.coach_message ?? "";
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!rows.length) return;
    if (expandedPlayerId) return;
    const firstRed = rows.find((x) => x.color === "red");
    if (firstRed) setExpandedPlayerId(String(firstRed.player_id));
  }, [rows, expandedPlayerId]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.team) set.add(r.team);
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "is"))];
  }, [rows]);

  // ✅ FIX: counts should use r.color (fallback final_color)
  const counts = useMemo(() => {
    const acc: Record<FinalColor, number> = { red: 0, yellow: 0, green: 0 };
    for (const r of rows) {
      const c = (String((r as any).color ?? (r as any).final_color ?? "").toLowerCase() as FinalColor) || null;
      if (c === "red" || c === "yellow" || c === "green") acc[c] += 1;
    }
    return acc;
  }, [rows]);

  // Ath: þú ert að filtera í SQL, þannig er "filtered = rows" ok
  const filtered = useMemo(() => rows, [rows]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function lockTeamToday() {
    try {
      setError("");
      setLockToast("");
      setLocking(true);

      const day = todayISO();
      const { data, error } = await supabase.rpc("lock_team_microdose_plans", { p_day: day });

      if (error) {
        setError(error.message);
        return;
      }

      const n = Number(data ?? 0);

      if (n === 0) {
        setLockToast("Enginn var læstur. Athugaðu að coach sé með team_id og að leikmenn séu tengdir þessu liði.");
      } else {
        setLockToast(`✅ Læst dagsæfingum fyrir ${n} leikmenn (${day}).`);
      }

      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLocking(false);
    }
  }

  async function loadHistory(readinessEntryId: string) {
    setHistoryLoading((p) => ({ ...p, [readinessEntryId]: true }));
    setError("");

    const { data, error } = await supabase
      .from("readiness_entry_audit")
      .select("*")
      .eq("readiness_entry_id", readinessEntryId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      setError(error.message);
      setHistoryLoading((p) => ({ ...p, [readinessEntryId]: false }));
      return;
    }

    setHistory((p) => ({ ...p, [readinessEntryId]: (data as AuditRow[]) ?? [] }));
    setHistoryLoading((p) => ({ ...p, [readinessEntryId]: false }));
  }

  async function saveOverride(r: Row) {
    const playerId = String(r.player_id);
    const action = draftAction[playerId] ?? r.training_action ?? "FULL";
    const message = (draftMessage[playerId] ?? r.coach_message ?? "").trim();

    setSaving((p) => ({ ...p, [playerId]: true }));
    setSaved((p) => ({ ...p, [playerId]: false }));
    setError("");

    const entryId = r.readiness_entry_id ?? r.id;

    let q = supabase
      .from("readiness_entries")
      .update({ training_action: action, coach_message: message.length ? message : null });

    if (entryId) q = q.eq("id", entryId);
    else q = q.eq("player_id", playerId).eq("entry_date", r.entry_date);

    const { error } = await q;

    if (error) {
      setError(error.message);
      setSaving((p) => ({ ...p, [playerId]: false }));
      return;
    }

    setSaving((p) => ({ ...p, [playerId]: false }));
    setSaved((p) => ({ ...p, [playerId]: true }));
    await loadToday();
  }

  const renderRow = (r: Row) => {
    const pid = String(r.player_id);
    const isSaving = !!saving[pid];
    const isSaved = !!saved[pid];

    const isLocked = !!r.is_locked || !!r.coach_locked || !!r.is_time_locked;

    const cm = colorMeta(r.color);
    const isOpen = expandedPlayerId === pid;

    // ✅ FIX: Auto-flag á að sýna computed_auto_flag (warning), ekki flag_status (primary)
    const autoFlag = r.computed_auto_flag ? flagLabel(r.computed_auto_flag as FlagStatus) : null;

    const playerNote = (r.notes ?? "").trim() || null;
    const computedReason = r.computed_auto_reason ?? null;

    const coachMsg = r.coach_message && r.coach_message.trim().length ? r.coach_message : null;

    return (
      <React.Fragment key={r.id}>
        <div className="rounded-lg border bg-white px-3 py-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,1.4fr)_auto_auto_1fr_auto] md:items-center">
            {/* Name */}
            <div className="min-w-0">
              <div className="font-medium leading-snug truncate">{r.full_name}</div>
              <div className="text-xs text-gray-500 truncate">{[r.team, r.position].filter(Boolean).join(" • ")}</div>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cm.pill}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${cm.dot}`} />
                {cm.label}
              </span>

              <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800">
                {r.md_day ?? mdDayToday}
              </span>
            </div>

            {/* Score */}
            <div className="flex items-center justify-start md:justify-center">
              <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-sm font-semibold tabular-nums text-gray-800">
                {r.total_score ?? "—"}
              </span>
            </div>

            {/* Reason */}
            <div className="min-w-0 text-sm text-gray-700">
              <span className="block truncate" title={computedReason ?? ""}>
                {computedReason || "—"}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={async () => {
                  await saveOverride(r);
                }}
                disabled={isLocked || isSaving}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              >
                {isLocked ? "LOCKED" : isSaving ? "Saving..." : "Save"}
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
          <div className="mt-2 rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                📊 Readiness: <span className="font-medium tabular-nums">{r.readiness ?? "—"}</span>
              </div>
              <div>
                😴 Svefn: <span className="font-medium tabular-nums">{r.sleep ?? "—"}</span>
              </div>
              <div>
                🦴 Stífleiki: <span className="font-medium tabular-nums">{r.soreness ?? "—"}</span>
              </div>
              <div>
                ⚡ Ath.: <span className="font-medium tabular-nums">{r.notes ?? "—"}</span>
              </div>
              <div>
                Skráð:{" "}
                <span className="font-medium">
                  {new Date(r.created_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {r.is_locked && (
                <div>
                  🔒 Læst:{" "}
                  <span className="font-medium">
                    {r.locked_at
                      ? new Date(r.locked_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </span>
                </div>
              )}
            </div>

            {(autoFlag || playerNote || computedReason || coachMsg) && (
              <div className="mt-2 space-y-1 text-gray-700">
                {autoFlag && (
                  <div className="text-sm">
                    <span className="font-medium">Auto-flag:</span> {autoFlag}
                  </div>
                )}

                {playerNote && (
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Player note:</span> {playerNote}
                  </div>
                )}

                {computedReason && (
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Auto-reason:</span> {computedReason}
                  </div>
                )}

                {coachMsg && (
                  <div className="text-sm">
                    <span className="font-medium">Coach message:</span> {coachMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  if (loading) {
    return <div className="py-6 text-sm text-muted-foreground">Hleð...</div>;
  }

  const readinessBadge = (() => {
    const r = (planPreview?.readiness_level ?? "GREEN").toUpperCase();
    if (r === "RED") return "bg-red-600 text-white";
    if (r === "YELLOW") return "bg-yellow-500 text-black";
    return "bg-green-600 text-white";
  })();

  return (
    <div className="space-y-5">
      <CoachHubCards />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Readiness Today</CardTitle>
          <CardDescription>
            Coach: <span className="font-medium">{coachName || "—"}</span> · MD-day:{" "}
            <span className="font-medium">{mdDayToday}</span>
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

            <div className="flex gap-2">
              <Input
                placeholder="Leita að leikmanni…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[220px]"
              />
              <Button variant="outline" onClick={() => loadToday()} disabled={loading}>
                {loading ? "Hleð..." : "Refresh"}
              </Button>
            </div>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          {loading ? (
            <div className="text-sm text-muted-foreground">Hleð gögnum…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Engin readiness gögn í dag.</div>
          ) : (
            <div className="space-y-2">{filtered.map((r) => renderRow(r))}</div>
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
