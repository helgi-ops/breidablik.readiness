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

type TemplateRow = {
  md_day: string | null;
  readiness_level: string | null; // GREEN / GREEN_PLUS / YELLOW / RED
  title: string | null;
  description: string | null;
  structure: any | null; // jsonb
  variant: string | null; // A/B/C or null
};

type VariantCard = {
  label: "A" | "B" | "C";
  md_day: string | null;
  readiness_level: "GREEN_PLUS" | "GREEN" | "YELLOW" | "RED";
  title: string;
  description: string;
  structure: any;
};

/* =========================
   UI MAP
========================= */

const colorUi: Record<ColorKey, { label: string; dot: string; border: string; softBg: string; text: string }> = {
  green_plus: { label: "GREEN+", dot: "bg-emerald-500", border: "border-emerald-200", softBg: "bg-emerald-50", text: "text-emerald-800" },
  green: { label: "GREEN", dot: "bg-green-500", border: "border-green-200", softBg: "bg-green-50", text: "text-green-800" },
  yellow: { label: "YELLOW", dot: "bg-yellow-400", border: "border-yellow-200", softBg: "bg-yellow-50", text: "text-yellow-900" },
  red: { label: "RED", dot: "bg-red-500", border: "border-red-200", softBg: "bg-red-50", text: "text-red-800" },
};

/* =========================
   SYSTEM WARM-UP (Stage 4)
========================= */

const SYSTEM_WARMUP = [
  "Glutes x2 — mini-band glute walk 2×10 + hip bridge 2×8",
  "Split Squat ISO: 5 sek × 3 / hlið (max intent)",
  "Hamstring ISO: 10 sek × 2",
  "Adductor ISO: 10 sek × 2 (ef þörf)",
  "Pallof press: 10/10 + reactive 5×/hlið",
];

/* =========================
   HELPERS
========================= */

function normalizeReadiness(s: string | null) {
  return (s ?? "").toUpperCase().trim().replace(/\s+/g, "_");
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
  return v.replace(/^[🟢🟡🔴🟩🟨🟥🟦🟧🟪⚫⚪🟣🟤]+/u, "").replace(/^[•\-\\—]+/u, "").trim();
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
        const title = String(b.title ?? b.heading ?? b.name ?? b.block ?? "").trim() || "—";
        const bulletsRaw = b.items ?? b.bullets ?? b.lines ?? b.points ?? [];
        const bullets = Array.isArray(bulletsRaw) ? bulletsRaw.map((x: any) => String(x).trim()).filter(Boolean) : [];
        return bullets.length ? { title, bullets } : null;
      })
      .filter(Boolean) as Array<{ title: string; bullets: string[] }>;
  }

  if (typeof struct === "string") {
    const bullets = struct.split("\n").map((x) => x.trim()).filter(Boolean);
    return bullets.length ? [{ title: "Æfing", bullets }] : [];
  }

  return [];
}

function variantLabelToABC(v: string | null): "A" | "B" | "C" | null {
  const s = (v ?? "").toUpperCase().trim();
  if (s === "A") return "A";
  if (s === "B") return "B";
  if (s === "C") return "C";
  return null;
}

function colorKeyToReadinessLevelForTemplates(ck: ColorKey): "GREEN_PLUS" | "GREEN" | "YELLOW" | "RED" {
  if (ck === "green_plus") return "GREEN_PLUS";
  if (ck === "green") return "GREEN";
  if (ck === "yellow") return "YELLOW";
  return "RED";
}

function readinessOrderKey(rl: string) {
  const r = normalizeReadiness(rl);
  if (r === "GREEN_PLUS") return 1;
  if (r === "GREEN") return 2;
  if (r === "YELLOW") return 3;
  return 4; // RED last
}

function mdOrderKey(md: string) {
  // Keep deterministic order in dropdown
  // GENERIC, MD, MD-4, MD-3, MD-2, MD-1, MD0, MD+1, MD+2 ...
  // But if your system uses different strings, this still sorts reasonably.
  const s = (md ?? "").toUpperCase().trim();
  if (s === "GENERIC") return -100;
  if (s === "MD") return -50;

  // Try parse MD-#
  const m1 = s.match(/^MD-(\d+)$/);
  if (m1) return -Number(m1[1]); // MD-4 first (more negative)

  if (s === "MD0") return 0;

  const m2 = s.match(/^MD\+(\d+)$/);
  if (m2) return Number(m2[1]); // MD+1, MD+2...

  return 999;
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

  // ✅ rotate within each readiness column (A/B/C if multiple rows exist)
  const [variantIndex, setVariantIndex] = useState<Record<ColorKey, number>>({
    green_plus: 0,
    green: 0,
    yellow: 0,
    red: 0,
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ✅ md_day dropdown
  const [mdDayOptions, setMdDayOptions] = useState<string[]>([]);
  const [selectedMdDay, setSelectedMdDay] = useState<string | null>(sp.get("md") || null);
  const [mdTouched, setMdTouched] = useState(false);

  // ✅ templates fetched for selected md_day
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  /* =========================
     URL SYNC
  ========================= */

  useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", mode);
    params.set("autorotate", autorotate ? "1" : "0");
    params.set("interval", String(intervalSec));
    if (selectedMdDay) params.set("md", selectedMdDay);
    router.replace(`/coach/display?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, autorotate, intervalSec, selectedMdDay]);

  useEffect(() => {
    if (!autorotate) return;
    const t = setInterval(() => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]), intervalSec * 1000);
    return () => clearInterval(t);
  }, [autorotate, intervalSec]);

  // ✅ rotate variants inside each color (A/B/C)
  useEffect(() => {
    if (!autorotate) return;

    const t = setInterval(() => {
      setVariantIndex((prev) => {
        const next: Record<ColorKey, number> = { ...prev };
        // len is computed later from finalVariantsByColor, so we keep safe increment here
        for (const ck of MODES) next[ck] = (prev[ck] + 1) % 99;
        return next;
      });
    }, intervalSec * 1000);

    return () => clearInterval(t);
  }, [autorotate, intervalSec]);

  /* =========================
     LOAD MD OPTIONS
  ========================= */

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("microdose_templates").select("md_day").not("md_day", "is", null);
        if (error) throw error;

        const set = new Set<string>();
        for (const r of (data ?? []) as Array<{ md_day: string | null }>) if (r.md_day) set.add(String(r.md_day));

        const list = Array.from(set).sort((a, b) => mdOrderKey(a) - mdOrderKey(b));
        setMdDayOptions(list);

        // choose default if none selected
        if (!mdTouched && !selectedMdDay && list.length) {
          // prefer MD-3 if exists, else first
          const def = list.includes("MD-3") ? "MD-3" : list[0];
          setSelectedMdDay(def);
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     LOAD TEMPLATES FOR MD
  ========================= */

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const md = selectedMdDay ?? (mdDayOptions.includes("MD-3") ? "MD-3" : mdDayOptions[0] ?? null);
      if (!md) {
        setTemplates([]);
        setLastUpdated(new Date());
        return;
      }

      const { data, error } = await supabase
        .from("microdose_templates")
        .select("md_day, readiness_level, title, description, structure, variant")
        .eq("md_day", md);

      if (error) throw error;

      const rows = (data ?? []) as TemplateRow[];

      // Sort for deterministic selection (readiness then variant)
      rows.sort((a, b) => {
        const ra = readinessOrderKey(a.readiness_level ?? "");
        const rb = readinessOrderKey(b.readiness_level ?? "");
        if (ra !== rb) return ra - rb;

        const va = (variantLabelToABC(a.variant) ?? "A").charCodeAt(0);
        const vb = (variantLabelToABC(b.variant) ?? "A").charCodeAt(0);
        return va - vb;
      });

      setTemplates(rows);
      setLastUpdated(new Date());
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMdDay]);

  /* =========================
     BUILD VARIANTS PER COLOR
  ========================= */

  const variantsByColor = useMemo(() => {
    const out: Record<ColorKey, VariantCard[]> = { green_plus: [], green: [], yellow: [], red: [] };

    for (const ck of MODES) {
      const rl = colorKeyToReadinessLevelForTemplates(ck);

      const rows = templates.filter((t) => normalizeReadiness(t.readiness_level) === rl);

      // map into A/B/C by variant if present, else by index
      const byLabel = new Map<"A" | "B" | "C", VariantCard>();
      const fallbackLabels: Array<"A" | "B" | "C"> = ["A", "B", "C"];

      rows.forEach((r, idx) => {
        const abc = variantLabelToABC(r.variant) ?? fallbackLabels[idx] ?? "A";
        if (byLabel.has(abc)) return; // keep first per label
        byLabel.set(abc, {
          label: abc,
          md_day: r.md_day ?? selectedMdDay ?? null,
          readiness_level: rl,
          title: stripLeadingColorEmoji(String(r.title ?? "—")) || "—",
          description: String(r.description ?? ""),
          structure: r.structure ?? null,
        });
      });

      out[ck] = (["A", "B", "C"] as const).map((k) => byLabel.get(k)).filter(Boolean) as VariantCard[];
    }

    return out;
  }, [templates, selectedMdDay]);

  // ✅ choose the currently shown variant per color
  const currentVariantByColor = useMemo(() => {
    const out: Record<ColorKey, VariantCard | null> = { green_plus: null, green: null, yellow: null, red: null };

    for (const ck of MODES) {
      const list = variantsByColor[ck] ?? [];
      if (!list.length) {
        out[ck] = null;
        continue;
      }
      const idxRaw = variantIndex[ck] ?? 0;
      const idx = idxRaw % list.length;
      out[ck] = list[idx];
    }

    return out;
  }, [variantsByColor, variantIndex]);

  // keep variantIndex in range when lists change
  useEffect(() => {
    setVariantIndex((prev) => {
      const next: Record<ColorKey, number> = { ...prev };
      for (const ck of MODES) {
        const len = (variantsByColor[ck] ?? []).length;
        if (len <= 1) next[ck] = 0;
        else next[ck] = (prev[ck] ?? 0) % len;
      }
      return next;
    });
  }, [variantsByColor]);

  const prevMode = () => setMode((m) => MODES[(MODES.indexOf(m) - 1 + MODES.length) % MODES.length]);
  const nextMode = () => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);

  const buildId = useMemo(() => {
    const md = selectedMdDay ?? "—";
    const ts = lastUpdated ? lastUpdated.toLocaleTimeString("is-IS") : "—";
    const rows = templates.length;
    return `Build: TV_TEMPLATES_${md} • Rows: ${rows} • Updated: ${ts}`;
  }, [selectedMdDay, lastUpdated, templates.length]);

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-3xl font-semibold">Æfingar dagsins</div>
          <div className="mt-1 text-xs text-muted-foreground">{buildId}</div>

          <div className="text-sm text-muted-foreground">
            Highlight: {colorUi[mode].label} • Interval: {intervalSec}s{selectedMdDay ? ` • MD: ${selectedMdDay}` : ""}
          </div>

          {err ? <div className="text-sm text-red-600 mt-1">Error: {err}</div> : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">MD</label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={selectedMdDay ?? ""}
              onChange={(e) => {
                setSelectedMdDay(e.target.value || null);
                setMdTouched(true);
              }}
            >
              <option value="" disabled>
                Veldu MD-day
              </option>
              {mdDayOptions.map((md) => (
                <option key={md} value={md}>
                  {md}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={prevMode}>◀</Button>
          <Button onClick={nextMode}>▶</Button>

          <Button variant={autorotate ? "default" : "secondary"} onClick={() => setAutorotate((v) => !v)}>
            Auto
          </Button>

          <Button onClick={() => setIntervalSec(intervalSec === 12 ? 8 : intervalSec === 8 ? 15 : 12)}>{intervalSec}s</Button>

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

          const v = currentVariantByColor[ck];
          const all = variantsByColor[ck] ?? [];
          const blocks = v ? normalizeBlocks(v.structure) : [];

          return (
            <Card
              key={ck}
              className={["rounded-2xl border-2 transition", ui.border, isActive ? "ring-2 ring-black/20" : "opacity-95"].join(" ")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${ui.dot}`} />
                    <span>{ui.label}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {selectedMdDay ? `MD: ${selectedMdDay}` : "MD: —"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {v ? `Variant ${v.label}` : "Variant —"}
                    </Badge>
                  </div>
                </CardTitle>

                <CardDescription className="text-xs">
                  {loading ? "Loading…" : v?.description || (all.length ? " " : "Engin uppsetning fyrir þennan lit á þessu MD-day.")}
                </CardDescription>
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

                {/* ✅ System warm-up always visible */}
                <div className={`rounded-xl border ${ui.border} ${ui.softBg} p-3 text-[12.5px] ${ui.text}`}>
                  <div className="font-semibold">0. System Warm-up (always)</div>
                  <ul className="mt-1 list-disc pl-5 space-y-0.5">
                    {SYSTEM_WARMUP.map((x, i) => (
                      <li key={`${ck}-syswarmup-${i}`} className="leading-tight">
                        {x}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-[11.5px] opacity-80">Samræmi & öryggi — óháð readiness/variantum.</div>
                </div>

                {!v ? (
                  <div className="text-sm text-muted-foreground">
                    Engin template fannst fyrir <b>{ui.label}</b> á <b>{selectedMdDay ?? "—"}</b>.
                  </div>
                ) : (
                  <div className="rounded-xl border bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full ${ui.dot}`} />
                          <div className="text-base font-semibold leading-tight truncate">{stripLeadingColorEmoji(v.title || "—")}</div>
                        </div>
                        <div className="text-[12px] text-muted-foreground leading-tight">
                          ({selectedMdDay ?? "—"} • {ui.label} • Variant {v.label})
                        </div>
                      </div>

                      {all.length > 1 ? <Badge variant="secondary">{all.length} variants</Badge> : <Badge variant="outline">1 variant</Badge>}
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
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}