"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePlan } from "@/lib/micropulse/product";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category =
  | "all"
  | "microdose"
  | "rehab"
  | "prehab"
  | "strength"
  | "power"
  | "recovery"
  | "activation"
  | "matchday"
  | "uncategorized";

type TemplateRow = {
  id: string;
  team_id: string | null;
  code: string | null;
  title: string | null;
  description: string | null;
  structure: any;
  is_active: boolean | null;
  created_at: string | null;

  // Optional (if exists in DB)
  category?: string | null;
  intensity_level?: string | null;
  md_relevance?: string | null;
};

function clampText(s: string, max = 160) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trim() + "…";
}

function getDuration(structure: any) {
  const d = structure?.duration_min;
  return typeof d === "number" && isFinite(d) ? `${d} min` : "— min";
}

/* =========================
   ✅ Category helpers
========================= */

function normalizeCategory(x: any): Category {
  const s = String(x ?? "").trim().toLowerCase();
  if (!s) return "uncategorized";

  // common aliases
  if (s === "focus") return "uncategorized";
  if (s === "microdose") return "microdose";
  if (s === "rehab") return "rehab";
  if (s === "prehab") return "prehab";
  if (s === "strength") return "strength";
  if (s === "power") return "power";
  if (s === "recovery") return "recovery";
  if (s === "activation") return "activation";
  if (s === "matchday") return "matchday";

  // soft matches
  if (s.includes("micro")) return "microdose";
  if (s.includes("rehab")) return "rehab";
  if (s.includes("prehab")) return "prehab";
  if (s.includes("strength")) return "strength";
  if (s.includes("power")) return "power";
  if (s.includes("recover")) return "recovery";
  if (s.includes("activ")) return "activation";
  if (s.includes("match")) return "matchday";

  return "uncategorized";
}

function getRowCategory(row: TemplateRow): Category {
  // Prefer DB column if present
  const fromColumn = normalizeCategory(row.category);
  if (fromColumn !== "uncategorized") return fromColumn;

  // Fallback to structure.category
  return normalizeCategory(row.structure?.category);
}

function categoryLabel(c: Category) {
  switch (c) {
    case "all":
      return "All";
    case "microdose":
      return "Microdose";
    case "rehab":
      return "Rehab";
    case "prehab":
      return "Prehab";
    case "strength":
      return "Strength";
    case "power":
      return "Power";
    case "recovery":
      return "Recovery";
    case "activation":
      return "Activation";
    case "matchday":
      return "Matchday";
    case "uncategorized":
      return "Other";
    default:
      return "Other";
  }
}

export default function TemplatesPage() {
  const { isAtLeastPro } = usePlan();

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [q, setQ] = useState("");

  // Category filter
  const [categoryFilter, setCategoryFilter] = useState<Category>("all");

  // Inline create form
  const [showNew, setShowNew] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStructure, setNewStructure] = useState(
    JSON.stringify(
      {
        duration_min: 25,
        category: "strength",
        blocks: [
          {
            type: "strength",
            title: "Block A",
            exercises: [{ name: "Bench Press", sets: 4, reps: 4 }],
          },
        ],
      },
      null,
      2
    )
  );

  // Preview / details
  const [openStructureId, setOpenStructureId] = useState<string | null>(null);

  async function load() {
    const extendedSelect =
      "id, team_id, code, title, description, structure, is_active, created_at, category, intensity_level, md_relevance";

    // Always load global templates (team_id IS NULL / is_global = true)
    const { data: globalData, error: globalError } = await supabase
      .from("workout_templates")
      .select(extendedSelect)
      .is("team_id", null)
      .order("created_at", { ascending: true });

    if (globalError) {
      console.error("load global templates error:", globalError);
    }

    const globalRows = (globalData ?? []) as TemplateRow[];

    // Pro users also see their team's custom templates
    if (isAtLeastPro) {
      const { data: teamData, error: teamError } = await supabase
        .from("workout_templates")
        .select(extendedSelect)
        .not("team_id", "is", null)
        .order("created_at", { ascending: false });

      if (!teamError) {
        setRows([...globalRows, ...(teamData ?? []) as TemplateRow[]]);
        return;
      }
    }

    setRows(globalRows);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return rows.filter((r) => {
      const hay = `${r.code ?? ""} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();
      const matchesSearch = !s || hay.includes(s);

      const rowCat = getRowCategory(r);
      const matchesCategory = categoryFilter === "all" ? true : rowCat === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [rows, q, categoryFilter]);

  async function setActive(id: string, next: boolean) {
    const { error } = await supabase.from("workout_templates").update({ is_active: next }).eq("id", id);

    if (error) {
      console.error("setActive error:", error);
      alert("Tókst ekki að uppfæra is_active.");
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
  }

  async function createTemplate() {
    let parsed: any;
    try {
      parsed = JSON.parse(newStructure);
    } catch {
      alert("Structure þarf að vera valid JSON.");
      return;
    }

    const payload = {
      team_id: null,
      code: newCode || null,
      title: newTitle || null,
      description: newDesc || null,
      structure: parsed,
      is_active: true,
    };

    const { error } = await supabase.from("workout_templates").insert(payload);

    if (error) {
      console.error("createTemplate error:", error);
      alert("Tókst ekki að búa til template.");
      return;
    }

    setNewCode("");
    setNewTitle("");
    setNewDesc("");
    setShowNew(false);
    await load();
  }

  const categoryButtons: Category[] = [
    "all",
    "microdose",
    "rehab",
    "prehab",
    "strength",
    "power",
    "recovery",
    "activation",
    "matchday",
    "uncategorized",
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Æfingasafn
                {!isAtLeastPro && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Free plan
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                {isAtLeastPro
                  ? "Æfingabanki – leitaðu, skoðaðu og búðu til eignar templates."
                  : "Þú hefur aðgang að öllum global templates. Uppfærðu í Pro til að búa til eignar."}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {isAtLeastPro ? (
                <Button onClick={() => setShowNew((v) => !v)}>{showNew ? "Loka" : "Ný template"}</Button>
              ) : (
                <a
                  href="/pricing"
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  Uppfæra í Pro
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              )}
              <Button variant="outline" onClick={load}>
                Uppfæra
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input placeholder="Leita..." value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
              <div className="text-sm opacity-70">Skoðaðu templates og opnaðu structure til að sjá nákvæmlega innihald.</div>
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap gap-2">
              {categoryButtons.map((cat) => (
                <Button key={cat} size="sm" variant={categoryFilter === cat ? "default" : "outline"} onClick={() => setCategoryFilter(cat)}>
                  {categoryLabel(cat)}
                </Button>
              ))}
            </div>
          </div>

          {showNew ? (
            <div className="rounded-xl border p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label>Code</Label>
                  <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="TENDON_ISO_PATELLAR" />
                </div>

                <div className="grid gap-1">
                  <Label>Title</Label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Tendon Isometric – Patellar" />
                </div>
              </div>

              <div className="grid gap-1">
                <Label>Description</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Stutt lýsing..." />
              </div>

              <div className="grid gap-1">
                <Label>Structure (JSON)</Label>
                <Textarea value={newStructure} onChange={(e) => setNewStructure(e.target.value)} className="min-h-[220px] font-mono text-xs" />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNew(false)}>
                  Cancel
                </Button>
                <Button onClick={createTemplate}>Create</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {filtered.map((t) => {
          const title = t.title ?? "Untitled";
          const duration = getDuration(t.structure);
          const desc = t.description ? clampText(t.description, 180) : "";
          const cat = getRowCategory(t);
          const isGlobal = !t.team_id;

          return (
            <Card key={t.id} className={isGlobal ? "" : "border-blue-200"}>
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {isGlobal ? (
                        <span className="text-[11px] rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 font-medium">Global</span>
                      ) : (
                        <span className="text-[11px] rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-medium">Custom</span>
                      )}
                      <div className="text-xs rounded-full border px-2 py-0.5 opacity-70">{categoryLabel(cat)}</div>
                      <div className="text-xs rounded-full border px-2 py-0.5 opacity-70">{duration}</div>
                      {(t as any).md_relevance && (
                        <div className="text-xs rounded-full border px-2 py-0.5 opacity-60">{(t as any).md_relevance}</div>
                      )}
                    </div>

                    <div className="text-base sm:text-lg font-semibold truncate">{title}</div>

                    {desc ? <div className="text-sm opacity-80">{desc}</div> : <div className="text-sm opacity-50">Engin lýsing</div>}

                    <div className="flex items-center gap-3 pt-2">
                      <Button variant="outline" onClick={() => setOpenStructureId((prev) => (prev === t.id ? null : t.id))}>
                        {openStructureId === t.id ? "Fela" : "Skoða"}
                      </Button>

                      {isAtLeastPro && !isGlobal && (
                        <label className="ml-auto flex items-center gap-2 text-sm">
                          <span className="opacity-70">Virk</span>
                          <input type="checkbox" checked={!!t.is_active} onChange={(e) => setActive(t.id, e.target.checked)} />
                        </label>
                      )}
                    </div>

                    {openStructureId === t.id ? (
                      <div className="mt-3 rounded-lg border bg-black/[0.02] p-3">
                        <div className="text-xs font-semibold opacity-70 mb-2">Uppbygging</div>
                        <pre className="text-xs overflow-auto whitespace-pre-wrap leading-relaxed">{JSON.stringify(t.structure ?? {}, null, 2)}</pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm opacity-70">Engin templates fundust.</CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}