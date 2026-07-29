"use client";

/**
 * Coach view — Heart Rate Intelligence (Edwards 1993 · Buchheit 2024).
 *
 * The objective cross-check on the subjective sRPE, now that Catapult belt HR flows.
 * Promotes HrLoadCrossCheckCard into a full per-player surface (same shared loader,
 * so they can never disagree): belt coverage as the honesty gate, HR-vs-sRPE
 * divergence, 8-band intensity distribution, calibrated %HRmax when a player's HRmax
 * is set, and personal-norm HR-load trend. Explainability-first: verdict → plain why
 * → S&C detail. Everything read on the player's OWN norm; nothing fabricated —
 * no belt / no HRmax → no-data, never zero.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import ShowDetails from "@/components/common/ShowDetails";
import VerdictBanner, { type VerdictTone, type VerdictDriver, type ConfidenceLevel } from "@/components/coach/VerdictBanner";
import MethodologyLink from "@/components/common/MethodologyLink";
import { HR_CAVEAT } from "@/lib/methodologyCaveats";
import { loadHrForTeam, type PlayerHrRead } from "@/lib/micropulse/hrLoad/loadForTeam";
import { type LoadAlignment, type Bi, DIVERGENCE_GAP, MIN_MATURE_HR_SESSIONS } from "@/lib/micropulse/hrLoad";
import { counterfactual, confidenceReason } from "@/lib/micropulse/hrLoad/explain";

// The 8 ordinal Catapult bands grouped into three plain, coach-readable intensity
// tiers on a familiar cool→hot heat ramp (blue = easy … red = hard). "High = bands
// 6–8" matches the squad-shape line and the glossary. Ordinal only — never a %HRmax zone.
const INTENSITY_TIERS: { key: string; bands: number[]; color: string; label: Bi }[] = [
  { key: "low", bands: [1, 2, 3], color: "#60a5fa", label: { en: "Low", is: "Lágt" } },
  { key: "mod", bands: [4, 5], color: "#f59e0b", label: { en: "Moderate", is: "Miðlungs" } },
  { key: "high", bands: [6, 7, 8], color: "#ef4444", label: { en: "High", is: "Hátt" } },
];
const ALIGN_CLASS: Record<LoadAlignment, string> = {
  hidden_load: "text-rose-700",
  low_cardio_response: "text-amber-700",
  aligned: "text-emerald-700",
  insufficient: "text-slate-400",
};

// Plain, at-a-glance status per alignment: a traffic-light dot + a two-word label.
// Colours use the design tokens (green/amber/clay). This is the "verdict" a coach reads
// first; the full sentence below it is the "why".
const STATUS: Record<LoadAlignment, { label: Bi; dot: string; chip: string }> = {
  aligned:             { label: { en: "In sync",         is: "Í takt" },          dot: "#1c7a4a", chip: "bg-emerald-50 text-emerald-700" },
  hidden_load:         { label: { en: "Hidden load",     is: "Falið álag" },      dot: "#a83e28", chip: "bg-rose-50 text-rose-700" },
  low_cardio_response: { label: { en: "Low heart demand", is: "Lágt hjarta-drif" }, dot: "#de9328", chip: "bg-amber-50 text-amber-700" },
  insufficient:        { label: { en: "Not enough data", is: "Ekki næg gögn" },   dot: "#94a3b8", chip: "bg-slate-100 text-slate-500" },
};

/**
 * Plain "what to do" for a flagged read — a coaching prompt with its reasoning inline
 * (rules decide, and it's the coach's call). Null when there's nothing to act on.
 */
function actionGuidance(alignment: LoadAlignment | undefined): Bi | null {
  switch (alignment) {
    case "hidden_load":
      return {
        en: "Plan his recovery as if this was a harder session than he logged. If it keeps happening, ease the next day — or check he's rating honestly.",
        is: "Skipuleggðu endurheimt eins og þetta hafi verið erfiðari lota en hann skráði. Ef það endurtekur sig, léttu næsta dag — eða athugaðu hvort hann meti heiðarlega.",
      };
    case "low_cardio_response":
      return {
        en: "Usually fine if it was strength or skills work — the heart just wasn't taxed. Only worth a look if it was meant to be a conditioning session.",
        is: "Yfirleitt í lagi ef þetta var styrktar- eða tækniæfing — hjartað var einfaldlega ekki reynt. Aðeins vert að skoða ef þetta átti að vera þolæfing.",
      };
    default:
      return null;
  }
}

const isFlaggedRead = (r: PlayerHrRead) =>
  r.read.latest?.alignment === "hidden_load" || r.read.latest?.alignment === "low_cardio_response";

/** Honest label for where a player's HRmax (and thus %HRmax) came from. */
function hrMaxSourceLabel(r: PlayerHrRead): { text: Bi; estimate: boolean } | null {
  switch (r.hrMaxSource) {
    case "set": return { text: { en: "coach-set", is: "stillt" }, estimate: false };
    case "observed": return { text: { en: "observed peak", is: "mælt hámark" }, estimate: false };
    case "estimated": return { text: { en: "age-estimated", is: "aldurs-áætlað" }, estimate: true };
    default: return null;
  }
}
const gapStr = (g: number | null | undefined) => (g != null ? `${g >= 0 ? "+" : ""}${g}` : "—");

type Verdict = { tone: VerdictTone; sentence: { EN: string; IS: string }; subtitle?: { EN: string; IS: string }; action?: { EN: string; IS: string }; confidence: { level: ConfidenceLevel; note?: { EN: string; IS: string } }; drivers: VerdictDriver[] };

function computeVerdict(reads: PlayerHrRead[], rosterCount: number): Verdict {
  const beltCount = reads.length;
  if (beltCount === 0) {
    return {
      tone: "neutral",
      sentence: { EN: "No heart-rate belt data yet — this cross-check turns on once a belt session syncs.", IS: "Engin HR-beltisgögn enn — þessi kross-tékk kviknar þegar HR-lota samstillist." },
      action: { EN: "Have players wear the HR belt on skin during sessions; nothing to act on until then.", IS: "Láttu leikmenn bera HR-beltið á húð í æfingum; ekkert að aðhafast fyrr en þá." },
      confidence: { level: "low" },
      drivers: [],
    };
  }
  const flagged = reads.filter(isFlaggedRead);
  const pctMaxSet = reads.filter((r) => r.read.dataCoverage.hasPctMax).length;
  const mature = reads.filter((r) => r.read.confidence !== "low").length;
  const level: ConfidenceLevel = mature >= Math.ceil(beltCount / 2) && pctMaxSet > 0 ? "moderate" : "low";
  const note = { EN: `%HRmax set for ${pctMaxSet} of ${beltCount}`, IS: `%HRmax stillt fyrir ${pctMaxSet} af ${beltCount}` };

  if (flagged.length === 0) {
    return {
      tone: "good",
      sentence: { EN: `Effort ratings and heart rate agree across the squad — ${beltCount} of ${rosterCount} wore the belt.`, IS: `Áreynslumat og púls samræmast hjá liðinu — ${beltCount} af ${rosterCount} báru belti.` },
      action: { EN: "Nothing to act on — you can trust their session ratings this week.", IS: "Ekkert að aðhafast — þú getur treyst áreynslumati þeirra þessa viku." },
      confidence: { level, note },
      drivers: [],
    };
  }
  // Split the mismatch by type so the team-level meaning is concrete, not just a count.
  const hiddenN = flagged.filter((r) => r.read.latest?.alignment === "hidden_load").length;
  const lowN = flagged.filter((r) => r.read.latest?.alignment === "low_cardio_response").length;
  const drivers: VerdictDriver[] = flagged.slice(0, 6).map((r) => {
    const s = r.read.latest;
    const hidden = s?.alignment === "hidden_load";
    return {
      label: r.name.split(" ")[0],
      tone: "watch",
      detail: hidden
        ? { EN: "heart worked harder than the rating", IS: "hjartað vann meira en matið" }
        : { EN: "rated hard but heart stayed low", IS: "mat hátt en hjartað lágt" },
      tip: {
        EN: `HR idx ${s?.hrLoadIndex ?? "—"} vs sRPE idx ${s?.srpeIndex ?? "—"}, gap ${gapStr(s?.gap)} (>25 = diverging) — Edwards 1993 summated-HR-zone TRIMP, adapted; Buchheit 2024.`,
        IS: `HR-vísit. ${s?.hrLoadIndex ?? "—"} vs sRPE-vísit. ${s?.srpeIndex ?? "—"}, bil ${gapStr(s?.gap)} (>25 = ósamræmi) — Edwards 1993, aðlagað; Buchheit 2024.`,
      },
    };
  });
  // Team-meaning sentence — what it means for the squad, no name list (names are the chips below).
  const parts = {
    EN: [hiddenN > 0 ? `${hiddenN} worked harder than they logged` : "", lowN > 0 ? `${lowN} logged more than the heart showed` : ""].filter(Boolean).join(", "),
    IS: [hiddenN > 0 ? `${hiddenN} unnu meira en þeir skráðu` : "", lowN > 0 ? `${lowN} skráðu meira en hjartað sýndi` : ""].filter(Boolean).join(", "),
  };
  return {
    tone: "watch",
    sentence: {
      EN: `Effort ratings and heart rate disagree for ${flagged.length} of ${beltCount} on a belt — ${parts.EN}. Their logged load may be off.`,
      IS: `Áreynslumat og púls ósamræmd hjá ${flagged.length} af ${beltCount} með belti — ${parts.IS}. Skráð álag þeirra gæti verið skakkt.`,
    },
    subtitle: { EN: "A cross-check to investigate — not an injury flag.", IS: "Kross-tékk til að skoða — ekki meiðslamerki." },
    action: {
      EN: "Before setting their next load, plan around what the heart showed, not just the rating — see each flagged player below.",
      IS: "Áður en þú stillir næsta álag, skipuleggðu út frá því sem hjartað sýndi, ekki bara matinu — sjá hvern flaggaðan leikmann að neðan.",
    },
    confidence: { level, note },
    drivers,
  };
}

/** Personal-norm HR-load trend (100 = the player's own average session). */
function Sparkline({ history }: { history: { hrLoadIndex: number | null }[] }) {
  const vals = history.map((h) => h.hrLoadIndex).filter((v): v is number => v != null).slice(-12);
  if (vals.length < 2) return null;
  const max = Math.max(120, ...vals), min = Math.min(80, ...vals);
  const w = 120, h = 22;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${(h - ((v - min) / (max - min || 1)) * h).toFixed(1)}`).join(" ");
  const y100 = h - ((100 - min) / (max - min || 1)) * h;
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <line x1="0" y1={y100} x2={w} y2={y100} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The heavy per-player layers, rendered inside the detail modal (opened from a
 * compact card). Moved verbatim from the old inline card so behaviour is
 * identical — verdict → counterfactual → what-to-do → %HRmax setter → HR-load
 * trend → session intensity (+ all 8 bands) → behind-the-numbers.
 */
function HrPlayerDetail({
  r, IS, hrMaxDraft, setHrMaxDraft, saveHrMax, savingId,
}: {
  r: PlayerHrRead;
  IS: boolean;
  hrMaxDraft: Record<string, string>;
  setHrMaxDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveHrMax: (playerId: string) => void | Promise<void>;
  savingId: string | null;
}) {
  const s = r.read.latest;
  const flag = isFlaggedRead(r);
  const align = s?.alignment ?? "insufficient";
  const action = actionGuidance(align);
  const present = r.dist.filter((b) => (b.timeS ?? 0) > 0);
  return (
    <div className="mt-3">
      {/* The plain story — the "why", prominent, no jargon */}
      <p className="text-[13px] leading-snug text-slate-800">{IS ? s?.verdict.is : s?.verdict.en}</p>

      {/* Counterfactual — manifesto-mandatory for every flagged player */}
      {flag && counterfactual(s) && (
        <p className="mt-1 text-[11px] italic text-slate-500">{IS ? counterfactual(s)!.is : counterfactual(s)!.en}</p>
      )}

      {/* What to do — a coaching prompt with its reasoning, coach's call */}
      {action && (
        <div className="mt-1.5 flex gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
          <span className="font-semibold text-slate-700">{IS ? "Hvað á að gera:" : "What to do:"}</span>
          <span>{IS ? action.is : action.en}</span>
        </div>
      )}

      {/* Numbers */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
        <span title={IS ? "Þessi lota vs meðallota hans sjálfs (100 = dæmigert)" : "This session vs his own average session (100 = typical)"}>HR idx <b className="font-semibold tabular-nums text-slate-500">{s?.hrLoadIndex ?? "—"}</b></span>
        <span title={IS ? "sRPE þessarar lotu vs hans eigin meðaltal (100 = dæmigert)" : "This session's sRPE vs his own average (100 = typical)"}>sRPE idx <b className="font-semibold tabular-nums text-slate-500">{s?.srpeIndex ?? "—"}</b></span>
        <span title={IS ? `HR-vísitala mínus sRPE-vísitala; umfram ±${DIVERGENCE_GAP} = ósamræmi` : `HR index minus sRPE index; beyond ±${DIVERGENCE_GAP} = diverging`}>{IS ? "Bil" : "Gap"} <b className="font-semibold tabular-nums text-slate-500">{gapStr(s?.gap)}</b></span>
        <span className={r.read.confidence === "low" ? "text-amber-600" : ""} title={IS ? confidenceReason(r.read).is : confidenceReason(r.read).en}>
          · {r.read.confidence === "low" ? (IS ? "lítil vissa" : "low confidence") : r.read.confidence === "medium" ? (IS ? "miðlungs vissa" : "moderate confidence") : (IS ? "mikil vissa" : "high confidence")}
        </span>
      </div>

      {/* %HRmax + provenance + the per-player HRmax setter (override) */}
      {(() => {
        const src = hrMaxSourceLabel(r);
        return (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {r.latestHr?.pctMax != null ? (
              <span
                className={`rounded-full px-2 py-0.5 tabular-nums ${src?.estimate ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}
                title={IS ? "% af HRmax; heimild HRmax sýnd á eftir" : "% of HRmax; the HRmax source is shown after"}
              >
                {src?.estimate ? "≈ " : ""}%HRmax {r.latestHr.pctAvg ?? "—"} {IS ? "meðal" : "avg"} · {r.latestHr.pctMax} {IS ? "topp" : "peak"}
                {src ? <span className="ml-1 font-normal opacity-70">· HRmax {r.effectiveHrMax} {IS ? src.text.is : src.text.en}</span> : null}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">{IS ? "engin HRmax-heimild enn — settu HRmax hér að neðan" : "no HRmax source yet — set HRmax below"}</span>
            )}
            <span className="inline-flex items-center gap-1 text-slate-500">
              <span title={IS ? "Yfirskrifar áætlun með mældu gildi" : "Overrides the estimate with a measured value"}>HRmax</span>
              <input
                type="number" inputMode="numeric" placeholder={r.effectiveHrMax != null ? String(r.effectiveHrMax) : "bpm"}
                value={hrMaxDraft[r.playerId] ?? (r.hrMax != null ? String(r.hrMax) : "")}
                onChange={(e) => setHrMaxDraft((d) => ({ ...d, [r.playerId]: e.target.value }))}
                className="w-16 rounded border border-slate-300 px-1 py-0.5 text-[11px] tabular-nums"
              />
              <button type="button" onClick={() => void saveHrMax(r.playerId)} disabled={savingId === r.playerId}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {savingId === r.playerId ? "…" : (IS ? "Vista" : "Save")}
              </button>
            </span>
          </div>
        );
      })()}

      {/* Personal-norm HR-load trend */}
      {r.read.history.filter((h) => h.hrLoadIndex != null).length >= 2 && (
        <div className="mt-2">
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{IS ? "HR-álag vs eigin viðmiðun (100 = meðaltal)" : "HR load vs own norm (100 = average)"}</div>
          <Sparkline history={r.read.history} />
        </div>
      )}

      {/* How hard was the session — plain Low/Moderate/High split, latest belt session */}
      {present.length > 0 && (() => {
        const tiers = INTENSITY_TIERS.map((t) => ({ ...t, timeS: t.bands.reduce((a, b) => a + (r.dist[b - 1]?.timeS ?? 0), 0) }));
        const totalS = tiers.reduce((a, t) => a + t.timeS, 0);
        if (totalS <= 0) return null;
        const shown = tiers.filter((t) => t.timeS > 0);
        const pctOf = (sec: number) => Math.round((sec / totalS) * 100);
        const minsOf = (sec: number) => (sec < 30 ? "<1" : String(Math.round(sec / 60)));
        return (
          <div className="mt-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[11px] font-medium text-slate-700">{IS ? "Hve erfið var lotan" : "How hard was the session"}</div>
              <div className="text-[9px] text-slate-400">{IS ? "nýjasta lota" : "latest session"} · {Math.round(totalS / 60)} {IS ? "mín á belti" : "min on belt"}</div>
            </div>
            <div className="mt-1 flex h-4 w-full overflow-hidden rounded"
              title={IS ? "Hlutfallsleg ákefð, lág → há (Catapult raðbönd, hópuð)" : "Relative intensity, low → high (Catapult ordinal bands, grouped)"}>
              {shown.map((t) => (
                <div key={t.key} style={{ width: `${pctOf(t.timeS)}%`, backgroundColor: t.color }}
                  className="flex items-center justify-center"
                  title={`${IS ? t.label.is : t.label.en} · ${minsOf(t.timeS)} ${IS ? "mín" : "min"} (${pctOf(t.timeS)}%)`}>
                  {pctOf(t.timeS) >= 12 ? <span className="text-[9px] font-semibold tabular-nums text-white/95">{pctOf(t.timeS)}%</span> : null}
                </div>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-600">
              {shown.map((t) => (
                <span key={t.key} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {IS ? t.label.is : t.label.en}
                  <span className="tabular-nums text-slate-500">{minsOf(t.timeS)}{IS ? "m" : "m"} · {pctOf(t.timeS)}%</span>
                </span>
              ))}
            </div>

            {/* Full per-band detail (S&C layer) — one click away, bpm where reliable. */}
            <div className="mt-1">
              <ShowDetails label={{ EN: "Show all 8 bands", IS: "Sýna öll 8 bönd" }}>
                <div className="flex h-2.5 w-full overflow-hidden rounded">
                  {present.map((b) => {
                    const tier = INTENSITY_TIERS.find((x) => x.bands.includes(b.band));
                    return (
                      <div key={b.band} style={{ width: `${b.pct ?? 0}%`, backgroundColor: tier?.color ?? "#94a3b8" }}
                        title={`Band ${b.band}${b.avgBpm ? ` ≈ ${b.avgBpm} bpm` : ""} · ${minsOf(b.timeS ?? 0)}${IS ? "mín" : "m"} (${b.pct ?? 0}%)`} />
                    );
                  })}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-600 sm:grid-cols-4">
                  {present.map((b) => {
                    const tier = INTENSITY_TIERS.find((x) => x.bands.includes(b.band));
                    return (
                      <span key={b.band} className="inline-flex items-center gap-1 tabular-nums">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tier?.color ?? "#94a3b8" }} />
                        Band {b.band}
                        <span className="text-slate-500">{b.pct}%{b.avgBpm ? ` · ~${b.avgBpm}bpm` : ""}</span>
                      </span>
                    );
                  })}
                </div>
                <p className="mt-1 text-[9px] leading-snug text-slate-400">
                  {IS
                    ? "Raðbönd Catapult (mörk í OpenField), lág → há; litur = flokkur bandsins. bpm birt aðeins þar sem áreiðanlegt — óáreiðanlegt á lægstu böndum."
                    : "Catapult ordinal bands (boundaries in OpenField), low → high; colour = the band's tier. bpm shown only where reliable — unreliable on the lowest bands."}
                </p>
              </ShowDetails>
            </div>
          </div>
        );
      })()}

      {/* Behind the numbers — the raw matched sessions this read is built on. */}
      {(() => {
        const matched = r.read.history.filter((h) => h.hrLoadIndex != null && h.srpeIndex != null).slice(-8).reverse();
        if (matched.length === 0) return null;
        return (
          <div className="mt-2">
            <ShowDetails label={{ EN: "Behind the numbers", IS: "Á bak við tölurnar" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="py-0.5 pr-2 font-medium">{IS ? "Dags." : "Date"}</th>
                      <th className="py-0.5 pr-2 font-medium" title={IS ? "Edwards summated-HR-zone AU — aðeins persónu-viðmiðun" : "Edwards summated-HR-zone AU — personal-norm only"}>HR AU</th>
                      <th className="py-0.5 pr-2 font-medium">HR idx</th>
                      <th className="py-0.5 pr-2 font-medium">sRPE idx</th>
                      <th className="py-0.5 pr-2 font-medium">{IS ? "Bil" : "Gap"}</th>
                      <th className="py-0.5 font-medium">{IS ? "Lestur" : "Read"}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-slate-600">
                    {matched.map((h) => (
                      <tr key={h.date} className="border-t border-slate-100">
                        <td className="py-0.5 pr-2">{h.date.slice(5)}</td>
                        <td className="py-0.5 pr-2">{h.hrLoad ?? "—"}</td>
                        <td className="py-0.5 pr-2">{h.hrLoadIndex ?? "—"}</td>
                        <td className="py-0.5 pr-2">{h.srpeIndex ?? "—"}</td>
                        <td className="py-0.5 pr-2">{gapStr(h.gap)}</td>
                        <td className={`py-0.5 ${ALIGN_CLASS[h.alignment]}`}>
                          {h.alignment === "aligned" ? (IS ? "samræmt" : "aligned")
                            : h.alignment === "hidden_load" ? (IS ? "falið álag" : "hidden load")
                            : h.alignment === "low_cardio_response" ? (IS ? "lágt drif" : "low demand")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[9px] leading-snug text-slate-400">
                  {IS
                    ? "HR AU er Edwards summated-HR-zone álag — borið saman AÐEINS við eigin meðaltal leikmannsins (vísitölurnar), aldrei sem alger tala vs sRPE."
                    : "HR AU is Edwards summated-HR-zone load — compared ONLY to the player's own average (the indices), never as an absolute vs sRPE."}
                </p>
              </div>
            </ShowDetails>
          </div>
        );
      })()}
    </div>
  );
}

export default function HeartRateIntelligencePage() {
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const IS = lang === "IS";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reads, setReads] = React.useState<PlayerHrRead[]>([]);
  const [rosterCount, setRosterCount] = React.useState(0);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [hrMaxDraft, setHrMaxDraft] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  // Which player's detail modal is open (click-through from the card grid).
  const [openId, setOpenId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError(IS ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = (profile as { team_id?: string | null } | null)?.team_id ?? null;
      if (!tid) { setError(IS ? "Þjálfari ekki tengdur liði." : "Coach not linked to a team."); return; }
      setTeamId(tid);
      const { reads: r, rosterCount: rc } = await loadHrForTeam(supabase, tid);
      setReads(r);
      setRosterCount(rc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [supabase, IS]);

  React.useEffect(() => { void load(); }, [load]);

  async function saveHrMax(playerId: string) {
    if (!teamId) return;
    const raw = hrMaxDraft[playerId];
    const val = raw != null && raw.trim() !== "" ? Number(raw) : null;
    // Sane human HRmax bounds; reject out-of-range rather than store garbage.
    if (val != null && (!Number.isFinite(val) || val < 120 || val > 230)) return;
    setSavingId(playerId);
    try {
      await supabase.from("players").update({ hr_max: val }).eq("id", playerId);
      await load(); // recompute effective %HRmax + confidence
    } finally {
      setSavingId(null);
    }
  }

  const verdict = React.useMemo(() => computeVerdict(reads, rosterCount), [reads, rosterCount]);
  const beltCount = reads.length;
  const flagged = reads.filter(isFlaggedRead);
  const sorted = React.useMemo(
    () => [...reads].sort((a, b) => (isFlaggedRead(a) ? 0 : 1) - (isFlaggedRead(b) ? 0 : 1) || a.name.localeCompare(b.name)),
    [reads],
  );
  // Squad intensity shape from the aggregated distributions — ordinal only.
  const squadShape = React.useMemo(() => {
    let high = 0, total = 0;
    for (const r of reads) for (const b of r.dist) { const t = b.timeS ?? 0; total += t; if (b.band >= 6) high += t; }
    if (total === 0) return null;
    const hs = high / total;
    return hs >= 0.25
      ? { EN: "Notable time in the high-intensity bands (6–8) this week.", IS: "Töluverður tími í háum ákefðarböndum (6–8) þessa viku." }
      : { EN: "Belt time sat mostly in the low-to-moderate bands this week.", IS: "Beltis-tími lá aðallega í lágum-til-miðlungs böndum þessa viku." };
  }, [reads]);

  // The player whose detail modal is open (resolved from the live reads so it
  // stays in sync after an HRmax save recomputes the list).
  const openRead = React.useMemo(() => reads.find((x) => x.playerId === openId) ?? null, [reads, openId]);
  // Esc closes the modal.
  React.useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {!loading && !error && (
        <VerdictBanner
          lang={lang}
          kicker={IS ? "Púls" : "Heart rate"}
          tone={verdict.tone}
          sentence={verdict.sentence}
          subtitle={verdict.subtitle}
          action={verdict.action}
          confidence={verdict.confidence}
          drivers={verdict.drivers}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900">{IS ? "Púls-greining" : "Heart Rate Intelligence"}</h1>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">Edwards 1993 · Buchheit 2024</span>
          </div>
          <PagePurpose
            en="cross-check effort ratings against what the heart actually did"
            is="krossa áreynslumat við það sem hjartað gerði í raun"
            tutorial="heart-rate-intelligence"
          />
          <p className="text-sm text-muted-foreground max-w-3xl mt-1">
            {IS
              ? "Hlutlægur púls sem kross-tékk á huglægt sRPE — falið álag, lágt hjarta-drif, og ákefðardreifing. Allt lesið á persónulegri viðmiðun; aðeins þeir sem báru belti."
              : "Objective HR as a cross-check on subjective sRPE — hidden load, low cardiac demand, and intensity distribution. All read on the player's own norm; only players who wore a belt."}
          </p>
        </div>
        <Link href="/coach" className="text-sm text-slate-500 hover:text-slate-700">{IS ? "← Til baka" : "← Back"}</Link>
      </div>

      {loading && <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">{IS ? "Hleð…" : "Loading…"}</div>}
      {!loading && error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && (
        <>
          {/* Plain "why" — belt coverage is the honesty gate, first. */}
          <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div><span className="font-semibold tabular-nums">{beltCount}</span> {IS ? `af ${rosterCount} báru belti` : `of ${rosterCount} wore the belt`} <span className="text-slate-400">({IS ? "síðustu 28 daga" : "last 28 days"})</span></div>
            {beltCount > 0 && (
              <div>{flagged.length === 0
                ? (IS ? "Púls og áreynsla samræmast hjá öllum með belti." : "Heart rate and effort agree for everyone on a belt.")
                : (IS ? `${flagged.length} með ósamræmi púls vs áreynslu.` : `${flagged.length} with a heart-vs-effort mismatch.`)}</div>
            )}
            {squadShape && <div className="text-slate-500">{IS ? squadShape.IS : squadShape.EN}</div>}
            <MethodologyLink caveat={HR_CAVEAT} />
          </div>

          {/* "How to read these numbers" — the plain glossary, one click, never in the primary view. */}
          {beltCount > 0 && (
            <ShowDetails label={{ EN: "How to read these numbers", IS: "Hvernig á að lesa tölurnar" }}>
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-[12px] leading-relaxed text-slate-600 sm:grid-cols-2">
                <div>
                  <div className="font-semibold text-slate-800">{IS ? "HR-vísitala & sRPE-vísitala" : "HR index & sRPE index"}</div>
                  <p>{IS
                    ? "Hvor um sig er þessi lota borin saman við MEÐALLOTU leikmannsins sjálfs — 100 = dæmigerð lota fyrir hann. Ekki hægt að bera saman milli leikmanna."
                    : "Each compares this session to the player's OWN average session — 100 = a typical session for him. Not comparable between players."}</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{IS ? "Bil (Gap)" : "Gap"}</div>
                  <p>{IS
                    ? `HR-vísitala mínus sRPE-vísitala. Jákvætt = hjartað vann meira en hann mat lotuna. Umfram ±${DIVERGENCE_GAP} köllum við ósamræmi; innan þess er venjulegt flökt milli lota.`
                    : `HR index minus sRPE index. Positive = the heart worked harder than he rated it. Beyond ±${DIVERGENCE_GAP} we call it diverging; within that it's ordinary session-to-session wobble.`}</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{IS ? "Falið álag" : "Hidden load"}</div>
                  <p>{IS
                    ? "Hjartað vann meira en áreynslumatið gaf til kynna — hugsanlega vanmetin lota. Skoða, ekki meiðslamerki."
                    : "The heart worked harder than the rating suggested — possibly an under-reported session. Investigate, not an injury flag."}</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{IS ? "Lítið hjarta-drif" : "Low cardiac demand"}</div>
                  <p>{IS
                    ? "Mat hátt en hjartað hélst lágt — t.d. styrktaræfing (lítið þolálag) eða ofmetin áreynsla."
                    : "Rated hard but the heart stayed low — e.g. strength work (little aerobic demand) or an over-reported effort."}</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{IS ? "Vissa" : "Confidence"}</div>
                  <p>{IS
                    ? `Þarf ≥${MIN_MATURE_HR_SESSIONS} beltis-lotur til að treysta grunnlínunni, auk þess að HRmax sé stillt fyrir kvarðaða %HRmax. Þunn gögn birtast sem lítil vissa, aldrei sem dómur.`
                    : `Needs ≥${MIN_MATURE_HR_SESSIONS} belt sessions to trust the baseline, plus HRmax set for calibrated %HRmax. Thin data shows as low confidence, never as a verdict.`}</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{IS ? "HRmax & %HRmax" : "HRmax & %HRmax"}</div>
                  <p>{IS
                    ? "%HRmax þarf HRmax leikmannsins. Við notum bestu heimild: stillt gildi þjálfara → mælt hámark úr beltinu → aldurs-áætlun (Tanaka 2001; Gulati 2010 fyrir konur). Aldurs-áætlun er merkt „≈“ og hækkar EKKI vissuna — aðeins raunmæling gerir það. Yfirskrifaðu með mældu gildi hvenær sem er."
                    : "%HRmax needs the player's HRmax. We use the best available: coach-set → observed belt peak → age estimate (Tanaka 2001; Gulati 2010 for women). An age estimate is marked “≈” and does NOT raise confidence — only real measurement does. Override with a measured value anytime."}</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{IS ? "Hve erfið var lotan (lág/miðlungs/há)" : "How hard was the session (low/moderate/high)"}</div>
                  <p>{IS
                    ? "Catapult sendir 8 raðbönd (mörk stillt í OpenField, ekki kvörðuð %HRmax svæði). Við hópum þau í þrennt — lágt (1–3), miðlungs (4–5), hátt (6–8) — og sýnum mínútur + % í hverjum. Blátt = rólegt, rautt = erfitt. Aðeins röð, ekki púls-svæði."
                    : "Catapult sends 8 ordinal bands (boundaries set in OpenField, not calibrated %HRmax zones). We group them into three — low (1–3), moderate (4–5), high (6–8) — and show minutes + % in each. Blue = easy, red = hard. Order only, not HR zones."}</p>
                </div>
              </div>
            </ShowDetails>
          )}

          {beltCount === 0 ? null : (
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sorted.map((r) => {
                const s = r.read.latest;
                const flag = isFlaggedRead(r);
                const align = s?.alignment ?? "insufficient";
                const status = STATUS[align];
                const action = actionGuidance(align);
                return (
                  <div
                    key={r.playerId}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenId(r.playerId)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(r.playerId); } }}
                    className={`cursor-pointer rounded-lg border p-3 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300 ${flag ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"}`}
                  >
                    {/* Glance: traffic-light dot + name + two-word status */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.dot }} aria-hidden />
                        <span className="text-sm font-medium text-slate-900">{r.name}</span>
                        {r.position && <span className="text-[11px] text-slate-400">{r.position}</span>}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.chip}`}>{IS ? status.label.is : status.label.en}</span>
                    </div>

                    {/* The plain story — the "why", prominent, no jargon (clamped to keep faces even) */}
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-slate-800">{IS ? s?.verdict.is : s?.verdict.en}</p>

                    {/* What to do — kept on the face for flagged players; the actionable bit */}
                    {flag && action && (
                      <div className="mt-1.5 flex gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
                        <span className="font-semibold text-slate-700">{IS ? "Hvað á að gera:" : "What to do:"}</span>
                        <span>{IS ? action.is : action.en}</span>
                      </div>
                    )}

                    {/* Numbers — a quiet glance line; the full detail is one click away in the modal */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                      <span title={IS ? "Þessi lota vs meðallota hans sjálfs (100 = dæmigert)" : "This session vs his own average session (100 = typical)"}>HR idx <b className="font-semibold tabular-nums text-slate-500">{s?.hrLoadIndex ?? "—"}</b></span>
                      <span title={IS ? "sRPE þessarar lotu vs hans eigin meðaltal (100 = dæmigert)" : "This session's sRPE vs his own average (100 = typical)"}>sRPE idx <b className="font-semibold tabular-nums text-slate-500">{s?.srpeIndex ?? "—"}</b></span>
                      <span title={IS ? `HR-vísitala mínus sRPE-vísitala; umfram ±${DIVERGENCE_GAP} = ósamræmi` : `HR index minus sRPE index; beyond ±${DIVERGENCE_GAP} = diverging`}>{IS ? "Bil" : "Gap"} <b className="font-semibold tabular-nums text-slate-500">{gapStr(s?.gap)}</b></span>
                      <span className={r.read.confidence === "low" ? "text-amber-600" : ""} title={IS ? confidenceReason(r.read).is : confidenceReason(r.read).en}>
                        · {r.read.confidence === "low" ? (IS ? "lítil vissa" : "low confidence") : r.read.confidence === "medium" ? (IS ? "miðlungs vissa" : "moderate confidence") : (IS ? "mikil vissa" : "high confidence")}
                      </span>
                    </div>

                    <div className="mt-2 text-[10px] font-medium text-slate-400">{IS ? "Ýttu fyrir smáatriði →" : "Tap for details →"}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Player detail modal — the heavy layers (counterfactual, what-to-do,
              %HRmax setter, trend, intensity, 8 bands, behind-the-numbers) live
              here, one click from the compact card, like Decision Summary. */}
          {openRead && (() => {
            const s = openRead.read.latest;
            const align = s?.alignment ?? "insufficient";
            const status = STATUS[align];
            return (
              <div
                className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
                onClick={() => setOpenId(null)}
                role="dialog"
                aria-modal="true"
              >
                <div
                  className="my-8 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.dot }} aria-hidden />
                      <span className="text-base font-semibold text-slate-900">{openRead.name}</span>
                      {openRead.position && <span className="text-xs text-slate-400">{openRead.position}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.chip}`}>{IS ? status.label.is : status.label.en}</span>
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        aria-label={IS ? "Loka" : "Close"}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <HrPlayerDetail
                    r={openRead}
                    IS={IS}
                    hrMaxDraft={hrMaxDraft}
                    setHrMaxDraft={setHrMaxDraft}
                    saveHrMax={saveHrMax}
                    savingId={savingId}
                  />
                </div>
              </div>
            );
          })()}

          {/* Structured methodology + honest limits behind a toggle (the S&C surface). */}
          {beltCount > 0 && (
            <ShowDetails label={{ EN: "Method & caveats", IS: "Aðferð & fyrirvarar" }}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-900">{IS ? "Aðferð — Edwards 1993, aðlagað" : "Method — Edwards 1993, adapted"}</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>
                    <strong>{IS ? "HR-álag:" : "HR load:"}</strong>{" "}
                    {IS
                      ? "summated-heart-rate-zone aðferð Edwards — Σ (mínútur í bandi × þyngd bands). Edwards notar 5 svæði (þyngd 1–5); Catapult sendir 8 bönd, svo þyngd = bandaröð (1..8). Aðlagað, ekki bókstafleg endurgerð."
                      : "Edwards' summated-heart-rate-zone method — Σ (minutes in band × band weight). Edwards uses 5 zones (weights 1–5); Catapult sends 8 bands, so weight = band order (1..8). Adapted, not a literal reproduction."}
                  </li>
                  <li>
                    <strong>{IS ? "Persónu-viðmiðun:" : "Personal-norm:"}</strong>{" "}
                    {IS
                      ? "þar sem böndin eru röð (ekki staðfest %HRmax-mörk) er alger AU EKKI sambærileg við sRPE. Allt lesið sem vísitala á eigin grunnlínu leikmanns (100 = meðallota) — eina verjandi samanburðinn."
                      : "because the bands are ordinal (not confirmed %HRmax cuts) the absolute AU is NOT comparable to sRPE. Everything is read as an index on the player's own baseline (100 = average session) — the only defensible comparison."}
                  </li>
                  <li>
                    <strong>{IS ? `Ósamræmis-bil (±${DIVERGENCE_GAP}):` : `Divergence gap (±${DIVERGENCE_GAP}):`}</strong>{" "}
                    {IS
                      ? `bil = HR-vísitala − sRPE-vísitala. Umfram +${DIVERGENCE_GAP} = falið álag; undir −${DIVERGENCE_GAP} = lítið hjarta-drif; þar á milli = samræmt. Fjórðungur af eigin meðaltali — stillanlegt, valið til að merkja ekki venjulegt flökt.`
                      : `gap = HR index − sRPE index. Above +${DIVERGENCE_GAP} = hidden load; below −${DIVERGENCE_GAP} = low cardiac demand; in between = aligned. A quarter of the player's own average — tunable, chosen to avoid flagging ordinary wobble.`}
                  </li>
                  <li>
                    <strong>{IS ? `Vissa:` : `Confidence:`}</strong>{" "}
                    {IS
                      ? `þarf ≥${MIN_MATURE_HR_SESSIONS} beltis-lotur fyrir þroskaða grunnlínu OG %HRmax (HRmax stillt) áður en bilið er treyst. Annars lítil vissa.`
                      : `needs ≥${MIN_MATURE_HR_SESSIONS} belt sessions for a mature baseline AND %HRmax (HRmax set) before the gap is trusted. Otherwise low confidence.`}
                  </li>
                  <li>
                    <strong>{IS ? "HRmax:" : "HRmax:"}</strong>{" "}
                    {IS
                      ? "til að reikna %HRmax notum við bestu heimild í röð — gildi stillt af þjálfara, síðan mælt hámark úr beltinu (hæsta púls í glugganum), síðan aldurs-áætlun (Tanaka 2001 / Gulati 2010 fyrir konur). Aldurs-áætlun er merkt „≈“ og hækkar ekki vissuna; hún er ekki geymd — aðeins mæld gildi eru vistuð."
                      : "to compute %HRmax we take the best available in order — a coach-set value, then the observed belt peak (highest HR in the window), then an age estimate (Tanaka 2001 / Gulati 2010 for women). An age estimate is marked “≈”, doesn't lift confidence, and isn't stored — only measured values are persisted."}
                  </li>
                </ul>
                <p className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
                  <strong>{IS ? "Heiðarleg takmörk:" : "Honest limits:"}</strong> {IS ? reads[0]?.read.caveat.is : reads[0]?.read.caveat.en}
                </p>
                <p className="mt-2 text-slate-400">
                  <strong>{IS ? "Tilvitnun:" : "Reference:"}</strong> {reads[0]?.read.citation}. Edwards S. (1993). <em>The Heart Rate Monitor Book.</em> · Buchheit M. (2024), HR monitoring in team sport. · {IS ? "HRmax-áætlun" : "HRmax estimate"}: Tanaka 2001 · Gulati 2010.
                </p>
                <p className="mt-2 text-slate-400">
                  {IS
                    ? "Utan þessa (v1): HRex / submaximal þolferill (Buchheit — „Maximizing the submaximal“), sem þarf staðlaða endurtekna submaximal áreynslu sem liðið keyrir ekki enn; og kvörðaður tími-í-%HRmax-svæði (bandamörk Catapult ekki birt). WHOOP hvíldarpúls/HRV er aðskilinn straumur, ekki blandað hér."
                    : "Out of scope (v1): HRex / submaximal fitness trend (Buchheit — “Maximizing the submaximal”), which needs a standardised repeated submaximal effort the club doesn't run yet; and calibrated time-in-%HRmax-zone (Catapult band boundaries aren't exposed). WHOOP resting-HR/HRV is a separate stream, never mixed in here."}
                </p>
              </div>
            </ShowDetails>
          )}
        </>
      )}
    </div>
  );
}
