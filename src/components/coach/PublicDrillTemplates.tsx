"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Category =
  | "possession"
  | "ssg"
  | "transition"
  | "running"
  | "finishing"
  | "shooting"
  | "fast_break"
  | "half_court_offense"
  | "defense"
  | "conditioning"
  | "warmup"
  | "other";

export type PublicTemplate = {
  id: string;
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
  hr_pct_max: number | null;
  blood_lactate_mmol: number | null;
  rpe_cr10: number | null;
  coach_encouragement: boolean | null;
  source_citation: string | null;
  source_doi: string | null;
  tags: string[] | null;
};

const FOOTBALL_CATEGORIES: Array<Category | "all"> = [
  "all",
  "possession",
  "ssg",
  "transition",
  "running",
  "finishing",
  "warmup",
  "other",
];

const BASKETBALL_CATEGORIES: Array<Category | "all"> = [
  "all",
  "conditioning",
  "half_court_offense",
  "fast_break",
  "defense",
  "shooting",
  "warmup",
  "other",
];

const CATEGORY_LABELS: Record<string, string> = {
  all: "Allir flokkar",
  possession: "Possession",
  ssg: "SSG",
  transition: "Transition",
  running: "Running",
  finishing: "Finishing",
  conditioning: "Conditioning",
  half_court_offense: "Half-Court Offense",
  fast_break: "Fast Break",
  defense: "Defense",
  shooting: "Shooting",
  warmup: "Warm-up",
  other: "Annað",
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

export default function PublicDrillTemplates({
  teamId,
  sport = "football",
  onCopied,
}: {
  teamId: string;
  sport?: string;
  onCopied?: () => void;
}) {
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<PublicTemplate | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Vantar auðkenningu");
      const qs = sport ? `?sport=${encodeURIComponent(sport)}` : "";
      const res = await fetch(`/api/public/drill-library${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Villa við að sækja");
      setTemplates(json.templates ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (q) {
        const hay = `${t.drill_name} ${t.description ?? ""} ${(t.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [templates, filterCategory, search]);

  async function handleCopy(t: PublicTemplate) {
    if (!teamId) {
      setError("Vantar team_id");
      return;
    }
    setCopyingId(t.id);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Vantar auðkenningu");
      const res = await fetch("/api/coach/drill-library/from-template", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ team_id: teamId, template_id: t.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Villa við að afrita");
      setJustCopied((prev) => new Set(prev).add(t.id));
      onCopied?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCopyingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Research templates</h2>
        <p className="text-sm text-gray-500">
          {templates.length} rannsóknarbyggðar SSG templates · afritaðu í library liðsins þíns
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as Category | "all")}
          className="rounded border px-2 py-1 text-sm"
        >
          {(sport === "basketball" ? BASKETBALL_CATEGORIES : FOOTBALL_CATEGORIES).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          placeholder="Leita…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] flex-1 rounded border px-2 py-1 text-sm"
        />
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-500">Hleð…</div>}

      {!loading && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const isCopied = justCopied.has(t.id);
            return (
              <div
                key={t.id}
                onClick={() => setDetail(t)}
                className="cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition hover:border-emerald-400 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.drill_name}</div>
                    {t.drill_format && (
                      <div className="text-xs text-gray-500">{t.drill_format}</div>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                    research
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <Metric
                    label="Völlur"
                    value={
                      t.field_length_m && t.field_width_m
                        ? `${n(t.field_length_m, 0)}×${n(t.field_width_m, 0)}`
                        : "–"
                    }
                  />
                  <Metric label="m²/leikm" value={n(t.area_per_player_m2, 0)} />
                  <Metric label="Leikm" value={t.total_players ?? "–"} />
                  <Metric label="Dur (min)" value={n(t.duration_min, 0)} />
                  <Metric label="%HRmax" value={n(t.hr_pct_max, 1)} />
                  <Metric label="BL mmol" value={n(t.blood_lactate_mmol, 1)} />
                  <Metric label="RPE" value={n(t.rpe_cr10, 1)} />
                  <Metric
                    label="Hvatning"
                    value={
                      t.coach_encouragement == null
                        ? "–"
                        : t.coach_encouragement
                        ? "já"
                        : "nei"
                    }
                  />
                </div>

                {t.source_citation && (
                  <div className="mt-2 text-[10px] italic text-gray-500">
                    {t.source_citation}
                  </div>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); handleCopy(t); }}
                  disabled={copyingId === t.id || isCopied}
                  className={`mt-3 w-full rounded px-2 py-1.5 text-xs font-medium transition ${
                    isCopied
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  }`}
                >
                  {copyingId === t.id
                    ? "Afrita…"
                    : isCopied
                    ? "✓ Afritað í library"
                    : "+ Afrita í mitt library"}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-sm text-gray-500">
              Engar templates fundust.
            </div>
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
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                    research
                  </span>
                  {detail.coach_encouragement != null && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      {detail.coach_encouragement ? "með hvatningu" : "án hvatningar"}
                    </span>
                  )}
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

            <div className="space-y-4">
              <TplSection title="Völlur og leikmenn">
                <TplRow
                  label="Völlur (L × B)"
                  value={
                    detail.field_length_m && detail.field_width_m
                      ? `${n(detail.field_length_m, 0)} × ${n(detail.field_width_m, 0)} m`
                      : "–"
                  }
                />
                <TplRow
                  label="Flatarmál"
                  value={detail.field_area_m2 ? `${n(detail.field_area_m2, 0)} m²` : "–"}
                />
                <TplRow label="Fjöldi leikmanna" value={detail.total_players ?? "–"} />
                <TplRow
                  label="m² / leikm (Fradua 65–110)"
                  value={detail.area_per_player_m2 ? `${n(detail.area_per_player_m2, 1)} m²` : "–"}
                />
                <TplRow label="Duration" value={detail.duration_min ? `${n(detail.duration_min, 0)} mín` : "–"} />
                {detail.reps && <TplRow label="Reps" value={detail.reps} />}
              </TplSection>

              <TplSection title="Internal load (Rampinini 2007)">
                <TplRow label="HR %max" value={n(detail.hr_pct_max, 1)} />
                <TplRow label="Blood lactate (mmol/L)" value={n(detail.blood_lactate_mmol, 1)} />
                <TplRow label="RPE (CR-10)" value={n(detail.rpe_cr10, 1)} />
              </TplSection>

              {detail.tags && detail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {detail.source_citation && (
                <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs italic text-slate-600">
                  {detail.source_citation}
                  {detail.source_doi && (
                    <div className="mt-1 not-italic text-slate-500">DOI: {detail.source_doi}</div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDetail(null)}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Loka
              </button>
              <button
                onClick={() => { const t = detail; handleCopy(t); }}
                disabled={copyingId === detail.id || justCopied.has(detail.id)}
                className={`rounded px-3 py-2 text-sm font-medium transition ${
                  justCopied.has(detail.id)
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                }`}
              >
                {copyingId === detail.id
                  ? "Afrita…"
                  : justCopied.has(detail.id)
                  ? "✓ Afritað"
                  : "+ Afrita í mitt library"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TplSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function TplRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
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
