"use client";

/**
 * Peak demands — the most intense sessions a player has faced, and how they compare
 * to his own typical. Follows the player selected in the Match Movement comparison
 * above. Reads the peak-intensity fingerprint (PlayerLoad/min, peak metabolic power,
 * high-speed rate, high-intensity efforts/min) and mechanical-load intensity from the
 * session summaries. Layered read: verdict → plain why → confidence → detail.
 *
 * Phase 1 uses session-summary proxies — a peak-intensity fingerprint, NOT a true
 * rolling peak period (that needs the per-interval Catapult export, Phase 2). Labelled
 * as a proxy throughout. Descriptive load context — it never touches the readiness
 * colour, the load target, or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import type { PeakRead, PeakLevel } from "@/lib/micropulse/load/peakIntensity";
import type { MechRead, MechDemand } from "@/lib/micropulse/load/mechanicalPower";
import type { PeakBenchmarkRead, Band, BenchRow } from "@/lib/micropulse/load/peakBenchmark";
import type { PeakMovementRead, MovementArchetype, MovementSegment } from "@/lib/micropulse/peakMovementSignature";

type Resp = {
  ok: boolean;
  name: string | null;
  position: string | null;
  hasData: boolean;
  peak: PeakRead;
  mechanical: MechRead;
  benchmark: PeakBenchmarkRead | null;
  movementSignature: PeakMovementRead | null;
};

const ARCHETYPE_TONE: Record<MovementArchetype, { dot: string; text: string }> = {
  straight_attacking: { dot: "#2740e6", text: "text-blue-700" },
  straight_recovery: { dot: "#de9328", text: "text-amber-700" },
  multidirectional: { dot: "#7a5cc4", text: "text-violet-700" },
  low_intensity: { dot: "#94a3b8", text: "text-slate-500" },
};

const SEGMENT_COLOR: Record<MovementSegment["key"], string> = {
  forward: "#2740e6", backward: "#de9328", multidirectional: "#7a5cc4",
};

/** Peak-window MOVEMENT SIGNATURE — what his peak intensity is made of (Catapult-only). */
function MovementSignatureBlock({ m, is }: { m: PeakMovementRead; is: boolean }) {
  if (!m.hasData) {
    return (
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="text-[13px] font-bold text-slate-800">{is ? "Úr hverju er hámarkið? (hreyfing)" : "What is the peak made of? (movement)"}</div>
        <p className="mt-1.5 text-[13px] text-slate-500">{m.verdict[is ? "is" : "en"]}</p>
      </div>
    );
  }
  const tone = m.archetype ? ARCHETYPE_TONE[m.archetype] : { dot: "#94a3b8", text: "text-slate-500" };
  const confWord = is ? { high: "há", medium: "meðal", low: "lág" }[m.confidence] : m.confidence;
  const segs = m.segments.filter((s) => s.share > 0.001);
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">{is ? "Úr hverju er hámarkið? (hreyfing)" : "What is the peak made of? (movement)"}</span>
        <span
          className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={m.caveat[is ? "is" : "en"]}
        >
          {is ? "GPS/IMA hreyfing ⓘ" : "GPS/IMA movement ⓘ"}
        </span>
      </div>

      {/* (0) verdict */}
      <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${tone.text}`}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.dot }} />
        {m.verdict[is ? "is" : "en"]}
      </p>

      {/* (1) stacked movement-mix bar */}
      <div className="mt-2.5">
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {segs.map((s) => (
            <div
              key={s.key}
              style={{ width: `${Math.max(s.share * 100, 1)}%`, backgroundColor: SEGMENT_COLOR[s.key] }}
              title={`${s.label[is ? "is" : "en"]}: ${Math.round(s.share * 100)}%`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {segs.map((s) => (
            <span key={s.key} className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: SEGMENT_COLOR[s.key] }} />
              {s.label[is ? "is" : "en"]} {Math.round(s.share * 100)}%
            </span>
          ))}
        </div>
      </div>

      {/* Repetition axis (RHIE) — a compact at-a-glance badge; the detail is a fact below */}
      {m.repeatedSprint ? (() => {
        const lv = m.repeatedSprint.level;
        const c = lv === "high" ? { bg: "bg-rose-50", tx: "text-rose-700", b: "border-rose-200" }
          : lv === "moderate" ? { bg: "bg-amber-50", tx: "text-amber-700", b: "border-amber-200" }
          : { bg: "bg-slate-50", tx: "text-slate-500", b: "border-slate-200" };
        const word = is ? { high: "hátt", moderate: "miðlungs", low: "lágt" }[lv] : lv;
        return (
          <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.tx} ${c.b}`}>
            {is ? "Endurtekið sprett-álag" : "Repeated-sprint load"}: {word} · {m.repeatedSprint.bouts} {is ? "lotur" : "bouts"}
          </span>
        );
      })() : null}

      {/* (1) plain facts */}
      {m.facts.length ? (
        <ul className="mt-2 space-y-1 text-[13px] text-slate-600">
          {m.facts.map((f, i) => <li key={i}>• {f[is ? "is" : "en"]}</li>)}
        </ul>
      ) : null}

      <p className="mt-1.5 text-[11px] text-slate-400">
        {is ? "Áreiðanleiki" : "Confidence"}: {confWord} · {m.intenseEvents} {is ? "ákafar stefnu-hreyfingar" : "intense directional efforts"}
        {m.intenseShare != null ? ` · ${Math.round(m.intenseShare * 100)}% ${is ? "ákaft (rest lág)" : "intense (rest low)"}` : ""}
      </p>

      <ShowDetails
        label={{ EN: "How this is read", IS: "Hvernig þetta er lesið" }}
        hint={{ EN: "movement, not the Ju taxonomy", IS: "hreyfing, ekki Ju-flokkun" }}
      >
        <p className="text-[12px] leading-relaxed text-slate-500">{m.caveat[is ? "is" : "en"]}</p>
      </ShowDetails>

      <p className="mt-1.5 text-[11px] text-slate-400">
        {is ? "Reglur reikna — ekki AI." : "Rules compute — not AI."} · {m.citation}
      </p>
    </div>
  );
}

const BAND_TONE: Record<Band, { dot: string; text: string; word: { en: string; is: string } }> = {
  elite: { dot: "#1c7a4a", text: "text-emerald-700", word: { en: "elite", is: "elite" } },
  high: { dot: "#2740e6", text: "text-blue-700", word: { en: "high", is: "hátt" } },
  average: { dot: "#de9328", text: "text-amber-700", word: { en: "average", is: "meðal" } },
  below: { dot: "#a83e28", text: "text-rose-700", word: { en: "below", is: "undir" } },
  context: { dot: "#94a3b8", text: "text-slate-500", word: { en: "context", is: "samhengi" } },
  na: { dot: "#cbd5e1", text: "text-slate-400", word: { en: "—", is: "—" } },
};

function BenchmarkBlock({ b, is }: { b: PeakBenchmarkRead; is: boolean }) {
  const topBand = b.rows.find((r) => r.key === "top_speed")?.band ?? "na";
  const tone = BAND_TONE[topBand];
  const fmtVal = (r: BenchRow) => (r.playerValue == null ? "–" : r.playerValue.toFixed(r.unit === "km/h" ? 1 : 0));
  const confWord = is ? { high: "há", medium: "meðal", low: "lág" }[b.confidence] : b.confidence;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">{is ? "Á móti elite (Ju 2022)" : "vs elite (Ju 2022)"}</span>
        <span
          className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={b.caveat[is ? "is" : "en"]}
        >
          {is ? "stöðu-viðmið ⓘ" : "position ref ⓘ"}
        </span>
      </div>

      {/* (0) verdict */}
      <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${tone.text}`}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.dot }} />
        {b.verdict[is ? "is" : "en"]}
      </p>

      {/* (1) plain facts */}
      {b.facts.length ? (
        <ul className="mt-1.5 space-y-1 text-[13px] text-slate-600">
          {b.facts.map((f, i) => <li key={i}>• {f[is ? "is" : "en"]}</li>)}
        </ul>
      ) : null}

      <p className="mt-1.5 text-[11px] text-slate-400">
        {is ? "Áreiðanleiki" : "Confidence"}: {confWord}
      </p>

      <ShowDetails
        label={{ EN: "Show the benchmark table", IS: "Sýna viðmiðatöfluna" }}
        hint={{ EN: "player value vs elite reference", IS: "gildi leikmanns vs elite-viðmið" }}
      >
        <div className="space-y-3 text-[12px]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">{is ? "Mælikvarði" : "Metric"}</th>
                <th className="py-1 text-right font-medium">{is ? "Leikmaður" : "Player"}</th>
                <th className="py-1 text-right font-medium">{is ? "Elite-viðmið" : "Elite ref"}</th>
                <th className="py-1 text-right font-medium">{is ? "Staða" : "Band"}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-700">
              {b.rows.map((r) => (
                <tr key={r.key} className="border-b border-slate-100">
                  <td className="py-1 text-slate-600">{r.label[is ? "is" : "en"]}</td>
                  <td className="py-1 text-right">{fmtVal(r)} <span className="text-slate-400">{r.unit}</span></td>
                  <td className="py-1 text-right text-slate-500">{r.eliteRef}</td>
                  <td className={`py-1 text-right font-medium ${BAND_TONE[r.band].text}`}>{BAND_TONE[r.band].word[is ? "is" : "en"]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Peak-period HIR track — the Table 2 reference, with an honest gate */}
          <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2.5">
            <div className="text-[11px] font-semibold text-amber-800">
              {is ? "Hámarkstímabils háákafahlaup (Tafla 2)" : "Peak-period high-intensity running (Table 2)"}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-600">
              {is ? "Viðmið fyrir stöðuna" : "Reference for the position"}: 1-mín {b.peakHir.ref.w1}, 3-mín {b.peakHir.ref.w3}, 5-mín {b.peakHir.ref.w5} m/min
            </p>
            {b.peakHir.comparable ? (
              <table className="mt-1.5 w-full">
                <tbody className="tabular-nums text-slate-700">
                  {b.peakHir.rows.map((r) => (
                    <tr key={r.key} className="border-b border-amber-100/60 last:border-0">
                      <td className="py-1 text-slate-600">{r.label[is ? "is" : "en"]}</td>
                      <td className="py-1 text-right">{r.playerValue == null ? "–" : r.playerValue.toFixed(0)} m/min</td>
                      <td className="py-1 text-right text-slate-500">{r.eliteRef}</td>
                      <td className={`py-1 text-right font-medium ${BAND_TONE[r.band].text}`}>{BAND_TONE[r.band].word[is ? "is" : "en"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">{b.peakHir.gapNote[is ? "is" : "en"]}</p>
            )}
            {b.peakHir.comparable && b.peakHir.thresholdNote ? (
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                {is ? "Uppruni" : "Provenance"}: {b.peakHir.thresholdNote[is ? "is" : "en"]}
              </p>
            ) : null}
          </div>

          {/* Peak-period fall-off SHAPE — total distance (context only, never graded vs Table 2) */}
          {b.shape.available ? (() => {
            const sr = b.shape.read;
            const dot = sr === "sustains" ? "#1c7a4a" : sr === "steep" ? "#a83e28" : "#de9328";
            const word = sr === "sustains" ? { en: "holds well", is: "heldur vel" } : sr === "steep" ? { en: "steep fall-off", is: "bratt fall" } : { en: "moderate fall-off", is: "hóflegt fall" };
            return (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
                  <span className="text-[11px] font-semibold text-slate-700">{is ? "Hámarks-lögun (heildarvegalengd)" : "Peak-period shape (total distance)"}</span>
                  <span className="text-[11px] text-slate-500">— {word[is ? "is" : "en"]}</span>
                </div>
                <p className="mt-0.5 tabular-nums text-[11px] text-slate-600">
                  1-mín {b.shape.w1?.toFixed(0) ?? "–"} → 3-mín {b.shape.w3?.toFixed(0) ?? "–"} → 5-mín {b.shape.w5?.toFixed(0) ?? "–"} m/min
                  {b.shape.retain5 != null ? ` · ${is ? "heldur" : "keeps"} ${b.shape.retain5}% ${is ? "yfir 5 mín" : "over 5 min"}` : ""}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{b.shape.note[is ? "is" : "en"]}</p>
              </div>
            );
          })() : null}
        </div>
      </ShowDetails>

      <p className="mt-1.5 text-[11px] text-slate-400">
        {is ? "Reglur reikna — ekki AI." : "Rules compute — not AI."} · {b.citation}
      </p>
    </div>
  );
}

function levelTone(level: PeakLevel): { dot: string; text: string } {
  switch (level) {
    case "peak": return { dot: "#a83e28", text: "text-rose-700" };
    case "elevated": return { dot: "#de9328", text: "text-amber-700" };
    case "below": return { dot: "#2740e6", text: "text-blue-700" };
    case "typical": return { dot: "#1c7a4a", text: "text-emerald-700" };
    default: return { dot: "#94a3b8", text: "text-slate-400" };
  }
}

function levelWord(level: PeakLevel, is: boolean): string {
  const en: Record<PeakLevel, string> = { peak: "Peak", elevated: "Elevated", typical: "Typical", below: "Below usual", insufficient: "Not enough data" };
  const isl: Record<PeakLevel, string> = { peak: "Hámark", elevated: "Hækkað", typical: "Dæmigert", below: "Undir venju", insufficient: "Ekki næg gögn" };
  return is ? isl[level] : en[level];
}

function demandWord(d: MechDemand, is: boolean): string {
  const en: Record<MechDemand, string> = { high: "High", typical: "Typical", low: "Low", insufficient: "n/a" };
  const isl: Record<MechDemand, string> = { high: "Há", typical: "Dæmigerð", low: "Lág", insufficient: "n/a" };
  return is ? isl[d] : en[d];
}

const fmt = (v: number | null | undefined, d = 1): string => (v == null ? "–" : v.toFixed(d));
const idx = (v: number | null | undefined): string => (v == null ? "–" : `${Math.round(v)}`);

export default function MatchPeakDemandsCard({ selectedPlayerId }: { selectedPlayerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Resp | null>(null);

  React.useEffect(() => {
    if (!selectedPlayerId) { setData(null); return; }
    let alive = true;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) { if (alive) setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
        const res = await fetch(`/api/coach/player/${selectedPlayerId}/peak-demands`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (!alive) return;
        if (!res.ok || !j?.ok) { setErr(is ? "Náði ekki í gögn." : "Couldn't load."); return; }
        setData(j);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selectedPlayerId, is]);

  const title = is ? "Hámarkskrafa" : "Peak demands";

  if (!selectedPlayerId) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold text-slate-800">{title}</div>
        <p className="mt-1 text-[13px] text-slate-500">
          {is ? "Veldu leikmann að ofan til að sjá hámarkskröfu hans." : "Pick a player above to see his peak demands."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{title}</span>
        <span
          className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={is
            ? "Hámarks-ákefðar fingrafar úr lotu-samantektum (PlayerLoad/mín, hámarks efnaskiptaafl, háhraðahlaup, hákröftug átök/mín) — nálgun, ekki raunverulegt rúllandi hámarkstímabil."
            : "A peak-intensity fingerprint from session summaries (PlayerLoad/min, peak metabolic power, high-speed rate, high-intensity efforts/min) — a proxy, not a true rolling peak period."}
        >
          {is ? "nálgun ⓘ" : "proxy ⓘ"}
        </span>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}
      {err ? <p className="mt-3 text-[13px] font-medium text-red-700">{err}</p> : null}

      {data && !loading && !err ? (<>
        {!data.hasData ? (
          data.benchmark || data.movementSignature?.hasData ? null : (
            <p className="mt-2 text-[13px] text-slate-500">
              {is ? "Engin GPS/IMA lotu-gögn fyrir þennan leikmann enn." : "No GPS/IMA session data for this player yet."}
            </p>
          )
        ) : (() => {
          const peak = data.peak;
          const mech = data.mechanical;
          const latest = peak.latest;
          const worst = peak.worstCase;
          const tone = levelTone(latest?.level ?? "insufficient");

          // Layer 0 — verdict.
          const verdict = latest?.level && latest.level !== "insufficient"
            ? (is
                ? `Síðasta lota: ${levelWord(latest.level, true).toLowerCase()} ákefð fyrir hann (${idx(latest.fingerprint)} vs 100 = venja).`
                : `Latest session: ${levelWord(latest.level, false).toLowerCase()} intensity for him (${idx(latest.fingerprint)} vs 100 = his usual).`)
            : (is ? "Ekki næg gögn til að staðsetja síðustu lotu enn." : "Not enough data to place his latest session yet.");

          // Layer 1 — 2–3 plain facts.
          const facts: string[] = [];
          if (peak.ceiling != null) {
            facts.push(is
              ? `Dæmigerð hámarks-ákefð (p90 PlayerLoad/mín yfir raunlotur ≥20 mín): ${fmt(peak.ceiling)}/mín — hans "erfiðu daga" þak.`
              : `Typical peak intensity (p90 PlayerLoad/min over real ≥20-min sessions): ${fmt(peak.ceiling)}/min — his "hard-day" ceiling.`);
          }
          if (worst) {
            facts.push(is
              ? `Ákafasta lota tímabilsins: ${worst.date.slice(5)} (fingrafar ${idx(worst.fingerprint)}, PlayerLoad ${fmt(worst.proxies.loadPerMin)}/mín) — versta-tilfellis krafan.`
              : `Most intense session this window: ${worst.date.slice(5)} (fingerprint ${idx(worst.fingerprint)}, PlayerLoad ${fmt(worst.proxies.loadPerMin)}/min) — the worst-case demands.`);
          }
          if (mech.latest?.demand && mech.latest.demand !== "insufficient") {
            facts.push(is
              ? `Vélræn krafa síðustu lotu: ${demandWord(mech.latest.demand, true).toLowerCase()} (${idx(mech.latest.mechIndex)} vs venja) — skurðir, hröðun og hemlun á mínútu.`
              : `Latest mechanical demand: ${demandWord(mech.latest.demand, false).toLowerCase()} (${idx(mech.latest.mechIndex)} vs usual) — cuts, accelerations and decelerations per minute.`);
          }
          if (latest?.proxies.metabolicPeak != null) {
            facts.push(is
              ? `Hámarks efnaskiptaafl síðast: ${fmt(latest.proxies.metabolicPeak)} W/kg (${idx(latest.indices.metabolicPeak)} vs venja).`
              : `Peak metabolic power last out: ${fmt(latest.proxies.metabolicPeak)} W/kg (${idx(latest.indices.metabolicPeak)} vs usual).`);
          }

          const confWord = is
            ? { high: "há", medium: "meðal", low: "lág" }[peak.confidence]
            : peak.confidence;

          return (
            <div className="mt-3 space-y-2">
              <p className={`flex items-center gap-2 text-sm font-medium ${tone.text}`}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.dot }} />
                {verdict}
              </p>
              {facts.length ? (
                <ul className="space-y-1 text-[13px] text-slate-600">
                  {facts.map((f, i) => <li key={i}>• {f}</li>)}
                </ul>
              ) : null}
              <p className="text-[11px] text-slate-400" title={peak.caveat[is ? "is" : "en"]}>
                {is ? "Áreiðanleiki" : "Confidence"}: {confWord} · {peak.dataCoverage.sessions} {is ? "lotur" : "sessions"} · {peak.dataCoverage.proxies}/4 {is ? "mælikvarðar" : "proxies"}
              </p>

              <ShowDetails
                label={{ EN: "Show the peak-intensity fingerprint", IS: "Sýna hámarks-ákefðar fingrafar" }}
                hint={{ EN: "each proxy vs his own norm", IS: "hver mælikvarði vs eigin viðmið" }}
              >
                <div className="space-y-3 text-[12px]">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-1 font-medium">{is ? "Mælikvarði (síðast)" : "Proxy (latest)"}</th>
                        <th className="py-1 text-right font-medium">{is ? "Gildi" : "Value"}</th>
                        <th className="py-1 text-right font-medium">{is ? "vs venja" : "vs usual"}</th>
                        <th className="py-1 text-right font-medium">{is ? "Versta lota" : "Worst"}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums text-slate-700">
                      {([
                        ["PlayerLoad/min", latest?.proxies.loadPerMin, latest?.indices.loadPerMin, worst?.proxies.loadPerMin, 1],
                        [is ? "Hámarks efnaskiptaafl (W/kg)" : "Peak metab. power (W/kg)", latest?.proxies.metabolicPeak, latest?.indices.metabolicPeak, worst?.proxies.metabolicPeak, 1],
                        [is ? "Háhraðahlaup (m/mín)" : "High-speed (m/min)", latest?.proxies.hsrRate, latest?.indices.hsrRate, worst?.proxies.hsrRate, 1],
                        [is ? "Hákröftug átök/mín" : "High-intensity efforts/min", latest?.proxies.effortsPerMin, latest?.indices.effortsPerMin, worst?.proxies.effortsPerMin, 2],
                      ] as Array<[string, number | null | undefined, number | null | undefined, number | null | undefined, number]>).map(([label, v, ix, w, dp]) => (
                        <tr key={label} className="border-b border-slate-100">
                          <td className="py-1 text-slate-600">{label}</td>
                          <td className="py-1 text-right">{fmt(v, dp)}</td>
                          <td className="py-1 text-right">{idx(ix)}</td>
                          <td className="py-1 text-right text-slate-500">{fmt(w, dp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="leading-relaxed text-slate-500">{peak.caveat[is ? "is" : "en"]}</p>
                </div>
              </ShowDetails>

              <p className="text-[11px] text-slate-400">
                {is ? "Reglur reikna — ekki AI." : "Rules compute — not AI."} · {peak.citation}
              </p>
            </div>
          );
        })()}
        {data.movementSignature ? <MovementSignatureBlock m={data.movementSignature} is={is} /> : null}
        {data.benchmark ? <BenchmarkBlock b={data.benchmark} is={is} /> : null}
      </>) : null}
    </div>
  );
}
