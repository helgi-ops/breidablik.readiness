"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui (sem þú ert með)
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TemplateRow = {
  id: string;
  team_id: string | null;
  code: string | null;
  title: string | null;
  description: string | null;
  structure: any;
  is_active: boolean | null;
  created_at: string | null;
};

export default function TemplatesPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [q, setQ] = useState("");

  // Inline create form
  const [showNew, setShowNew] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStructure, setNewStructure] = useState(
    JSON.stringify(
      {
        duration_min: 25,
        category: "FOCUS",
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

  async function load() {
    const { data, error } = await supabase
      .from("workout_templates")
      .select("id, team_id, code, title, description, structure, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load templates error:", error);
      return;
    }
    setRows((data ?? []) as any);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const hay = `${r.code ?? ""} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  async function setActive(id: string, next: boolean) {
    const { error } = await supabase
      .from("workout_templates")
      .update({ is_active: next })
      .eq("id", id);

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Búðu til / stjórnaðu workout templates. Active templates birtast í Quick Assign.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Leita..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="sm:max-w-sm"
            />

            <div className="flex items-center gap-2">
              <Button onClick={() => setShowNew((v) => !v)}>
                {showNew ? "Close" : "New template"}
              </Button>
              <Button variant="outline" onClick={load}>
                Refresh
              </Button>
            </div>
          </div>

          {showNew ? (
            <div className="rounded-xl border p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label>Code</Label>
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="TENDON_ISO_PATELLAR"
                  />
                </div>

                <div className="grid gap-1">
                  <Label>Title</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Tendon Isometric – Patellar"
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <Label>Description</Label>
                <Textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Stutt lýsing..."
                />
              </div>

              <div className="grid gap-1">
                <Label>Structure (JSON)</Label>
                <Textarea
                  value={newStructure}
                  onChange={(e) => setNewStructure(e.target.value)}
                  className="min-h-[220px] font-mono text-xs"
                />
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
        {filtered.map((t) => (
          <Card key={t.id}>
            <CardContent className="py-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm opacity-70">{t.code ?? "—"}</div>
                <div className="text-lg font-semibold">{t.title ?? "Untitled"}</div>
                {t.description ? (
                  <div className="text-sm opacity-80">{t.description}</div>
                ) : null}
                <div className="text-xs opacity-60">
                  {t.structure?.category ? `Category: ${t.structure.category}` : "Category: —"}
                  {" · "}
                  {t.structure?.duration_min ? `${t.structure.duration_min} min` : "— min"}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!t.is_active}
                  onChange={(e) => setActive(t.id, e.target.checked)}
                />
                Active
              </label>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}