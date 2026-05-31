"use client";

/**
 * ProgramAuditCard — live build-time movement-pattern balance audit.
 *
 * Explainability-first: one-sentence verdict on top, a balance bar per family,
 * the two key ratios (push:pull, knee:hip), and any balance flags — each with a
 * concrete fix (the counterfactual). The coach sees WHY the program is balanced
 * or has a gap before it is ever assigned. Rules decide; this UI explains.
 */

import { useMemo, useState } from "react";
import {
  auditWeeks,
  AUDIT_FAMILIES,
  type AuditWeek,
  type MovementFamily,
  type AuditFlag,
} from "@/lib/client/programAudit";

type Lang = "IS" | "EN";

const FAMILY_LABELS: Record<Lang, Record<MovementFamily, string>> = {
  IS: { squat: "Hnébeygja", hinge: "Mjaðmahjör", push: "Ýta", pull: "Toga", core: "Kjarni", carry: "Bera" },
  EN: { squat: "Squat", hinge: "Hinge", push: "Push", pull: "Pull", core: "Core", carry: "Carry" },
};

const FAMILY_COLOR: Record<MovementFamily, string> = {
  squat: "#6366f1", // indigo
  hinge: "#10b981", // emerald
  push: "#f59e0b",  // amber
  pull: "#3b82f6",  // blue
  core: "#a855f7",  // purple
  carry: "#64748b", // slate
};

const COPY = {
  IS: {
    title: "Jafnvægi prógramms",
    subtitle: "Hreyfimynstur · vinnusett",
    empty: "Veldu æfingar til að sjá jafnvægið.",
    balanced: "Vel jafnvægt yfir hreyfimynstrin.",
    flagsOne: "1 atriði til að skoða.",
    flagsMany: (n: number) => `${n} atriði til að skoða.`,
    pushPull: "Ýta : Toga",
    kneeHip: "Hné : Mjöðm",
    unilateral: "Einlíður",
    sets: "sett",
    details: "Sýna nánar",
    hide: "Fela",
    classified: (a: number, b: number) => `${a} af ${b} settum flokkuð`,
  },
  EN: {
    title: "Program balance",
    subtitle: "Movement patterns · working sets",
    empty: "Add exercises to see the balance audit.",
    balanced: "Well balanced across movement patterns.",
    flagsOne: "1 item to review.",
    flagsMany: (n: number) => `${n} items to review.`,
    pushPull: "Push : Pull",
    kneeHip: "Knee : Hip",
    unilateral: "Single-leg",
    sets: "sets",
    details: "Show details",
    hide: "Hide",
    classified: (a: number, b: number) => `${a} of ${b} sets classified`,
  },
} as const;

function flagText(flag: AuditFlag, lang: Lang): { msg: string; fix: string } {
  const fam = (f: MovementFamily) => FAMILY_LABELS[lang][f];
  const IS = lang === "IS";
  switch (flag.code) {
    case "missing_family":
      return IS
        ? { msg: `Engin ${fam(flag.family!)}-vinna í planinu`, fix: `Bættu við ${fam(flag.family!).toLowerCase()}-æfingu til að loka gatinu.` }
        : { msg: `No ${fam(flag.family!).toLowerCase()} work in this plan`, fix: `Add a ${fam(flag.family!).toLowerCase()} exercise to round it out.` };
    case "push_heavy":
      return IS
        ? { msg: `Ýta : Toga er ${flag.value}:1 — ýtu-þungt`, fix: "Bættu við togum (róður/niðurtog) fyrir axlaheilsu." }
        : { msg: `Push:pull is ${flag.value}:1 — push-dominant`, fix: "Add pulls (rows / pulldowns) for shoulder health." };
    case "pull_heavy":
      return IS
        ? { msg: `Toga-þungt (toga : ýta ${flag.value}:1)`, fix: "Bættu við pressu til að jafna." }
        : { msg: `Pull-dominant (pull:push ${flag.value}:1)`, fix: "Add a press to balance." };
    case "knee_heavy":
      return IS
        ? { msg: `Hné-ráðandi ${flag.value}× á við mjaðmavinnu`, fix: "Bættu við hinge (RDL, mjaðmalyfta) til að verja aftanlæri." }
        : { msg: `Knee-dominant ${flag.value}× the hinge volume`, fix: "Add a hinge (RDL, hip thrust) to protect the posterior chain." };
    case "no_core":
      return IS
        ? { msg: "Engin sérstök kjarna- / mót-snúnings vinna", fix: "Bættu við anti-rotation eða anti-extension æfingu." }
        : { msg: "No dedicated core / anti-rotation work", fix: "Add an anti-rotation or anti-extension exercise." };
    case "low_unilateral":
      return IS
        ? { msg: `Aðeins ${flag.value}% einlíða vinna`, fix: "Bættu við einlíða æfingu fyrir vinstri/hægri ójafnvægi." }
        : { msg: `Only ${flag.value}% single-leg/arm work`, fix: "Add a unilateral exercise to address left/right asymmetry." };
    default:
      return { msg: "", fix: "" };
  }
}

function fmtRatio(r: number | null): string {
  if (r === null) return "—";
  if (!Number.isFinite(r)) return "∞ : 1";
  if (r >= 1) return `${Math.round(r * 10) / 10} : 1`;
  return `1 : ${Math.round((1 / r) * 10) / 10}`;
}

/** A ratio is "off" when either side is ≥2× the other. */
function ratioOff(r: number | null): boolean {
  if (r === null) return false;
  if (!Number.isFinite(r)) return true;
  return r >= 2 || r <= 0.5;
}

export default function ProgramAuditCard({
  weeks,
  lang = "IS",
}: {
  weeks: AuditWeek[];
  lang?: Lang;
}) {
  const t = COPY[lang];
  const [open, setOpen] = useState(false);
  const audit = useMemo(() => auditWeeks(weeks), [weeks]);

  if (audit.taggedSets === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {t.empty}
      </div>
    );
  }

  const maxFamily = Math.max(1, ...AUDIT_FAMILIES.map((f) => audit.byFamily[f]));
  const warnCount = audit.flags.length;
  const verdict =
    warnCount === 0 ? t.balanced : warnCount === 1 ? t.flagsOne : t.flagsMany(warnCount);
  const verdictColor = warnCount === 0 ? "text-emerald-700" : "text-amber-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      {/* Verdict line */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{warnCount === 0 ? "✓" : "⚠"}</span>
            <span className={`text-sm font-semibold ${verdictColor}`}>{verdict}</span>
          </div>
          <div className="text-[11px] text-slate-500">{t.title} · {t.subtitle}</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
        >
          {open ? t.hide : t.details}
        </button>
      </div>

      {/* Family balance bars */}
      <div className="mt-2.5 space-y-1">
        {AUDIT_FAMILIES.map((f) => {
          const n = audit.byFamily[f];
          return (
            <div key={f} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] text-slate-600">{FAMILY_LABELS[lang][f]}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(n / maxFamily) * 100}%`, backgroundColor: n === 0 ? "transparent" : FAMILY_COLOR[f] }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{n}</span>
            </div>
          );
        })}
      </div>

      {/* Ratios */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Chip label={t.pushPull} value={fmtRatio(audit.pushPullRatio)} off={ratioOff(audit.pushPullRatio)} />
        <Chip label={t.kneeHip} value={fmtRatio(audit.kneeHipRatio)} off={ratioOff(audit.kneeHipRatio)} />
        <Chip label={t.unilateral} value={`${audit.unilateralPct}%`} off={audit.unilateralPct < 15} />
      </div>

      {/* Flags with fixes (counterfactuals) */}
      {audit.flags.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {audit.flags.map((flag, i) => {
            const { msg, fix } = flagText(flag, lang);
            const warn = flag.severity === "warn";
            return (
              <div
                key={`${flag.code}-${flag.family ?? i}`}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                  warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className={`font-medium ${warn ? "text-amber-800" : "text-slate-700"}`}>
                  {warn ? "⚠ " : "· "}{msg}
                </div>
                <div className="mt-0.5 text-slate-500">→ {fix}</div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
          {t.classified(audit.taggedSets, audit.totalSets)}
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, off }: { label: string; value: string; off: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        off ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
