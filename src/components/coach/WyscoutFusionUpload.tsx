"use client";

/**
 * Coach widget — physical peak × tactical content (Wyscout SportsCode fusion).
 *
 * Drop the two Wyscout "Download SportsCode XML" exports (player-events + team-events)
 * and a match date; the route aligns each already-loaded Catapult peak window to the
 * time-stamped events and returns, per player per window, his on-ball actions + the
 * team's tactical phase around that window. Descriptive — never the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PeakContextBars from "@/components/coach/PeakContextBars";

type Bi = { en: string; is: string };
type ActionShare = { action: string; label: Bi; count: number; share: number; offBall: boolean };
type WindowRead = {
  windowMin: number; metric: string; value: number | null;
  secondHalf: boolean; alignment: string;
  verdict: Bi; actions: ActionShare[]; events: number; onBallEvents: number; confidence: string;
  teamLabels: Record<string, number>;
};
type PlayerRead = { playerId: string; name: string; wyscoutCode: string; windows: WindowRead[] };
type Resp = { ok: boolean; error?: string; matchDate?: string; playerInstances?: number; teamInstances?: number; codesMatched?: number; codesTotal?: number; players?: PlayerRead[]; note?: string };

const METRIC_LABEL: Record<string, Bi> = {
  distance: { en: "running", is: "hlaup" },
  player_load: { en: "Player Load", is: "Player Load" },
  hsr: { en: "high-speed", is: "háhraði" },
};

function topLabels(m: Record<string, number>, n = 6): string {
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ×${v}`).join(", ");
}

export default function WyscoutFusionUpload() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [date, setDate] = React.useState("");
  const [playerFile, setPlayerFile] = React.useState<File | null>(null);
  const [teamFile, setTeamFile] = React.useState<File | null>(null);
  const [htGap, setHtGap] = React.useState("900");
  const [h1End, setH1End] = React.useState("2850");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<Resp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function run() {
    if (!playerFile || !date) { setErr(is ? "Veldu player-events skrá og leikdag." : "Pick the player-events file and a match date."); return; }
    setBusy(true); setErr(null); setRes(null);
    try {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData();
      fd.set("playerEvents", playerFile); if (teamFile) fd.set("teamEvents", teamFile);
      fd.set("match_date", date); fd.set("half_time_gap_s", htGap); fd.set("first_half_end_s", h1End);
      const r = await fetch("/api/coach/load/peak-context/upload", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const j = (await r.json().catch(() => ({}))) as Resp;
      if (!r.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setRes(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  return (
    <details className="group mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <span className="transition-transform group-open:rotate-90">▸</span>
        {is ? "Peak-samhengi — Wyscout atburðir (fusion)" : "Peak-context — Wyscout events (fusion)"}
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700">{is ? "líkamlegt × taktík" : "physical × tactical"}</span>
      </summary>

      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        {is
          ? "Settu inn Wyscout „Download SportsCode XML\" (leikmanna-atburðir + valfrjálst lið-atburðir) og leikdag. Fyrir hvern peak-glugga (úr Catapult) sýnir þetta hvað leikmaðurinn gerði á boltanum OG hvað liðið var að gera taktískt á sama tíma. Fyrri hálfleikur stillist nákvæmlega; seinni hálfleikur er færður um hálfleikshléið (merkt „u.þ.b.\")."
          : "Drop the Wyscout \"Download SportsCode XML\" (player-events + optional team-events) and the match date. For each peak window (from Catapult) it shows what the player did on the ball AND what the team was doing tactically at that moment. First half aligns exactly; second half is shifted by the half-time gap (flagged \"approx\")."}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-slate-600">{is ? "Leikmanna-atburðir (XML)" : "Player-events (XML)"}
          <input type="file" accept=".xml" onChange={(e) => { setPlayerFile(e.target.files?.[0] ?? null); setRes(null); }} className="mt-0.5 block text-[12px]" />
        </label>
        <label className="text-[12px] text-slate-600">{is ? "Lið-atburðir (XML, valfrjálst)" : "Team-events (XML, optional)"}
          <input type="file" accept=".xml" onChange={(e) => { setTeamFile(e.target.files?.[0] ?? null); setRes(null); }} className="mt-0.5 block text-[12px]" />
        </label>
        <label className="text-[12px] text-slate-600">{is ? "Leikdagur" : "Match date"}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-1 rounded border border-slate-300 px-1.5 py-0.5 text-[12px]" />
        </label>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <label title={is ? "Sekúndur af hálfleikshléi (session-klukka)" : "Half-time length in seconds (session clock)"}>{is ? "Hálfleikshlé (s)" : "Half-time (s)"}
            <input type="number" value={htGap} onChange={(e) => setHtGap(e.target.value)} className="ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-[12px]" />
          </label>
          <label title={is ? "Session-sekúnda þar sem fyrri hálfleikur endar" : "Session-clock second where H1 ends"}>{is ? "H1 endar (s)" : "H1 end (s)"}
            <input type="number" value={h1End} onChange={(e) => setH1End(e.target.value)} className="ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-[12px]" />
          </label>
        </div>
      </div>

      <button onClick={run} disabled={busy || !playerFile || !date} className="mt-3 rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
        {busy ? (is ? "Reikna…" : "Computing…") : (is ? "Reikna peak-samhengi" : "Compute peak-context")}
      </button>

      {err && <p className="mt-2 text-[12px] font-medium text-rose-700">{err}</p>}

      {res && (
        <div className="mt-3 space-y-3">
          <div className="text-[12px] text-slate-600">
            {is ? "Atburðir" : "Events"}: <b>{res.playerInstances}</b> {is ? "leikmanna" : "player"} · <b>{res.teamInstances}</b> {is ? "lið" : "team"} · {is ? "pössuðu" : "matched"} <b>{res.codesMatched}/{res.codesTotal}</b>
          </div>
          {(res.players ?? []).length === 0 && (
            <p className="text-[12px] text-slate-500">{is ? "Engir leikmenn með bæði peak-glugga og pössuð Wyscout-nöfn fyrir þennan leik." : "No players with both a peak window and a matched Wyscout name for this match."}</p>
          )}
          {(res.players ?? []).map((p) => (
            <div key={p.playerId} className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-900">{p.name} <span className="text-[11px] font-normal text-slate-400">· {p.wyscoutCode}</span></div>
              {/* Ju 2022 Fig. 2 style — what his peak windows were made of, tactically. */}
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Úr hverju peak-gluggarnir eru gerðir" : "What his peak windows are made of"}</div>
              <PeakContextBars windows={p.windows} is={is} />
              <div className="mt-2 space-y-2">
                {p.windows.map((w, i) => (
                  <div key={i} className="rounded-md bg-slate-50 p-2">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="font-medium text-slate-800">{w.windowMin}-min {is ? "peak" : "peak"} · {is ? METRIC_LABEL[w.metric]?.is ?? w.metric : METRIC_LABEL[w.metric]?.en ?? w.metric}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${w.secondHalf ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{w.secondHalf ? (is ? "u.þ.b." : "approx") : (is ? "nákvæmt" : "exact")}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-700">{is ? w.verdict.is : w.verdict.en}</p>
                    {w.actions.length > 0 && (
                      <p className="mt-1 text-[11px] text-slate-600">{is ? "Á boltanum" : "On the ball"}: {w.actions.map((a) => `${is ? a.label.is : a.label.en} ×${a.count}`).join(", ")}</p>
                    )}
                    {Object.keys(w.teamLabels).length > 0 && (
                      <p className="mt-0.5 text-[11px] text-slate-500">{is ? "Liðið" : "Team"}: {topLabels(w.teamLabels)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {res.note && <p className="text-[11px] text-slate-400">{res.note}</p>}
        </div>
      )}
    </details>
  );
}
