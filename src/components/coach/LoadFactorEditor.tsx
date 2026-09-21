"use client";

/**
 * Per-team editor for the Mohr multiplying factors that drive the four-category load
 * profile (drillLoadProfile.ts). The factors are a coaching philosophy, not a validated
 * instrument, so a team can tune them; a team with no override uses the defaults. Saves
 * to /api/coach/load-factors (PUT). Descriptive config — never the readiness colour.
 */

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_LOAD_FACTORS, mergeLoadFactors, type LoadFactors } from "@/lib/micropulse/load/drillLoadProfile";

type Lang = "IS" | "EN";

const COPY = {
  IS: {
    title: "Stilla Mohr-stuðla", sub: "orkukerfi · lið",
    aerobic: "Loftháð — mín í púlssvæði ×", anaerobic: "Háhraða — vegalengd (per 100 m) í hraðabandi ×",
    speed: "Hraði — fjöldi hámarkshraða-spretta ×", muscular: "Vöðva–liða — fjöldi ×",
    accelDecel: "Hröðun/hemlun", impacts: "Högg", turns: "Beygjur (95–100%)",
    low: "lágt", med: "miðlungs", high: "hátt",
    save: "Vista", saving: "Vista…", saved: "Vistað", reset: "Endurstilla á sjálfgefið",
    custom: "Sérsniðið fyrir liðið", default: "Sjálfgefnir Mohr-stuðlar",
    note: "Stuðlar eru þjálfaraviðmið (Mohr, FIFA Fitness A) — lýsandi, ekki löggilt mæling. Aldrei viðbragðsliturinn.",
    error: "Villa við að vista",
  },
  EN: {
    title: "Adjust Mohr factors", sub: "energy systems · team",
    aerobic: "Aerobic — minutes in HR zone ×", anaerobic: "High-speed — distance (per 100 m) in speed band ×",
    speed: "Speed — count of max-speed efforts ×", muscular: "Muscular–joint — counts ×",
    accelDecel: "Accel/decel", impacts: "Impacts", turns: "Turns (95–100%)",
    low: "low", med: "med", high: "high",
    save: "Save", saving: "Saving…", saved: "Saved", reset: "Reset to defaults",
    custom: "Custom for this team", default: "Default Mohr factors",
    note: "Factors are a coaching heuristic (Mohr, FIFA Fitness A) — descriptive, not a validated instrument. Never the readiness colour.",
    error: "Error saving",
  },
} as const;

const AEROBIC_LABELS: Array<[keyof LoadFactors["aerobicHrZone"], string]> = [["z1", "70–80"], ["z2", "80–85"], ["z3", "85–90"], ["z4", "90–95"], ["z5", "95–100"]];
const BAND_LABELS: Array<[keyof LoadFactors["anaerobicSpeedBand"], string]> = [["b1", "10–14"], ["b2", "14–17"], ["b3", "17–21"], ["b4", "21–24"], ["b5", ">24"]];
const SPEED_LABELS: Array<[keyof LoadFactors["speedEffort"], string]> = [["s1", "85–90%"], ["s2", "90–95%"], ["s3", "95–100%"]];

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-500">{label}</span>
      <input
        type="number" min={0} step={0.5} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded border border-slate-300 px-1.5 py-1 text-[12px] tabular-nums focus:border-[#2740e6] focus:outline-none focus:ring-1 focus:ring-[#2740e6]"
      />
    </label>
  );
}

export default function LoadFactorEditor({
  teamId, lang, factors, custom, onSaved,
}: {
  teamId: string;
  lang: Lang;
  factors: LoadFactors;
  custom: boolean;
  onSaved: (f: LoadFactors, custom: boolean) => void;
}) {
  const c = COPY[lang];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LoadFactors>(factors);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Re-seed the draft whenever the canonical factors change (e.g. after a fetch) and the
  // editor isn't mid-edit.
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(factors), [draft, factors]);

  function openPanel() {
    if (!open) setDraft(factors);
    setOpen(!open);
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    try {
      const token = (await getSupabaseClient().auth.getSession()).data?.session?.access_token;
      if (!token) throw new Error("auth");
      const res = await fetch("/api/coach/load-factors", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ team_id: teamId, factors: draft }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "save");
      const saved = mergeLoadFactors(json.factors);
      setDraft(saved);
      onSaved(saved, true);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  function reset() {
    setDraft(mergeLoadFactors(DEFAULT_LOAD_FACTORS));
    setStatus("idle");
  }

  const setAerobic = (k: keyof LoadFactors["aerobicHrZone"], v: number) => setDraft((d) => ({ ...d, aerobicHrZone: { ...d.aerobicHrZone, [k]: v } }));
  const setBand = (k: keyof LoadFactors["anaerobicSpeedBand"], v: number) => setDraft((d) => ({ ...d, anaerobicSpeedBand: { ...d.anaerobicSpeedBand, [k]: v } }));
  const setSpeed = (k: keyof LoadFactors["speedEffort"], v: number) => setDraft((d) => ({ ...d, speedEffort: { ...d.speedEffort, [k]: v } }));
  const setAd = (k: "low" | "med" | "high", v: number) => setDraft((d) => ({ ...d, muscular: { ...d.muscular, accelDecel: { ...d.muscular.accelDecel, [k]: v } } }));
  const setIm = (k: "low" | "med" | "high", v: number) => setDraft((d) => ({ ...d, muscular: { ...d.muscular, impacts: { ...d.muscular.impacts, [k]: v } } }));
  const setTurn = (v: number) => setDraft((d) => ({ ...d, muscular: { ...d.muscular, turn: v } }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button type="button" onClick={openPanel} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-sm font-semibold">
          {c.title}
          <span className="ml-1.5 text-[10px] font-normal text-slate-400">· {c.sub}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${custom ? "bg-[#2740e6]/10 text-[#2740e6]" : "bg-slate-100 text-slate-500"}`}>
            {custom ? c.custom : c.default}
          </span>
          <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          <div>
            <div className="mb-1 text-[11px] font-semibold text-slate-600">{c.aerobic}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {AEROBIC_LABELS.map(([k, lbl]) => <NumberField key={k} label={lbl} value={draft.aerobicHrZone[k]} onChange={(v) => setAerobic(k, v)} />)}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-slate-600">{c.anaerobic}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {BAND_LABELS.map(([k, lbl]) => <NumberField key={k} label={lbl} value={draft.anaerobicSpeedBand[k]} onChange={(v) => setBand(k, v)} />)}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-slate-600">{c.speed}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {SPEED_LABELS.map(([k, lbl]) => <NumberField key={k} label={lbl} value={draft.speedEffort[k]} onChange={(v) => setSpeed(k, v)} />)}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-slate-600">{c.muscular}</div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-2">
              <div>
                <div className="mb-0.5 text-[10px] text-slate-400">{c.accelDecel}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <NumberField label={c.low} value={draft.muscular.accelDecel.low} onChange={(v) => setAd("low", v)} />
                  <NumberField label={c.med} value={draft.muscular.accelDecel.med} onChange={(v) => setAd("med", v)} />
                  <NumberField label={c.high} value={draft.muscular.accelDecel.high} onChange={(v) => setAd("high", v)} />
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-[10px] text-slate-400">{c.impacts}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <NumberField label={c.low} value={draft.muscular.impacts.low} onChange={(v) => setIm("low", v)} />
                  <NumberField label={c.med} value={draft.muscular.impacts.med} onChange={(v) => setIm("med", v)} />
                  <NumberField label={c.high} value={draft.muscular.impacts.high} onChange={(v) => setIm("high", v)} />
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-[10px] text-slate-400">{c.turns}</div>
                <NumberField label="×" value={draft.muscular.turn} onChange={setTurn} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={reset} className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-700">{c.reset}</button>
            <div className="flex items-center gap-2">
              {status === "saved" && !dirty && <span className="text-[11px] font-semibold text-emerald-600">{c.saved}</span>}
              {status === "error" && <span className="text-[11px] font-semibold text-red-600">{c.error}</span>}
              <button
                type="button" onClick={save} disabled={status === "saving" || !dirty}
                className="rounded bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                {status === "saving" ? c.saving : c.save}
              </button>
            </div>
          </div>
          <div className="text-[10px] leading-snug text-slate-400">{c.note}</div>
        </div>
      )}
    </div>
  );
}
