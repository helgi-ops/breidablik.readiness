"use client";

/**
 * /coach/my-exercises — the trainer's own custom exercises.
 *
 * System/global exercises stay read-only (the trainer uses them in plans but
 * can't change them). Here the trainer adds, edits and deletes their OWN
 * exercises, which then appear in the Plan builder browse and carry their
 * description/video into the info popover like any other exercise.
 */

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Ex = {
  id: string;
  name: string;
  name_is: string | null;
  exercise_type: string | null;
  movement_family: string | null;
  equipment: string | null;
  description: string | null;
  description_is: string | null;
  video_url: string | null;
  is_bilateral: boolean | null;
  editable?: boolean;
};

const FAMILIES = ["squat", "hinge", "push", "pull", "core", "carry"];
const empty = {
  name: "", name_is: "", exercise_type: "strength", movement_family: "",
  equipment: "", description: "", description_is: "", video_url: "", is_bilateral: true,
};

export default function MyExercisesPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [items, setItems] = useState<Ex[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");

  const auth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // Fetch the whole library this team can see (system + own); filter locally.
      const res = await fetch("/api/trainer/exercises", { headers: await auth() });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setItems((j.exercises ?? []) as Ex[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [auth]);
  useEffect(() => { void load(); }, [load]);

  const q = search.trim().toLowerCase();
  const visible = items.filter((e) => {
    if (filter === "mine" && !e.editable) return false;
    if (!q) return true;
    return `${e.name} ${e.name_is ?? ""} ${e.movement_family ?? ""} ${e.equipment ?? ""}`.toLowerCase().includes(q);
  });
  const mineCount = items.filter((e) => e.editable).length;

  const resetForm = () => { setForm(empty); setEditingId(null); };

  const save = async () => {
    if (!form.name.trim()) { setErr(is ? "Nafn vantar" : "Name is required"); return; }
    setSaving(true); setErr(null);
    try {
      const url = editingId ? `/api/trainer/exercises/${editingId}` : "/api/trainer/exercises";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...(await auth()) },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Save failed"); return; }
      resetForm();
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setSaving(false); }
  };

  const edit = (e: Ex) => {
    setEditingId(e.id);
    setForm({
      name: e.name, name_is: e.name_is ?? "", exercise_type: e.exercise_type ?? "strength",
      movement_family: e.movement_family ?? "", equipment: e.equipment ?? "",
      description: e.description ?? "", description_is: e.description_is ?? "",
      video_url: e.video_url ?? "", is_bilateral: e.is_bilateral ?? true,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (e: Ex) => {
    if (typeof window !== "undefined" && !window.confirm(is ? `Eyða „${e.name}"?` : `Delete "${e.name}"?`)) return;
    try {
      const res = await fetch(`/api/trainer/exercises/${e.id}`, { method: "DELETE", headers: await auth() });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Delete failed"); return; }
      await load();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Network error"); }
  };

  const F = (k: keyof typeof empty, v: string | boolean) => setForm((s) => ({ ...s, [k]: v }));
  const inputCls = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{is ? "Æfingasafn" : "Exercise library"}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {is
            ? "Allar æfingar sem þú getur notað. Kerfis-æfingar eru læstar (þú notar þær en breytir ekki); þínar eigin geturðu breytt og eytt. Allar birtast í Kerfasmiðnum."
            : "Every exercise you can use. System exercises are locked (you use them but can't change them); your own you can edit and delete. All show up in the Plan builder."}
        </p>
      </div>

      {/* Add / edit form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-800">
          {editingId ? (is ? "Breyta æfingu" : "Edit exercise") : (is ? "Ný æfing" : "New exercise")}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Nafn (enska)" : "Name (English)"} *</label>
            <input className={inputCls} value={form.name} onChange={(e) => F("name", e.target.value)} placeholder="e.g. Hex Bar Jump" />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Nafn (íslenska)" : "Name (Icelandic)"}</label>
            <input className={inputCls} value={form.name_is} onChange={(e) => F("name_is", e.target.value)} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Tegund" : "Type"}</label>
            <select className={inputCls} value={form.exercise_type} onChange={(e) => F("exercise_type", e.target.value)}>
              <option value="strength">{is ? "Styrkur" : "Strength"}</option>
              <option value="endurance">{is ? "Þol" : "Endurance"}</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Hreyfifjölskylda" : "Movement family"}</label>
            <select className={inputCls} value={form.movement_family} onChange={(e) => F("movement_family", e.target.value)}>
              <option value="">{is ? "(engin)" : "(none)"}</option>
              {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Búnaður" : "Equipment"}</label>
            <input className={inputCls} value={form.equipment} onChange={(e) => F("equipment", e.target.value)} placeholder="barbell, kettlebell…" />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Myndband (hlekkur)" : "Video (URL)"}</label>
            <input className={inputCls} value={form.video_url} onChange={(e) => F("video_url", e.target.value)} placeholder="https://…" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Lýsing (enska)" : "Description (English)"}</label>
            <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => F("description", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium text-slate-500">{is ? "Lýsing (íslenska)" : "Description (Icelandic)"}</label>
            <textarea className={inputCls} rows={2} value={form.description_is} onChange={(e) => F("description_is", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.is_bilateral} onChange={(e) => F("is_bilateral", e.target.checked)} />
            {is ? "Tvíhliða (báðir útlimir saman)" : "Bilateral (both limbs together)"}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? (is ? "Vista…" : "Saving…") : editingId ? (is ? "Vista breytingar" : "Save changes") : (is ? "Bæta við" : "Add exercise")}
          </button>
          {editingId && <button type="button" onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-700">{is ? "Hætta við" : "Cancel"}</button>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      </div>

      {/* Library browser */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
          <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
            <button type="button" onClick={() => setFilter("all")} className={`rounded px-2 py-1 font-medium ${filter === "all" ? "bg-slate-900 text-white" : "text-slate-600"}`}>
              {is ? "Allt" : "All"} ({items.length})
            </button>
            <button type="button" onClick={() => setFilter("mine")} className={`rounded px-2 py-1 font-medium ${filter === "mine" ? "bg-slate-900 text-white" : "text-slate-600"}`}>
              {is ? "Mínar" : "Mine"} ({mineCount})
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={is ? "Leita…" : "Search…"}
            className="ml-auto w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        {loading ? (
          <div className="p-4 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>
        ) : visible.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">{is ? "Engar æfingar passa." : "No exercises match."}</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-800">
                      {e.name}{e.name_is ? <span className="text-slate-400"> · {e.name_is}</span> : null}
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${e.editable ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                      {e.editable ? (is ? "Mín" : "Mine") : (is ? "🔒 Kerfis" : "🔒 System")}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {[e.exercise_type, e.movement_family, e.equipment].filter(Boolean).join(" · ")}
                    {e.video_url ? " · ▶ video" : ""}
                  </div>
                </div>
                {e.editable && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => edit(e)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">{is ? "Breyta" : "Edit"}</button>
                    <button type="button" onClick={() => void remove(e)} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">{is ? "Eyða" : "Delete"}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
