"use client";

/**
 * MAS interval-session builder — turns the player's MAS zones into a runnable HIIT session: pick a
 * format (Long / Short / Threshold / RSA / Recovery) and get his speed (km/h), per-rep distance, and
 * reps × work / rest × sets, with editable reps/rest. A starting TEMPLATE the coach owns and adjusts;
 * speeds are only as good as the MAS test. Descriptive — never touches readiness. Bilingual.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import { buildIntervalSession, HIIT_FORMATS, type HiitFormatId, type MasConfidence } from "@/lib/micropulse/load/intervalSession";

type Resp = { ok: boolean; mas?: { kmh: number; confidence: MasConfidence } | null };
const CONF_TONE: Record<string, string> = { high: "bg-emerald-100 text-emerald-700", moderate: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-500" };
const FORMAT_ORDER: HiitFormatId[] = ["long", "short", "threshold", "rsa", "recovery"];

export default function IntervalSessionCard({ players, playerId }: { players: Array<{ id: string; name: string }>; playerId?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [selInternal, setSelInternal] = React.useState("");
  const sel = playerId ?? selInternal;
  const [mas, setMas] = React.useState<{ kmh: number; confidence: MasConfidence } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [format, setFormat] = React.useState<HiitFormatId>("long");
  const [reps, setReps] = React.useState<string>("");
  const [restSec, setRestSec] = React.useState<string>("");

  React.useEffect(() => { if (!playerId && !selInternal && players.length) setSelInternal(players[0].id); }, [players, selInternal, playerId]);

  const load = React.useCallback(async () => {
    if (!sel) return;
    setLoading(true);
    try {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
      if (!tok) return;
      const j: Resp | null = await fetch(`/api/coach/load/peak-period?player=${sel}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setMas(j?.ok ? (j.mas ?? null) : null);
    } finally { setLoading(false); }
  }, [sel]);
  React.useEffect(() => { setReps(""); setRestSec(""); void load(); }, [load]);

  const session = React.useMemo(() => buildIntervalSession({
    masKmh: mas?.kmh ?? null, masConfidence: mas?.confidence,
    format, overrides: { reps: reps ? Number(reps) : undefined, restSec: restSec ? Number(restSec) : undefined },
  }), [mas, format, reps, restSec]);

  const mmss = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec}s`);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Intervöl-æfing (úr MAS)" : "Interval session (from MAS)"}</span>
        <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is ? "MAS-svæði → HIIT-snið (Buchheit & Laursen). Sniðmát sem þjálfari á og aðlagar — snertir aldrei readiness." : "MAS zones → HIIT formats (Buchheit & Laursen). A template the coach owns & adjusts — never touches readiness."}>
          HIIT ⓘ
        </span>
        {!playerId ? (
          <select value={sel} onChange={(e) => setSelInternal(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
      </div>

      {/* Format picker */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {FORMAT_ORDER.map((f) => (
          <button key={f} onClick={() => { setFormat(f); setReps(""); setRestSec(""); }}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${format === f ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {is ? HIIT_FORMATS[f].label.is : HIIT_FORMATS[f].label.en}
          </button>
        ))}
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {!loading && !mas ? (
        <p className="mt-3 text-[13px] text-slate-500">{is ? "Skráðu MAS-próf fyrst (t.d. 4-mín hlaup eða VAMEVAL) til að byggja intervöl." : "Record a MAS test first (e.g. a 4-min run or VAMEVAL) to build intervals."}</p>
      ) : null}

      {!loading && session ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-slate-600">{is ? session.goal.is : session.goal.en}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CONF_TONE[session.confidence] ?? CONF_TONE.moderate}`}>
              MAS {session.masKmh} km/h · {is ? "vissa" : "conf"} {session.confidence}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{is ? "Hraði" : "Speed"}</div>
              <div className="text-[15px] font-bold tabular-nums text-slate-900">{session.speedKmh} <span className="text-[11px] font-normal text-slate-400">km/h · {session.pctMas}%</span></div>
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

          {/* Editable overrides */}
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-slate-500">{is ? "Endurtekningar" : "Reps"}
              <input value={reps} onChange={(e) => setReps(e.target.value)} inputMode="numeric" placeholder={String(HIIT_FORMATS[format].reps)}
                className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
            </label>
            {!HIIT_FORMATS[format].continuous ? (
              <label className="text-[11px] text-slate-500">{is ? "Hvíld (s)" : "Rest (s)"}
                <input value={restSec} onChange={(e) => setRestSec(e.target.value)} inputMode="numeric" placeholder={String(HIIT_FORMATS[format].restSec)}
                  className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
              </label>
            ) : null}
            <span className="text-[11px] text-slate-400">{is ? `vinna alls ${session.totalWorkMin} mín` : `${session.totalWorkMin} min work`}</span>
          </div>

          <ShowDetails label={{ EN: "How to read this", IS: "Hvernig á að lesa þetta" }}>
            <p className="text-[11px] leading-relaxed text-slate-500">{is ? session.note.is : session.note.en}</p>
            <p className="mt-1 text-[10px] text-slate-400">{session.cite}</p>
          </ShowDetails>
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-slate-400">{is ? "Reglur reikna — ekki AI. Sniðmát, ekki fyrirmæli — snertir aldrei readiness." : "Rules compute — not AI. A template, not a prescription — never touches readiness."}</p>
    </div>
  );
}
