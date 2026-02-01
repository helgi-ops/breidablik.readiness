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

  // ✅ MD-day (team/day) – kemur úr Plan Preview view
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

  // ✅ Derived MD-day chip (from plan preview)
  const mdDayToday = useMemo(() => {
    const p = prettyMd(planPreview?.md_day ?? "GENERIC");
    return p.md;
  }, [planPreview?.md_day]);

  const mdLabelToday = useMemo(() => {
    const p = prettyMd(planPreview?.md_day ?? "GENERIC");
    return p.label;
  }, [planPreview?.md_day]);

  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, teamFilter, filter, search]);

  useEffect(() => {
    setPage(0);
  }, [teamFilter, filter, search]);

  async function loadCoachName() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
      const name = (prof as any)?.full_name ?? "";
      setCoachName(name);
    } catch {
      setCoachName("");
    }
  }

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

      // 3) sækja mapping
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

      await loadCoachName();
      await loadPlanPreview();
      await loadWeekGrid();

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("v_coach_readiness_today_v4")
        .select("*", { count: "exact" })
        .order("color", { ascending: false })
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

      const raw = (data ?? []) as Row[];

      const list = raw.map((r) => {
        const id = (r.readiness_entry_id as string) || String(r.player_id);

        const finalFlag = ((r as any).final_flag ?? r.computed_auto_flag ?? null) as FlagStatus | null;
        const finalColor = ((r as any).final_color ?? null) as "red" | "yellow" | "green" | null;

        const color: Color | null =
          finalColor === "red"
            ? "red"
            : finalColor === "yellow"
            ? "yellow"
            : finalColor === "green"
            ? "green"
            : finalFlag === "RED"
            ? "red"
            : finalFlag === "YELLOW"
            ? "yellow"
            : finalFlag === "GREEN"
            ? "green"
            : null;

        const reason = r.computed_auto_reason ?? null;

        return { ...r, id, flag_status: finalFlag, color, auto_reason: reason, md_day: mdDayToday };
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
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/";
        return;
      }

      await loadToday();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const counts = useMemo(() => {
    const acc: Record<FinalColor, number> = { red: 0, yellow: 0, green: 0 };
    for (const r of rows) {
      const c = r.final_color as FinalColor | null | undefined;
      if (c) acc[c] = (acc[c] ?? 0) + 1;
    }
    return acc;
  }, [rows]);

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

    let q = supabase.from("readiness_entries").update({ training_action: action, coach_message: message.length ? message : null });

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
    const autoFlag = (r.flag_status ? flagLabel(r.flag_status as FlagStatus) : null) as string | null;
    const playerNote = (r.notes ?? "").trim() || null;
    const computedReason = r.computed_auto_reason ?? null;

    const coachMsg = typeof r.coach_message === "string" && r.coach_message.trim().length ? r.coach_message : null;

    return (
      <React.Fragment key={r.id}>
        <div className="relative flex items-center gap-3 rounded-lg border bg-white px-3 py-2 pr-[320px]">
          <div className="min-w-0 flex-1">
            {/* ✅ full name (no truncate) */}
            <div className="font-medium leading-snug break-words">{r.full_name}</div>
            <div className="text-xs text-gray-500 truncate">{[r.team, r.position].filter(Boolean).join(" • ")}</div>
          </div>

          {/* ✅ Color + MD day pills */}
          <div className="w-[230px] flex items-center justify-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cm.pill}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${cm.dot}`} />
              {cm.label}
            </span>

            <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800">
              {r.md_day ?? mdDayToday}
            </span>
          </div>

          <div className="w-[90px] flex items-center justify-center">
            <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-sm font-semibold tabular-nums text-gray-800">
              {r.total_score ?? "—"}
            </span>
          </div>

          <div className="sticky right-2 ml-auto flex items-center gap-2 bg-white/90 backdrop-blur px-2 py-1 rounded-md">
            <div className="w-[180px] text-sm text-gray-700">
              <span className="reason-text">{computedReason}</span>
            </div>

            <div className="w-[90px]">
              <button
                onClick={async () => {
                  await saveOverride(r);
                }}
                disabled={isLocked || isSaving}
                className="w-full rounded-md border px-2 py-1 text-sm disabled:opacity-50"
              >
                {isLocked ? "LOCKED" : isSaving ? "Saving..." : "Save"}
              </button>
              {isSaved && <div className="text-[11px] text-green-700 mt-0.5">Saved ✓</div>}
            </div>

            <button
              type="button"
              className="w-10 h-9 rounded-md border text-gray-600 hover:bg-gray-50"
              aria-label="Sýna nánar"
              onClick={() => setExpandedPlayerId((prev) => (prev === pid ? null : pid))}
            >
              {isOpen ? "▴" : "▾"}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="-mt-1 rounded-b-lg border border-t-0 bg-gray-50 px-3 py-2 text-sm text-gray-700">
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
                    {r.locked_at ? new Date(r.locked_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" }) : "—"}
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
      {/* Hub cards: tengingar */}
      <CoachHubCards />

      {/* ✅ Plan Preview */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Plan Preview (í dag)</CardTitle>
            <CardDescription>MD-day + readiness → læst template fyrir staff.</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800">
              {mdLabelToday}: <span className="ml-1 font-mono">{mdDayToday}</span>
            </span>

            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${readinessBadge}`}>
              {planPreview?.readiness_level ?? "GREEN"}
            </span>

            <span className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold">
              {planPreview?.is_locked ? "🔒 Læst" : "🔓 Ólæst"}
            </span>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Template</div>
            <div className="truncate font-medium">
              {planPreview?.template_title ?? "Engin template fannst (md_day + readiness)."}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/coach/messages")}>
              Opna Messages
            </Button>
            <Button variant="outline" onClick={loadPlanPreview}>
              Endurnýja preview
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ✅ Week overview (only if week is saved) */}
      {weekGrid.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Week plan</CardTitle>
            <CardDescription>MD-day mapping vikunnar (vistuð uppsetning).</CardDescription>
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="min-w-[620px] grid grid-cols-4 gap-2 text-xs">
              <div className="font-semibold text-muted-foreground">Dagur</div>
              <div className="font-semibold text-muted-foreground">MD</div>
              <div className="font-semibold text-muted-foreground">Day type</div>
              <div className="font-semibold text-muted-foreground">Dose</div>

              {weekGrid.map((d) => (
                <React.Fragment key={String(d.day_date)}>
                  <div>{new Date(d.day_date).toLocaleDateString("is-IS", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
                  <div className="font-mono">{d.md_day ?? "—"}</div>
                  <div>{d.day_type_final ?? "—"}</div>
                  <div>{d.dose_final ?? "—"}</div>
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header + signout */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {coachName ? `Coach: ${coachName}` : "Coach"} · Readiness (Í dag)
          </h1>
        </div>

        <Button variant="outline" onClick={signOut}>
          Útskrá
        </Button>
      </div>

      {/* Toolbar */}
      <Card className="shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={loadToday}>
              Endurnýja
            </Button>

            <Button onClick={lockTeamToday} disabled={locking} className="font-semibold">
              {locking ? "🔒 Læsi..." : "🔒 Læsa dagsæfingum (í dag)"}
            </Button>

            {/* MD-day chip (from Plan Preview) */}
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold">
              <span className="text-muted-foreground">{mdLabelToday}:</span>
              <span className="font-mono">{mdDayToday}</span>
            </div>

            {/* Team filter */}
            <label className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1">
              <span className="text-xs text-muted-foreground">Lið</span>
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="bg-transparent text-sm outline-none">
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t === "all" ? "Öll lið" : t}
                  </option>
                ))}
              </select>
            </label>

            {/* Search */}
            <div className="w-full md:w-[260px]">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Leita að leikmanni…" />
            </div>

            {lockToast && <div className="text-xs text-muted-foreground">{lockToast}</div>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
              Allt ({rows.length})
            </Button>
            <Button size="sm" variant={filter === "red" ? "default" : "outline"} onClick={() => setFilter("red")}>
              🔴 Rautt ({counts.red})
            </Button>
            <Button size="sm" variant={filter === "yellow" ? "default" : "outline"} onClick={() => setFilter("yellow")}>
              🟡 Gult ({counts.yellow})
            </Button>
            <Button size="sm" variant={filter === "green" ? "default" : "outline"} onClick={() => setFilter("green")}>
              🟢 Grænt ({counts.green})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <span className="font-semibold">Villa:</span> {error}
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {rows.length === 0 && !error && (
        <Card className="shadow-sm">
          <CardContent className="p-4 text-sm text-muted-foreground">Engin svör komin fyrir daginn.</CardContent>
        </Card>
      )}

      {/* List */}
      {rows.length > 0 && <div className="max-h-[70vh] overflow-auto pr-2 space-y-2">{filtered.map(renderRow)}</div>}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Sýni {Math.min(total, page * PAGE_SIZE + 1)}–{Math.min(total, (page + 1) * PAGE_SIZE)} af {total}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Prev
          </Button>
          <div className="text-xs text-muted-foreground">
            Síða {page + 1} / {totalPages}
          </div>
          <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      {/* Workflow */}
      <Card className="shadow-sm">
        <CardContent className="p-4 text-sm">
          <span className="font-semibold">Workflow:</span> Byrja á 🔴/🟡 → staðfesta með GPS/CMJ → velja minnsta virka skammt.
        </CardContent>
      </Card>
    </div>
  );
}
