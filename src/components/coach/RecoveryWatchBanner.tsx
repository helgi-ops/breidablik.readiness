"use client";

/**
 * RecoveryWatchBanner (spec: docs/post-match-recovery-recheck.md, step 3)
 *
 * Surfaces the OPEN post-match recovery watches from /api/coach/recovery-watch:
 * players who played meaningful minutes and are still below their own baseline
 * for the MD-day their last check-in landed on. Names the player, the deviation
 * (z), the MD-day, and the action, with a confidence note when the baseline is
 * still calibrating.
 *
 * A DISTINCT "recovery watch" signal beside the canonical readiness colour, on
 * the subjective check-in only — never presented as the colour (CLAUDE.md).
 * Self-hides when nothing needs attention.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Watch = {
  player_id: string; name: string; position: string | null;
  status: "monitor" | "incomplete" | "escalate" | "on_track" | "recovered" | "building" | "na";
  z: number | null; belowBy: number | null; mdOffset: number | null; confident: boolean;
};
type Payload = {
  match: { date: string; opponent: string | null; days_ago: number } | null;
  watches: Watch[];
  summary: { played: number; evaluated: number; open: number; alerting: number; awaiting_checkin: number } | null;
};

const ALERTING = new Set(["monitor", "incomplete", "escalate"]);

const STATUS: Record<string, { label: { IS: string; EN: string }; tone: string; action: { IS: string; EN: string } }> = {
  escalate: {
    label: { IS: "Stigmögnun", EN: "Escalate" },
    tone: "border-red-300 bg-red-50 text-red-800",
    action: { IS: "Breyttu æfingu og/eða vísaðu til sjúkraþjálfara — komið fram yfir væntanlegt echo.", EN: "Modify training and/or refer to physio — past the expected echo." },
  },
  incomplete: {
    label: { IS: "Ófullkomin endurheimt", EN: "Incomplete recovery" },
    tone: "border-amber-300 bg-amber-50 text-amber-800",
    action: { IS: "Endurmældu næsta check-in dag; íhugaðu léttari æfingu.", EN: "Re-check next check-in day; consider a lighter session." },
  },
  monitor: {
    label: { IS: "Fylgjast með", EN: "Monitor" },
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    action: { IS: "Endurmældu næsta check-in dag; léttu plan ef það helst.", EN: "Re-check next check-in day; ease the plan if it persists." },
  },
};

export default function RecoveryWatchBanner({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const IS = lang === "IS";
  const [data, setData] = React.useState<Payload | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/coach/recovery-watch", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (cancelled || !res.ok) return;
        setData((await res.json()) as Payload);
      } catch { /* supplementary — fail silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data?.summary || data.summary.alerting === 0) return null;
  const alerting = data.watches.filter((w) => ALERTING.has(w.status));
  if (!alerting.length) return null;

  const onTrack = (data.summary.evaluated ?? 0) - data.summary.alerting; // recovered/on_track
  const days = data.match?.days_ago ?? null;

  return (
    <div className="pmr-sec rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-amber-900">
          {IS ? "Endurheimtar-vakt" : "Recovery watch"}
          <span className="ml-2 text-[11px] font-normal text-amber-700">
            {IS
              ? `${alerting.length} leikmaður${alerting.length === 1 ? "" : " (fleiri)"} enn undir grunnlínu${days != null ? `, ${days} dögum eftir leik` : ""}`
              : `${alerting.length} player${alerting.length === 1 ? "" : "s"} still below baseline${days != null ? `, ${days} day${days === 1 ? "" : "s"} after the match` : ""}`}
          </span>
        </div>
        {data.summary.awaiting_checkin > 0 && (
          <span className="text-[10px] text-amber-600">
            {data.summary.awaiting_checkin} {IS ? "bíða check-in" : "awaiting check-in"}
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-1.5">
        {alerting.map((w) => {
          const s = STATUS[w.status] ?? STATUS.monitor;
          return (
            <li key={w.player_id} className={`rounded-lg border px-3 py-2 text-xs leading-snug ${s.tone}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {w.name}{w.position ? <span className="ml-1 font-normal opacity-60">{w.position}</span> : null}
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                  {IS ? s.label.IS : s.label.EN}
                </span>
              </div>
              <div className="mt-0.5 tabular-nums opacity-90">
                {IS ? "líðan" : "readiness"} z {w.z ?? "—"} · MD+{w.mdOffset ?? "?"}
                {!w.confident && <span className="ml-1 opacity-70">· {IS ? "grunnlína að kvarðast" : "baseline calibrating"}</span>}
              </div>
              <div className="mt-0.5 opacity-90">{IS ? s.action.IS : s.action.EN}</div>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[10px] leading-snug text-amber-700/80">
        {IS
          ? `Huglægt líðan-merki vs hvers leikmanns eigin grunnlínu — stefnu-vísir, við hlið litarins, ekki liturinn sjálfur.${onTrack > 0 ? ` ${onTrack} aðrir á áætlun.` : ""}`
          : `Subjective readiness vs each player's own baseline — directional, beside the colour, not the colour itself.${onTrack > 0 ? ` ${onTrack} others on track.` : ""}`}
      </p>
    </div>
  );
}
