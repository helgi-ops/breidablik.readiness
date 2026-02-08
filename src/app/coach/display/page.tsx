"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ColorKey = "green_plus" | "green" | "yellow" | "red";

type TemplateRow = {
  color_key: ColorKey;
  md_day: string | null;

  // ✅ View-ið þitt skilar template_json
  template_json: any | null;

  // Optional fallback fields (ef view skilar þeim einhvern tímann)
  template_title?: string | null;
  template_description?: string | null;
  template_structure?: any | null;
};

const COLORS: ColorKey[] = ["green_plus", "green", "yellow", "red"];

const colorUi: Record<ColorKey, { label: string; dot: string; border: string; softBg: string; text: string }> = {
  green_plus: {
    label: "GREEN+",
    dot: "bg-emerald-500",
    border: "border-emerald-200",
    softBg: "bg-emerald-50",
    text: "text-emerald-800",
  },
  green: {
    label: "GREEN",
    dot: "bg-green-500",
    border: "border-green-200",
    softBg: "bg-green-50",
    text: "text-green-800",
  },
  yellow: {
    label: "YELLOW",
    dot: "bg-yellow-400",
    border: "border-yellow-200",
    softBg: "bg-yellow-50",
    text: "text-yellow-900",
  },
  red: {
    label: "RED",
    dot: "bg-red-500",
    border: "border-red-200",
    softBg: "bg-red-50",
    text: "text-red-800",
  },
};

// Fjarlægir litapunkta/emoji fremst í title (t.d. 🟢, 🟡, 🔴, 🟩 o.s.frv.)
function stripLeadingColorEmoji(s: string) {
  const v = (s ?? "").trim();
  return v
    .replace(/^[🟢🟡🔴🟩🟨🟥🟦🟧🟪⚫⚪🟣🟤]+/u, "")
    .replace(/^[•\-\\—]+/u, "")
    .trim();
}

function pickTitle(r: TemplateRow | null) {
  const t = r?.template_json;
  const raw =
    r?.template_title ??
    t?.template_title ??
    t?.title ??
    t?.name ??
    t?.template_name ??
    "—";
  return stripLeadingColorEmoji(String(raw));
}

function pickDescription(r: TemplateRow | null) {
  const t = r?.template_json;
  const raw =
    r?.template_description ??
    t?.template_description ??
    t?.description ??
    t?.notes ??
    t?.summary ??
    "";
  return String(raw ?? "");
}

// Þitt form er yfirleitt: template_json.structure
function pickStructure(r: TemplateRow | null): any {
  const t = r?.template_json;
  return (
    r?.template_structure ??
    t?.template_structure ??
    t?.structure ??
    t?.plan ??
    t?.content ??
    t?.template ??
    null
  );
}

function normalizeBlocks(struct: any): Array<{ title: string; bullets: string[] }> {
  if (!struct) return [];

  // ✅ Algengast hjá þér: object með köflum sem lykla
  if (typeof struct === "object" && !Array.isArray(struct)) {
    return Object.entries(struct)
      .map(([title, items]) => {
        const bullets = Array.isArray(items) ? items.map((x) => String(x).trim()).filter(Boolean) : [];
        return bullets.length ? { title: String(title).trim() || "—", bullets } : null;
      })
      .filter(Boolean) as Array<{ title: string; bullets: string[] }>;
  }

  // Fallback: array af blocks
  if (Array.isArray(struct)) {
    return struct
      .map((b: any) => {
        const title = String(b.title ?? b.heading ?? b.name ?? "").trim() || "—";
        const bulletsRaw = b.items ?? b.bullets ?? b.lines ?? b.points ?? [];
        const bullets = Array.isArray(bulletsRaw)
          ? bulletsRaw.map((x: any) => String(x).trim()).filter(Boolean)
          : [];
        return bullets.length ? { title, bullets } : null;
      })
      .filter(Boolean) as Array<{ title: string; bullets: string[] }>;
  }

  // Fallback: string -> línur
  if (typeof struct === "string") {
    const bullets = struct
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    return bullets.length ? [{ title: "Æfing", bullets }] : [];
  }

  return [];
}

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshSec = useMemo(() => {
    if (typeof window === "undefined") return 15;
    const sp = new URLSearchParams(window.location.search);
    const v = Number(sp.get("refresh") || "15");
    if (!Number.isFinite(v) || v < 5 || v > 120) return 15;
    return v;
  }, []);

  async function load() {
    setErr(null);
    try {
      const { data, error } = await supabase.from("v_coach_display_templates_today").select("*");
      if (error) throw error;

      setRows(((data ?? []) as unknown) as TemplateRow[]);
      setLastUpdated(new Date());
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, refreshSec * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSec]);

  const byColor = useMemo(() => {
    const m = new Map<ColorKey, TemplateRow>();
    for (const r of rows) m.set(r.color_key, r);
    return m;
  }, [rows]);

  return (
    <div className="min-h-screen w-full bg-background p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-2xl md:text-3xl font-semibold">Æfingar dagsins — 4 uppsetningar</div>
          <div className="text-sm text-muted-foreground">
            Auto-refresh: {refreshSec}s
            {lastUpdated ? ` • Síðast uppfært: ${lastUpdated.toLocaleTimeString("is-IS")}` : ""}
          </div>
          {err ? <div className="text-sm text-red-600 mt-1">Error: {err}</div> : null}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={() => document.documentElement.requestFullscreen?.()}>Fullscreen</Button>
        </div>
      </div>

      {/* 2x2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {COLORS.map((ck) => {
          const r = byColor.get(ck) ?? null;
          const ui = colorUi[ck];

          const title = pickTitle(r);
          const desc = pickDescription(r);
          const md = r?.md_day ?? "";

          const struct = pickStructure(r);
          const blocks = normalizeBlocks(struct);

          return (
            <Card key={ck} className={`rounded-2xl border-2 ${ui.border}`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${ui.dot}`} />
                    <span>{ui.label}</span>
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {md ? `MD: ${md}` : "MD: —"}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">{loading ? "Loading…" : desc || " "}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                {/* ✅ Best practice: YELLOW & RED mega vera sama template,
                    en RED fær “mode” reglu-ramma */}
                {ck === "red" && (
                  <div className={`rounded-xl border ${ui.border} ${ui.softBg} p-3 text-[12.5px] ${ui.text}`}>
                    <div className="font-semibold">⚠️ RED MODE — Öryggi & coach ákvörðun</div>
                    <ul className="mt-1 list-disc pl-5 space-y-0.5">
                      <li>Ef óþægindi/verkir eða gæði falla → STOPP</li>
                      <li>Engin plyo / ballistic nema sérstaklega samþykkt</li>
                      <li>ISO + minimal styrkur (clean reps) hafa forgang</li>
                      <li>Þetta er viðhald/öryggisdagur — ekki frammistaðudagur</li>
                    </ul>
                  </div>
                )}

                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {/* ✅ Rétt litamerki við title (ekki “grænn” fyrir alla) */}
                        <span className={`h-3 w-3 rounded-full ${ui.dot}`} />
                        <div className="text-base font-semibold leading-tight">{title}</div>
                      </div>

                      <div className="text-[12px] text-muted-foreground leading-tight">
                        (Veldu litinn þinn og fylgdu þessari uppsetningu)
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 space-y-2">
                    {blocks.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Engin æfing “structure” fannst í template_json (athugaðu `structure`).
                      </div>
                    ) : (
                      blocks.map((b, idx) => (
                        <div key={`${ck}-${idx}`} className="rounded-xl border bg-white p-2">
                          <div className="text-[13px] font-semibold leading-tight">{b.title}</div>
                          <ul className="mt-1 list-disc pl-5 space-y-0.5">
                            {b.bullets.map((x, j) => (
                              <li key={`${ck}-${idx}-${j}`} className="text-[12.5px] leading-tight">
                                {x}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
