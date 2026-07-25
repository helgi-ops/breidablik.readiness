"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import MethodologyLink from "@/components/common/MethodologyLink";
import { ACWR_CAVEAT } from "@/lib/methodologyCaveats";

type AcwrZone = "undertrain" | "optimal" | "caution" | "high_risk" | "insufficient";

type PlayerAcwr = {
  player_id: string;
  full_name: string;
  position: string | null;
  acute7: number;
  chronic28: number;
  acwr: number | null;
  zone: AcwrZone;
  weekLoads: [number, number, number, number];
  sessionCount28: number;
};

type AcwrResponse = {
  ok: boolean;
  error?: string;
  players: PlayerAcwr[];
  toDate: string;
  fromDate: string;
};

const ZONE_META: Record<AcwrZone, { label: string; bg: string; text: string; dot: string }> = {
  high_risk:   { label: "High risk",   bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500" },
  caution:     { label: "Caution",     bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400" },
  optimal:     { label: "Optimal",     bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-500" },
  undertrain:  { label: "Undertrain",  bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-400" },
  insufficient:{ label: "No data",     bg: "bg-slate-50",  text: "text-slate-500",  dot: "bg-slate-300" },
};

// Compact bar for the collapsed "all players" rows: 0→2 range, colour by zone.
function AcwrBar({ acwr }: { acwr: number | null }) {
  if (acwr == null) return <span className="text-slate-400 text-xs">—</span>;
  const pct = Math.min((acwr / 2.0) * 100, 100);
  const color = acwr < 0.8 ? "#60a5fa" : acwr <= 1.3 ? "#2b8a54" : acwr <= 1.5 ? "#cb8420" : "#b34a30";
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[#f0eee7]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right font-mono text-xs font-semibold text-[#5a584f]">{acwr.toFixed(2)}</span>
    </div>
  );
}

function ZoneBadge({ zone }: { zone: AcwrZone }) {
  const m = ZONE_META[zone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium whitespace-nowrap ${m.bg} ${m.text}`}>
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// Fixed zone scale (0–0.8 / 0.8–1.3 / 1.3–1.5 / >1.5) with a marker at the player's
// ACWR — so a flagged value is read against the zones at a glance.
function ZoneScaleBar({ acwr }: { acwr: number | null }) {
  const pos = acwr != null ? Math.min(acwr / 2, 0.98) * 100 : null;
  return (
    <div className="relative mt-2">
      <div className="flex h-2 overflow-hidden rounded-full">
        <div style={{ width: "40%", background: "#93c5fd" }} />
        <div style={{ width: "25%", background: "#86c9a3" }} />
        <div style={{ width: "10%", background: "#e5c37a" }} />
        <div style={{ width: "25%", background: "#dfa08c" }} />
      </div>
      {pos != null && (
        <div className="absolute top-1/2 -translate-y-1/2 rounded-sm" style={{ left: `calc(${pos}% - 1.5px)`, width: "3px", height: "14px", background: "#292824" }} />
      )}
    </div>
  );
}

export default function InternalAcwrCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const IS = lang === "IS";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AcwrResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");
      const qs = new URLSearchParams();
      if (teamId) qs.set("teamId", teamId);
      const res = await fetch(`/api/coach/session-rpe/acwr?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const json: AcwrResponse = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load ACWR");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = data?.players ?? [];
  const riskPlayers = players
    .filter((p) => p.zone === "high_risk" || p.zone === "caution")
    .sort((a, b) => (b.acwr ?? 0) - (a.acwr ?? 0));

  const recommendation = (p: PlayerAcwr): string => {
    if (p.acwr == null) return "";
    if (p.zone === "high_risk") {
      const over = Math.round((p.acwr - 1) * 100);
      return IS
        ? `Bráða álag ${over}% yfir langvarandi — íhugaðu léttari skammt næstu 2–3 daga.`
        : `Acute load ${over}% above chronic — consider a lighter dose for 2–3 days.`;
    }
    return IS ? "Rétt yfir varúðarmörkum — fylgstu með næstu æfingu." : "Just over the caution line — watch the next session.";
  };

  return (
    <div className="rounded-2xl border border-[#e8e4d9] bg-white" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="flex items-center justify-between gap-3 border-b border-[#f0eee7] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#292824]">ACWR · {IS ? "innra álag" : "internal load"}</h3>
          <p className="mt-0.5 text-[11px] text-[#908d83]">
            {IS ? "Bráða:langvarandi hlutfall — sRPE 28 daga" : "Acute:chronic ratio — sRPE over 28 days"}
            {data && <span className="ml-1">· {data.fromDate}–{data.toDate}</span>}
          </p>
        </div>
        <span className="whitespace-nowrap text-[11px] text-[#908d83]">{IS ? "Bráða = 7d sRPE" : "Acute = 7d sRPE"}</span>
      </div>

      <div className="px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#4338ca]" />
          </div>
        )}
        {!loading && error && <p className="py-3 text-center text-sm text-red-600">{error}</p>}
        {!loading && !error && players.length === 0 && (
          <p className="py-3 text-center text-sm text-[#908d83]">{IS ? "Engir virkir leikmenn." : "No active players found."}</p>
        )}

        {!loading && !error && players.length > 0 && (
          <>
            {riskPlayers.length > 0 ? (
              <>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8f3d29]">
                  {IS ? "Þarf að skoða" : "Needs attention"} · {riskPlayers.length}
                </div>
                <div className="space-y-2">
                  {riskPlayers.map((p) => {
                    const high = p.zone === "high_risk";
                    return (
                      <div key={p.player_id} className="rounded-[10px] border px-3 py-2.5"
                        style={high ? { background: "#f9efec", borderColor: "#f3e2dc" } : { background: "rgba(251,247,233,0.6)", borderColor: "#eddfb4" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-[#292824]">{p.full_name}</span>
                          <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: high ? "#8f3d29" : "#a4691c" }}>
                            <span className="h-2 w-2 rounded-full" style={{ background: high ? "#b34a30" : "#cb8420" }} />
                            {p.acwr != null ? p.acwr.toFixed(2) : "—"}
                          </span>
                        </div>
                        <ZoneScaleBar acwr={p.acwr} />
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] leading-snug" style={{ color: high ? "#8f3d29" : "#a4691c" }}>{recommendation(p)}</span>
                          <span className="whitespace-nowrap text-[11px] text-[#908d83]">{IS ? "bráða" : "acute"} {p.acute7 > 0 ? p.acute7.toLocaleString("is-IS") : "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#eef6f0", color: "#2e6b4a" }}>
                {IS ? "Allir leikmenn innan öruggra marka." : "All players within safe range."}
              </div>
            )}

            <details className="group mt-3">
              <summary className="cursor-pointer text-xs font-medium" style={{ color: "#4338ca" }}>
                {IS ? `Sýna alla ${players.length} leikmenn` : `Show all ${players.length} players`}
              </summary>
              <div className="mt-2 max-h-60 divide-y divide-[#f0eee7] overflow-y-auto">
                {players.map((p) => (
                  <div key={p.player_id} className="grid grid-cols-[1fr_60px_100px_70px] items-center gap-2 py-1.5">
                    <span className="truncate text-xs font-medium text-[#292824]">
                      {p.full_name}<span className="ml-1 font-normal text-[#908d83]">· {p.sessionCount28}s</span>
                    </span>
                    <span className="text-right font-mono text-xs font-semibold text-[#5a584f]">{p.acute7 > 0 ? p.acute7.toLocaleString("is-IS") : "—"}</span>
                    <AcwrBar acwr={p.acwr} />
                    <ZoneBadge zone={p.zone} />
                  </div>
                ))}
              </div>
            </details>

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-2 text-[10px] text-[#908d83]">
              <span><strong style={{ color: "#60a5fa" }}>{IS ? "Vanþjálfun" : "Undertrain"}</strong> &lt;0.8</span>
              <span><strong style={{ color: "#2b8a54" }}>{IS ? "Í lagi" : "Optimal"}</strong> 0.8–1.3</span>
              <span><strong style={{ color: "#cb8420" }}>{IS ? "Varúð" : "Caution"}</strong> 1.3–1.5</span>
              <span><strong style={{ color: "#b34a30" }}>{IS ? "Há áhætta" : "High risk"}</strong> &gt;1.5</span>
            </div>
            <div className="mt-1"><MethodologyLink caveat={ACWR_CAVEAT} /></div>
          </>
        )}
      </div>
    </div>
  );
}
