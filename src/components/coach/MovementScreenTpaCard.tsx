"use client";

/**
 * Movement Screen card for Total Player Analysis. Surfaces the player's latest
 * movement screen as an athlete-axis input: each reading is a finding → corrective
 * / strength lever with its own confidence + RTP/red-flag, exactly like a VALD /
 * GPS quality but from video. Self-contained (fetches by playerId), additive.
 * Descriptive — never the readiness colour; pain / red flags route to a clinician.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { STRENGTH_EMPHASIS_LABEL, type ScreenReading, type ScreenResult } from "@/lib/micropulse/movementScreen/interpret";

type ScreenRow = {
  id: string; testSlug: string; screenDate: string; confidence: string | null;
  redFlag: boolean; rtpFlag: boolean; result: ScreenResult | null;
};
const CONF_HEX: Record<string, string> = { high: "#1c7a4a", moderate: "#de9328", low: "#a83e28" };

export default function MovementScreenTpaCard({ playerId, isEN }: { playerId: string; isEN: boolean }) {
  const [row, setRow] = React.useState<ScreenRow | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const T = (en: string, is: string) => (isEN ? en : is);

  React.useEffect(() => {
    let alive = true;
    if (!playerId) { setRow(null); setLoaded(true); return; }
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
        const res = await fetch(`/api/coach/movement-screen?player_id=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (alive) { setRow(res.ok && j.screens?.[0] ? (j.screens[0] as ScreenRow) : null); setLoaded(true); }
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (!loaded || !row) return null; // silent until a screen exists for this player

  const result = row.result;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{T("Movement Screen", "Hreyfiskimun")}</h3>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{row.testSlug.replace(/_/g, " ")}</span>
        <span className="text-[10px] text-slate-400">{row.screenDate}</span>
        {row.confidence && <span className="ml-auto text-[10px] font-semibold" style={{ color: CONF_HEX[row.confidence] }}>{row.confidence}</span>}
      </div>

      {row.redFlag ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          ⚑ {result?.redFlagNote ? (isEN ? result.redFlagNote.en : result.redFlagNote.is) : T("Pain / red flag — refer to a clinician.", "Verkur / rautt flagg — vísaðu til klíníkers.")}
        </div>
      ) : !result || result.readings.length === 0 ? (
        <p className="mt-2 text-[12px] text-slate-500">{T("Within normal for the recorded variables.", "Innan eðlilegs fyrir skráðar breytur.")}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {result.readings.map((r: ScreenReading, i) => (
            <li key={i} className="text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-900">{isEN ? r.finding.en : r.finding.is}{r.leg ? ` (${r.leg})` : ""}</span>
                {r.flag && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">{r.flag === "rtp" ? T("RTP flag", "Endurkomu-flagg") : T("asymmetry", "ósamhverfa")}</span>}
                <span className="ml-auto text-[9px] font-semibold" style={{ color: CONF_HEX[r.confidence] }}>{r.confidence}</span>
              </div>
              <div className="text-slate-700">↳ <span className="font-medium">{isEN ? STRENGTH_EMPHASIS_LABEL[r.strengthEmphasis].en : STRENGTH_EMPHASIS_LABEL[r.strengthEmphasis].is}:</span> {isEN ? r.lever.en : r.lever.is}</div>
              <div className="text-[9px] text-slate-400">{r.citation}</div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[9px] text-slate-400">{T("Screen/trend, not a diagnosis. Feeds the athlete axis + build-up. Never the readiness colour.", "Skimun/þróun, ekki greining. Fæðir íþrótta-ásinn + uppbyggingu. Aldrei readiness-liturinn.")}</p>
    </div>
  );
}
