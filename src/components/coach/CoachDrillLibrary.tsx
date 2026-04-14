"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { estimateSsgIntensity, bandColorClasses } from "@/lib/ssg-intensity";
import { classifyDrillStimulus, stimulusColorClasses } from "@/lib/drill-stimulus";
import {
  getFormatRecommendation,
  getFormatTag,
  formatGoalColorClasses,
  checkBoutDuration,
} from "@/lib/drill-recommendations";
import DrillPdfImporter from "./DrillPdfImporter";
import { useLang, type Lang } from "@/lib/lang";

// ── Football categories ──
type FootballCategory =
  | "possession"
  | "ssg"
  | "transition"
  | "running"
  | "finishing"
  | "warmup"
  | "other";

// ── Basketball categories ──
type BasketballCategory =
  | "shooting"
  | "fast_break"
  | "half_court_offense"
  | "defense"
  | "conditioning"
  | "warmup"
  | "other";

type Category = FootballCategory | BasketballCategory;

const FOOTBALL_CATEGORIES: FootballCategory[] = [
  "possession",
  "ssg",
  "transition",
  "running",
  "finishing",
  "warmup",
  "other",
];

const BASKETBALL_CATEGORIES: BasketballCategory[] = [
  "shooting",
  "fast_break",
  "half_court_offense",
  "defense",
  "conditioning",
  "warmup",
  "other",
];

const CATEGORY_LABELS_EN: Record<Category, string> = {
  // Football
  possession: "Possession",
  ssg: "SSG",
  transition: "Transition",
  running: "Running",
  finishing: "Finishing",
  // Basketball
  shooting: "Shooting",
  fast_break: "Fast Break",
  half_court_offense: "Half-Court Offense",
  defense: "Defense",
  conditioning: "Conditioning",
  // Shared
  warmup: "Warm-up",
  other: "Other",
};

const CATEGORY_LABELS_IS: Record<Category, string> = {
  possession: "Bolthald",
  ssg: "SSG",
  transition: "Umskipti",
  running: "Hlaup",
  finishing: "Klárunaræfingar",
  shooting: "Skot",
  fast_break: "Hraðupphlaup",
  half_court_offense: "Sókn á hálfum velli",
  defense: "Vörn",
  conditioning: "Þrek",
  warmup: "Upphitun",
  other: "Annað",
};

function getCategoryLabels(lang: Lang): Record<Category, string> {
  return lang === "IS" ? CATEGORY_LABELS_IS : CATEGORY_LABELS_EN;
}

function getCategoriesForSport(sport: string | null): Category[] {
  if (sport === "basketball") return BASKETBALL_CATEGORIES;
  return FOOTBALL_CATEGORIES;
}

function isFootballSport(sport: string | null): boolean {
  return sport !== "basketball";
}

export type Drill = {
  id: string;
  team_id: string;
  category: Category;
  drill_name: string;
  description: string | null;
  drill_format: string | null;
  field_length_m: number | null;
  field_width_m: number | null;
  total_players: number | null;
  reps: string | null;
  field_area_m2: number | null;
  area_per_player_m2: number | null;
  duration_min: number | null;
  distance_m: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  hir_total: number | null;
  player_load: number | null;
  player_load_per_min: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  accel_b23_avg: number | null;
  decel_b23_avg: number | null;
  accel_total: number | null;
  decel_total: number | null;
  max_velocity: number | null;
  metabolic_power_avg: number | null;
  metabolic_power_peak: number | null;
  hmld_m: number | null;
  time_above_threshold_s: number | null;
  metabolic_estimated: boolean;
  // ── Basketball BMP (Catapult) ──
  jump_count: number | null;
  ima_cod_total: number | null;
  high_ima: number | null;
  diagram_url: string | null;
  source:
    | "seed"
    | "coach"
    | "catapult"
    | "public_template"
    | "shared_from_coach"
    | "claimed_copy";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // ── Ownership (coach-owned library follows the coach; team-owned stays
  //    with the club; public is system-curated)
  owner_type?: "coach" | "team" | "public";
  owner_coach_id?: string | null;
};

export type DrillScope = "all" | "my" | "team" | "public";

const DRILL_COPY = {
  EN: {
    // Scope
    scopeAll: "All",
    scopeMy: "My library",
    scopeTeam: "Team library",
    scopePublic: "Public",
    scopeMyTitle: "Drills that follow you between clubs",
    scopeTeamTitle: "Drills owned by this team",
    scopePublicTitle: "Public MicroPulse baseline drills",
    scopeAllTitle: "Everything you can access",
    scopeMyHint: "Your personal library — follows you if you switch clubs",
    scopeTeamHint: "Shared with the team • all team coaches can see",
    scopePublicHint: "Public MicroPulse baseline drills",
    scopeAllHint: "Full library (mine + team + public)",
    // Header
    title: "Drill Library",
    countDrills: "drills",
    countFromCoach: "from coach",
    importPdf: "Import PDF",
    newDrill: "New drill",
    // Filters
    allCategories: "All categories",
    searchPlaceholder: "Search by name / description…",
    plMin: "PL min",
    plMax: "PL max",
    // States
    loading: "Loading…",
    noDrills: "No drills found.",
    // Badges
    badgeMineTitle: "In your personal library — follows you between clubs",
    badgeTeamTitle: "Team-owned — all team coaches can see",
    badgePublicTitle: "Public MicroPulse baseline library",
    badgeMine: "👤 Mine",
    badgeTeam: "🏟 Team",
    badgePublic: "🌐 Public",
    // Card
    field: "Field",
    edit: "Edit",
    duplicate: "Duplicate",
    delete: "Delete",
    // Confirmations / errors
    confirmDelete: "Delete this drill?",
    errAuth: "Authentication missing",
    errFetch: "Error fetching",
    errSave: "Error saving",
    errDelete: "Error deleting",
    errGeneric: "Error",
    // Detail modal
    estLoad: "Estimated load",
    bestFor: "Best suited for",
    basedOn: "Based on",
    fieldAndPlayers: "Field and players",
    fieldLxW: "Field (L × W)",
    area: "Area",
    numPlayers: "Number of players",
    m2PerPlayerFradua: "m² / player (Fradua target: 65–110)",
    timeAndDistance: "Time and distance",
    reset: "Reset",
    min: "min",
    scaledLabel: "Scaled to",
    ofOriginal: "of original",
    loadGps: "Load (GPS / Catapult)",
    loadIndoor: "Load (Catapult Indoor)",
    plPerMin: "PL / min",
    metabolicEstimated: "estimated from PL",
    // Share / claim
    confirmShareTeam: "Share this drill with the team? A copy will be saved to the team library.",
    shareTitle: "Saves a copy to the team library",
    shareBtn: "🏟 Share with team",
    confirmClaim: "Copy drill to My library? The copy follows you between clubs.",
    claimTitle: "Creates a personal copy that follows you between clubs",
    claimBtn: "👤 Copy to My library",
    // Create/edit modal
    editDrill: "Edit drill",
    newDrillTitle: "New drill",
    saveMyCheckbox: "👤 Save to My library (personal)",
    saveMyHint: "— follows you between clubs. By default drills are saved to the Team library where all team coaches can see.",
    category: "Category",
    name: "Name*",
    formatLabel: "Format (e.g. 5v5+2)",
    repsLabel: "Reps (e.g. 4x75s)",
    description: "Description",
    fieldLength: "Field length (m)",
    fieldWidth: "Field width (m)",
    m2PerPlayerComputed: "m² / player (computed)",
    duration: "Duration (min)",
    distance: "Distance (m)",
    playerLoad: "Player Load",
    plPerMinComputed: "computed",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
  },
  IS: {
    scopeAll: "Allt",
    scopeMy: "Mitt safn",
    scopeTeam: "Liðasafn",
    scopePublic: "Almennt",
    scopeMyTitle: "Drillur sem fylgja þér milli klúbba",
    scopeTeamTitle: "Drillur sem eru eign þessa liðs",
    scopePublicTitle: "Almennar grunndrillur frá MicroPulse",
    scopeAllTitle: "Allt sem þú hefur aðgang að",
    scopeMyHint: "Persónulegt safn þitt — fylgir þér ef þú skiptir um klúbb",
    scopeTeamHint: "Sameiginlegt lið • allir þjálfarar liðsins sjá",
    scopePublicHint: "Opin sýning á MicroPulse grunndrillum",
    scopeAllHint: "Allt safn (mitt + lið + almennt)",
    title: "Drillusafn",
    countDrills: "drillur",
    countFromCoach: "frá þjálfara",
    importPdf: "Flytja inn PDF",
    newDrill: "Ný drilla",
    allCategories: "Allir flokkar",
    searchPlaceholder: "Leita eftir nafni / lýsingu…",
    plMin: "PL mín",
    plMax: "PL hám",
    loading: "Hleð…",
    noDrills: "Engar drillur fundust.",
    badgeMineTitle: "Í þínu persónulega safni — fylgir þér milli klúbba",
    badgeTeamTitle: "Eign liðsins — allir þjálfarar liðsins sjá",
    badgePublicTitle: "Almennt MicroPulse grunn-safn",
    badgeMine: "👤 Mitt",
    badgeTeam: "🏟 Lið",
    badgePublic: "🌐 Almennt",
    field: "Völlur",
    edit: "Breyta",
    duplicate: "Afrita",
    delete: "Eyða",
    confirmDelete: "Eyða þessari drillu?",
    errAuth: "Vantar auðkenningu",
    errFetch: "Villa við að sækja",
    errSave: "Villa við að vista",
    errDelete: "Villa við að eyða",
    errGeneric: "Villa",
    estLoad: "Áætlað álag",
    bestFor: "Passar best fyrir",
    basedOn: "Byggt á",
    fieldAndPlayers: "Völlur og leikmenn",
    fieldLxW: "Völlur (L × B)",
    area: "Flatarmál",
    numPlayers: "Fjöldi leikmanna",
    m2PerPlayerFradua: "m² / leikm (Fradua viðmið: 65–110)",
    timeAndDistance: "Tími og vegalengd",
    reset: "Endurstilla",
    min: "mín",
    scaledLabel: "Skalað",
    ofOriginal: "af upprunalegu",
    loadGps: "Álag (GPS / Catapult)",
    loadIndoor: "Álag (Catapult Indoor)",
    plPerMin: "PL / mín",
    metabolicEstimated: "áætlað frá PL",
    confirmShareTeam: "Deila þessari drillu með liðinu? Afrit af henni verður vistað í liðsafninu.",
    shareTitle: "Vistar afrit af drillu í liðasafninu",
    shareBtn: "🏟 Deila með liði",
    confirmClaim: "Afrita drillu í Mitt safn? Afritið fylgir þér milli klúbba.",
    claimTitle: "Býr til persónulegt afrit sem fylgir þér milli klúbba",
    claimBtn: "👤 Afrita í Mitt safn",
    editDrill: "Breyta drillu",
    newDrillTitle: "Ný drilla",
    saveMyCheckbox: "👤 Vista í Mitt safn (persónulegt)",
    saveMyHint: "— fylgir þér milli klúbba. Sjálfgefið er að vista í Liðasafn þar sem allir þjálfarar liðsins sjá.",
    category: "Flokkur",
    name: "Nafn*",
    formatLabel: "Format (t.d. 5v5+2)",
    repsLabel: "Reps (t.d. 4x75sek)",
    description: "Lýsing",
    fieldLength: "Lengd vallar (m)",
    fieldWidth: "Breidd vallar (m)",
    m2PerPlayerComputed: "m² / leikmann (reiknað)",
    duration: "Duration (min)",
    distance: "Distance (m)",
    playerLoad: "Player Load",
    plPerMinComputed: "reiknað",
    cancel: "Hætta við",
    saving: "Vista…",
    save: "Vista",
  },
} as const;

type FormState = {
  category: Category;
  drill_name: string;
  description: string;
  drill_format: string;
  field_length_m: number | null;
  field_width_m: number | null;
  total_players: number | null;
  reps: string;
  duration_min: number | null;
  distance_m: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  hir_total: number | null;
  player_load: number | null;
  player_load_per_min: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  accel_b23_avg: number | null;
  decel_b23_avg: number | null;
  accel_total: number | null;
  decel_total: number | null;
  max_velocity: number | null;
  metabolic_power_avg: number | null;
  metabolic_power_peak: number | null;
  hmld_m: number | null;
  time_above_threshold_s: number | null;
  // ── Basketball BMP ──
  jump_count: number | null;
  ima_cod_total: number | null;
  high_ima: number | null;
};

const emptyForm: FormState = {
  category: "possession",
  drill_name: "",
  description: "",
  drill_format: "",
  field_length_m: null,
  field_width_m: null,
  total_players: null,
  reps: "",
  duration_min: null,
  distance_m: null,
  vel_b5: null,
  vel_b6: null,
  hir_total: null,
  player_load: null,
  player_load_per_min: null,
  accel_b23: null,
  decel_b23: null,
  accel_b23_avg: null,
  decel_b23_avg: null,
  accel_total: null,
  decel_total: null,
  max_velocity: null,
  metabolic_power_avg: null,
  metabolic_power_peak: null,
  hmld_m: null,
  time_above_threshold_s: null,
  jump_count: null,
  ima_cod_total: null,
  high_ima: null,
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

export default function CoachDrillLibrary({
  teamId,
  mineOnly = false,
  teamSport = null,
}: {
  teamId: string;
  mineOnly?: boolean;
  teamSport?: string | null;
}) {
  const [lang] = useLang();
  const t = DRILL_COPY[lang];
  const ALL_CATEGORY_LABELS = getCategoryLabels(lang);
  const categories = getCategoriesForSport(teamSport);
  const isFootball = isFootballSport(teamSport);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [scope, setScope] = useState<DrillScope>(mineOnly ? "my" : "all");
  const [search, setSearch] = useState("");
  const [plMin, setPlMin] = useState("");
  const [plMax, setPlMax] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveToMyLibrary, setSaveToMyLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Drill | null>(null);
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPdfImporter, setShowPdfImporter] = useState(false);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.errAuth);
      const params = new URLSearchParams({ team_id: teamId, scope });
      const res = await fetch(`/api/coach/drill-library?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.errFetch);
      setDrills(json.drills ?? []);
      if (json.currentUserId) setCurrentUserId(json.currentUserId);
      setIsAdmin(Boolean(json.isAdmin));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, scope, t.errAuth, t.errFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const min = plMin ? parseFloat(plMin) : -Infinity;
    const max = plMax ? parseFloat(plMax) : Infinity;
    const q = search.trim().toLowerCase();
    return drills.filter((d) => {
      if (filterCategory !== "all" && d.category !== filterCategory) return false;
      if (q) {
        const hay = `${d.drill_name} ${d.description ?? ""} ${d.drill_format ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const pl = d.player_load ?? null;
      if (pl != null && (pl < min || pl > max)) return false;
      return true;
    });
  }, [drills, filterCategory, search, plMin, plMax]);

  const grouped = useMemo(() => {
    const map = new Map<Category, Drill[]>();
    for (const c of categories) map.set(c, []);
    for (const d of filtered) {
      if (map.has(d.category)) {
        map.get(d.category)!.push(d);
      } else {
        // Drill from another sport — put in "other"
        map.get("other")!.push(d);
      }
    }
    return map;
  }, [filtered, categories]);

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm, category: categories[0] });
    setSaveToMyLibrary(scope === "my");
    setModalOpen(true);
  }

  function openEdit(d: Drill) {
    setEditingId(d.id);
    setForm({
      category: d.category,
      drill_name: d.drill_name,
      description: d.description ?? "",
      drill_format: d.drill_format ?? "",
      field_length_m: d.field_length_m,
      field_width_m: d.field_width_m,
      total_players: d.total_players,
      reps: d.reps ?? "",
      duration_min: d.duration_min,
      distance_m: d.distance_m,
      vel_b5: d.vel_b5,
      vel_b6: d.vel_b6,
      hir_total: d.hir_total,
      player_load: d.player_load,
      player_load_per_min: d.player_load_per_min,
      accel_b23: d.accel_b23,
      decel_b23: d.decel_b23,
      accel_b23_avg: d.accel_b23_avg,
      decel_b23_avg: d.decel_b23_avg,
      accel_total: d.accel_total,
      decel_total: d.decel_total,
      max_velocity: d.max_velocity,
      metabolic_power_avg: d.metabolic_power_avg,
      metabolic_power_peak: d.metabolic_power_peak,
      hmld_m: d.hmld_m,
      time_above_threshold_s: d.time_above_threshold_s,
      jump_count: d.jump_count,
      ima_cod_total: d.ima_cod_total,
      high_ima: d.high_ima,
    });
    setModalOpen(true);
  }

  function openDuplicate(d: Drill) {
    setEditingId(null);
    setForm({
      category: d.category,
      drill_name: `${d.drill_name} (${lang === "IS" ? "afrit" : "copy"})`,
      description: d.description ?? "",
      drill_format: d.drill_format ?? "",
      field_length_m: d.field_length_m,
      field_width_m: d.field_width_m,
      total_players: d.total_players,
      reps: d.reps ?? "",
      duration_min: d.duration_min,
      distance_m: d.distance_m,
      vel_b5: d.vel_b5,
      vel_b6: d.vel_b6,
      hir_total: d.hir_total,
      player_load: d.player_load,
      player_load_per_min: d.player_load_per_min,
      accel_b23: d.accel_b23,
      decel_b23: d.decel_b23,
      accel_b23_avg: d.accel_b23_avg,
      decel_b23_avg: d.decel_b23_avg,
      accel_total: d.accel_total,
      decel_total: d.decel_total,
      max_velocity: d.max_velocity,
      metabolic_power_avg: d.metabolic_power_avg,
      metabolic_power_peak: d.metabolic_power_peak,
      hmld_m: d.hmld_m,
      time_above_threshold_s: d.time_above_threshold_s,
      jump_count: d.jump_count,
      ima_cod_total: d.ima_cod_total,
      high_ima: d.high_ima,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.errAuth);
      const body = {
        ...form,
        team_id: teamId,
        // Only include owner_type on create (PATCH can't change ownership)
        ...(editingId
          ? {}
          : { owner_type: saveToMyLibrary ? "coach" : "team" }),
      };
      const res = await fetch(
        editingId
          ? `/api/coach/drill-library/${editingId}`
          : `/api/coach/drill-library`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.errSave);
      setModalOpen(false);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.confirmDelete)) return;
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.errAuth);
      const res = await fetch(`/api/coach/drill-library/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t.errDelete);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const computedPlPerMin =
    form.player_load && form.duration_min && form.duration_min > 0
      ? Number(form.player_load) / Number(form.duration_min)
      : null;

  const computedAreaPerPlayer =
    form.field_length_m && form.field_width_m && form.total_players
      ? (Number(form.field_length_m) * Number(form.field_width_m)) /
        Number(form.total_players)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t.title}</h2>
          <p className="text-sm text-gray-500">
            {drills.length} {t.countDrills} ·{" "}
            {drills.filter((d) => d.source === "coach").length} {t.countFromCoach}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPdfImporter(!showPdfImporter)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            📄 {t.importPdf}
          </button>
          <button
            onClick={openAdd}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            + {t.newDrill}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-white p-1 text-sm">
        {(["all", "my", "team", "public"] as DrillScope[]).map((s) => {
          const active = scope === s;
          const scopeLabel =
            s === "my" ? t.scopeMy :
            s === "team" ? t.scopeTeam :
            s === "public" ? t.scopePublic : t.scopeAll;
          const scopeTitle =
            s === "my" ? t.scopeMyTitle :
            s === "team" ? t.scopeTeamTitle :
            s === "public" ? t.scopePublicTitle : t.scopeAllTitle;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={
                "rounded-md px-3 py-1.5 font-medium transition " +
                (active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100")
              }
              title={scopeTitle}
            >
              {scopeLabel}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-500">
          {scope === "my" && t.scopeMyHint}
          {scope === "team" && t.scopeTeamHint}
          {scope === "public" && t.scopePublicHint}
          {scope === "all" && t.scopeAllHint}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as Category | "all")}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="all">{t.allCategories}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {ALL_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          placeholder={t.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder={t.plMin}
          value={plMin}
          onChange={(e) => setPlMin(e.target.value)}
          className="w-24 rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder={t.plMax}
          value={plMax}
          onChange={(e) => setPlMax(e.target.value)}
          className="w-24 rounded border px-2 py-1 text-sm"
        />
      </div>

      {showPdfImporter && (
        <DrillPdfImporter
          teamId={teamId}
          onImported={() => {
            setShowPdfImporter(false);
            refresh();
          }}
        />
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-500">{t.loading}</div>}

      {!loading && (
        <div className="space-y-6">
          {categories.map((cat) => {
            const list = grouped.get(cat) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
                  {ALL_CATEGORY_LABELS[cat]} ({list.length})
                </h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {list.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => { setDetail(d); setDurationOverride(null); }}
                      className="cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition hover:border-blue-400 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{d.drill_name}</div>
                          {d.drill_format && (
                            <div className="text-xs text-gray-500">{d.drill_format}</div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {d.owner_type === "coach" && d.owner_coach_id === currentUserId ? (
                            <span
                              className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700"
                              title={t.badgeMineTitle}
                            >
                              {t.badgeMine}
                            </span>
                          ) : d.owner_type === "team" ? (
                            <span
                              className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                              title={t.badgeTeamTitle}
                            >
                              {t.badgeTeam}
                            </span>
                          ) : d.owner_type === "public" ? (
                            <span
                              className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                              title={t.badgePublicTitle}
                            >
                              {t.badgePublic}
                            </span>
                          ) : null}
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              d.source === "coach"
                                ? "bg-blue-100 text-blue-700"
                                : d.source === "catapult"
                                ? "bg-purple-100 text-purple-700"
                                : d.source === "public_template"
                                ? "bg-emerald-100 text-emerald-700"
                                : d.source === "shared_from_coach"
                                ? "bg-indigo-100 text-indigo-700"
                                : d.source === "claimed_copy"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {d.source}
                          </span>
                          {isFootball ? (() => {
                            const s = classifyDrillStimulus(d.vel_b5, d.vel_b6, d.accel_b23, d.decel_b23);
                            if (!s) return null;
                            const c = stimulusColorClasses(s.type);
                            return (
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text} ${c.border}`}
                                title={s.description}
                              >
                                {s.shortLabel}
                              </span>
                            );
                          })() : null}
                          {isFootball ? (() => {
                            const tag = getFormatTag(d.total_players);
                            if (!tag) return null;
                            const c = formatGoalColorClasses(tag.goal);
                            return (
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] ${c.bg} ${c.text} ${c.border}`}
                                title={`${tag.format}: ${tag.goalLabel} (Lacome et al.)`}
                              >
                                {tag.format}
                              </span>
                            );
                          })() : null}
                        </div>
                      </div>

                      {isFootball ? (() => {
                        const est = estimateSsgIntensity(d.total_players, d.area_per_player_m2);
                        if (!est) return null;
                        const c = bandColorClasses(est.band);
                        return (
                          <div
                            className={`mt-2 flex items-center justify-between rounded border px-2 py-1 text-[11px] ${c.bg} ${c.text} ${c.border}`}
                            title={est.description}
                          >
                            <span className="font-medium">~{Math.round(est.estHrMaxPct)}% HRmax</span>
                            <span className="opacity-80">{est.suitableMdDays.join(" · ")}</span>
                          </div>
                        );
                      })() : null}

                      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <Metric label="PL" value={n(d.player_load, 0)} />
                        <Metric label="PL/min" value={n(d.player_load_per_min, 1)} />
                        <Metric label="Dur (min)" value={n(d.duration_min, 1)} />
                        <Metric label="Dist (m)" value={n(d.distance_m, 0)} />
                        {isFootball && <Metric label="HIR" value={n(d.hir_total, 0)} />}
                        {isFootball && (
                          <Metric
                            label={t.field}
                            value={
                              d.field_length_m && d.field_width_m
                                ? `${n(d.field_length_m, 0)}×${n(d.field_width_m, 0)}`
                                : "–"
                            }
                          />
                        )}
                        {isFootball && <Metric label="m²/leikm" value={n(d.area_per_player_m2, 0)} />}
                        <Metric label="Leikm" value={d.total_players ?? "–"} />
                        {isFootball && (
                          <Metric
                            label={d.metabolic_estimated ? "HMLD (est)" : "HMLD"}
                            value={d.hmld_m != null ? `${n(d.hmld_m, 0)}m` : "–"}
                          />
                        )}
                        {isFootball && <Metric label="Acc B2-3 Avg" value={n(d.accel_b23_avg, 0)} />}
                        {isFootball && <Metric label="Dec B2-3 Avg" value={n(d.decel_b23_avg, 0)} />}
                        {isFootball && d.max_velocity != null && <Metric label="Max km/h" value={n(d.max_velocity, 1)} />}
                        {isFootball && <Metric label="MetPwr" value={d.metabolic_power_avg != null ? `${n(d.metabolic_power_avg, 1)}W/kg` : "–"} />}
                        {!isFootball && <Metric label="IMA Accel" value={n(d.accel_total, 0)} />}
                        {!isFootball && <Metric label="IMA Decel" value={n(d.decel_total, 0)} />}
                        {!isFootball && <Metric label="Jumps" value={n(d.jump_count, 0)} />}
                        {!isFootball && <Metric label="COD" value={n(d.ima_cod_total, 0)} />}
                        {!isFootball && <Metric label="High-IMA" value={n(d.high_ima, 0)} />}
                      </div>

                      <div className="mt-3 flex gap-1 text-xs">
                        {(isAdmin || (currentUserId && d.created_by === currentUserId)) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(d); }}
                            className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                          >
                            {t.edit}
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); openDuplicate(d); }}
                          className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                        >
                          {t.duplicate}
                        </button>
                        {(isAdmin || (currentUserId && d.created_by === currentUserId)) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                            className="rounded bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100"
                          >
                            {t.delete}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-sm text-gray-500">{t.noDrills}</div>
          )}
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{detail.drill_name}</h3>
                {detail.drill_format && (
                  <div className="text-sm text-gray-500">{detail.drill_format}</div>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5">
                    {ALL_CATEGORY_LABELS[detail.category] ?? detail.category}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      detail.source === "coach"
                        ? "bg-blue-100 text-blue-700"
                        : detail.source === "catapult"
                        ? "bg-purple-100 text-purple-700"
                        : detail.source === "public_template"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {detail.source}
                  </span>
                  {detail.reps && <span>· {detail.reps}</span>}
                </div>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="text-gray-500 hover:text-gray-900"
              >
                ✕
              </button>
            </div>

            {detail.diagram_url && (
              <div className="mb-4 flex justify-center">
                <div className="max-w-md overflow-hidden rounded-lg border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detail.diagram_url}
                    alt={`Diagram: ${detail.drill_name}`}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {detail.description && (
              <p className="mb-4 rounded bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-line">
                {detail.description}
              </p>
            )}

            {isFootball ? (() => {
              const est = estimateSsgIntensity(detail.total_players, detail.area_per_player_m2);
              if (!est) return null;
              const c = bandColorClasses(est.band);
              return (
                <div className={`mb-4 rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`text-sm font-semibold ${c.text}`}>
                        {t.estLoad}: ~{est.estHrMaxPct}% HRmax · {est.label}
                      </div>
                      <div className="mt-1 text-xs text-gray-700">
                        {t.bestFor}: <strong>{est.suitableMdDays.join(", ")}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] leading-snug text-gray-600">
                    Byggt á Hill-Haas et al. (2011), <em>Physiology of Small-Sided Games Training in Football: A Systematic Review</em>, Sports Med 41(3).
                  </div>
                </div>
              );
            })() : null}

            {isFootball ? (() => {
              const s = classifyDrillStimulus(detail.vel_b5, detail.vel_b6, detail.accel_b23, detail.decel_b23);
              if (!s) return null;
              const c = stimulusColorClasses(s.type);
              return (
                <div className={`mb-4 rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className={`text-sm font-semibold ${c.text}`}>
                    Stimulus: {s.label}
                  </div>
                  <div className="mt-1 text-xs text-gray-700">
                    HSR (v5+v6): <strong>{s.hsrM} m</strong> · Accel+Decel B2-3: <strong>{s.accDec}</strong>
                  </div>
                  <div className="mt-1 text-xs text-gray-700">
                    {t.bestFor}: <strong>{s.suitableMdDays.join(", ")}</strong>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-gray-600">
                    {s.description}
                  </div>
                </div>
              );
            })() : null}

            {isFootball ? (() => {
              const rec = getFormatRecommendation(detail.total_players, detail.area_per_player_m2);
              if (!rec || !rec.format) return null;
              const c = formatGoalColorClasses(rec.goal);
              const boutWarn = checkBoutDuration(detail.total_players, detail.duration_min);
              return (
                <div className={`mb-4 rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className={`text-sm font-semibold ${c.text}`}>
                    Format: {rec.format} — {rec.goalLabel}
                  </div>
                  {rec.positionSummary && (
                    <div className="mt-1 text-xs text-gray-700">
                      <strong>Position emphasis:</strong> {rec.positionSummary}
                    </div>
                  )}
                  {rec.boutGuidance && (
                    <div className="mt-1 text-xs text-gray-700">
                      <strong>Bout guidance:</strong> {rec.boutGuidance}
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
                  <div className="mt-2 text-[10px] leading-snug text-gray-500">
                    {t.basedOn} {rec.citation}
                  </div>
                </div>
              );
            })() : null}

            <div className="space-y-4">
              {isFootball && (
                <Section title={t.fieldAndPlayers}>
                  <DetailRow
                    label={t.fieldLxW}
                    value={
                      detail.field_length_m && detail.field_width_m
                        ? `${n(detail.field_length_m, 0)} × ${n(detail.field_width_m, 0)} m`
                        : "–"
                    }
                  />
                  <DetailRow
                    label={t.area}
                    value={detail.field_area_m2 ? `${n(detail.field_area_m2, 0)} m²` : "–"}
                  />
                  <DetailRow label={t.numPlayers} value={detail.total_players ?? "–"} />
                  <DetailRow
                    label={t.m2PerPlayerFradua}
                    value={detail.area_per_player_m2 ? `${n(detail.area_per_player_m2, 1)} m²` : "–"}
                    highlight={detail.area_per_player_m2 != null ? (
                      detail.area_per_player_m2 < 65 ? "low" :
                      detail.area_per_player_m2 > 110 ? "high" : "ok"
                    ) : undefined}
                  />
                </Section>
              )}

              {/* ── Duration scaler ── */}
              {(() => {
                const baseDur = detail.duration_min;
                const scale = (baseDur && baseDur > 0 && durationOverride && durationOverride > 0)
                  ? durationOverride / baseDur
                  : 1;
                const isScaled = scale !== 1;
                const sv = (v: number | null, dec: number) =>
                  v != null ? n(Math.round(v * scale * (10 ** dec)) / (10 ** dec), dec) : "–";
                return (
                  <>
                    <Section title={t.timeAndDistance}>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm text-gray-600">Duration</span>
                        <div className="flex items-center gap-2">
                          {baseDur ? (
                            <>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                className="w-20 rounded border px-2 py-0.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                                value={durationOverride ?? baseDur ?? ""}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (!isNaN(v) && v > 0) setDurationOverride(v);
                                  else if (e.target.value === "") setDurationOverride(null);
                                }}
                              />
                              <span className="text-sm text-gray-500">{t.min}</span>
                              {isScaled && (
                                <button
                                  onClick={() => setDurationOverride(null)}
                                  className="ml-1 text-xs text-gray-400 hover:text-gray-600"
                                  title={t.reset}
                                >↺</button>
                              )}
                            </>
                          ) : (
                            <span className="text-sm text-gray-400">–</span>
                          )}
                        </div>
                      </div>
                      {isScaled && (
                        <div className="mb-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                          {t.scaledLabel} {n(scale * 100, 0)}% {t.ofOriginal} ({n(baseDur!, 1)} {t.min} → {n(durationOverride!, 1)} {t.min})
                        </div>
                      )}
                      <DetailRow
                        label="Distance"
                        value={detail.distance_m ? (
                          isScaled
                            ? `${sv(detail.distance_m, 0)} m (↔ ${n(detail.distance_m, 0)})`
                            : `${n(detail.distance_m, 0)} m`
                        ) : "–"}
                      />
                    </Section>

                    <Section title={isFootball ? t.loadGps : t.loadIndoor}>
                      <DetailRow
                        label="Player Load (PL)"
                        value={detail.player_load != null ? (
                          isScaled
                            ? `${sv(detail.player_load, 1)} (↔ ${n(detail.player_load, 1)})`
                            : n(detail.player_load, 1)
                        ) : "–"}
                      />
                      <DetailRow label={t.plPerMin} value={n(detail.player_load_per_min, 2)} />
                      {isFootball && (
                        <DetailRow
                          label="HIR total"
                          value={detail.hir_total ? (
                            isScaled
                              ? `${sv(detail.hir_total, 0)} m (↔ ${n(detail.hir_total, 0)})`
                              : `${n(detail.hir_total, 0)} m`
                          ) : "–"}
                        />
                      )}
                      {isFootball && (
                        <DetailRow
                          label="Vel B5 (>19.8 km/h)"
                          value={detail.vel_b5 ? (
                            isScaled
                              ? `${sv(detail.vel_b5, 0)} m (↔ ${n(detail.vel_b5, 0)})`
                              : `${n(detail.vel_b5, 0)} m`
                          ) : "–"}
                        />
                      )}
                      {isFootball && (
                        <DetailRow
                          label="Vel B6 (>25.2 km/h)"
                          value={detail.vel_b6 ? (
                            isScaled
                              ? `${sv(detail.vel_b6, 0)} m (↔ ${n(detail.vel_b6, 0)})`
                              : `${n(detail.vel_b6, 0)} m`
                          ) : "–"}
                        />
                      )}
                      <DetailRow
                        label="Accel total"
                        value={detail.accel_total != null ? (
                          isScaled
                            ? `${sv(detail.accel_total, 0)} (↔ ${n(detail.accel_total, 0)})`
                            : n(detail.accel_total, 0)
                        ) : "–"}
                      />
                      <DetailRow
                        label="Decel total"
                        value={detail.decel_total != null ? (
                          isScaled
                            ? `${sv(detail.decel_total, 0)} (↔ ${n(detail.decel_total, 0)})`
                            : n(detail.decel_total, 0)
                        ) : "–"}
                      />
                      <DetailRow
                        label={isFootball ? "Accel B2–3 total" : "IMA Accel high"}
                        value={detail.accel_b23 != null ? (
                          isScaled
                            ? `${sv(detail.accel_b23, 0)} (↔ ${n(detail.accel_b23, 0)})`
                            : n(detail.accel_b23, 0)
                        ) : "–"}
                      />
                      <DetailRow
                        label={isFootball ? "Decel B2–3 total" : "IMA Decel high"}
                        value={detail.decel_b23 != null ? (
                          isScaled
                            ? `${sv(detail.decel_b23, 0)} (↔ ${n(detail.decel_b23, 0)})`
                            : n(detail.decel_b23, 0)
                        ) : "–"}
                      />
                      {isFootball && (
                        <DetailRow
                          label="Accel B2–3 avg/sess"
                          value={detail.accel_b23_avg != null ? n(detail.accel_b23_avg, 0) : "–"}
                        />
                      )}
                      {isFootball && (
                        <DetailRow
                          label="Decel B2–3 avg/sess"
                          value={detail.decel_b23_avg != null ? n(detail.decel_b23_avg, 0) : "–"}
                        />
                      )}
                      {isFootball && detail.max_velocity != null && (
                        <DetailRow
                          label="Max velocity"
                          value={`${n(detail.max_velocity, 1)} km/h`}
                        />
                      )}
                      {!isFootball && <DetailRow label="IMA COD total" value={detail.ima_cod_total != null ? (isScaled ? `${sv(detail.ima_cod_total, 0)} (↔ ${n(detail.ima_cod_total, 0)})` : n(detail.ima_cod_total, 0)) : "–"} />}
                      {!isFootball && <DetailRow label="High-IMA (≥3.5 m/s²)" value={detail.high_ima != null ? (isScaled ? `${sv(detail.high_ima, 0)} (↔ ${n(detail.high_ima, 0)})` : n(detail.high_ima, 0)) : "–"} />}
                    </Section>
                  </>
                );
              })()}

              {!isFootball && (
                <Section title="Jumps (Catapult BMP)">
                  <DetailRow label="Jump Count" value={n(detail.jump_count, 0)} />
                </Section>
              )}

              {isFootball && (
                <Section title={`Metabolic Power (Osgnach 2010)${detail.metabolic_estimated ? ` · ${t.metabolicEstimated}` : ""}`}>
                  <DetailRow
                    label="Avg MetPwr"
                    value={detail.metabolic_power_avg != null ? `${n(detail.metabolic_power_avg, 1)} W/kg` : "–"}
                  />
                  <DetailRow
                    label="Peak MetPwr"
                    value={detail.metabolic_power_peak != null ? `${n(detail.metabolic_power_peak, 1)} W/kg` : "–"}
                  />
                  <DetailRow
                    label="HMLD (>25.5 W/kg)"
                    value={detail.hmld_m != null ? `${n(detail.hmld_m, 0)} m` : "–"}
                  />
                  <DetailRow
                    label="Time > threshold"
                    value={detail.time_above_threshold_s != null ? `${n(detail.time_above_threshold_s, 0)} s` : "–"}
                  />
                </Section>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {/* Coach-owned drill → allow sharing a team snapshot */}
              {detail.owner_type === "coach" &&
                detail.owner_coach_id === currentUserId && (
                  <button
                    onClick={async () => {
                      const d = detail;
                      if (!confirm(t.confirmShareTeam)) return;
                      try {
                        const token = await getAuthToken();
                        if (!token) throw new Error(t.errAuth);
                        const res = await fetch(
                          `/api/coach/drill-library/${d.id}/share-to-team`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ team_id: teamId }),
                          },
                        );
                        const json = await res.json();
                        if (!res.ok || !json.ok)
                          throw new Error(json.error || t.errGeneric);
                        setDetail(null);
                        await refresh();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : String(e));
                      }
                    }}
                    className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700"
                    title={t.shareTitle}
                  >
                    {t.shareBtn}
                  </button>
                )}

              {/* Team-owned or public drill → allow claiming into Mitt safn */}
              {(detail.owner_type === "team" || detail.owner_type === "public") && (
                <button
                  onClick={async () => {
                    const d = detail;
                    if (!confirm(t.confirmClaim)) return;
                    try {
                      const token = await getAuthToken();
                      if (!token) throw new Error(t.errAuth);
                      const res = await fetch(
                        `/api/coach/drill-library/${d.id}/claim`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                        },
                      );
                      const json = await res.json();
                      if (!res.ok || !json.ok)
                        throw new Error(json.error || t.errGeneric);
                      setDetail(null);
                      setScope("my");
                      await refresh();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                  title={t.claimTitle}
                >
                  {t.claimBtn}
                </button>
              )}

              <button
                onClick={() => { const d = detail; setDetail(null); openDuplicate(d); }}
                className="rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
              >
                {t.duplicate}
              </button>
              {(isAdmin || (currentUserId && detail.created_by === currentUserId)) && (
                <button
                  onClick={() => { const d = detail; setDetail(null); openEdit(d); }}
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                >
                  {t.edit}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingId ? t.editDrill : t.newDrillTitle}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-900"
              >
                ✕
              </button>
            </div>

            {!editingId && (
              <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 p-2 text-xs">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={saveToMyLibrary}
                    onChange={(e) => setSaveToMyLibrary(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-blue-900">
                      {t.saveMyCheckbox}
                    </span>
                    <span className="ml-1 text-blue-800">
                      {t.saveMyHint}
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t.category}>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                  className="w-full rounded border px-2 py-1"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {ALL_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.name}>
                <input
                  value={form.drill_name}
                  onChange={(e) => setForm({ ...form, drill_name: e.target.value })}
                  className="w-full rounded border px-2 py-1"
                />
              </Field>

              <Field label={t.formatLabel}>
                <input
                  value={form.drill_format}
                  onChange={(e) => setForm({ ...form, drill_format: e.target.value })}
                  className="w-full rounded border px-2 py-1"
                />
              </Field>
              <Field label={t.repsLabel}>
                <input
                  value={form.reps}
                  onChange={(e) => setForm({ ...form, reps: e.target.value })}
                  className="w-full rounded border px-2 py-1"
                />
              </Field>

              <div className="md:col-span-2">
                <Field label={t.description}>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full rounded border px-2 py-1"
                  />
                </Field>
              </div>

              {isFootball && (
                <Field label={t.fieldLength}>
                  <NumInput
                    value={form.field_length_m}
                    onChange={(v) => setForm({ ...form, field_length_m: v })}
                  />
                </Field>
              )}
              {isFootball && (
                <Field label={t.fieldWidth}>
                  <NumInput
                    value={form.field_width_m}
                    onChange={(v) => setForm({ ...form, field_width_m: v })}
                  />
                </Field>
              )}
              <Field label={t.numPlayers}>
                <NumInput
                  value={form.total_players}
                  onChange={(v) => setForm({ ...form, total_players: v })}
                  integer
                />
              </Field>
              {isFootball && (
                <Field label={t.m2PerPlayerComputed}>
                  <div className="rounded border bg-gray-50 px-2 py-1 text-gray-600">
                    {computedAreaPerPlayer != null ? computedAreaPerPlayer.toFixed(1) : "–"}
                  </div>
                </Field>
              )}

              <Field label="Duration (min)">
                <NumInput
                  value={form.duration_min}
                  onChange={(v) => setForm({ ...form, duration_min: v })}
                />
              </Field>
              <Field label="Distance (m)">
                <NumInput
                  value={form.distance_m}
                  onChange={(v) => setForm({ ...form, distance_m: v })}
                />
              </Field>
              <Field label="Player Load">
                <NumInput
                  value={form.player_load}
                  onChange={(v) => setForm({ ...form, player_load: v })}
                />
              </Field>
              <Field
                label={`PL/min ${
                  computedPlPerMin != null ? `(${t.plPerMinComputed}: ${computedPlPerMin.toFixed(2)})` : ""
                }`}
              >
                <NumInput
                  value={form.player_load_per_min}
                  onChange={(v) => setForm({ ...form, player_load_per_min: v })}
                />
              </Field>
              {isFootball && (
                <Field label="Vel B5 (m)">
                  <NumInput value={form.vel_b5} onChange={(v) => setForm({ ...form, vel_b5: v })} />
                </Field>
              )}
              {isFootball && (
                <Field label="Vel B6 (m)">
                  <NumInput value={form.vel_b6} onChange={(v) => setForm({ ...form, vel_b6: v })} />
                </Field>
              )}
              {isFootball && (
                <Field label="HIR total (m)">
                  <NumInput
                    value={form.hir_total}
                    onChange={(v) => setForm({ ...form, hir_total: v })}
                  />
                </Field>
              )}
              <Field label={isFootball ? "Accel total (count)" : "IMA Accel (count)"}>
                <NumInput
                  value={form.accel_total}
                  onChange={(v) => setForm({ ...form, accel_total: v })}
                />
              </Field>
              <Field label={isFootball ? "Decel total (count)" : "IMA Decel (count)"}>
                <NumInput
                  value={form.decel_total}
                  onChange={(v) => setForm({ ...form, decel_total: v })}
                />
              </Field>
              <Field label={isFootball ? "Accel B2-3 total" : "IMA Accel high (count)"}>
                <NumInput
                  value={form.accel_b23}
                  onChange={(v) => setForm({ ...form, accel_b23: v })}
                />
              </Field>
              <Field label={isFootball ? "Decel B2-3 total" : "IMA Decel high (count)"}>
                <NumInput
                  value={form.decel_b23}
                  onChange={(v) => setForm({ ...form, decel_b23: v })}
                />
              </Field>
              {isFootball && (
                <Field label="Accel B2-3 avg/sess">
                  <NumInput
                    value={form.accel_b23_avg}
                    onChange={(v) => setForm({ ...form, accel_b23_avg: v })}
                  />
                </Field>
              )}
              {isFootball && (
                <Field label="Decel B2-3 avg/sess">
                  <NumInput
                    value={form.decel_b23_avg}
                    onChange={(v) => setForm({ ...form, decel_b23_avg: v })}
                  />
                </Field>
              )}
              {isFootball && (
                <Field label="Max velocity (km/h)">
                  <NumInput
                    value={form.max_velocity}
                    onChange={(v) => setForm({ ...form, max_velocity: v })}
                  />
                </Field>
              )}
              {isFootball && (
                <Field label="Avg MetPwr (W/kg)">
                  <NumInput
                    value={form.metabolic_power_avg}
                    onChange={(v) => setForm({ ...form, metabolic_power_avg: v })}
                  />
                </Field>
              )}
              {isFootball && (
                <Field label="Peak MetPwr (W/kg)">
                  <NumInput
                    value={form.metabolic_power_peak}
                    onChange={(v) => setForm({ ...form, metabolic_power_peak: v })}
                  />
                </Field>
              )}
              {isFootball && (
                <Field label="HMLD (m)">
                  <NumInput
                    value={form.hmld_m}
                    onChange={(v) => setForm({ ...form, hmld_m: v })}
                  />
                </Field>
              )}
              {isFootball && (
                <Field label="Time > HML (s)">
                  <NumInput
                    value={form.time_above_threshold_s}
                    onChange={(v) => setForm({ ...form, time_above_threshold_s: v })}
                  />
                </Field>
              )}
              {!isFootball && (
                <Field label="Jump Count">
                  <NumInput
                    value={form.jump_count}
                    onChange={(v) => setForm({ ...form, jump_count: v })}
                    integer
                  />
                </Field>
              )}
              {!isFootball && (
                <Field label="IMA COD total">
                  <NumInput
                    value={form.ima_cod_total}
                    onChange={(v) => setForm({ ...form, ima_cod_total: v })}
                    integer
                  />
                </Field>
              )}
              {!isFootball && (
                <Field label="High-IMA (≥3.5 m/s²)">
                  <NumInput
                    value={form.high_ima}
                    onChange={(v) => setForm({ ...form, high_ima: v })}
                    integer
                  />
                </Field>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded border px-4 py-2 hover:bg-gray-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.drill_name}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: "low" | "ok" | "high";
}) {
  const color =
    highlight === "low"
      ? "text-orange-700"
      : highlight === "high"
      ? "text-red-700"
      : highlight === "ok"
      ? "text-emerald-700"
      : "text-slate-900";
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  integer = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  integer?: boolean;
}) {
  return (
    <input
      type="number"
      step={integer ? 1 : "any"}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className="w-full rounded border px-2 py-1"
    />
  );
}
