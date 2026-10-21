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
  // Which phase's block schemes are shown, and where the team is NOW (phase + block) — best-effort read
  // of the same periodization endpoint the Daily session uses, so the current row is marked.
  const [blockPhase, setBlockPhase] = React.useState<SeasonPhaseKey>("competitive");
  const [nowPhase, setNowPhase] = React.useState<SeasonPhaseKey | null>(null);
  const [nowBlock, setNowBlock] = React.useState<{ goal: BlockGoalKey; phase: SeasonPhaseKey } | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/strength-periodization", { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => null);
        if (!alive || !res.ok || !j?.ok) return;
        const ph = j.phase as SeasonPhaseKey | undefined;
        if (ph === "preseason" || ph === "competitive" || ph === "offseason") { setNowPhase(ph); if (ph === "preseason") setBlockPhase("preseason"); }
        const cb = j.currentBlock as { goalKey?: string; blockPhase?: string } | null;
        if (cb?.goalKey && (BLOCK_GOALS as string[]).includes(cb.goalKey)) {
          const bp = cb.blockPhase === "preseason" ? "preseason" : "competitive";
          setNowBlock({ goal: cb.goalKey as BlockGoalKey, phase: bp });
        }
      } catch { /* the "Now" marks are optional */ }
    })();
    return () => { alive = false; };
  }, []);

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
  const BiSelect = ({ label, def, value, options, onChange, compact = false }: {
    label: string; def: Bi; value?: BiOverride; options: Bi[]; onChange: (v: BiOverride | undefined) => void; compact?: boolean;
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
      <div className={compact ? "" : "mt-1.5"}>
        <div className={compact ? "sr-only" : "text-[11px] font-semibold text-slate-600"}>{label}</div>
        <select
          value={sel}
          aria-label={label}
          title={value ? (isEN ? value.en : value.is) : (isEN ? def.en : def.is)}
          onChange={(e) => onSelect(e.target.value)}
          className={`w-full rounded-lg px-2.5 text-[13px] ${compact ? "h-10" : "mt-0.5 py-1.5"} ${value ? "border-2 border-[#2740e6] bg-white font-semibold text-slate-900" : "border border-slate-300 bg-slate-50 text-slate-600"}`}
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] placeholder:text-slate-500"
            />
            <input
              value={value?.is ?? ""} placeholder={def.is}
              onChange={(e) => onChange({ ...value, is: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700 placeholder:text-slate-500"
            />
          </>
        )}
      </div>
    );
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">{isEN ? "Loading…" : "Hleð…"}</div>;

  // How many fields the coach has moved off the defaults (shown in the save bar).
  const changeCount = Object.values(rules.block ?? {}).reduce((n, c) => n + Object.keys(c ?? {}).length, 0)
    + Object.values(rules.phase ?? {}).reduce((n, c) => n + Object.keys(c ?? {}).length, 0);
  const paletteCount = ctx ? Object.values(ctx.slots).reduce((n, ids) => n + (ids?.length ?? 0), 0) : null;
  const methodCount = ctx ? Object.values(ctx.mdStructures).filter(Boolean).length : null;
  const GOAL_COLOR: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
  const GOAL_IS: Record<BlockGoalKey, string> = { accum: "Uppsöfnun", transmute: "Umbreyting", realize: "Framkvæmd", deload: "Niðurtröppun" };
  const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6" style={{ color: "#14181c" }}>
      {/* 1 — SAVE BAR + what these rules apply to */}
      <section className={`${card} flex flex-wrap items-center gap-x-5 gap-y-3`}>
        <div className="min-w-0 flex-[1_1_420px]">
          <h1 className="text-[17px] font-bold text-slate-900">{isEN ? "How the strength build is structured" : "Hvernig styrktaruppbyggingin er byggð"}</h1>
          <p className="text-[12px] text-slate-600">{isEN ? "Each field is a pick-list of evidence-based options (or Custom…). Grey = the default." : "Hver reitur er val úr gagnreyndum kostum (eða „Sérsniðið…“). Grátt = sjálfgefið."}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${changeCount ? "bg-[#2740e6]/10 text-[#1b2da8]" : "bg-slate-100 text-slate-700"}`}>
          {changeCount ? (isEN ? `${changeCount} change${changeCount === 1 ? "" : "s"} from default` : `${changeCount} ${changeCount === 1 ? "breyting" : "breytingar"} frá sjálfgefnu`) : (isEN ? "All default" : "Allt sjálfgefið")}
        </span>
        <CoachTutorialButton slug="strength-build" />
        {saved && <span className="text-[12px] font-semibold text-emerald-700">{isEN ? "✓ Saved" : "✓ Vistað"}</span>}
        <button onClick={save} disabled={saving} className="h-10 rounded-lg bg-[#2740e6] px-4 text-[13px] font-bold text-white hover:bg-[#1e34c0] disabled:opacity-50">
          {saving ? (isEN ? "Saving…" : "Vista…") : (isEN ? "Save rules" : "Vista reglur")}
        </button>
        {ctx && (
          <details className="w-full border-t border-slate-100 pt-3">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] text-slate-700 [&::-webkit-details-marker]:hidden">
              <span className="font-bold">{isEN ? "Applies to:" : "Á við:"}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5">{isEN ? "Exercise palette" : "Æfingasafn"} · {paletteCount ? (isEN ? `${paletteCount} exercises` : `${paletteCount} æfingar`) : (isEN ? "full library" : "allt safnið")}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5">{methodCount ? (isEN ? `Method set on ${methodCount} MD days` : `Aðferð sett á ${methodCount} MD-dögum`) : (isEN ? "Default method per MD day" : "Sjálfgefin aðferð per MD-dag")}</span>
              <span className="font-semibold text-[#2740e6]">{isEN ? "Show ▾" : "Sýna ▾"}</span>
              <a href="/coach/strength-hub?tab=send" className="font-semibold text-[#2740e6] hover:underline">{isEN ? "Edit on Daily session →" : "Breyta á Æfingu dagsins →"}</a>
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-[12px] font-bold text-slate-700">{isEN ? "Exercise pool (palette)" : "Æfinga-pool (palette)"}</div>
                <ul className="mt-1 space-y-1">
                  {ctx.slotOptions.map((g) => {
                    const ids = ctx.slots[g.slot] ?? [];
                    if (!ids.length) return null;
                    return (
                      <li key={g.slot} className="text-[12px] leading-snug">
                        <span className="font-semibold text-slate-700">{isEN ? g.label.en : g.label.is}:</span>{" "}
                        <span className="text-slate-600">{ids.map((id) => { const o = g.options.find((x) => x.id === id); return o ? (isEN ? o.nameEN : o.nameIS) : id; }).join(", ")}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <div className="text-[12px] font-bold text-slate-700">{isEN ? "Method per MD day" : "Aðferð per MD-dag"}</div>
                <ul className="mt-1 space-y-1">
                  {ctx.structureOptions.map((g) => {
                    const key = ctx.mdStructures[g.md];
                    if (!key) return null;
                    const opt = g.options.find((o) => o.key === key);
                    return <li key={g.md} className="text-[12px] leading-snug"><span className="font-semibold text-slate-700">{g.md}:</span> <span className="text-slate-600">{key === "rest" ? (isEN ? "Off / rest" : "Off / hvíld") : opt ? (isEN ? opt.label.en : opt.label.is) : key}</span></li>;
                  })}
                </ul>
              </div>
            </div>
          </details>
        )}
      </section>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</div>}

      {/* 2 — PHASE GOALS (macro first) */}
      <section className={card}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[15px] font-bold text-slate-900">{isEN ? "Phase goals" : "Fasa-markmið"}</h2>
          <span className="text-[12px] text-slate-500">{isEN ? "One line per season phase — shown on the Daily session and in the Periodization Hub." : "Ein lína per fasa tímabilsins — birtist á Æfingu dagsins og í Periodization Hub."}</span>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead><tr className="text-left text-[11px] text-slate-500">
              <th className="w-[160px] py-2 pr-3 font-semibold">{isEN ? "Phase" : "Fasi"}</th>
              <th className="px-2 py-2 font-semibold">{isEN ? "Goal (one line)" : "Markmið (ein lína)"}</th>
              <th className="px-2 py-2 font-semibold">{isEN ? "Intensity / zone" : "Ákefð / svæði"}</th>
              <th className="w-[100px] py-2" />
            </tr></thead>
            <tbody>
              {CONFIG_PHASES.map((phase) => {
                const def = strengthConfigForPhase(phase);
                const cell = rules.phase?.[phase];
                const customised = !!cell && Object.keys(cell).length > 0;
                const now = nowPhase === phase;
                return (
                  <tr key={phase} className={`border-t border-slate-100 align-top ${customised ? "bg-[#2740e6]/[0.04]" : ""}`}>
                    <td className="py-2.5 pr-3 font-bold text-slate-900">
                      {isEN ? PHASE_LABEL[phase].EN : PHASE_LABEL[phase].IS}
                      {now && <span className="ml-1.5 rounded-full bg-[#a83e28]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#a83e28]">{isEN ? "Now" : "Núna"}</span>}
                    </td>
                    <td className="px-2 py-2.5"><BiSelect compact label={isEN ? "Goal" : "Markmið"} def={def.verdict} value={cell?.verdict} options={VERDICT_OPTIONS} onChange={(v) => setPhaseField(phase, "verdict", v)} /></td>
                    <td className="px-2 py-2.5"><BiSelect compact label={isEN ? "Intensity / zone" : "Ákefð / svæði"} def={def.intensity} value={cell?.intensity} options={INTENSITY_OPTIONS} onChange={(v) => setPhaseField(phase, "intensity", v)} /></td>
                    <td className="py-2.5 text-right">{customised && <button onClick={() => resetPhaseCell(phase)} className="h-9 rounded-lg px-2 text-[12px] font-bold text-[#a83e28] hover:bg-[#a83e28]/5">{isEN ? "Reset" : "Endurstilla"}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3 — BLOCK SCHEMES: one phase at a time; the four block goals as rows so they compare down a column */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="min-w-0 flex-[1_1_420px]">
            <h2 className="text-[15px] font-bold text-slate-900">{isEN ? "Block schemes — block goal × phase" : "Blokkakerfi — markmið lotu × fasi"}</h2>
            <p className="text-[12px] text-slate-500">{isEN ? "What each Meso block trains in the gym. Compare the blocks row by row." : "Hvað hver Mesó-lota þjálfar í ræktinni. Berðu loturnar saman lína fyrir línu."}</p>
          </div>
          <div role="radiogroup" aria-label={isEN ? "Phase" : "Fasi"} className="inline-flex overflow-hidden rounded-lg border border-slate-300">
            {BLOCK_PHASES.map((ph) => {
              const n = BLOCK_GOALS.filter((g) => Object.keys(rules.block?.[`${g}:${ph}`] ?? {}).length > 0).length;
              return (
                <button key={ph} type="button" role="radio" aria-checked={blockPhase === ph} onClick={() => setBlockPhase(ph)}
                  className={`h-10 px-4 text-[13px] font-semibold ${blockPhase === ph ? "bg-slate-900 text-white" : "bg-white text-slate-800 hover:bg-slate-50"}`}>
                  {isEN ? PHASE_LABEL[ph].EN : PHASE_LABEL[ph].IS}{n ? ` · ${n}` : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1080px] text-[13px]">
            <thead><tr className="text-left text-[11px] text-slate-500">
              <th className="w-[150px] py-2 pr-3 font-semibold">{isEN ? "Block" : "Lota"}</th>
              <th className="px-2 py-2 font-semibold">{isEN ? "Quality" : "Gæði"}</th>
              <th className="px-2 py-2 font-semibold">% 1RM</th>
              <th className="px-2 py-2 font-semibold">{isEN ? "Set × rep" : "Set × rep"}</th>
              <th className="w-[200px] px-2 py-2 font-semibold">{isEN ? "Weekly approach" : "Háttur vikunnar"}</th>
              <th className="w-[160px] px-2 py-2 font-semibold">{isEN ? "Citation (optional)" : "Heimild (valkvætt)"}</th>
              <th className="w-[100px] py-2" />
            </tr></thead>
            <tbody>
              {BLOCK_GOALS.map((goal) => {
                const key = `${goal}:${blockPhase}`;
                const def = strengthForBlockGoal(goal, blockPhase);
                const cell = rules.block?.[key];
                const customised = !!cell && Object.keys(cell).length > 0;
                const now = nowBlock?.goal === goal && nowBlock.phase === blockPhase;
                return (
                  <tr key={key} className={`border-t border-slate-100 align-top ${customised ? "bg-[#2740e6]/[0.04]" : ""}`}>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-2 font-bold text-slate-900"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: GOAL_COLOR[goal] }} />{isEN ? GOAL_LABEL[goal] : GOAL_IS[goal]}</span>
                      {now && <span className="mt-1 block w-fit rounded-full bg-[#a83e28]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#a83e28]">{isEN ? "Now" : "Núna"}</span>}
                    </td>
                    <td className="px-2 py-2.5"><BiSelect compact label={isEN ? "Quality" : "Gæði"} def={def.quality} value={cell?.quality} options={QUALITY_OPTIONS} onChange={(v) => setBlockField(key, "quality", v)} /></td>
                    <td className="px-2 py-2.5"><BiSelect compact label="% 1RM" def={def.pct1rm} value={cell?.pct1rm} options={ZONE_OPTIONS} onChange={(v) => setBlockField(key, "pct1rm", v)} /></td>
                    <td className="px-2 py-2.5"><BiSelect compact label={isEN ? "Set × rep scheme" : "Set × rep kerfi"} def={def.scheme} value={cell?.scheme} options={SCHEME_OPTIONS} onChange={(v) => setBlockField(key, "scheme", v)} /></td>
                    <td className="px-2 py-2.5">
                      <label className="sr-only" htmlFor={`mode-${key}`}>{isEN ? "Weekly approach" : "Háttur vikunnar"}</label>
                      <select id={`mode-${key}`} value={cell?.mode ?? "microdose"} onChange={(e) => setBlockField(key, "mode", e.target.value)}
                        className={`h-10 w-full rounded-lg border px-2.5 text-[13px] ${cell?.mode ? "border-2 border-[#2740e6] bg-white font-semibold text-slate-900" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
                        <option value="microdose">{isEN ? "Micro-dose — spread (default)" : "Micro-dose — dreift (sjálfgefið)"}</option>
                        <option value="traditional">{isEN ? "Traditional — 1–4 lift days" : "Hefðbundið — 1–4 lyftidagar"}</option>
                      </select>
                    </td>
                    <td className="px-2 py-2.5">
                      <input value={cell?.cite ?? ""} placeholder={def.cite} aria-label={isEN ? "Citation" : "Heimild"} onChange={(e) => setBlockField(key, "cite", e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-700 placeholder:text-slate-500" />
                    </td>
                    <td className="py-2.5 text-right">{customised && <button onClick={() => resetBlockCell(key)} className="h-9 rounded-lg px-2 text-[12px] font-bold text-[#a83e28] hover:bg-[#a83e28]/5">{isEN ? "Reset" : "Endurstilla"}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-slate-500">{isEN ? "Traditional? Pick the lift days and mark the rest Off in Structure per MD day on the Daily session." : "Hefðbundið? Veldu lyftidagana og merktu hina „Off“ í Uppsetningu per MD-dag á Æfingu dagsins."}</p>
      </section>

      <p className="text-[12px] text-slate-500">{isEN ? "Descriptive planning layer — these rules shape the generated session content; they never set the readiness colour or the daily decision." : "Lýsandi skipulag — reglurnar móta innihald æfinganna; þær setja aldrei readiness-litinn eða daglegu ákvörðunina."}</p>
    </div>
  );
}
