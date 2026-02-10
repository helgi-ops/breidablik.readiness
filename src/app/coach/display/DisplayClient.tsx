"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* =========================
   ROTATION (highlight)
========================= */

const MODES = ["green_plus", "green", "yellow", "red"] as const;
type Mode = (typeof MODES)[number];

const DEFAULT_MODE: Mode = "green";
const DEFAULT_INTERVAL = 12;

function clampInt(v: any, fallback: number, min: number, max: number) {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/* =========================
   TYPES
========================= */

type ColorKey = Mode;

type FinalRow = {
  player_id: string;
  entry_date: string; // date
  readiness_level: string | null;
  md_day: string | null;

  plan_title: string | null;
  plan_description: string | null;
  plan_structure: any | null;

  training_system?: string | null;
  is_locked?: boolean | null;
  locked_at?: string | null;
};

type VariantCard = {
  label: "A" | "B" | "C";
  md_day: string | null;
  title: string;
  description: string;
  structure: any;
};

type TemplateVariantRow = {
  md_day: string | null;
  readiness_level: string | null;
  variant_label: string | null; // A/B/C
  title: string | null;
  description: string | null;
  structure: any | null;
};

/* =========================
   UI MAP
========================= */

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

/* =========================
   HELPERS
========================= */

function normalizeReadiness(s: string | null) {
  return (s ?? "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "_"); // "GREEN PLUS" -> "GREEN_PLUS"
}

function mapReadinessToColorKey(readiness: string | null): ColorKey | null {
  const r = normalizeReadiness(readiness);
  if (!r) return null;

  if (r === "GREEN_PLUS" || r === "GREENPLUS" || r.startsWith("GREEN+")) return "green_plus";
  if (r === "GREEN") return "green";
  if (r === "YELLOW") return "yellow";
  if (r === "RED") return "red";

  if (r.includes("GREEN_PLUS") || r.includes("GREEN+")) return "green_plus";
  if (r.includes("YELLOW")) return "yellow";
  if (r.includes("RED")) return "red";
  if (r.includes("GREEN")) return "green";

  return null;
}

function stripLeadingColorEmoji(s: string) {
  const v = (s ?? "").trim();
  return v
    .replace(/^[🟢🟡🔴🟩🟨🟥🟦🟧🟪⚫⚪🟣🟤]+/u, "")
    .replace(/^[•\-\\—]+/u, "")
    .trim();
}

function normalizeBlocks(struct: any): Array<{ title: string; bullets: string[] }> {
  if (!struct) return [];

  if (typeof struct === "object" && !Array.isArray(struct)) {
    return Object.entries(struct)
      .map(([title, items]) => {
        const bullets = Array.isArray(items) ? items.map((x) => String(x).trim()).filter(Boolean) : [];
        return bullets.length ? { title: String(title).trim() || "—", bullets } : null;
      })
      .filter(Boolean) as Array<{ title: string; bullets: string[] }>;
  }

  if (Array.isArray(struct)) {
    return struct
      .map((b: any) => {
        const title = String(b.title ?? b.heading ?? b.name ?? "").trim() || "—";
        const bulletsRaw = b.items ?? b.bullets ?? b.lines ?? b.points ?? [];
        const bullets = Array.isArray(bulletsRaw) ? bulletsRaw.map((x: any) => String(x).trim()).filter(Boolean) : [];
        return bullets.length ? { title, bullets } : null;
      })
      .filter(Boolean) as Array<{ title: string; bullets: string[] }>;
  }

  if (typeof struct === "string") {
    const bullets = struct
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    return bullets.length ? [{ title: "Æfing", bullets }] : [];
  }

  return [];
}

function jsonStableKey(x: any) {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function variantLabelToABC(v: string | null): "A" | "B" | "C" | null {
  const s = (v ?? "").toUpperCase().trim();
  if (s === "A") return "A";
  if (s === "B") return "B";
  if (s === "C") return "C";
  return null;
}

function colorKeyToReadinessLevelForVariants(ck: ColorKey) {
  if (ck === "green_plus") return "GREEN_PLUS";
  if (ck === "green") return "GREEN";
  if (ck === "yellow") return "YELLOW";
  return "RED";
}

/* =========================
   CLIENT PAGE
========================= */

export default function DisplayClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const urlMode = (sp.get("mode") as Mode) || DEFAULT_MODE;
  const urlAuto = sp.get("autorotate") === "1";
  const urlInterval = clampInt(sp.get("interval"), DEFAULT_INTERVAL, 5, 60);

  const [mode, setMode] = useState<Mode>(MODES.includes(urlMode) ? urlMode : DEFAULT_MODE);
  const [autorotate, setAutorotate] = useState(urlAuto);
  const [intervalSec, setIntervalSec] = useState(urlInterval);

  const [variantIndex, setVariantIndex] = useState<Record<ColorKey, number>>({
    green_plus: 0,
    green: 0,
    yellow: 0,
    red: 0,
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [rows, setRows] = useState<FinalRow[]>([]);
  const [fallbackVariants, setFallbackVariants] = useState<Record<ColorKey, VariantCard[]>>({
    green_plus: [],
    green: [],
    yellow: [],
    red: [],
  });

  useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", mode);
    params.set("autorotate", autorotate ? "1" : "0");
    params.set("interval", String(intervalSec));
    router.replace(`/coach/display?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, autorotate, intervalSec]);

  useEffect(() => {
    if (!autorotate) return;
    const t = setInterval(() => {
      setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);
    }, intervalSec * 1000);
    return () => clearInterval(t);
  }, [autorotate, intervalSec]);

  async function load() {
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("v_player_today_microdose_final")
        .select(
          "player_id,entry_date,readiness_level,md_day,plan_title,plan_description,plan_structure,training_system,is_locked,locked_at"
        );

      if (error) throw error;

      setRows((data ?? []) as FinalRow[]);
      setLastUpdated(new Date());
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const md = rows.map((r) => r.md_day).find(Boolean) ?? null;
    if (!md) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("microdose_template_variants")
          .select("md_day,readiness_level,variant_label,title,description,structure")
          .eq("md_day", md);

        if (error) throw error;

        const out: Record<ColorKey, VariantCard[]> = { green_plus: [], green: [], yellow: [], red: [] };
        const list = (data ?? []) as TemplateVariantRow[];

        for (const ck of MODES) {
          const rl = colorKeyToReadinessLevelForVariants(ck);
          const rowsForColor = list.filter((x) => normalizeReadiness(x.readiness_level) === rl);

          const byLabel = new Map<"A" | "B" | "C", VariantCard>();
          for (const r of rowsForColor) {
            const abc = variantLabelToABC(r.variant_label);
            if (!abc) continue;

            byLabel.set(abc, {
              label: abc,
              md_day: r.md_day ?? md,
              title: stripLeadingColorEmoji(String(r.title ?? "—")),
              description: String(r.description ?? ""),
              structure: r.structure ?? null,
            });
          }

          out[ck] = (["A", "B", "C"] as const).map((k) => byLabel.get(k)).filter(Boolean) as VariantCard[];
        }

        setFallbackVariants(out);
      } catch {
        // ignore
      }
    })();
  }, [rows]);

  const variantsByColor = useMemo(() => {
    const byColor: Record<ColorKey, VariantCard[]> = { green_plus: [], green: [], yellow: [], red: [] };

    const buckets = new Map<ColorKey, FinalRow[]>();
    for (const r of rows) {
      const ck = mapReadinessToColorKey(r.readiness_level);
      if (!ck) continue;
      if (!buckets.has(ck)) buckets.set(ck, []);
      buckets.get(ck)!.push(r);
    }

    for (const ck of MODES) {
      const list = buckets.get(ck) ?? [];
      const seen = new Set<string>();
      const picked: FinalRow[] = [];

      for (const r of list) {
        const title = stripLeadingColorEmoji(String(r.plan_title ?? ""));
        const key = `${title}__${jsonStableKey(r.plan_structure)}`;
        if (!title || title === "—") continue;
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(r);
        if (picked.length >= 3) break;
      }

      const labels: Array<"A" | "B" | "C"> = ["A", "B", "C"];

      byColor[ck] = picked.map((r, idx) => ({
        label: labels[idx] ?? "A",
        md_day: r.md_day ?? null,
        title: stripLeadingColorEmoji(String(r.plan_title ?? "—")),
        description: String(r.plan_description ?? ""),
        structure: r.plan_structure ?? null,
      }));
    }

    return byColor;
  }, [rows]);

  const finalVariantsByColor = useMemo(() => {
    const out: Record<ColorKey, VariantCard[]> = { green_plus: [], green: [], yellow: [], red: [] };
    for (const ck of MODES) out[ck] = (variantsByColor[ck]?.length ? variantsByColor[ck] : fallbackVariants[ck]) ?? [];
    return out;
  }, [variantsByColor, fallbackVariants]);

  useEffect(() => {
    if (!autorotate) return;

    const t = setInterval(() => {
      setVariantIndex((prev) => {
        const next: Record<ColorKey, number> = { ...prev };
        for (const ck of MODES) {
          const list = finalVariantsByColor?.[ck] ?? [];
          if (list.length > 1) next[ck] = (prev[ck] + 1) % list.length;
          else next[ck] = 0;
        }
        return next;
      });
    }, intervalSec * 1000);

    return () => clearInterval(t);
  }, [autorotate, intervalSec, finalVariantsByColor]);

  useEffect(() => {
    setVariantIndex((prev) => {
      const next: Record<ColorKey, number> = { ...prev };
      for (const ck of MODES) {
        const len = (finalVariantsByColor?.[ck] ?? []).length;
        if (len <= 1) next[ck] = 0;
        else if (next[ck] >= len) next[ck] = 0;
      }
      return next;
    });
  }, [finalVariantsByColor]);

  const prevMode = () => setMode((m) => MODES[(MODES.indexOf(m) - 1 + MODES.length) % MODES.length]);
  const nextMode = () => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-3xl font-semibold">Æfingar dagsins</div>
          <div className="text-sm text-muted-foreground">
            Highlight: {colorUi[mode].label} • Interval: {intervalSec}s
            {lastUpdated ? ` • ${lastUpdated.toLocaleTimeString("is-IS")}` : ""}
          </div>
          {err ? <div className="text-sm text-red-600 mt-1">Error: {err}</div> : null}
        </div>

        <div className="flex gap-2">
          <Button onClick={prevMode}>◀</Button>
          <Button onClick={nextMode}>▶</Button>

          <Button variant={autorotate ? "default" : "secondary"} onClick={() => setAutorotate((v) => !v)}>
            Auto
          </Button>

          <Button onClick={() => setIntervalSec(intervalSec === 12 ? 8 : intervalSec === 8 ? 15 : 12)}>
            {intervalSec}s
          </Button>

          <Button variant="secondary" onClick={load} disabled={loading}>
            Refresh
          </Button>

          <Button onClick={() => document.documentElement.requestFullscreen?.()}>Fullscreen</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODES.map((ck) => {
          const ui = colorUi[ck];
          const isActive = ck === mode;

          const allVariants = finalVariantsByColor[ck] ?? [];
          const idx = variantIndex[ck] ?? 0;

          const variants = allVariants.length ? [allVariants[idx % allVariants.length]] : [];

          return (
            <Card
              key={ck}
              className={[
                "rounded-2xl border-2 transition",
                ui.border,
                isActive ? "ring-2 ring-black/20" : "opacity-95",
              ].join(" ")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${ui.dot}`} />
                    <span>{ui.label}</span>
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {variants[0]?.md_day ? `MD: ${variants[0].md_day}` : "MD: —"}
                  </Badge>
                </CardTitle>

                <CardDescription className="text-xs">{loading ? "Loading…" : variants[0]?.description || " "}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {ck === "red" && (
                  <div className={`rounded-xl border ${ui.border} ${ui.softBg} p-3 text-[12.5px] ${ui.text}`}>
                    <div className="font-semibold">⚠️ RED MODE — Öryggi & coach ákvörðun</div>
                    <ul className="mt-1 list-disc pl-5 space-y-0.5">
                      <li>Ef óþægindi/verkir eða gæði falla → STOPP</li>
                      <li>Engin plyo / ballistic nema sérstaklega samþykkt</li>
                      <li>ISO + minimal styrkur (clean reps) hafa forgang</li>
                      <li>Viðhald/öryggisdagur — ekki frammistaðudagur</li>
                    </ul>
                  </div>
                )}

                {variants.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Engin A/B/C uppsetning fannst fyrir {ui.label}. (Athuga md_day/variant töflu)
                  </div>
                ) : (
                  variants.map((v) => {
                    const blocks = normalizeBlocks(v.structure);
                    return (
                      <div key={`${ck}-${v.label}`} className="rounded-xl border bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`h-3 w-3 rounded-full ${ui.dot}`} />
                              <div className="text-base font-semibold leading-tight truncate">{v.title}</div>
                            </div>
                            <div className="text-[12px] text-muted-foreground leading-tight">(Variant {v.label})</div>
                          </div>
                          <Badge variant="outline">Variant {v.label}</Badge>
                        </div>

                        <div className="mt-3 space-y-2">
                          {blocks.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Engin structure blokk fannst.</div>
                          ) : (
                            blocks.map((b, idx2) => (
                              <div key={`${ck}-${v.label}-${idx2}`} className="rounded-xl border bg-white p-2">
                                <div className="text-[13px] font-semibold leading-tight">{b.title}</div>
                                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                                  {b.bullets.map((x, j) => (
                                    <li key={`${ck}-${v.label}-${idx2}-${j}`} className="text-[12.5px] leading-tight">
                                      {x}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
