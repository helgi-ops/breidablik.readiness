"use client";

/**
 * Coach view — Strength build RULES editor.
 *
 * Where the strength coach sets HOW the build is structured: the scheme per meso block × season phase
 * (quality / %1RM zone / set×rep scheme / exercise setups / cite) and the phase config (intensity /
 * verdict). Each field is a PICK-LIST of the evidence-based options (with a "Custom…" escape to type
 * your own); blank = the default (shown greyed). Exercise setups (French contrast, contrast, …) are a
 * multi-select — a block can carry more than one. The engine merges these over the defaults, so an
 * un-customised cell stays exactly as today. Descriptive planning — never the readiness colour.
 *
 * Mounts standalone and inside /coach/strength-hub?tab=rules (one source).
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";
import {
  strengthForBlockGoal,
  strengthConfigForPhase,
  ZONE_OPTIONS,
  SCHEME_OPTIONS,
  QUALITY_OPTIONS,
  INTENSITY_OPTIONS,
  VERDICT_OPTIONS,
  type BlockGoalKey,
  type SeasonPhaseKey,
  type CoachStrengthRules,
  type CoachBlockRule,
  type CoachPhaseRule,
} from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";

const BLOCK_GOALS: BlockGoalKey[] = ["accum", "transmute", "realize", "deload"];
const BLOCK_PHASES: SeasonPhaseKey[] = ["preseason", "competitive"];
const CONFIG_PHASES: SeasonPhaseKey[] = ["preseason", "competitive", "offseason"];
const GOAL_LABEL: Record<BlockGoalKey, string> = { accum: "Accumulation", transmute: "Transmutation", realize: "Realization", deload: "Deload" };
const PHASE_LABEL: Record<SeasonPhaseKey, { EN: string; IS: string }> = {
  preseason: { EN: "Pre-season", IS: "Undirbúningur" },
  competitive: { EN: "In-season", IS: "Keppnistímabil" },
  offseason: { EN: "Off-season", IS: "Frítímabil" },
};

type Bi = { en: string; is: string };
type BiOverride = { en?: string; is?: string };

// Read-only context fetched from the Team palette (owned + edited on the Today & send tab).
// Shown here so the coach sees WHICH exercises + methods a scheme applies to while authoring it —
// without a second editor (one source, one editor). Shapes mirror GET /api/coach/team/strength-palette.
type SlotOption = { id: string; nameEN: string; nameIS: string };
type SlotGroup = { slot: string; label: Bi; options: SlotOption[] };
type StructureGroup = { md: string; defaultKey: string | null; options: { key: string; label: Bi }[] };
type PaletteContext = {
  slots: Record<string, string[]>;
  slotOptions: SlotGroup[];
  mdStructures: Record<string, string>;
  structureOptions: StructureGroup[];
};

async function authHeader(): Promise<string> {
  const sb = getSupabaseClient();
  return `Bearer ${(await sb.auth.getSession()).data.session?.access_token ?? ""}`;
}

export default function StrengthRulesPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [rules, setRules] = React.useState<CoachStrengthRules>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Read-only palette/method context (edited on the Today & send tab) — never blocks the editor.
  const [ctx, setCtx] = React.useState<PaletteContext | null>(null);
  const [ctxOpen, setCtxOpen] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/team/strength-rules", { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => null);
        if (alive && res.ok && j?.ok) setRules((j.rules ?? {}) as CoachStrengthRules);
        else if (alive && !res.ok) setErr(j?.error ?? "error");
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Fetch the team palette + per-MD methods for the read-only context panel. Best-effort:
  // a failure just hides the panel (the rules editor is unaffected).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/team/strength-palette", { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => null);
        if (alive && res.ok && j?.ok) {
          setCtx({
            slots: (j.slots ?? {}) as Record<string, string[]>,
            slotOptions: (j.slotOptions ?? []) as SlotGroup[],
            mdStructures: (j.mdStructures ?? {}) as Record<string, string>,
            structureOptions: (j.structureOptions ?? []) as StructureGroup[],
          });
        }
      } catch { /* non-blocking */ }
    })();
    return () => { alive = false; };
  }, []);

  // Prune empty fields/cells so the stored map stays sparse.
  const pruneBi = (b?: BiOverride): BiOverride | undefined => {
    const en = b?.en?.trim() || undefined; const is = b?.is?.trim() || undefined;
    return en || is ? { ...(en ? { en } : {}), ...(is ? { is } : {}) } : undefined;
  };
  const setBlockField = (key: string, field: keyof CoachBlockRule, val: BiOverride | string | undefined) => {
    setSaved(false);
    setRules((prev) => {
      const block = { ...(prev.block ?? {}) };
      const cell: CoachBlockRule = { ...(block[key] ?? {}) };
      if (field === "cite") { const s = typeof val === "string" ? val.trim() : ""; if (s) cell.cite = s; else delete cell.cite; }
      else if (field === "mode") { const s = typeof val === "string" ? val : ""; if (s === "traditional") cell.mode = "traditional"; else if (s === "microdose") cell.mode = "microdose"; else delete cell.mode; }
      else { const p = pruneBi(val as BiOverride); if (p) (cell as Record<string, unknown>)[field] = p; else delete (cell as Record<string, unknown>)[field]; }
      if (Object.keys(cell).length) block[key] = cell; else delete block[key];
      return { ...prev, block };
    });
  };
  const setPhaseField = (phase: SeasonPhaseKey, field: keyof CoachPhaseRule, val: BiOverride | undefined) => {
    setSaved(false);
    setRules((prev) => {
      const phaseMap = { ...(prev.phase ?? {}) } as Record<string, CoachPhaseRule>;
      const cell: CoachPhaseRule = { ...(phaseMap[phase] ?? {}) };
      const p = pruneBi(val); if (p) (cell as Record<string, unknown>)[field] = p; else delete (cell as Record<string, unknown>)[field];
      if (Object.keys(cell).length) phaseMap[phase] = cell; else delete phaseMap[phase];
      return { ...prev, phase: phaseMap };
    });
  };
  const resetBlockCell = (key: string) => { setSaved(false); setRules((p) => { const block = { ...(p.block ?? {}) }; delete block[key]; return { ...p, block }; }); };
  const resetPhaseCell = (phase: SeasonPhaseKey) => { setSaved(false); setRules((p) => { const phaseMap = { ...(p.phase ?? {}) } as Record<string, CoachPhaseRule>; delete phaseMap[phase]; return { ...p, phase: phaseMap }; }); };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/coach/team/strength-rules", {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
        body: JSON.stringify({ rules }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) setSaved(true); else setErr(j?.error ?? "error");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  // A pick-list for one bilingual field. Options are the evidence-based values; "Default" inherits,
  // "Custom…" reveals EN+IS text inputs so the coach is never locked out. Selecting an option stores
  // both languages at once.
  const BiSelect = ({ label, def, value, options, onChange }: {
    label: string; def: Bi; value?: BiOverride; options: Bi[]; onChange: (v: BiOverride | undefined) => void;
  }) => {
    const matchIdx = value ? options.findIndex((o) => o.en === value.en && o.is === value.is) : -1;
    const isCustom = !!value && matchIdx === -1;
    const sel = !value ? "default" : isCustom ? "custom" : String(matchIdx);
    const onSelect = (v: string) => {
      if (v === "default") return onChange(undefined);
      if (v === "custom") return onChange({ en: value?.en ?? def.en, is: value?.is ?? def.is });
      const o = options[Number(v)]; if (o) onChange({ en: o.en, is: o.is });
    };
    return (
      <div className="mt-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <select
          value={sel}
          onChange={(e) => onSelect(e.target.value)}
          className={`mt-0.5 w-full rounded border px-2 py-1 text-[12px] ${value ? "border-[#2740e6]/50 bg-white text-slate-900" : "border-slate-300 bg-slate-50 text-slate-500"}`}
        >
          <option value="default">{(isEN ? "Default — " : "Sjálfgefið — ") + (isEN ? def.en : def.is)}</option>
          {options.map((o, i) => (<option key={i} value={String(i)}>{isEN ? o.en : o.is}</option>))}
          <option value="custom">{isEN ? "Custom…" : "Sérsniðið…"}</option>
        </select>
        {isCustom && (
          <>
            <input
              value={value?.en ?? ""} placeholder={def.en}
              onChange={(e) => onChange({ ...value, en: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-[12px] placeholder:text-slate-400"
            />
            <input
              value={value?.is ?? ""} placeholder={def.is}
              onChange={(e) => onChange({ ...value, is: e.target.value })}
              className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 placeholder:text-slate-400"
            />
          </>
        )}
      </div>
    );
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">{isEN ? "Loading…" : "Hleð…"}</div>;

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-slate-900">{isEN ? "Build rules" : "Uppbyggingar-reglur"}</h1>
          <p className="mt-0.5 text-[12px] text-slate-500">{isEN ? "Set how the strength build is structured. Each field is a pick-list of evidence-based options (or Custom…); blank = the default (shown greyed). The system reads readiness + the microcycle and applies your rules." : "Stilltu hvernig styrktaruppbyggingin er byggð. Hver reitur er fellilisti af gagnreyndum valkostum (eða Sérsniðið…); autt = sjálfgefið (sýnt grátt). Kerfið les readiness + míkró-lotuna og beitir þínum reglum."}</p>
        </div>
        <div className="flex items-center gap-2">
          <CoachTutorialButton slug="strength-build" />
          {saved && <span className="text-[12px] font-semibold text-emerald-600">{isEN ? "✓ Saved" : "✓ Vistað"}</span>}
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#1e34c0] disabled:opacity-50">
            {saving ? (isEN ? "Saving…" : "Vista…") : (isEN ? "Save rules" : "Vista reglur")}
          </button>
        </div>
      </div>
      {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</div>}

      {/* Read-only build context: WHICH exercises (team palette) + the per-MD METHOD these rules apply
          to. Authoring stays on the Today & send tab (one editor); this panel is a reference only, so the
          coach sees the scheme's targets without leaving the page. */}
      {ctx && (() => {
        const anyExercises = ctx.slotOptions.some((g) => (ctx.slots[g.slot] ?? []).length > 0);
        const anyMethods = ctx.structureOptions.some((g) => ctx.mdStructures[g.md]);
        if (!anyExercises && !anyMethods) return null;
        const nameOf = (g: SlotGroup, id: string) => {
          const o = g.options.find((x) => x.id === id);
          return o ? (isEN ? o.nameEN : o.nameIS) : id;
        };
        return (
          <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <button onClick={() => setCtxOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                <span className={`inline-block text-slate-400 transition-transform ${ctxOpen ? "rotate-90" : ""}`}>▸</span>
                {isEN ? "What these rules apply to" : "Hvað reglurnar eiga við"}
              </span>
              <span className="text-[10px] text-slate-400">{isEN ? "Edit on Today & send" : "Breytt á Í dag & senda"}</span>
            </button>
            {!ctxOpen && (
              <p className="mt-1 pl-5 text-[11px] text-slate-500">
                {isEN
                  ? "The exercise pool and per-day method your schemes run on — read-only here."
                  : "Æfinga-poolið og aðferð per dag sem kerfin þín keyra á — skrifvarið hér."}
              </p>
            )}
            {ctxOpen && (
              <div className="mt-2 grid gap-3 pl-5 sm:grid-cols-2">
                {/* Exercise pool (team palette) */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{isEN ? "Exercise pool (palette)" : "Æfinga-pool (palette)"}</div>
                  {anyExercises ? (
                    <ul className="mt-1 space-y-1">
                      {ctx.slotOptions.map((g) => {
                        const ids = ctx.slots[g.slot] ?? [];
                        if (!ids.length) return null;
                        return (
                          <li key={g.slot} className="text-[11px] leading-snug">
                            <span className="font-semibold text-slate-600">{isEN ? g.label.en : g.label.is}:</span>{" "}
                            <span className="text-slate-500">{ids.map((id) => nameOf(g, id)).join(", ")}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">{isEN ? "No palette set — the engine uses the full eligible library." : "Ekkert palette sett — vélin notar allt gjaldgenga safnið."}</p>
                  )}
                </div>
                {/* Per-MD method */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{isEN ? "Method per MD day" : "Aðferð per MD dag"}</div>
                  {anyMethods ? (
                    <ul className="mt-1 space-y-1">
                      {ctx.structureOptions.map((g) => {
                        const key = ctx.mdStructures[g.md];
                        if (!key) return null;
                        const opt = g.options.find((o) => o.key === key);
                        const text = key === "rest" ? (isEN ? "Off / rest" : "Off / hvíld") : opt ? (isEN ? opt.label.en : opt.label.is) : key;
                        return (
                          <li key={g.md} className="text-[11px] leading-snug">
                            <span className="font-semibold text-slate-600">{g.md}:</span>{" "}
                            <span className={key === "rest" ? "text-slate-400" : "text-slate-500"}>{text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">{isEN ? "No per-day method set — each MD day uses its default." : "Engin aðferð sett per dag — hver MD dagur notar sjálfgefið."}</p>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* Block × phase scheme cells */}
      <h2 className="mt-5 text-sm font-semibold text-slate-900">{isEN ? "Block schemes (block goal × phase)" : "Blokk-kerfi (block-goal × fasi)"}</h2>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
        {BLOCK_PHASES.flatMap((phase) => BLOCK_GOALS.map((goal) => {
          const key = `${goal}:${phase}`;
          const def = strengthForBlockGoal(goal, phase);
          const cell = rules.block?.[key];
          const customised = !!cell && Object.keys(cell).length > 0;
          return (
            <div key={key} className={`rounded-xl border p-3 ${customised ? "border-[#2740e6]/40 bg-[#2740e6]/5" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-slate-900">{GOAL_LABEL[goal]} · {isEN ? PHASE_LABEL[phase].EN : PHASE_LABEL[phase].IS}</span>
                {customised && <button onClick={() => resetBlockCell(key)} className="text-[10px] font-semibold text-[#a83e28] hover:underline">{isEN ? "Reset" : "Endurstilla"}</button>}
              </div>
              <BiSelect label={isEN ? "% 1RM zone" : "% 1RM svæði"} def={def.pct1rm} value={cell?.pct1rm} options={ZONE_OPTIONS} onChange={(v) => setBlockField(key, "pct1rm", v)} />
              <BiSelect label={isEN ? "Set × rep scheme" : "Set × rep kerfi"} def={def.scheme} value={cell?.scheme} options={SCHEME_OPTIONS} onChange={(v) => setBlockField(key, "scheme", v)} />
              <BiSelect label={isEN ? "Quality" : "Gæði"} def={def.quality} value={cell?.quality} options={QUALITY_OPTIONS} onChange={(v) => setBlockField(key, "quality", v)} />
              <div className="mt-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{isEN ? "Weekly approach" : "Háttur vikunnar"}</div>
                <select
                  value={cell?.mode ?? "microdose"}
                  onChange={(e) => setBlockField(key, "mode", e.target.value)}
                  className={`mt-0.5 w-full rounded border px-2 py-1 text-[12px] ${cell?.mode ? "border-[#2740e6]/50 bg-white text-slate-900" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                >
                  <option value="microdose">{isEN ? "Micro-dose — spread across the week (default)" : "Micro-dose — dreift yfir vikuna (sjálfgefið)"}</option>
                  <option value="traditional">{isEN ? "Traditional — concentrate on 1–2 lift days, rest Off" : "Hefðbundið — einbeitt á 1–2 lyftidaga, aðrir Off"}</option>
                </select>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{isEN ? "Traditional? Pick the lift days and mark the rest Off on the Today & send tab (per MD day)." : "Hefðbundið? Veldu lyftidagana og merktu aðra Off á Í dag & senda flipanum (per MD-dag)."}</p>
              </div>
              <div className="mt-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{isEN ? "Citation (optional)" : "Tilvísun (valkvætt)"}</div>
                <input value={cell?.cite ?? ""} placeholder={def.cite} onChange={(e) => setBlockField(key, "cite", e.target.value)} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 placeholder:text-slate-400" />
              </div>
            </div>
          );
        }))}
      </div>

      {/* Phase config cells */}
      <h2 className="mt-5 text-sm font-semibold text-slate-900">{isEN ? "Phase goals" : "Fasa-markmið"}</h2>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
        {CONFIG_PHASES.map((phase) => {
          const def = strengthConfigForPhase(phase);
          const cell = rules.phase?.[phase];
          const customised = !!cell && Object.keys(cell).length > 0;
          return (
            <div key={phase} className={`rounded-xl border p-3 ${customised ? "border-[#2740e6]/40 bg-[#2740e6]/5" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-slate-900">{isEN ? PHASE_LABEL[phase].EN : PHASE_LABEL[phase].IS}</span>
                {customised && <button onClick={() => resetPhaseCell(phase)} className="text-[10px] font-semibold text-[#a83e28] hover:underline">{isEN ? "Reset" : "Endurstilla"}</button>}
              </div>
              <BiSelect label={isEN ? "Intensity / zone" : "Ákefð / svæði"} def={def.intensity} value={cell?.intensity} options={INTENSITY_OPTIONS} onChange={(v) => setPhaseField(phase, "intensity", v)} />
              <BiSelect label={isEN ? "Goal (one line)" : "Markmið (ein lína)"} def={def.verdict} value={cell?.verdict} options={VERDICT_OPTIONS} onChange={(v) => setPhaseField(phase, "verdict", v)} />
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] text-slate-400">{isEN ? "Descriptive planning layer — these rules shape the generated session content; they never set the readiness colour or the daily decision. Readiness still only eases the dose." : "Lýsandi skipulagslag — þessar reglur móta æfingarnar sem eru búnar til; þær setja aldrei readiness-litinn eða daglegu ákvörðunina. Readiness mildar áfram aðeins skammtinn."}</p>
    </div>
  );
}
