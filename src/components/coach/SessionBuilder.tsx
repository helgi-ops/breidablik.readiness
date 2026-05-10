"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { downloadSessionPdf, type SessionPdfPlanMetric } from "./SessionPdf";
import { estimateSsgIntensity, bandColorClasses } from "@/lib/ssg-intensity";
import {
  classifyDrillStimulus,
  stimulusColorClasses,
  buildStimulusDistribution,
} from "@/lib/drill-stimulus";
import {
  getFormatRecommendation,
  formatGoalColorClasses,
  checkBoutDuration,
} from "@/lib/drill-recommendations";
import { useLang, type Lang } from "@/lib/lang";
import {
  matchTeamConstraintsToDrills,
  playerDecisionToConstraintInput,
  type PlayerConstraintInput,
  type TeamBlockConflictSummary,
  type BlockConflictResult,
  type DrillSessionItem,
} from "@/lib/micropulse/sessionWorkflow";

const SB_COPY = {
  IS: {
    other: "Annað",
    missingAuth: "Vantar auðkenningu",
    fetchError: "Villa við að sækja",
    clearConfirm: "Hreinsa æfinguna?",
    durationMin: "Duration (mín)",
    plPerMin: "PL / mín",
    sessionFallback: "æfing",
    pdfError: "Villa við að búa til PDF",
    sessionNamePlaceholder: "Nafn á æfingu…",
    creating: "Býr til…",
    clear: "Hreinsa",
    teamHistory: "Liðs-saga",
    sessions: "æfingar",
    players: "leikmenn",
    band: "band",
    fetchingHistory: "Sæki liðs-sögu…",
    noHistoryData: "Engin söguleg gögn fyrir",
    min: "mín",
    plVsHistory: "Player Load vs",
    history: "saga",
    inBand: "í bandi",
    low: "lágt",
    stimulusDistribution: "Stimulus dreifing",
    noData: "án gagna",
    addToSession: "Bæta í æfingu",
    up: "Upp",
    down: "Niður",
    reduceSets: "Minnka sets",
    remove: "Fjarlægja",
    increaseSets: "Fjölga sets",
    removeDrill: "Fjarlægja drillu",
    pitchPlayers: "Völlur / leikmenn",
    pitch: "Völlur",
    playersLabel: "Leikmenn",
    sqmPerPlayer: "m² / leikm",
    timeDist: "Tími / vegalengd",
    loadGps: "Álag (GPS)",
    close: "Loka",
    metricsVsHistory: "Breytur vs",
    allInBand: "Öll gildi eru innan söguLegs álags fyrir",
    missing: "Vantar",
    myLibrary: "Mitt library",
    allCategories: "Allir flokkar",
    search: "Leita…",
    drillSingular: "drilla",
    drillPlural: "drillur",
    noDrills: "Engar drillur fundust.",
    session: "Æfing",
    noDrillsSelected: "Engar drillur valdar. Smelltu á \"+\" til vinstri.",
    estimatedLoad: "Áætlað álag",
    bestFor: "Passar best fyrir",
    basedOn: "Byggt á Hill-Haas et al. (2011), Sports Med 41(3)",
    loading: "Hleð…",
    save: "Vista",
    saving: "Vista…",
    saved: "Vistað!",
    saveError: "Villa við að vista",
    emptyTitle: "Tilbúinn að byggja æfingu?",
    emptyStep1: "1. Veldu MD-day efst (t.d. MD-1, MD-3, MD+1) — kerfið dregur upp team-sögu og setur sjálfvirkt target PL",
    emptyStep2: "2. Bættu við 3–5 drillum úr safninu til vinstri — smelltu á + eða á drilluna sjálfa",
    emptyStep3: "3. Skoðaðu totals og PL band bar sem birtast efst, vista síðan og hlaða niður PDF",
    emptyTip: "Tip: drillur eru flokkaðar eftir stimulus (LOC / MECH / MIX / TECH) — einföld blanda er 1 LOC + 1 MECH + 1 MIX",
  },
  EN: {
    other: "Other",
    missingAuth: "Missing authentication",
    fetchError: "Error fetching",
    clearConfirm: "Clear the session?",
    durationMin: "Duration (min)",
    plPerMin: "PL / min",
    sessionFallback: "session",
    pdfError: "Error creating PDF",
    sessionNamePlaceholder: "Session name…",
    creating: "Creating…",
    clear: "Clear",
    teamHistory: "Team history",
    sessions: "sessions",
    players: "players",
    band: "band",
    fetchingHistory: "Fetching team history…",
    noHistoryData: "No historical data for",
    min: "min",
    plVsHistory: "Player Load vs",
    history: "history",
    inBand: "in band",
    low: "low",
    stimulusDistribution: "Stimulus distribution",
    noData: "no data",
    addToSession: "Add to session",
    up: "Up",
    down: "Down",
    reduceSets: "Reduce sets",
    remove: "Remove",
    increaseSets: "Increase sets",
    removeDrill: "Remove drill",
    pitchPlayers: "Pitch / players",
    pitch: "Pitch",
    playersLabel: "Players",
    sqmPerPlayer: "m² / player",
    timeDist: "Time / distance",
    loadGps: "Load (GPS)",
    close: "Close",
    metricsVsHistory: "Metrics vs",
    allInBand: "All values within historical load for",
    missing: "Missing",
    myLibrary: "My library",
    allCategories: "All categories",
    search: "Search…",
    drillSingular: "drill",
    drillPlural: "drills",
    noDrills: "No drills found.",
    session: "Session",
    noDrillsSelected: "No drills selected. Click \"+\" on the left.",
    estimatedLoad: "Estimated load",
    bestFor: "Best suited for",
    basedOn: "Based on Hill-Haas et al. (2011), Sports Med 41(3)",
    loading: "Loading…",
    save: "Save",
    saving: "Saving…",
    saved: "Saved!",
    saveError: "Error saving session",
    emptyTitle: "Ready to build a session?",
    emptyStep1: "1. Pick an MD day above (e.g. MD-1, MD-3, MD+1) — we'll load team history and auto-set target PL",
    emptyStep2: "2. Add 3–5 drills from the library on the left — click + or the drill itself",
    emptyStep3: "3. Watch totals and the PL band bar appear at the top, then save and download the PDF",
    emptyTip: "Tip: drills are tagged by stimulus (LOC / MECH / MIX / TECH) — a simple blend is 1 LOC + 1 MECH + 1 MIX",
  },
} as const;

type Category =
  | "possession"
  | "ssg"
  | "transition"
  | "running"
  | "finishing"
  | "warmup"
  | "other";

type Drill = {
  id: string;
  category: Category;
  drill_name: string;
  drill_format: string | null;
  reps: string | null;
  duration_min: number | null;
  distance_m: number | null;
  hir_total: number | null;
  player_load: number | null;
  player_load_per_min: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  accel_total: number | null;
  decel_total: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  field_length_m: number | null;
  field_width_m: number | null;
  total_players: number | null;
  area_per_player_m2: number | null;
  metabolic_power_avg: number | null;
  metabolic_power_peak: number | null;
  hmld_m: number | null;
  time_above_threshold_s: number | null;
  metabolic_estimated: boolean;
};

const CATEGORY_LABELS: Record<Lang, Record<Category, string>> = {
  IS: {
    possession: "Possession",
    ssg: "SSG",
    transition: "Transition",
    running: "Running",
    finishing: "Finishing",
    warmup: "Warm-up",
    other: "Annað",
  },
  EN: {
    possession: "Possession",
    ssg: "SSG",
    transition: "Transition",
    running: "Running",
    finishing: "Finishing",
    warmup: "Warm-up",
    other: "Other",
  },
};

function n(v: number | null | undefined, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return "–";
  return Number(v).toFixed(digits);
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

type SessionItem = {
  uid: string; // local id to allow duplicates
  drill: Drill;
  sets: number;
};

export default function SessionBuilder({ teamId }: { teamId: string }) {
  const [lang] = useLang();
  const t = SB_COPY[lang];
  const catLabels = CATEGORY_LABELS[lang];
  const [drills, setDrills] = useState<Drill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [filterStimulus, setFilterStimulus] = useState<"all" | "locomotive" | "mechanical" | "mixed" | "technical">("all");
  const [source, setSource] = useState<"mine" | "team">("mine");
  const storageKey = `session-builder:${teamId}`;
  const [sessionName, setSessionName] = useState("");
  const [mdDay, setMdDay] = useState<string>("");
  const [targetPL, setTargetPL] = useState<string>("");
  const [items, setItems] = useState<SessionItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [detailDrill, setDetailDrill] = useState<Drill | null>(null);

  // Drag & drop state for reordering items
  const dragItemRef = useRef<string | null>(null);
  const [dragOverUid, setDragOverUid] = useState<string | null>(null);

  // Restore session state from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          sessionName?: string;
          mdDay?: string;
          targetPL?: string;
          items?: SessionItem[];
        };
        if (saved.sessionName) setSessionName(saved.sessionName);
        if (saved.mdDay) setMdDay(saved.mdDay);
        if (saved.targetPL) setTargetPL(saved.targetPL);
        if (Array.isArray(saved.items)) setItems(saved.items);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // Persist session state whenever it changes (after hydration)
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ sessionName, mdDay, targetPL, items })
      );
    } catch {
      /* ignore */
    }
  }, [hydrated, storageKey, sessionName, mdDay, targetPL, items]);
  type PlanMetric = {
    metric: string;
    mean: number;
    stdDev: number;
    low: number;
    high: number;
    min: number;
    max: number;
    sampleSize: number;
    unit: string;
  };
  const [mdPlanning, setMdPlanning] = useState<{
    metrics: Record<string, PlanMetric>;
    sessionCount: number;
    playerCount: number;
  } | null>(null);
  const [mdLoading, setMdLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.missingAuth);
      const params = new URLSearchParams({ team_id: teamId });
      if (source === "mine") params.set("mine", "1");
      const res = await fetch(`/api/coach/drill-library?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.fetchError);
      setDrills(json.drills ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, source]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Fetch historical MD-day load when MD day changes
  useEffect(() => {
    if (!teamId || !mdDay) {
      setMdPlanning(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setMdLoading(true);
      try {
        const res = await fetch(
          `/api/coach/md-planning?teamId=${encodeURIComponent(
            teamId
          )}&mdDay=${encodeURIComponent(mdDay)}`
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.error) {
          setMdPlanning(null);
          return;
        }
        const metricsArr = (json.metrics ?? []) as PlanMetric[];
        const metrics: Record<string, PlanMetric> = {};
        for (const m of metricsArr) metrics[m.metric] = m;
        if (Object.keys(metrics).length > 0) {
          setMdPlanning({
            metrics,
            sessionCount: json.sessionCount ?? 0,
            playerCount: json.playerCount ?? 0,
          });
          // Auto-populate target PL if not manually set
          const pl = metrics.totalPlayerLoad;
          if (pl && pl.mean > 0) {
            setTargetPL((prev) => (prev ? prev : pl.mean.toFixed(0)));
          }
        } else {
          setMdPlanning(null);
        }
      } catch {
        if (!cancelled) setMdPlanning(null);
      } finally {
        if (!cancelled) setMdLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, mdDay]);

  const filteredDrills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drills.filter((d) => {
      if (filterCategory !== "all" && d.category !== filterCategory) return false;
      if (q) {
        const hay = `${d.drill_name} ${d.drill_format ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Stimulus filter
      if (filterStimulus !== "all") {
        const stim = classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23);
        if (!stim) return false; // No GPS data → exclude when filtering by stimulus
        if (filterStimulus === "locomotive") {
          // Locomotive session: show locomotive + mixed
          if (stim.type !== "locomotive" && stim.type !== "mixed") return false;
        } else if (filterStimulus === "mechanical") {
          // Mechanical session: show mechanical + mixed
          if (stim.type !== "mechanical" && stim.type !== "mixed") return false;
        } else {
          if (stim.type !== filterStimulus) return false;
        }
      }
      return true;
    });
  }, [drills, filterCategory, filterStimulus, search]);

  function addDrill(d: Drill) {
    setItems((prev) => [
      ...prev,
      { uid: `${d.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, drill: d, sets: 1 },
    ]);
  }

  function removeItem(uid: string) {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  }

  function updateSets(uid: string, sets: number) {
    setItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, sets: Math.max(1, sets) } : i))
    );
  }

  function decrementSets(uid: string) {
    // If sets > 1: decrement. If sets === 1: remove the item.
    setItems((prev) => {
      const target = prev.find((i) => i.uid === uid);
      if (!target) return prev;
      if (target.sets <= 1) return prev.filter((i) => i.uid !== uid);
      return prev.map((i) => (i.uid === uid ? { ...i, sets: i.sets - 1 } : i));
    });
  }

  function incrementSets(uid: string) {
    setItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, sets: i.sets + 1 } : i))
    );
  }

  function moveItem(uid: string, direction: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.uid === uid);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  function handleDrop(targetUid: string) {
    const fromUid = dragItemRef.current;
    if (!fromUid || fromUid === targetUid) return;
    setItems((prev) => {
      const fromIdx = prev.findIndex((i) => i.uid === fromUid);
      const toIdx = prev.findIndex((i) => i.uid === targetUid);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
    dragItemRef.current = null;
    setDragOverUid(null);
  }

  function clearSession() {
    if (items.length === 0) return;
    if (!confirm(t.clearConfirm)) return;
    setItems([]);
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  async function handleSaveSession() {
    if (items.length === 0) return;
    setSavingSession(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.missingAuth);
      const payload = {
        team_id: teamId,
        session_name: sessionName,
        md_day: mdDay,
        target_pl: targetPL ? parseFloat(targetPL) : null,
        items: items.map((i) => ({ drill_id: i.drill.id, drill_name: i.drill.drill_name, sets: i.sets })),
        totals: {
          duration_min: totals.duration_min,
          distance_m: totals.distance_m,
          player_load: totals.player_load,
          vel_b5: totals.vel_b5,
          vel_b6: totals.vel_b6,
          accel_b23: totals.accel_b23,
          decel_b23: totals.decel_b23,
          accel_total: totals.accel_total,
          decel_total: totals.decel_total,
        },
      };
      const res = await fetch("/api/coach/saved-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.saveError);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      alert(t.saveError + ": " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingSession(false);
    }
  }
  async function handleDownloadPdf() {
    if (items.length === 0) return;
    setDownloadingPdf(true);
    try {
      const planningMetrics: SessionPdfPlanMetric[] = [];
      if (mdPlanning) {
        const plMin =
          totals.duration_min > 0 && totals.player_load > 0
            ? totals.player_load / totals.duration_min
            : 0;
        const rows = [
          { key: "totalPlayerLoad", label: "Player Load", value: totals.player_load, decimals: 0 },
          { key: "duration", label: t.durationMin, value: totals.duration_min, decimals: 0 },
          { key: "totalDistance", label: "Distance (m)", value: totals.distance_m, decimals: 0 },
          { key: "playerLoadPerMinute", label: t.plPerMin, value: plMin, decimals: 2 },
          { key: "velocityBand5", label: "Vel Band 5 (m)", value: totals.vel_b5, decimals: 0 },
          { key: "velocityBand6", label: "Vel Band 6 (m)", value: totals.vel_b6, decimals: 0 },
          { key: "accelB23", label: "Accel B2-3", value: totals.accel_b23, decimals: 0 },
          { key: "decelB23", label: "Decel B2-3", value: totals.decel_b23, decimals: 0 },
        ];
        for (const r of rows) {
          const m = mdPlanning.metrics[r.key];
          if (!m || m.mean <= 0) continue;
          const status =
            r.value <= 0
              ? "none"
              : r.value >= m.low && r.value <= m.high
              ? "ok"
              : r.value < m.low
              ? "low"
              : "high";
          planningMetrics.push({
            metric: r.key,
            label: r.label,
            mean: m.mean,
            low: m.low,
            high: m.high,
            sessionValue: r.value,
            status: status as "ok" | "low" | "high" | "none",
            decimals: r.decimals,
          });
        }
      }
      const today = new Date().toISOString().slice(0, 10);
      const safeName = (sessionName || t.sessionFallback).replace(/[^\p{L}\p{N}\-_ ]/gu, "").replace(/\s+/g, "_");
      const fname = `${today}_${mdDay || "session"}_${safeName}.pdf`;
      await downloadSessionPdf(
        {
          sessionName,
          mdDay,
          date: today,
          items: items.map((i) => ({ drill: i.drill, sets: i.sets })),
          totals: {
            duration_min: totals.duration_min,
            distance_m: totals.distance_m,
            player_load: totals.player_load,
            vel_b5: totals.vel_b5,
            vel_b6: totals.vel_b6,
            accel_b23: totals.accel_b23,
            decel_b23: totals.decel_b23,
            accel_total: totals.accel_total,
            decel_total: totals.decel_total,
          },
          avgPlPerMin:
            totals.duration_min > 0 && totals.player_load > 0
              ? totals.player_load / totals.duration_min
              : null,
          planningMetrics,
          mdSessionCount: mdPlanning?.sessionCount,
          mdPlayerCount: mdPlanning?.playerCount,
        },
        fname
      );
    } catch (e) {
      alert(t.pdfError + ": " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloadingPdf(false);
    }
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = {
      duration_min: 0,
      distance_m: 0,
      player_load: 0,
      hir_total: 0,
      accel_b23: 0,
      decel_b23: 0,
      accel_total: 0,
      decel_total: 0,
      vel_b5: 0,
      vel_b6: 0,
      hmld_m: 0,
      time_above_threshold_s: 0,
      metabolic_power_avg_num: 0, // weighted sum numerator (W/kg * duration)
      metabolic_power_avg_den: 0, // duration denominator for time-weighting
      metabolic_power_peak: 0,    // max peak across drills
      hasAny: false,
      hasMetabolic: false,
    };
    for (const it of items) {
      const d = it.drill;
      const mult = it.sets;
      if (d.duration_min != null) { t.duration_min += d.duration_min * mult; t.hasAny = true; }
      if (d.distance_m != null) { t.distance_m += d.distance_m * mult; t.hasAny = true; }
      if (d.player_load != null) { t.player_load += d.player_load * mult; t.hasAny = true; }
      if (d.hir_total != null) { t.hir_total += d.hir_total * mult; t.hasAny = true; }
      if (d.accel_b23 != null) { t.accel_b23 += d.accel_b23 * mult; t.hasAny = true; }
      if (d.decel_b23 != null) { t.decel_b23 += d.decel_b23 * mult; t.hasAny = true; }
      if (d.accel_total != null) { t.accel_total += d.accel_total * mult; t.hasAny = true; }
      if (d.decel_total != null) { t.decel_total += d.decel_total * mult; t.hasAny = true; }
      if (d.vel_b5 != null) { t.vel_b5 += d.vel_b5 * mult; t.hasAny = true; }
      if (d.vel_b6 != null) { t.vel_b6 += d.vel_b6 * mult; t.hasAny = true; }
      if (d.hmld_m != null) { t.hmld_m += d.hmld_m * mult; t.hasMetabolic = true; }
      if (d.time_above_threshold_s != null) { t.time_above_threshold_s += d.time_above_threshold_s * mult; t.hasMetabolic = true; }
      if (d.metabolic_power_avg != null && d.duration_min != null) {
        t.metabolic_power_avg_num += d.metabolic_power_avg * d.duration_min * mult;
        t.metabolic_power_avg_den += d.duration_min * mult;
        t.hasMetabolic = true;
      }
      if (d.metabolic_power_peak != null && d.metabolic_power_peak > t.metabolic_power_peak) {
        t.metabolic_power_peak = d.metabolic_power_peak;
        t.hasMetabolic = true;
      }
    }
    return t;
  }, [items]);

  const avgMetabolicPower = totals.metabolic_power_avg_den > 0
    ? totals.metabolic_power_avg_num / totals.metabolic_power_avg_den
    : null;

  const stimulusDist = useMemo(() => {
    return buildStimulusDistribution(
      items.map((it) => ({
        vel_b5: it.drill.vel_b5,
        vel_b6: it.drill.vel_b6,
        accel_b23: it.drill.accel_b23,
        decel_b23: it.drill.decel_b23,
        sets: it.sets,
      }))
    );
  }, [items]);

  // ── Team player constraints (drill-conflict warnings) ─────────────
  const [teamConstraints, setTeamConstraints] = useState<PlayerConstraintInput[]>([]);
  const [constraintsLoaded, setConstraintsLoaded] = useState(false);

  // ── Readiness overview for non-green players ─────────────────────
  type ReadinessOverviewPlayer = {
    athleteId: string;
    athleteName: string;
    state: "YELLOW" | "RED" | "GRAY";
    constraints: string[];
    loadAdjustment: number | null;
    coachSummary: string;
  };
  const [readinessOverviewPlayers, setReadinessOverviewPlayers] = useState<ReadinessOverviewPlayer[]>([]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      try {
        // 1. Try API first
        const token = await getAuthToken();
        let apiPlayers: Array<{
          athleteId: string;
          athleteName: string;
          state: string;
          constraints: string[];
          loadAdjustment: number | null;
          coachSummary?: string;
        }> | null = null;

        if (token) {
          try {
            const res = await fetch(`/api/team/decisions`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.players?.length > 0) {
              apiPlayers = json.players;
            }
          } catch { /* API unavailable, fall through */ }
        }

        // 2. Fallback: fetch directly from Supabase v_player_today_decision
        if (!apiPlayers && !cancelled) {
          const supabase = getSupabaseClient();
          let decisionRows: Record<string, unknown>[] | null = null;
          const { data: rows } = await supabase
            .from("v_player_today_decision")
            .select("player_id, team_id, effective_readiness, coach_training_action")
            .eq("team_id", teamId);
          if (rows && rows.length > 0) {
            decisionRows = rows as Record<string, unknown>[];
          }

          if (decisionRows && decisionRows.length > 0) {
            // Get player names
            const playerIds = decisionRows.map((r: Record<string, unknown>) => String(r.player_id));
            const { data: playerNames } = await supabase
              .from("players")
              .select("id, full_name")
              .in("id", playerIds);
            const nameMap = new Map((playerNames ?? []).map((p: Record<string, unknown>) => [String(p.id), String(p.full_name ?? "")]));

            apiPlayers = decisionRows.map((r: Record<string, unknown>) => {
              const readiness = String(r.effective_readiness ?? "GREEN");
              const action = String(r.coach_training_action ?? "");
              const state = readiness === "YELLOW" ? "YELLOW" : readiness === "RED" ? "RED" : readiness === "GRAY" ? "GRAY" : "GREEN";
              const constraints: string[] = [];
              if (state === "YELLOW") { constraints.push("limit_total_volume", "avoid_max_intensity"); }
              if (state === "RED") { constraints.push("recovery_only"); }
              if (state === "GRAY") { constraints.push("technique_only"); }
              return {
                athleteId: String(r.player_id),
                athleteName: nameMap.get(String(r.player_id)) ?? "?",
                state,
                constraints,
                loadAdjustment: action === "REDUCED" ? -0.15 : null,
                coachSummary: action === "REDUCED" ? "Reduced load" : "",
              };
            });
          }
        }

        if (cancelled || !apiPlayers) {
          if (!cancelled) setConstraintsLoaded(true);
          return;
        }

        const constraints: PlayerConstraintInput[] = [];
        const overviewPlayers: ReadinessOverviewPlayer[] = [];
        for (const p of apiPlayers) {
          const state = p.state as "GREEN" | "YELLOW" | "RED" | "GRAY";

          // Collect non-green players for readiness overview
          if (state === "YELLOW" || state === "RED" || state === "GRAY") {
            overviewPlayers.push({
              athleteId: p.athleteId,
              athleteName: p.athleteName,
              state,
              constraints: p.constraints ?? [],
              loadAdjustment: p.loadAdjustment ?? null,
              coachSummary: p.coachSummary ?? "",
            });
          }

          // Only include players with actual constraints (not all-green)
          if (
            state === "RED" ||
            state === "GRAY" ||
            (p.constraints && p.constraints.length > 0 && !p.constraints.every((c) => c === "no_change"))
          ) {
            constraints.push(
              playerDecisionToConstraintInput({
                athleteId: p.athleteId,
                athleteName: p.athleteName,
                state,
                constraints: p.constraints ?? [],
                loadAdjustment: p.loadAdjustment ?? null,
              })
            );
          }
        }
        if (!cancelled) {
          setTeamConstraints(constraints);
          setReadinessOverviewPlayers(overviewPlayers);
          setConstraintsLoaded(true);
        }
      } catch {
        if (!cancelled) setConstraintsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  // Match constraints against current session drills
  const drillConflictSummary: TeamBlockConflictSummary | null = useMemo(() => {
    if (!constraintsLoaded || teamConstraints.length === 0 || items.length === 0) return null;
    const drillItems: DrillSessionItem[] = items.map((it) => ({
      uid: it.uid,
      drill: it.drill,
      sets: it.sets,
    }));
    return matchTeamConstraintsToDrills(drillItems, teamConstraints);
  }, [constraintsLoaded, teamConstraints, items]);

  // Quick lookup: uid → BlockConflictResult
  const conflictByDrill = useMemo(() => {
    if (!drillConflictSummary) return new Map<string, BlockConflictResult>();
    const map = new Map<string, BlockConflictResult>();
    for (const b of drillConflictSummary.blocks) {
      map.set(b.blockId, b);
    }
    return map;
  }, [drillConflictSummary]);

  const target = targetPL ? parseFloat(targetPL) : null;
  const plMetric = mdPlanning?.metrics.totalPlayerLoad ?? null;
  const plDelta = target != null ? totals.player_load - target : null;
  const plPct = target && target > 0 ? (totals.player_load / target) * 100 : null;

  // Use historical band when available, otherwise fall back to ±10% of target
  const bandLow = plMetric?.low ?? (target != null ? target * 0.9 : null);
  const bandHigh = plMetric?.high ?? (target != null ? target * 1.1 : null);
  const inBand =
    bandLow != null && bandHigh != null && totals.player_load > 0
      ? totals.player_load >= bandLow && totals.player_load <= bandHigh
      : null;
  const belowBand =
    bandLow != null && totals.player_load > 0 && totals.player_load < bandLow;
  const aboveBand =
    bandHigh != null && totals.player_load > bandHigh;
  const avgPlPerMin =
    totals.duration_min > 0 && totals.player_load > 0
      ? totals.player_load / totals.duration_min
      : null;

  return (
    <div className="space-y-4">
      {/* ═══ TOP BAR: Session header + totals ═══ */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header row: name + MD-day + target + PDF */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
          <input
            placeholder={t.sessionNamePlaceholder}
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            className="min-w-[180px] flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">MD</label>
            <select
              value={mdDay}
              onChange={(e) => {
                setMdDay(e.target.value);
                setTargetPL("");
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              <option value="MD-5">MD-5</option>
              <option value="MD-4">MD-4</option>
              <option value="MD-3">MD-3</option>
              <option value="MD-2">MD-2</option>
              <option value="MD-1">MD-1</option>
              <option value="MD">MD</option>
              <option value="MD+1">MD+1</option>
              <option value="MD+2">MD+2</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Target PL</label>
            <input
              type="number"
              placeholder="–"
              value={targetPL}
              onChange={(e) => setTargetPL(e.target.value)}
              className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {items.length > 0 && (
              <>
                <button
                  onClick={handleSaveSession}
                  disabled={savingSession}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm disabled:opacity-50 ${
                    savedFlash
                      ? "bg-emerald-600 text-white"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  {savingSession ? t.saving : savedFlash ? t.saved : t.save}
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {downloadingPdf ? t.creating : "PDF"}
                </button>
                <button
                  onClick={clearSession}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600"
                >
                  {t.clear}
                </button>
              </>
            )}
          </div>
        </div>

        {/* MD history status line */}
        {mdDay && (
          <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-1.5 text-[11px]">
            {mdLoading && <span className="text-slate-500">{t.fetchingHistory}</span>}
            {!mdLoading && mdPlanning && (
              <span className="text-slate-600">
                <span className="font-semibold text-slate-800">{t.teamHistory} {mdDay}:</span> {mdPlanning.sessionCount} {t.sessions} · {mdPlanning.playerCount} {t.players} · {t.band} {bandLow?.toFixed(0)}–{bandHigh?.toFixed(0)} PL
              </span>
            )}
            {!mdLoading && !mdPlanning && (
              <span className="text-slate-500">{t.noHistoryData} {mdDay}.</span>
            )}
          </div>
        )}

        {/* Totals strip — only show when there are drills in the session
            (avoids zero-filled visual noise on first paint) */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4 lg:grid-cols-8">
            <TotalCell label="Player Load" value={n(totals.player_load, 0)} accent="blue" emphasis />
            <TotalCell label="Duration" value={n(totals.duration_min, 0)} suffix={t.min} emphasis />
            <TotalCell label="Distance" value={n(totals.distance_m, 0)} suffix="m" />
            <TotalCell label={t.plPerMin} value={avgPlPerMin != null ? avgPlPerMin.toFixed(2) : "–"} />
            <TotalCell label="Vel B5" value={n(totals.vel_b5, 0)} suffix="m" />
            <TotalCell label="Vel B6" value={n(totals.vel_b6, 0)} suffix="m" />
            <TotalCell label="Accel B2-3" value={n(totals.accel_b23, 0)} />
            <TotalCell label="Decel B2-3" value={n(totals.decel_b23, 0)} />
          </div>
        )}

        {/* Metabolic totals strip (only when any drill has MetPwr data) */}
        {totals.hasMetabolic && (
          <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 bg-indigo-50/30 sm:grid-cols-4">
            <TotalCell
              label="HMLD (>25.5 W/kg)"
              value={n(totals.hmld_m, 0)}
              suffix="m"
              accent="blue"
            />
            <TotalCell
              label="Time > HML"
              value={n(totals.time_above_threshold_s, 0)}
              suffix="s"
            />
            <TotalCell
              label="Avg MetPwr"
              value={avgMetabolicPower != null ? avgMetabolicPower.toFixed(1) : "–"}
              suffix="W/kg"
            />
            <TotalCell
              label="Peak MetPwr"
              value={totals.metabolic_power_peak > 0 ? totals.metabolic_power_peak.toFixed(1) : "–"}
              suffix="W/kg"
            />
          </div>
        )}

        {/* PL band bar */}
        {target != null && totals.player_load > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-600">
                {mdPlanning
                  ? `${t.plVsHistory} ${mdDay} ${t.history}`
                  : `Player Load vs target`}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  inBand
                    ? "bg-emerald-100 text-emerald-800"
                    : belowBand
                    ? "bg-orange-100 text-orange-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {plPct!.toFixed(0)}% · {plDelta! >= 0 ? "+" : ""}{plDelta!.toFixed(0)}
                {inBand && ` · ${t.inBand}`}
                {belowBand && ` · ${t.low}`}
                {aboveBand && " · spike"}
              </span>
            </div>
            {bandLow != null && bandHigh != null ? (
              <BandBar
                value={totals.player_load}
                low={bandLow}
                high={bandHigh}
                mean={mdPlanning?.metrics.totalPlayerLoad?.mean ?? target}
              />
            ) : (
              <div className="h-2 overflow-hidden rounded bg-slate-200">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(150, Math.max(0, plPct!))}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Stimulus distribution bar */}
        {stimulusDist.total > 0 && (stimulusDist.total - stimulusDist.unclassified) > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-600">{t.stimulusDistribution}</span>
              <span className="text-[10px] text-slate-500">
                {stimulusDist.unclassified > 0 && `${stimulusDist.unclassified} ${t.noData}`}
              </span>
            </div>
            {(() => {
              const classified = stimulusDist.total - stimulusDist.unclassified;
              if (classified <= 0) return null;
              const parts: Array<{ type: "mechanical" | "locomotive" | "mixed" | "technical"; count: number; label: string }> = [
                { type: "mechanical", count: stimulusDist.mechanical, label: "MECH" },
                { type: "locomotive", count: stimulusDist.locomotive, label: "LOC" },
                { type: "mixed", count: stimulusDist.mixed, label: "MIX" },
                { type: "technical", count: stimulusDist.technical, label: "TECH" },
              ];
              return (
                <>
                  <div className="flex h-2 overflow-hidden rounded bg-slate-200">
                    {parts.map((p) => {
                      if (p.count === 0) return null;
                      const pct = (p.count / classified) * 100;
                      const c = stimulusColorClasses(p.type);
                      return (
                        <div
                          key={p.type}
                          className={`${c.dot} transition-all`}
                          style={{ width: `${pct}%` }}
                          title={`${p.label}: ${p.count}/${classified} (${Math.round(pct)}%)`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                    {parts.map((p) => {
                      if (p.count === 0) return null;
                      const pct = Math.round((p.count / classified) * 100);
                      const c = stimulusColorClasses(p.type);
                      return (
                        <span key={p.type} className="inline-flex items-center gap-1 text-slate-600">
                          <span className={`inline-block h-2 w-2 rounded-sm ${c.dot}`} />
                          {p.label} {pct}%
                        </span>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ═══ METRIC COMPARISON (full-width, collapsible feel) ═══ */}
      {mdPlanning && totals.hasAny && (
        <MetricComparison
          mdDay={mdDay}
          planning={mdPlanning.metrics}
          totals={totals}
          lang={lang}
        />
      )}

      {/* ═══ READINESS OVERVIEW: non-green players ═══ */}
      {constraintsLoaded && readinessOverviewPlayers.length > 0 && (
        <ReadinessOverviewPanel players={readinessOverviewPlayers} lang={lang} />
      )}

      {/* ═══ MAIN 2-col: drill picker + selected drills ═══ */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* LEFT: drill picker */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                onClick={() => setSource("mine")}
                className={`rounded px-3 py-1 font-medium transition ${
                  source === "mine"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.myLibrary}
              </button>
              <button
                onClick={() => setSource("team")}
                className={`rounded px-3 py-1 font-medium transition ${
                  source === "team"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                General
              </button>
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as Category | "all")}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            >
              <option value="all">{t.allCategories}</option>
              {(Object.keys(catLabels) as Category[]).map((c) => (
                <option key={c} value={c}>
                  {catLabels[c]}
                </option>
              ))}
            </select>
            <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
              {([
                { value: "all", label: lang === "IS" ? "Allt" : "All", color: "" },
                { value: "locomotive", label: "LOC", color: "text-sky-700" },
                { value: "mechanical", label: "MECH", color: "text-orange-700" },
                { value: "mixed", label: "MIX", color: "text-violet-700" },
                { value: "technical", label: "TECH", color: "text-emerald-700" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterStimulus(opt.value)}
                  className={`rounded px-2 py-0.5 font-semibold transition ${
                    filterStimulus === opt.value
                      ? `bg-white shadow-sm ${opt.color || "text-slate-900"}`
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              placeholder={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[160px] flex-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs"
            />
            <span className="ml-auto text-[11px] text-slate-400">
              {filteredDrills.length} {filteredDrills.length === 1 ? t.drillSingular : t.drillPlural}
            </span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && <div className="text-sm text-slate-500">{t.loading}</div>}

          {!loading && (
            <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredDrills.map((d) => (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailDrill(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailDrill(d);
                    }
                  }}
                  className="group flex cursor-pointer flex-col rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex shrink-0 items-center rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700">
                        {catLabels[d.category]}
                      </span>
                      {(() => {
                        const stim = classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23);
                        if (!stim) return null;
                        const sc = stimulusColorClasses(stim.type);
                        return (
                          <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${sc.bg} ${sc.text}`}>
                            {stim.type === "locomotive" ? "LOC" : stim.type === "mechanical" ? "MECH" : stim.type === "mixed" ? "MIX" : "TECH"}
                          </span>
                        );
                      })()}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); addDrill(d); }}
                      title={t.addToSession}
                      className="shrink-0 rounded-full bg-slate-100 p-1 text-slate-400 transition hover:bg-blue-600 hover:text-white"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mb-1 truncate text-sm font-semibold text-slate-900" title={d.drill_name}>
                    {d.drill_name}
                  </div>
                  {d.drill_format && (
                    <div className="mb-2 truncate text-[11px] text-slate-500">{d.drill_format}</div>
                  )}
                  <div className="mt-auto grid grid-cols-4 gap-1 text-center">
                    <StatCell label="PL" value={n(d.player_load, 0)} />
                    <StatCell label="Min" value={n(d.duration_min, 0)} />
                    <StatCell label="Dist" value={n(d.distance_m, 0)} />
                    <StatCell label="V6" value={n(d.vel_b6, 0)} />
                  </div>
                </div>
              ))}
              {filteredDrills.length === 0 && (
                <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  {t.noDrills}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: selected drills */}
        <div className="space-y-3">
          {/* Drill-constraint conflict summary banner */}
          {drillConflictSummary && drillConflictSummary.totalConflicts > 0 && (
            <DrillConflictSummaryBanner summary={drillConflictSummary} lang={lang} />
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                {t.session} · {items.length} {items.length === 1 ? t.drillSingular : t.drillPlural}
              </div>
              {totals.duration_min > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-blue-800">
                  {n(totals.duration_min, 0)} {t.min}
                </span>
              )}
            </div>
          {items.length === 0 ? (
            <div className="p-5">
              <div className="mb-3 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-slate-900">{t.emptyTitle}</div>
              </div>
              <ol className="mx-auto max-w-md space-y-2 text-[12.5px] text-slate-600">
                <li className="flex gap-2">
                  <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">1</span>
                  <span>{t.emptyStep1.replace(/^1\.\s*/, "")}</span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">2</span>
                  <span>{t.emptyStep2.replace(/^2\.\s*/, "")}</span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">3</span>
                  <span>{t.emptyStep3.replace(/^3\.\s*/, "")}</span>
                </li>
              </ol>
              <div className="mx-auto mt-4 max-w-md rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11.5px] text-amber-900">
                {t.emptyTip}
              </div>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((it, idx) => {
                const d = it.drill;
                const pl = (d.player_load ?? 0) * it.sets;
                const dur = (d.duration_min ?? 0) * it.sets;
                return (
                  <li
                    key={it.uid}
                    draggable
                    onDragStart={() => { dragItemRef.current = it.uid; }}
                    onDragEnd={() => { dragItemRef.current = null; setDragOverUid(null); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverUid(it.uid); }}
                    onDrop={(e) => { e.preventDefault(); handleDrop(it.uid); }}
                    className={`flex flex-wrap items-start gap-2 p-2.5 transition-colors ${
                      dragOverUid === it.uid && dragItemRef.current !== it.uid
                        ? "bg-blue-50 border-t-2 border-blue-400"
                        : (() => {
                            const c = conflictByDrill.get(it.uid);
                            if (c?.severity === "danger") return "bg-red-50/40";
                            if (c?.severity === "warning") return "bg-amber-50/30";
                            return "";
                          })()
                    }`}
                  >
                    <div className="flex flex-col items-center gap-0.5 pt-0.5 cursor-grab active:cursor-grabbing">
                      <button
                        onClick={() => moveItem(it.uid, -1)}
                        disabled={idx === 0}
                        className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        title={t.up}
                      >
                        ▲
                      </button>
                      <span className="text-[10px] font-semibold text-slate-500">{idx + 1}</span>
                      <button
                        onClick={() => moveItem(it.uid, 1)}
                        disabled={idx === items.length - 1}
                        className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        title={t.down}
                      >
                        ▼
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{d.drill_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {catLabels[d.category]}
                        {d.drill_format ? ` · ${d.drill_format}` : ""}
                        {d.reps ? ` · ${d.reps}` : ""}
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-600">
                        <span>PL <span className="font-semibold tabular-nums text-slate-900">{n(pl, 0)}</span></span>
                        <span>Min <span className="font-semibold tabular-nums text-slate-900">{n(dur, 0)}</span></span>
                        <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50">
                          <button
                            onClick={() => decrementSets(it.uid)}
                            className="rounded-l-md px-2 py-1 text-sm font-bold text-slate-600 hover:bg-slate-200"
                            title={it.sets > 1 ? t.reduceSets : t.remove}
                          >
                            −
                          </button>
                          <span className="min-w-[28px] text-center text-xs font-semibold tabular-nums text-slate-900">
                            {it.sets}×
                          </span>
                          <button
                            onClick={() => incrementSets(it.uid)}
                            className="rounded-r-md px-2 py-1 text-sm font-bold text-slate-600 hover:bg-slate-200"
                            title={t.increaseSets}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(it.uid)}
                      className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      title={t.removeDrill}
                    >
                      ✕
                    </button>
                    {/* Per-drill constraint conflict badge */}
                    {(() => {
                      const conflict = conflictByDrill.get(it.uid);
                      if (!conflict || conflict.conflicts.length === 0) return null;
                      return <DrillConflictBadge result={conflict} lang={lang} />;
                    })()}
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </div>
      </div>

      {/* Drill detail modal */}
      {detailDrill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailDrill(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                  {catLabels[detailDrill.category]}
                </span>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{detailDrill.drill_name}</h3>
                {detailDrill.drill_format && (
                  <p className="text-sm text-slate-500">{detailDrill.drill_format}</p>
                )}
              </div>
              <button
                onClick={() => setDetailDrill(null)}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title={t.close}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {(() => {
              const est = estimateSsgIntensity(detailDrill.total_players, detailDrill.area_per_player_m2);
              if (!est) return null;
              const c = bandColorClasses(est.band);
              return (
                <div className={`mb-3 rounded-lg border p-3 ${c.bg} ${c.border}`} title={est.description}>
                  <div className={`text-sm font-semibold ${c.text}`}>
                    {t.estimatedLoad}: ~{est.estHrMaxPct}% HRmax · {est.label}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-700">
                    {t.bestFor}: <strong>{est.suitableMdDays.join(", ")}</strong>
                  </div>
                  <div className="mt-1 text-[10px] leading-snug text-gray-500">
                    {t.basedOn}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const s = classifyDrillStimulus(detailDrill.vel_b5, detailDrill.vel_b6, detailDrill.accel_b23, detailDrill.decel_b23);
              if (!s) return null;
              const c = stimulusColorClasses(s.type);
              return (
                <div className={`mb-3 rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className={`text-sm font-semibold ${c.text}`}>
                    Stimulus: {s.label}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-700">
                    HSR <strong>{s.hsrM} m</strong> · Acc+Dec B2-3 <strong>{s.accDec}</strong> · {s.suitableMdDays.join(", ")}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const rec = getFormatRecommendation(detailDrill.total_players, detailDrill.area_per_player_m2);
              if (!rec || !rec.format) return null;
              const c = formatGoalColorClasses(rec.goal);
              const boutWarn = checkBoutDuration(detailDrill.total_players, detailDrill.duration_min);
              return (
                <div className={`mb-4 rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className={`text-sm font-semibold ${c.text}`}>
                    {rec.format} — {rec.goalLabel}
                  </div>
                  {rec.positionSummary && (
                    <div className="mt-0.5 text-xs text-gray-700">
                      {rec.positionSummary}
                    </div>
                  )}
                  {rec.boutGuidance && (
                    <div className="mt-1 text-[11px] leading-snug text-gray-600">
                      {rec.boutGuidance}
                    </div>
                  )}
                  {boutWarn && (
                    <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 ring-1 ring-amber-200">
                      ⚠ {boutWarn}
                    </div>
                  )}
                  {rec.warnings.map((w, i) => (
                    <div key={i} className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 ring-1 ring-amber-200">
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="space-y-4">
              <DetailSection title={t.pitchPlayers}>
                <DetailKV label={t.pitch} value={
                  detailDrill.field_length_m && detailDrill.field_width_m
                    ? `${n(detailDrill.field_length_m, 0)} × ${n(detailDrill.field_width_m, 0)} m`
                    : "–"
                } />
                <DetailKV label={t.playersLabel} value={detailDrill.total_players ?? "–"} />
                <DetailKV label={t.sqmPerPlayer} value={n(detailDrill.area_per_player_m2, 0)} />
                {detailDrill.reps && <DetailKV label="Reps" value={detailDrill.reps} />}
              </DetailSection>

              <DetailSection title={t.timeDist}>
                <DetailKV label="Duration" value={detailDrill.duration_min != null ? `${n(detailDrill.duration_min, 1)} ${t.min}` : "–"} />
                <DetailKV label="Distance" value={detailDrill.distance_m != null ? `${n(detailDrill.distance_m, 0)} m` : "–"} />
              </DetailSection>

              <DetailSection title={t.loadGps}>
                <DetailKV label="Player Load" value={n(detailDrill.player_load, 1)} />
                <DetailKV label="PL / mín" value={n(detailDrill.player_load_per_min, 2)} />
                <DetailKV label="Vel B5 (>19.8 km/h)" value={detailDrill.vel_b5 != null ? `${n(detailDrill.vel_b5, 0)} m` : "–"} />
                <DetailKV label="Vel B6 (>25.2 km/h)" value={detailDrill.vel_b6 != null ? `${n(detailDrill.vel_b6, 0)} m` : "–"} />
                <DetailKV label="Accel B2–3" value={n(detailDrill.accel_b23, 0)} />
                <DetailKV label="Decel B2–3" value={n(detailDrill.decel_b23, 0)} />
              </DetailSection>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDetailDrill(null)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.close}
              </button>
              <button
                onClick={() => { const d = detailDrill; setDetailDrill(null); addDrill(d); }}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t.addToSession}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-slate-50/40">
        {children}
      </div>
    </div>
  );
}

function DetailKV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

type PlanningMetric = {
  metric: string;
  mean: number;
  stdDev: number;
  low: number;
  high: number;
  min: number;
  max: number;
  sampleSize: number;
  unit: string;
};

type Totals = {
  duration_min: number;
  distance_m: number;
  player_load: number;
  hir_total: number;
  accel_b23: number;
  decel_b23: number;
  accel_total: number;
  decel_total: number;
  vel_b5: number;
  vel_b6: number;
  hmld_m: number;
  time_above_threshold_s: number;
  metabolic_power_avg_num: number;
  metabolic_power_avg_den: number;
  metabolic_power_peak: number;
  hasAny: boolean;
  hasMetabolic: boolean;
};

function MetricComparison({
  mdDay,
  planning,
  totals,
  lang,
}: {
  mdDay: string;
  planning: Record<string, PlanningMetric>;
  totals: Totals;
  lang: Lang;
}) {
  const mt = SB_COPY[lang];
  // Map MD metric keys → session total values (and special rules)
  const avgPlPerMin =
    totals.duration_min > 0 && totals.player_load > 0
      ? totals.player_load / totals.duration_min
      : 0;

  const rows: Array<{
    key: string;
    label: string;
    value: number;
    decimals: number;
    isAverage?: boolean;
  }> = [
    { key: "totalPlayerLoad", label: "Player Load", value: totals.player_load, decimals: 0 },
    { key: "duration", label: mt.durationMin, value: totals.duration_min, decimals: 0 },
    { key: "totalDistance", label: "Distance (m)", value: totals.distance_m, decimals: 0 },
    {
      key: "playerLoadPerMinute",
      label: mt.plPerMin,
      value: avgPlPerMin,
      decimals: 2,
      isAverage: true,
    },
    { key: "velocityBand5", label: "Vel Band 5 (m)", value: totals.vel_b5, decimals: 0 },
    { key: "velocityBand6", label: "Vel Band 6 (m)", value: totals.vel_b6, decimals: 0 },
    { key: "accelB23", label: "Accel B2-3", value: totals.accel_b23, decimals: 0 },
    { key: "decelB23", label: "Decel B2-3", value: totals.decel_b23, decimals: 0 },
  ];

  let hits = 0;
  const available = rows.filter((r) => planning[r.key] && planning[r.key].mean > 0);
  for (const r of available) {
    const m = planning[r.key];
    if (r.value >= m.low && r.value <= m.high) hits++;
  }
  const withValue = available.filter((r) => r.value > 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-semibold">
          {mt.metricsVsHistory} {mdDay} {mt.history}
        </div>
        <div className="text-xs text-slate-500">
          {hits}/{available.length}{" "}
          <span className="text-slate-400">{mt.inBand}</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {available.map((r) => {
          const m = planning[r.key];
          const hasValue = r.value > 0;
          const inBand = hasValue && r.value >= m.low && r.value <= m.high;
          const below = hasValue && r.value < m.low;
          const above = hasValue && r.value > m.high;
          const status = !hasValue ? "none" : inBand ? "ok" : below ? "low" : "high";
          const icon =
            status === "ok" ? "✓" : status === "high" ? "⚠" : status === "low" ? "↓" : "–";
          const color =
            status === "ok"
              ? "text-emerald-700"
              : status === "high"
              ? "text-red-700"
              : status === "low"
              ? "text-orange-700"
              : "text-slate-400";
          const bg =
            status === "ok"
              ? "bg-emerald-50"
              : status === "high"
              ? "bg-red-50"
              : status === "low"
              ? "bg-orange-50"
              : "bg-slate-50";
          return (
            <div key={r.key} className={`px-3 py-1.5 ${bg}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold ${color}`}>{icon}</span>
                  <span className="text-slate-700">{r.label}</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className={`font-semibold ${color}`}>
                    {hasValue ? r.value.toFixed(r.decimals) : "–"}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {r.isAverage ? "avg" : (lang === "EN" ? "hist" : "saga")}:{" "}
                    {m.low.toFixed(r.decimals)}–{m.high.toFixed(r.decimals)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {withValue.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
          {hits === available.length ? (
            <span className="text-emerald-700">
              ✓ {mt.allInBand} {mdDay}
            </span>
          ) : (
            <>
              <span className="text-slate-500">{mt.missing}: </span>
              <span>
                {available
                  .filter((r) => {
                    const m = planning[r.key];
                    const hasValue = r.value > 0;
                    return !hasValue || r.value < m.low || r.value > m.high;
                  })
                  .map((r) => r.label)
                  .join(", ")}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BandBar({
  value,
  low,
  high,
  mean,
}: {
  value: number;
  low: number;
  high: number;
  mean: number;
}) {
  // Scale: 0 to 1.5× high (so 150% of upper band fills bar)
  const scaleMax = Math.max(high * 1.5, value * 1.05);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / scaleMax) * 100));
  const lowPct = pct(low);
  const highPct = pct(high);
  const meanPct = pct(mean);
  const valuePct = pct(value);
  const inBand = value >= low && value <= high;
  const below = value < low;
  const color = inBand ? "bg-emerald-500" : below ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="relative h-3 w-full overflow-hidden rounded bg-slate-200">
      {/* Normal band (green backdrop) */}
      <div
        className="absolute top-0 h-full bg-emerald-100"
        style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
      />
      {/* Mean line */}
      <div
        className="absolute top-0 h-full w-px bg-emerald-700"
        style={{ left: `${meanPct}%` }}
      />
      {/* Value marker */}
      <div
        className={`absolute top-0 h-full w-1 ${color}`}
        style={{ left: `${Math.max(0, valuePct - 0.5)}%` }}
      />
      {/* Band edges labels */}
      <div
        className="absolute -top-0.5 h-full w-px bg-emerald-400"
        style={{ left: `${lowPct}%` }}
      />
      <div
        className="absolute -top-0.5 h-full w-px bg-emerald-400"
        style={{ left: `${highPct}%` }}
      />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-slate-50 px-1 py-1">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xs font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function TotalTile({
  label,
  value,
  big = false,
}: {
  label: string;
  value: React.ReactNode;
  big?: boolean;
}) {
  return (
    <div className="rounded bg-white p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`font-semibold text-gray-900 ${big ? "text-lg" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}

function TotalCell({
  label,
  value,
  suffix,
  emphasis = false,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  emphasis?: boolean;
  accent?: "blue";
}) {
  const accentClass =
    accent === "blue" ? "bg-blue-50/60" : "";
  return (
    <div className={`px-3 py-2.5 ${accentClass}`}>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`tabular-nums font-bold text-slate-900 ${
            emphasis ? "text-xl" : "text-base"
          }`}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-[10px] font-medium text-slate-400">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ── Drill Conflict Warning Components ──────────────────────────────

const ACTION_STYLE_SB: Record<string, { bg: string; text: string; icon: string }> = {
  skip:            { bg: "bg-red-100",    text: "text-red-800",    icon: "⛔" },
  reduce_half:     { bg: "bg-amber-100",  text: "text-amber-800",  icon: "½" },
  reduce_volume:   { bg: "bg-amber-50",   text: "text-amber-700",  icon: "↓" },
  reduce_contact:  { bg: "bg-orange-100", text: "text-orange-800", icon: "🛡" },
  lower_intensity: { bg: "bg-yellow-50",  text: "text-yellow-800", icon: "⬇" },
};

const ACTION_LABEL_SB: Record<string, Record<string, string>> = {
  IS: { skip: "Sleppa", reduce_half: "Helmingur", reduce_volume: "Minnka", reduce_contact: "Minni snerting", lower_intensity: "Lægra álag" },
  EN: { skip: "Skip", reduce_half: "Half volume", reduce_volume: "Reduce", reduce_contact: "Less contact", lower_intensity: "Lower intensity" },
};

const FLAG_DOT_SB: Record<string, string> = {
  RED: "bg-red-500", YELLOW: "bg-amber-400", GREEN: "bg-emerald-500", GRAY: "bg-gray-400",
};

function DrillConflictBadge({ result, lang }: { result: BlockConflictResult; lang: Lang }) {
  const [open, setOpen] = useState(false);
  if (result.conflicts.length === 0) return null;

  const badgeBg = result.severity === "danger" ? "bg-red-100 border-red-300" : "bg-amber-50 border-amber-200";
  const badgeText = result.severity === "danger" ? "text-red-700" : "text-amber-700";
  const labels = ACTION_LABEL_SB[lang];

  return (
    <div className="mt-1 w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-medium ${badgeBg} ${badgeText} transition-colors hover:opacity-80`}
      >
        <span>⚠</span>
        <span>
          {result.skipCount > 0 && `${result.skipCount} ${lang === "IS" ? "sleppa" : "skip"}`}
          {result.skipCount > 0 && result.reduceCount > 0 && " · "}
          {result.reduceCount > 0 && `${result.reduceCount} ${lang === "IS" ? "minnka" : "reduce"}`}
        </span>
        <span className="text-[9px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-1 space-y-0.5 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm">
          {result.conflicts.map((c, idx) => {
            const style = ACTION_STYLE_SB[c.action] ?? ACTION_STYLE_SB.skip;
            return (
              <div key={`${c.playerId}-${idx}`} className="flex items-center gap-1.5 text-[10px]">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${FLAG_DOT_SB[c.flag] ?? "bg-gray-400"}`} />
                <span className="font-medium text-gray-900 min-w-[70px]">{c.playerName}</span>
                <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-medium ${style.bg} ${style.text}`}>
                  {style.icon} {labels[c.action] ?? c.action}
                </span>
                <span className="text-gray-500 truncate">{lang === "IS" ? c.reasonIs : c.reason}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DrillConflictSummaryBanner({ summary, lang }: { summary: TeamBlockConflictSummary; lang: Lang }) {
  const [expanded, setExpanded] = useState(false);

  if (summary.totalConflicts === 0) return null;

  const borderColor = summary.hasCriticalConflict ? "border-red-300" : "border-amber-200";
  const bgColor = summary.hasCriticalConflict ? "bg-red-50" : "bg-amber-50";
  const textColor = summary.hasCriticalConflict ? "text-red-800" : "text-amber-800";
  const headerIcon = summary.hasCriticalConflict ? "🚨" : "⚠";

  const conflictWord = lang === "IS"
    ? (summary.totalConflicts === 1 ? "árekstri" : "árekstrar")
    : (summary.totalConflicts === 1 ? "conflict" : "conflicts");
  const blockWord = lang === "IS"
    ? (summary.blocksWithConflicts === 1 ? "drillu" : "drillum")
    : (summary.blocksWithConflicts === 1 ? "drill" : "drills");
  const playerWord = lang === "IS"
    ? (summary.totalPlayersAffected === 1 ? "leikmaður" : "leikmenn")
    : (summary.totalPlayersAffected === 1 ? "player" : "players");

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-2.5 text-[11px] ${textColor}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <span>{headerIcon}</span>
          <div>
            <span className="font-semibold">
              {summary.totalConflicts} {conflictWord} {lang === "IS" ? "í" : "in"} {summary.blocksWithConflicts} {blockWord}
            </span>
            <span className="ml-1.5 font-normal opacity-80">
              — {summary.totalPlayersAffected} {playerWord}
            </span>
          </div>
        </div>
        <span className="text-[9px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {summary.blocks
            .filter((b) => b.conflicts.length > 0)
            .map((block) => (
              <div key={block.blockId} className="rounded-lg border border-gray-200 bg-white p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-[11px]">{block.blockTitle}</span>
                  {block.exposureTags.length > 0 && (
                    <div className="flex gap-0.5">
                      {block.exposureTags.map((tag) => (
                        <span key={tag} className="rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-0.5">
                  {block.conflicts.map((c, idx) => {
                    const style = ACTION_STYLE_SB[c.action] ?? ACTION_STYLE_SB.skip;
                    return (
                      <div key={`${c.playerId}-${idx}`} className="flex items-center gap-1.5 text-[10px]">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${FLAG_DOT_SB[c.flag] ?? "bg-gray-400"}`} />
                        <span className="font-medium text-gray-900 min-w-[70px]">{c.playerName}</span>
                        <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-medium ${style.bg} ${style.text}`}>
                          {style.icon} {ACTION_LABEL_SB[lang][c.action] ?? c.action}
                        </span>
                        <span className="text-gray-500 truncate">{lang === "IS" ? c.reasonIs : c.reason}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {summary.hasCriticalConflict && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-100 p-1.5 text-[11px] text-red-900">
          <span>🚨</span>
          <span className="font-semibold">
            {lang === "IS"
              ? "Rauðir leikmenn með háálags-drillur — athugar þarf áður en samþykkt"
              : "RED players in high-load drills — review before proceeding"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Readiness Overview Panel ──────────────────────────────────────────────

const CONSTRAINT_LABELS_IS: Record<string, string> = {
  limit_total_volume: "Minnka magn",
  avoid_max_intensity: "Forðast hámarksákefð",
  limit_high_speed_running: "Takmarka háhraðahlaup",
  limit_accel_decel_density: "Takmarka accel/decel",
  avoid_eccentric_overload: "Forðast eccentric overload",
  recovery_only: "Aðeins bati",
  technique_only: "Aðeins tækni",
  no_change: "Engin breyting",
};

const CONSTRAINT_LABELS_EN: Record<string, string> = {
  limit_total_volume: "Reduce volume",
  avoid_max_intensity: "Avoid max intensity",
  limit_high_speed_running: "Limit high-speed running",
  limit_accel_decel_density: "Limit accel/decel density",
  avoid_eccentric_overload: "Avoid eccentric overload",
  recovery_only: "Recovery only",
  technique_only: "Technique only",
  no_change: "No change",
};

function ReadinessOverviewPanel({
  players,
  lang,
}: {
  players: Array<{
    athleteId: string;
    athleteName: string;
    state: "YELLOW" | "RED" | "GRAY";
    constraints: string[];
    loadAdjustment: number | null;
    coachSummary: string;
  }>;
  lang: Lang;
}) {
  const [expanded, setExpanded] = useState(true);
  const labels = lang === "IS" ? CONSTRAINT_LABELS_IS : CONSTRAINT_LABELS_EN;

  const yellowCount = players.filter((p) => p.state === "YELLOW").length;
  const redCount = players.filter((p) => p.state === "RED").length;
  const grayCount = players.filter((p) => p.state === "GRAY").length;

  const stateBadge = (state: "YELLOW" | "RED" | "GRAY") => {
    if (state === "RED") return "bg-rose-100 text-rose-700 border-rose-200";
    if (state === "YELLOW") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  const stateLabel = (state: "YELLOW" | "RED" | "GRAY") => {
    if (state === "RED") return lang === "IS" ? "Rauður" : "Red";
    if (state === "YELLOW") return lang === "IS" ? "Gulur" : "Yellow";
    return lang === "IS" ? "Óviss" : "Unknown";
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">⚠</span>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-900">
              {lang === "IS" ? "Readiness — aðlögun þarf" : "Readiness — adjustments needed"}
            </div>
            <div className="text-[11px] text-slate-600">
              {yellowCount > 0 && (
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  {yellowCount} {lang === "IS" ? "gulir" : "yellow"}
                </span>
              )}
              {redCount > 0 && (
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                  {redCount} {lang === "IS" ? "rauðir" : "red"}
                </span>
              )}
              {grayCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                  {grayCount} {lang === "IS" ? "óvissir" : "unknown"}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-amber-200 px-4 py-2.5">
          <div className="space-y-1.5">
            {players.map((p) => (
              <div
                key={p.athleteId}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                {/* State badge */}
                <span
                  className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${stateBadge(p.state)}`}
                >
                  {stateLabel(p.state)}
                </span>

                {/* Player name */}
                <span className="min-w-[120px] text-sm font-medium text-slate-900">
                  {p.athleteName}
                </span>

                {/* Load adjustment */}
                {p.loadAdjustment != null && p.loadAdjustment < 0 && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800">
                    {Math.round(p.loadAdjustment * 100)}%
                  </span>
                )}

                {/* Constraints */}
                <div className="flex flex-wrap gap-1">
                  {p.constraints
                    .filter((c) => c !== "no_change")
                    .map((c) => (
                      <span
                        key={c}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        {labels[c] ?? c}
                      </span>
                    ))}
                </div>

                {/* Coach summary (truncated) */}
                {p.coachSummary && (
                  <span className="ml-auto text-[10px] text-slate-500 truncate max-w-[250px]" title={p.coachSummary}>
                    {p.coachSummary}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
