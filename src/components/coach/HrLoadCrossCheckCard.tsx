"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import { computeHrLoad, type HrLoadRow, type HrLoadRead, type LoadAlignment } from "@/lib/micropulse/hrLoad";

const WINDOW_DAYS = 28;

type PlayerRead = { playerId: string; name: string; read: HrLoadRead };

function windowStartISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

const ALIGN_CLASS: Record<LoadAlignment, string> = {
  hidden_load: "text-rose-700",
  low_cardio_response: "text-amber-700",
  aligned: "text-emerald-700",
  insufficient: "text-slate-400",
};

export default function HrLoadCrossCheckCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const IS = lang === "IS";
  const [loading, setLoading] = useState(true);
  const [reads, setReads] = useState<PlayerRead[]>([]);
  const [rosterCount, setRosterCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!teamId) { setLoading(false); return; }
      setLoading(true);
      const start = windowStartISO();
      try {
        const [playersRes, loadRes, rpeRes] = await Promise.all([
          supabase.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true),
          supabase
            .from("player_external_load_daily")
            .select("player_id, date, hr_zone_1_time_s, hr_zone_2_time_s, hr_zone_3_time_s, hr_zone_4_time_s, hr_zone_5_time_s, hr_zone_6_time_s, hr_zone_7_time_s, hr_zone_8_time_s, pct_max_heart_rate")
            .eq("team_id", teamId)
            .gte("date", start),
          supabase
            .from("session_rpe_entries")
            .select("player_id, session_date, session_load")
            .eq("team_id", teamId)
            .gte("session_date", start),
        ]);
        if (cancelled) return;

        const names = new Map<string, string>();
        for (const p of (playersRes.data ?? []) as Array<Record<string, unknown>>) {
          names.set(String(p.id), String(p.full_name ?? "Player"));
        }

        // player → date → row parts
        const byPlayerDate = new Map<string, Map<string, HrLoadRow>>();
        const ensure = (pid: string, date: string): HrLoadRow => {
          let m = byPlayerDate.get(pid);
          if (!m) { m = new Map(); byPlayerDate.set(pid, m); }
          let r = m.get(date);
          if (!r) { r = { date, srpeLoad: null, hrZonesSec: [], pctMaxHr: null }; m.set(date, r); }
          return r;
        };

        for (const row of (loadRes.data ?? []) as Array<Record<string, unknown>>) {
          const pid = String(row.player_id ?? "");
          const date = String(row.date ?? "").slice(0, 10);
          if (!pid || !date) continue;
          const r = ensure(pid, date);
          r.hrZonesSec = [1, 2, 3, 4, 5, 6, 7, 8].map((b) => {
            const v = row[`hr_zone_${b}_time_s`];
            return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
          });
          r.pctMaxHr = row.pct_max_heart_rate != null && Number.isFinite(Number(row.pct_max_heart_rate))
            ? Number(row.pct_max_heart_rate) : null;
        }
        // Sum sRPE session_load per player-date (a day can hold multiple sessions).
        for (const row of (rpeRes.data ?? []) as Array<Record<string, unknown>>) {
          const pid = String(row.player_id ?? "");
          const date = String(row.session_date ?? "").slice(0, 10);
          if (!pid || !date) continue;
          const load = row.session_load != null && Number.isFinite(Number(row.session_load)) ? Number(row.session_load) : null;
          if (load == null) continue;
          const r = ensure(pid, date);
          r.srpeLoad = (r.srpeLoad ?? 0) + load;
        }

        const out: PlayerRead[] = [];
        for (const [pid, m] of byPlayerDate) {
          const read = computeHrLoad([...m.values()]);
          if (read.dataCoverage.hasHr) out.push({ playerId: pid, name: names.get(pid) ?? "Player", read });
        }
        out.sort((a, b) => a.name.localeCompare(b.name));
        setReads(out);
        setRosterCount(names.size);
      } catch {
        if (!cancelled) setReads([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [teamId, supabase]);

  const flagged = reads.filter(
    (r) => r.read.latest?.alignment === "hidden_load" || r.read.latest?.alignment === "low_cardio_response",
  );
  const beltCount = reads.length;

  // Layered verdict.
  const verdict = (() => {
    if (loading) return IS ? "Hleð…" : "Loading…";
    if (beltCount === 0) {
      return IS
        ? "HR-beltisgögn ekki komin enn — birtast þegar HR-lota samstillist."
        : "No HR belt data yet — appears once a belt session syncs.";
    }
    if (flagged.length === 0) {
      return IS
        ? `HR-álag samræmist RPE hjá liðinu — ${beltCount} báru belti (síðustu ${WINDOW_DAYS} daga).`
        : `HR load matches RPE across the squad — ${beltCount} wore the belt (last ${WINDOW_DAYS} days).`;
    }
    const names = flagged.slice(0, 3).map((r) => r.name).join(", ") + (flagged.length > 3 ? ` +${flagged.length - 3}` : "");
    return IS
      ? `Ósamræmi HR vs RPE hjá ${flagged.length}: ${names}. Sjá sundurliðun.`
      : `HR vs RPE diverges for ${flagged.length}: ${names}. See breakdown.`;
  })();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Heart-rate cross-check</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{IS ? "HR-álag vs sRPE" : "HR load vs sRPE"}</div>
        </div>
        {!loading && rosterCount > 0 ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {IS ? `${beltCount} af ${rosterCount} með belti` : `${beltCount} of ${rosterCount} wore belt`}
          </span>
        ) : null}
      </div>

      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
        {verdict}
      </p>

      {!loading && beltCount > 0 ? (
        <ShowDetails label={{ EN: "Show per-player breakdown", IS: "Sýna sundurliðun per leikmann" }}>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-2">{IS ? "Leikmaður" : "Player"}</th>
                  <th className="py-1 pr-2">HR idx</th>
                  <th className="py-1 pr-2">sRPE idx</th>
                  <th className="py-1 pr-2">{IS ? "Bil" : "Gap"}</th>
                  <th className="py-1">{IS ? "Lestur" : "Read"}</th>
                </tr>
              </thead>
              <tbody>
                {reads.map(({ playerId, name, read }) => {
                  const s = read.latest;
                  return (
                    <tr key={playerId} className="border-t align-top">
                      <td className="py-1 pr-2 font-medium text-slate-800">{name}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{s?.hrLoadIndex ?? "—"}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{s?.srpeIndex ?? "—"}</td>
                      <td className="py-1 pr-2 tabular-nums text-slate-700">{s?.gap != null ? `${s.gap >= 0 ? "+" : ""}${s.gap}` : "—"}</td>
                      <td className={`py-1 ${ALIGN_CLASS[s?.alignment ?? "insufficient"]}`}>
                        {IS ? s?.verdict.is : s?.verdict.en}
                        {read.confidence === "low" ? (
                          <span className="ml-1 text-[10px] text-slate-400">{IS ? "· lítil vissa" : "· low confidence"}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-slate-400">
            {IS ? reads[0]?.read.caveat.is : reads[0]?.read.caveat.en} · {reads[0]?.read.citation}
          </p>
        </ShowDetails>
      ) : null}
    </div>
  );
}
