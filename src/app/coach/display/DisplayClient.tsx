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

type PlayerStatusRow = {
  full_name: string | null;
  final_color: string | null;
  final_flag: string | null;
};

type TemplateSetOption = {
  label: string;        // display name
  table_name: string;   // "microdose_templates" or custom slug
  md_days: string[];    // available MD days
  season_phase: string | null;
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

function mapPlayerStatusToColorKey(input: { final_color?: string | null; final_flag?: string | null }): ColorKey | null {
  const color = String(input.final_color ?? "").toLowerCase().trim();
  const byFlag = mapReadinessToColorKey(input.final_flag ?? null);
  if (byFlag) return byFlag;
  if (color === "green_plus") return "green_plus";
  if (color === "green") return "green";
  if (color === "yellow") return "yellow";
  if (color === "red") return "red";
  return null;
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
  const [teamId, setTeamId] = useState<string | null>(null);

  // ✅ md_day dropdown
  const [mdDayOptions, setMdDayOptions] = useState<string[]>([]);
  const [selectedMdDay, setSelectedMdDay] = useState<string | null>(sp.get("md") || null);
  const [mdTouched, setMdTouched] = useState(false);

  // ✅ template set selection (custom sets from custom_template_sets)
  const [templateSets, setTemplateSets] = useState<TemplateSetOption[]>([]);
  const [selectedSetIdx, setSelectedSetIdx] = useState<number>(0);

  // ✅ templates fetched for selected md_day
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [playersToday, setPlayersToday] = useState<PlayerStatusRow[]>([]);

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
     LOAD TEAM ID
  ========================= */

  useEffect(() => {
    (async () => {
      const { data: uRes } = await supabase.auth.getUser();
      if (!uRes.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", uRes.user.id)
        .maybeSingle();
      if ((prof as any)?.team_id) setTeamId((prof as any).team_id);
    })();
  }, []);

  /* =========================
     LOAD TEMPLATE SETS + MD OPTIONS
  ========================= */

  useEffect(() => {
    if (!teamId) return;
    (async () => {
      try {
        // 1) Custom template sets for this team
        const { data: setsData } = await supabase
          .from("custom_template_sets")
          .select("set_name, table_name, md_days, season_phase, sport, gender")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });

        // 2) Default microdose_templates md_days
        const { data: defaultData } = await supabase
          .from("microdose_templates")
          .select("md_day")
          .eq("team_id", teamId)
          .not("md_day", "is", null);

        const defaultMdDays = Array.from(
          new Set<string>(
            (defaultData ?? []).flatMap((r: any) => (r.md_day ? [String(r.md_day)] : []))
          )
        ).sort((a, b) => mdOrderKey(a) - mdOrderKey(b));

        // Build options list: default first, then custom sets
        const options: TemplateSetOption[] = [];
        if (defaultMdDays.length) {
          options.push({ label: "Sjálfgefið", table_name: "microdose_templates", md_days: defaultMdDays, season_phase: null });
        }
        for (const s of (setsData ?? []) as Array<any>) {
          const mdDays = (Array.isArray(s.md_days) ? s.md_days : []).sort((a: string, b: string) => mdOrderKey(a) - mdOrderKey(b));
          const phase = s.season_phase ? ` (${s.season_phase})` : "";
          options.push({ label: `${s.set_name}${phase}`, table_name: s.table_name, md_days: mdDays, season_phase: s.season_phase });
        }

        setTemplateSets(options);

        // Activate first set and its md_days
        const firstSet = options[0];
        if (firstSet) {
          setMdDayOptions(firstSet.md_days);
          if (!mdTouched && !selectedMdDay && firstSet.md_days.length) {
            const def = firstSet.md_days.includes("MD-3") ? "MD-3" : firstSet.md_days[0];
            setSelectedMdDay(def);
          }
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

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

      const activeSet = templateSets[selectedSetIdx];
      const tableName = activeSet?.table_name ?? "microdose_templates";

      const query = supabase
        .from(tableName as any)
        .select("md_day, readiness_level, title, description, structure, variant")
        .eq("md_day", md);

      // microdose_templates is team-scoped; custom tables store team_id too
      const { data, error } = await query.eq("team_id", teamId);

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

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayKey = `${yyyy}-${mm}-${dd}`;

      const { data: playerData, error: playerErr } = await supabase
        .from("v_coach_readiness_today_v8")
        .select("full_name, final_color, final_flag")
        .eq("entry_date", todayKey)
        .order("full_name", { ascending: true });

      if (!playerErr) {
        setPlayersToday((playerData ?? []) as PlayerStatusRow[]);
      } else {
        setPlayersToday([]);
      }

      setLastUpdated(new Date());
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
      setTemplates([]);
      setPlayersToday([]);
    } finally {
      setLoading(false);
    }
  }

  // When selected set changes: update md_days and reset md selection
  useEffect(() => {
    const activeSet = templateSets[selectedSetIdx];
    if (!activeSet) return;
    const days = activeSet.md_days;
    setMdDayOptions(days);
    // Reset to a sensible default for this set
    const def = days.includes("MD-3") ? "MD-3" : days[0] ?? null;
    setSelectedMdDay(def);
    setMdTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSetIdx, templateSets]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMdDay, selectedSetIdx]);

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
    const setLabel = templateSets[selectedSetIdx]?.label ?? "—";
    return `${setLabel} • ${md} • ${rows} færslur • ${ts}`;
  }, [selectedMdDay, lastUpdated, templates.length, templateSets, selectedSetIdx]);

  const playersByColor = useMemo(() => {
    const groups: Record<ColorKey, string[]> = {
      green_plus: [],
      green: [],
      yellow: [],
      red: [],
    };
    for (const row of playersToday) {
      const ck = mapPlayerStatusToColorKey(row);
      if (!ck) continue;
      const name = String(row.full_name ?? "").trim();
      if (!name) continue;
      groups[ck].push(name);
    }
    return groups;
  }, [playersToday]);

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
          {templateSets.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Kerfi</label>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm max-w-[200px]"
                value={selectedSetIdx}
                onChange={(e) => setSelectedSetIdx(Number(e.target.value))}
              >
                {templateSets.map((s, i) => (
                  <option key={s.table_name} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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

      <Card className="mb-4 border border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Players Today</CardTitle>
          <CardDescription className="text-xs">Readiness color list for current day</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {MODES.map((ck) => {
              const ui = colorUi[ck];
              const list = playersByColor[ck] ?? [];
              return (
                <div key={`players-${ck}`} className={`rounded-xl border ${ui.border} ${ui.softBg} p-2.5`}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className={`h-2.5 w-2.5 rounded-full ${ui.dot}`} />
                      <span>{ui.label}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {list.length}
                    </Badge>
                  </div>
                  <div className="max-h-36 overflow-auto pr-1">
                    {list.length ? (
                      <ul className="space-y-0.5 text-[11px] leading-tight">
                        {list.map((name) => (
                          <li key={`${ck}-${name}`} className="truncate">
                            {name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">No players</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
