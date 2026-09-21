"use client";

/**
 * Player-facing MAS interval-session card — his own conditioning session from his MAS test: pick a
 * format and see the speed (km/h), per-rep distance, and reps × work / rest × sets. Uses the same
 * pure `buildIntervalSession` lib as the coach card, so the read matches what staff prescribe.
 *
 * View-only for the athlete (no reps/rest overrides — that's the coach's to adjust). A starting
 * template his coach may change; speeds are only as good as the MAS test. Self-hides until a MAS test
 * exists. Descriptive — never touches readiness.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { buildIntervalSession, HIIT_FORMATS, type HiitFormatId, type MasConfidence } from "@/lib/micropulse/load/intervalSession";

const FORMAT_ORDER: HiitFormatId[] = ["long", "short", "threshold", "rsa", "recovery"];
const CONF_TONE: Record<string, string> = { high: "bg-emerald-100 text-emerald-700", moderate: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-500" };

export default function PlayerIntervalSessionCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [mas, setMas] = React.useState<{ kmh: number; confidence: MasConfidence } | null | undefined>(undefined);
  const [format, setFormat] = React.useState<HiitFormatId>("long");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
      if (!tok) { if (alive) setMas(null); return; }
      const res = await fetch("/api/player/mas", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (alive) setMas(j && j.ok ? (j.mas ?? null) : null);
    })();
    return () => { alive = false; };
  }, []);

  const session = React.useMemo(() => buildIntervalSession({ masKmh: mas?.kmh ?? null, masConfidence: mas?.confidence, format }), [mas, format]);
  const mmss = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec}s`);

  if (mas === undefined) return null;          // still loading
  if (!mas || !session) return null;           // self-hide until a MAS test exists

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Þolæfing úr MAS" : "Conditioning from MAS"}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CONF_TONE[session.confidence] ?? CONF_TONE.moderate}`}>
          MAS {session.masKmh} km/h
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {FORMAT_ORDER.map((f) => (
          <button key={f} onClick={() => setFormat(f)}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${format === f ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {is ? HIIT_FORMATS[f].label.is : HIIT_FORMATS[f].label.en}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[13px] text-slate-600">{is ? session.goal.is : session.goal.en}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{is ? "Hraði" : "Speed"}</div>
          <div className="text-[15px] font-bold tabular-nums text-slate-900">{session.speedKmh} <span className="text-[11px] font-normal text-slate-400">km/h</span></div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{is ? "Á endurtekningu" : "Per rep"}</div>
          <div className="text-[15px] font-bold tabular-nums text-slate-900">{session.repDistanceM} <span className="text-[11px] font-normal text-slate-400">m · {mmss(session.workSec)}</span></div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{is ? "Uppbygging" : "Structure"}</div>
          <div className="text-[13px] font-bold tabular-nums text-slate-900">{session.reps}×{mmss(session.workSec)} / {mmss(session.restSec)}{session.sets > 1 ? ` ×${session.sets}` : ""}</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{is ? "Alls" : "Total"}</div>
          <div className="text-[13px] font-bold tabular-nums text-slate-900">{session.totalSessionMin} {is ? "mín" : "min"} · {session.sessionDistanceM} m</div>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        {is
          ? "Byrjunar-sniðmát úr MAS-prófinu þínu — þjálfarinn getur aðlagað endurtekningar/hvíld. Keyrðu sem tíma eða mælda vegalengd. Lýsandi — ekki fyrirmæli."
          : "A starting template from your MAS test — your coach may adjust reps/rest. Run it as time or the marked distance. Descriptive — not a prescription."}
      </p>
    </div>
  );
}
