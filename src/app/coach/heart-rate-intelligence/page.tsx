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
import { loadHrForTeam, type PlayerHrRead } from "@/lib/micropulse/hrLoad/loadForTeam";
import { type LoadAlignment } from "@/lib/micropulse/hrLoad";

// Ordinal band → colour ramp (low intensity → high). Same as the cross-check card.
const BAND_COLOR = ["#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#f59e0b", "#f97316", "#ef4444", "#b91c1c"];
const ALIGN_CLASS: Record<LoadAlignment, string> = {
  hidden_load: "text-rose-700",
  low_cardio_response: "text-amber-700",
  aligned: "text-emerald-700",
  insufficient: "text-slate-400",
};

const isFlaggedRead = (r: PlayerHrRead) =>
  r.read.latest?.alignment === "hidden_load" || r.read.latest?.alignment === "low_cardio_response";
const gapStr = (g: number | null | undefined) => (g != null ? `${g >= 0 ? "+" : ""}${g}` : "—");

type Verdict = { tone: VerdictTone; sentence: { EN: string; IS: string }; subtitle?: { EN: string; IS: string }; confidence: { level: ConfidenceLevel; note?: { EN: string; IS: string } }; drivers: VerdictDriver[] };

function computeVerdict(reads: PlayerHrRead[], rosterCount: number): Verdict {
  const beltCount = reads.length;
  if (beltCount === 0) {
    return {
      tone: "neutral",
      sentence: { EN: "No HR belt data yet — appears once a belt session syncs.", IS: "HR-beltisgögn ekki komin enn — birtast þegar HR-lota samstillist." },
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
      sentence: { EN: `Heart rate and effort ratings line up — ${beltCount} of ${rosterCount} wore the belt.`, IS: `Púls og áreynslumat samræmast — ${beltCount} af ${rosterCount} báru belti.` },
      confidence: { level, note },
      drivers: [],
    };
  }
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
  const names = flagged.slice(0, 3).map((r) => r.name.split(" ")[0]).join(", ") + (flagged.length > 3 ? ` +${flagged.length - 3}` : "");
  return {
    tone: "watch",
    sentence: { EN: `${flagged.length} player${flagged.length > 1 ? "s" : ""} — heart and effort disagree: ${names}. Worth a look.`, IS: `${flagged.length} leikm. — hjarta og áreynsla ósamræmd: ${names}. Vert að skoða.` },
    subtitle: { EN: "A cross-check to investigate — not an injury flag.", IS: "Kross-tékk til að skoða — ekki meiðslamerki." },
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

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {!loading && !error && (
        <VerdictBanner
          lang={lang}
          kicker={IS ? "Púls" : "Heart rate"}
          tone={verdict.tone}
          sentence={verdict.sentence}
          subtitle={verdict.subtitle}
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
          </div>

          {beltCount === 0 ? null : (
            <div className="space-y-2">
              {sorted.map((r) => {
                const s = r.read.latest;
                const flag = isFlaggedRead(r);
                const present = r.dist.filter((b) => (b.timeS ?? 0) > 0);
                const labelled = present.filter((b) => (b.timeS ?? 0) >= 15);
                return (
                  <div key={r.playerId} className={`rounded-lg border p-3 ${flag ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-900">{r.name}</span>
                        {r.position && <span className="ml-1 text-[11px] text-slate-400">{r.position}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-600">
                        <span>HR idx <b className="tabular-nums">{s?.hrLoadIndex ?? "—"}</b></span>
                        <span>sRPE idx <b className="tabular-nums">{s?.srpeIndex ?? "—"}</b></span>
                        <span>{IS ? "Bil" : "Gap"} <b className="tabular-nums">{gapStr(s?.gap)}</b></span>
                      </div>
                    </div>

                    <div className={`mt-1 text-[12px] ${ALIGN_CLASS[s?.alignment ?? "insufficient"]}`}>
                      {IS ? s?.verdict.is : s?.verdict.en}
                      {r.read.confidence === "low" && <span className="ml-1 text-[10px] text-slate-400">{IS ? "· lítil vissa" : "· low confidence"}</span>}
                    </div>

                    {/* %HRmax (Catapult or app HRmax) + the per-player HRmax setter */}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      {r.latestHr?.pctMax != null ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 tabular-nums">
                          %HRmax {r.latestHr.pctAvg ?? "—"} {IS ? "meðal" : "avg"} · {r.latestHr.pctMax} {IS ? "topp" : "peak"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">{IS ? "settu HRmax fyrir kvarðað %HRmax" : "set HRmax for calibrated %HRmax"}</span>
                      )}
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <span>HRmax</span>
                        <input
                          type="number" inputMode="numeric" placeholder={r.hrMax != null ? String(r.hrMax) : "bpm"}
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

                    {/* Personal-norm HR-load trend */}
                    {r.read.history.filter((h) => h.hrLoadIndex != null).length >= 2 && (
                      <div className="mt-2">
                        <div className="text-[9px] uppercase tracking-wide text-slate-400">{IS ? "HR-álag vs eigin viðmiðun (100 = meðaltal)" : "HR load vs own norm (100 = average)"}</div>
                        <Sparkline history={r.read.history} />
                      </div>
                    )}

                    {/* 8-band intensity distribution (latest session) */}
                    {present.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[9px] uppercase tracking-wide text-slate-400">{IS ? "Ákefðardreifing (nýjasta lota)" : "Intensity distribution (latest session)"}</div>
                        <div className="mt-0.5 flex h-2.5 w-full overflow-hidden rounded">
                          {present.map((b) => (
                            <div key={b.band} style={{ width: `${b.pct ?? 0}%`, backgroundColor: BAND_COLOR[b.band - 1] }}
                              title={`Band ${b.band}${b.avgBpm ? ` ≈ ${b.avgBpm} bpm` : ""} · ${Math.round((b.timeS ?? 0) / 60)}m (${b.pct ?? 0}%)`} />
                          ))}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {labelled.map((b) => (
                            <span key={b.band} className="rounded px-1 py-px text-[9px] tabular-nums text-slate-600" style={{ backgroundColor: `${BAND_COLOR[b.band - 1]}33` }}>
                              B{b.band} · {b.pct}%{b.avgBpm ? <span className="text-slate-400"> ~{b.avgBpm}bpm</span> : null}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Raw sessions + methodology honesty behind a toggle (the S&C surface). */}
          {beltCount > 0 && (
            <ShowDetails label={{ EN: "Show method & caveats", IS: "Sýna aðferð & fyrirvara" }}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                <p>{IS ? reads[0]?.read.caveat.is : reads[0]?.read.caveat.en}</p>
                <p className="mt-1 text-slate-400">{reads[0]?.read.citation}</p>
                <p className="mt-1 text-slate-400">
                  {IS
                    ? "Bönd 1–8 = Catapult ákefðarbönd (mörk stillt í OpenField) — ekki kvörðuð %HRmax svæði; bpm-merki birt aðeins þar sem raunhæft. HR-álag er persónu-viðmiðun, ekki sambærilegt við sRPE í AU. Bil > 25 = ósamræmi."
                    : "Bands 1–8 = Catapult intensity bands (boundaries set in OpenField) — not calibrated %HRmax zones; bpm labels only where reliable. HR load is personal-norm, not comparable to sRPE in AU. Gap > 25 = diverging."}
                </p>
              </div>
            </ShowDetails>
          )}
        </>
      )}
    </div>
  );
}
