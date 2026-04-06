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

type Category =
  | "possession"
  | "ssg"
  | "transition"
  | "running"
  | "finishing"
  | "warmup"
  | "other";

const CATEGORIES: Category[] = [
  "possession",
  "ssg",
  "transition",
  "running",
  "finishing",
  "warmup",
  "other",
];

const CATEGORY_LABELS: Record<Category, string> = {
  possession: "Possession",
  ssg: "SSG",
  transition: "Transition",
  running: "Running",
  finishing: "Finishing",
  warmup: "Warm-up",
  other: "Annað",
};

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
  accel_total: number | null;
  decel_total: number | null;
  metabolic_power_avg: number | null;
  metabolic_power_peak: number | null;
  hmld_m: number | null;
  time_above_threshold_s: number | null;
  metabolic_estimated: boolean;
  source: "seed" | "coach" | "catapult" | "public_template";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

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
  accel_total: number | null;
  decel_total: number | null;
  metabolic_power_avg: number | null;
  metabolic_power_peak: number | null;
  hmld_m: number | null;
  time_above_threshold_s: number | null;
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
  accel_total: null,
  decel_total: null,
  metabolic_power_avg: null,
  metabolic_power_peak: null,
  hmld_m: null,
  time_above_threshold_s: null,
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
}: {
  teamId: string;
  mineOnly?: boolean;
}) {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [plMin, setPlMin] = useState("");
  const [plMax, setPlMax] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Drill | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Vantar auðkenningu");
      const params = new URLSearchParams({ team_id: teamId });
      if (mineOnly) params.set("mine", "1");
      const res = await fetch(`/api/coach/drill-library?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Villa við að sækja");
      setDrills(json.drills ?? []);
      if (json.currentUserId) setCurrentUserId(json.currentUserId);
      setIsAdmin(Boolean(json.isAdmin));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId, mineOnly]);

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
    for (const c of CATEGORIES) map.set(c, []);
    for (const d of filtered) map.get(d.category)!.push(d);
    return map;
  }, [filtered]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
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
      accel_total: d.accel_total,
      decel_total: d.decel_total,
      metabolic_power_avg: d.metabolic_power_avg,
      metabolic_power_peak: d.metabolic_power_peak,
      hmld_m: d.hmld_m,
      time_above_threshold_s: d.time_above_threshold_s,
    });
    setModalOpen(true);
  }

  function openDuplicate(d: Drill) {
    setEditingId(null);
    setForm({
      category: d.category,
      drill_name: `${d.drill_name} (afrit)`,
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
      accel_total: d.accel_total,
      decel_total: d.decel_total,
      metabolic_power_avg: d.metabolic_power_avg,
      metabolic_power_peak: d.metabolic_power_peak,
      hmld_m: d.hmld_m,
      time_above_threshold_s: d.time_above_threshold_s,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Vantar auðkenningu");
      const body = { ...form, team_id: teamId };
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
      if (!res.ok || !json.ok) throw new Error(json.error || "Villa við að vista");
      setModalOpen(false);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Eyða þessari drillu?")) return;
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Vantar auðkenningu");
      const res = await fetch(`/api/coach/drill-library/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Villa við að eyða");
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
          <h2 className="text-xl font-semibold">Drill Library</h2>
          <p className="text-sm text-gray-500">
            {drills.length} drillur ·{" "}
            {drills.filter((d) => d.source === "coach").length} frá þjálfara
          </p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + Ný drilla
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as Category | "all")}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="all">Allir flokkar</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          placeholder="Leita eftir nafni / lýsingu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder="PL min"
          value={plMin}
          onChange={(e) => setPlMin(e.target.value)}
          className="w-24 rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder="PL max"
          value={plMax}
          onChange={(e) => setPlMax(e.target.value)}
          className="w-24 rounded border px-2 py-1 text-sm"
        />
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-500">Hleð…</div>}

      {!loading && (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const list = grouped.get(cat) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
                  {CATEGORY_LABELS[cat]} ({list.length})
                </h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {list.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => setDetail(d)}
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
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              d.source === "coach"
                                ? "bg-blue-100 text-blue-700"
                                : d.source === "catapult"
                                ? "bg-purple-100 text-purple-700"
                                : d.source === "public_template"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {d.source}
                          </span>
                          {(() => {
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
                          })()}
                          {(() => {
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
                          })()}
                        </div>
                      </div>

                      {(() => {
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
                      })()}

                      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <Metric label="PL" value={n(d.player_load, 0)} />
                        <Metric label="PL/min" value={n(d.player_load_per_min, 1)} />
                        <Metric label="Dur (min)" value={n(d.duration_min, 1)} />
                        <Metric label="Dist (m)" value={n(d.distance_m, 0)} />
                        <Metric label="HIR" value={n(d.hir_total, 0)} />
                        <Metric
                          label="Völlur"
                          value={
                            d.field_length_m && d.field_width_m
                              ? `${n(d.field_length_m, 0)}×${n(d.field_width_m, 0)}`
                              : "–"
                          }
                        />
                        <Metric label="m²/leikm" value={n(d.area_per_player_m2, 0)} />
                        <Metric label="Leikm" value={d.total_players ?? "–"} />
                        <Metric
                          label={d.metabolic_estimated ? "HMLD (est)" : "HMLD"}
                          value={d.hmld_m != null ? `${n(d.hmld_m, 0)}m` : "–"}
                        />
                        <Metric label="MetPwr" value={d.metabolic_power_avg != null ? `${n(d.metabolic_power_avg, 1)}W/kg` : "–"} />
                      </div>

                      <div className="mt-3 flex gap-1 text-xs">
                        {(isAdmin || (currentUserId && d.created_by === currentUserId)) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(d); }}
                            className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                          >
                            Breyta
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); openDuplicate(d); }}
                          className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                        >
                          Afrita
                        </button>
                        {(isAdmin || (currentUserId && d.created_by === currentUserId)) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                            className="rounded bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100"
                          >
                            Eyða
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
            <div className="text-sm text-gray-500">Engar drillur fundust.</div>
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
                    {CATEGORY_LABELS[detail.category]}
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

            {detail.description && (
              <p className="mb-4 rounded bg-slate-50 p-3 text-sm text-slate-700">
                {detail.description}
              </p>
            )}

            {(() => {
              const est = estimateSsgIntensity(detail.total_players, detail.area_per_player_m2);
              if (!est) return null;
              const c = bandColorClasses(est.band);
              return (
                <div className={`mb-4 rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`text-sm font-semibold ${c.text}`}>
                        Áætlað álag: ~{est.estHrMaxPct}% HRmax · {est.label}
                      </div>
                      <div className="mt-1 text-xs text-gray-700">
                        Passar best fyrir: <strong>{est.suitableMdDays.join(", ")}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] leading-snug text-gray-600">
                    Byggt á Hill-Haas et al. (2011), <em>Physiology of Small-Sided Games Training in Football: A Systematic Review</em>, Sports Med 41(3).
                  </div>
                </div>
              );
            })()}

            {(() => {
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
                    Passar best fyrir: <strong>{s.suitableMdDays.join(", ")}</strong>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-gray-600">
                    {s.description}
                  </div>
                </div>
              );
            })()}

            {(() => {
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
                    Byggt á {rec.citation}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-4">
              <Section title="Völlur og leikmenn">
                <DetailRow
                  label="Völlur (L × B)"
                  value={
                    detail.field_length_m && detail.field_width_m
                      ? `${n(detail.field_length_m, 0)} × ${n(detail.field_width_m, 0)} m`
                      : "–"
                  }
                />
                <DetailRow
                  label="Flatarmál"
                  value={detail.field_area_m2 ? `${n(detail.field_area_m2, 0)} m²` : "–"}
                />
                <DetailRow label="Fjöldi leikmanna" value={detail.total_players ?? "–"} />
                <DetailRow
                  label="m² / leikm (Fradua viðmið: 65–110)"
                  value={detail.area_per_player_m2 ? `${n(detail.area_per_player_m2, 1)} m²` : "–"}
                  highlight={detail.area_per_player_m2 != null ? (
                    detail.area_per_player_m2 < 65 ? "low" :
                    detail.area_per_player_m2 > 110 ? "high" : "ok"
                  ) : undefined}
                />
              </Section>

              <Section title="Tími og vegalengd">
                <DetailRow label="Duration" value={detail.duration_min ? `${n(detail.duration_min, 1)} mín` : "–"} />
                <DetailRow label="Distance" value={detail.distance_m ? `${n(detail.distance_m, 0)} m` : "–"} />
              </Section>

              <Section title="Álag (GPS / Catapult)">
                <DetailRow label="Player Load (PL)" value={n(detail.player_load, 1)} />
                <DetailRow label="PL / mín" value={n(detail.player_load_per_min, 2)} />
                <DetailRow label="HIR total" value={detail.hir_total ? `${n(detail.hir_total, 0)} m` : "–"} />
                <DetailRow label="Vel B5 (>19.8 km/h)" value={detail.vel_b5 ? `${n(detail.vel_b5, 0)} m` : "–"} />
                <DetailRow label="Vel B6 (>25.2 km/h)" value={detail.vel_b6 ? `${n(detail.vel_b6, 0)} m` : "–"} />
                <DetailRow label="Accel total" value={n(detail.accel_total, 0)} />
                <DetailRow label="Decel total" value={n(detail.decel_total, 0)} />
                <DetailRow label="Accel B2–3" value={n(detail.accel_b23, 0)} />
                <DetailRow label="Decel B2–3" value={n(detail.decel_b23, 0)} />
              </Section>

              <Section title={`Metabolic Power (Osgnach 2010)${detail.metabolic_estimated ? " · áætlað frá PL" : ""}`}>
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
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { const d = detail; setDetail(null); openDuplicate(d); }}
                className="rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
              >
                Afrita
              </button>
              {(isAdmin || (currentUserId && detail.created_by === currentUserId)) && (
                <button
                  onClick={() => { const d = detail; setDetail(null); openEdit(d); }}
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Breyta
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
                {editingId ? "Breyta drillu" : "Ný drilla"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-900"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Flokkur">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                  className="w-full rounded border px-2 py-1"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nafn*">
                <input
                  value={form.drill_name}
                  onChange={(e) => setForm({ ...form, drill_name: e.target.value })}
                  className="w-full rounded border px-2 py-1"
                />
              </Field>

              <Field label="Format (t.d. 5v5+2)">
                <input
                  value={form.drill_format}
                  onChange={(e) => setForm({ ...form, drill_format: e.target.value })}
                  className="w-full rounded border px-2 py-1"
                />
              </Field>
              <Field label="Reps (t.d. 4x75sek)">
                <input
                  value={form.reps}
                  onChange={(e) => setForm({ ...form, reps: e.target.value })}
                  className="w-full rounded border px-2 py-1"
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="Lýsing">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full rounded border px-2 py-1"
                  />
                </Field>
              </div>

              <Field label="Lengd vallar (m)">
                <NumInput
                  value={form.field_length_m}
                  onChange={(v) => setForm({ ...form, field_length_m: v })}
                />
              </Field>
              <Field label="Breidd vallar (m)">
                <NumInput
                  value={form.field_width_m}
                  onChange={(v) => setForm({ ...form, field_width_m: v })}
                />
              </Field>
              <Field label="Fjöldi leikmanna">
                <NumInput
                  value={form.total_players}
                  onChange={(v) => setForm({ ...form, total_players: v })}
                  integer
                />
              </Field>
              <Field label="m² / leikmann (reiknað)">
                <div className="rounded border bg-gray-50 px-2 py-1 text-gray-600">
                  {computedAreaPerPlayer != null ? computedAreaPerPlayer.toFixed(1) : "–"}
                </div>
              </Field>

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
                  computedPlPerMin != null ? `(reiknað: ${computedPlPerMin.toFixed(2)})` : ""
                }`}
              >
                <NumInput
                  value={form.player_load_per_min}
                  onChange={(v) => setForm({ ...form, player_load_per_min: v })}
                />
              </Field>
              <Field label="Vel B5 (m)">
                <NumInput value={form.vel_b5} onChange={(v) => setForm({ ...form, vel_b5: v })} />
              </Field>
              <Field label="Vel B6 (m)">
                <NumInput value={form.vel_b6} onChange={(v) => setForm({ ...form, vel_b6: v })} />
              </Field>
              <Field label="HIR total (m)">
                <NumInput
                  value={form.hir_total}
                  onChange={(v) => setForm({ ...form, hir_total: v })}
                />
              </Field>
              <Field label="Accel total (count)">
                <NumInput
                  value={form.accel_total}
                  onChange={(v) => setForm({ ...form, accel_total: v })}
                />
              </Field>
              <Field label="Decel total (count)">
                <NumInput
                  value={form.decel_total}
                  onChange={(v) => setForm({ ...form, decel_total: v })}
                />
              </Field>
              <Field label="Accel B2-3 (count)">
                <NumInput
                  value={form.accel_b23}
                  onChange={(v) => setForm({ ...form, accel_b23: v })}
                />
              </Field>
              <Field label="Decel B2-3 (count)">
                <NumInput
                  value={form.decel_b23}
                  onChange={(v) => setForm({ ...form, decel_b23: v })}
                />
              </Field>
              <Field label="Avg MetPwr (W/kg)">
                <NumInput
                  value={form.metabolic_power_avg}
                  onChange={(v) => setForm({ ...form, metabolic_power_avg: v })}
                />
              </Field>
              <Field label="Peak MetPwr (W/kg)">
                <NumInput
                  value={form.metabolic_power_peak}
                  onChange={(v) => setForm({ ...form, metabolic_power_peak: v })}
                />
              </Field>
              <Field label="HMLD (m)">
                <NumInput
                  value={form.hmld_m}
                  onChange={(v) => setForm({ ...form, hmld_m: v })}
                />
              </Field>
              <Field label="Time > HML (s)">
                <NumInput
                  value={form.time_above_threshold_s}
                  onChange={(v) => setForm({ ...form, time_above_threshold_s: v })}
                />
              </Field>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded border px-4 py-2 hover:bg-gray-50"
              >
                Hætta við
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.drill_name}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Vista…" : "Vista"}
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
