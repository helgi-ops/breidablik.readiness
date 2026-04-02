"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Props = {
  teamId: string | null;
  date: string;
};

type ValdSnapshotRow = {
  playerId: string;
  playerName: string;
  neuromuscularFlag: string | null;
  hamstringFlag: string | null;
  groinFlag: string | null;
  cmjFreshnessStatus: string | null;
  latestCmjAt: string | null;
  cmjScore: number | null;
};

type CmjResult = {
  playerId: string;
  jumpHeightCm: number;
  asymmetryPct: number | null;
  testTimestamp: string;
};

type ActivePlayer = {
  id: string;
  name: string;
};

type CmjRequiredEntry = {
  playerId: string;
  playerName: string;
  reason: "protocol" | "neuromuscular" | "stale" | "missing";
};

function urgencyOrder(reason: CmjRequiredEntry["reason"]): number {
  return { neuromuscular: 0, protocol: 1, stale: 2, missing: 3 }[reason];
}

const REASON_META: Record<
  CmjRequiredEntry["reason"],
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  neuromuscular: { label: "Neuromuscular flag", bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500",    border: "border-red-200" },
  protocol:      { label: "Protocol day",       bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-500",   border: "border-blue-200" },
  stale:         { label: "CMJ stale (>7d)",    bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400",  border: "border-amber-200" },
  missing:       { label: "No CMJ baseline",    bg: "bg-slate-50",  text: "text-slate-500",  dot: "bg-slate-300",  border: "border-slate-200" },
};

// Groups in display order (excluding "missing" — handled separately)
const PRIORITY_GROUPS: CmjRequiredEntry["reason"][] = ["neuromuscular", "protocol", "stale"];

export default function ValdAlertsPanel({ teamId, date }: Props) {
  const [snapshots, setSnapshots]       = useState<ValdSnapshotRow[]>([]);
  const [cmjResults, setCmjResults]     = useState<CmjResult[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [mdDay, setMdDay]               = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]           = useState<string | null>(null);

  async function fetchData() {
    if (!teamId) { setLoading(false); return; }
    const supabase = getSupabaseClient();
    setLoading(true);
    const [snapshotRes, mdRes, playersRes, cmjRes] = await Promise.all([
      supabase
        .from("vald_daily_player_snapshot")
        .select("microplayer_id, neuromuscular_flag, hamstring_flag, groin_flag, cmj_freshness_status, latest_cmj_at, cmj_score, players!inner(full_name)")
        .eq("team_id", teamId)
        .eq("snapshot_date", date),
      supabase
        .from("v_training_day_context_team")
        .select("md_day")
        .eq("team_id", teamId)
        .eq("date", date)
        .maybeSingle(),
      supabase
        .from("players")
        .select("id, full_name")
        .eq("team_id", teamId)
        .eq("is_active", true)
        .order("full_name"),
      // Fetch best CMJ per player for today directly from ForceDecks results
      supabase
        .from("vald_forcedecks_results")
        .select("microplayer_id, jump_height_cm, asymmetry_percent, test_timestamp")
        .eq("team_id", teamId)
        .eq("test_type", "CMJ")
        .gte("test_timestamp", `${date}T00:00:00`)
        .lte("test_timestamp", `${date}T23:59:59`)
        .not("microplayer_id", "is", null)
        .order("jump_height_cm", { ascending: false }),
    ]);

    const mapped = ((snapshotRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const player = (row.players as Record<string, unknown> | null) ?? null;
      return {
        playerId: String(row.microplayer_id ?? ""),
        playerName: String(player?.full_name ?? "Player"),
        neuromuscularFlag: row.neuromuscular_flag ? String(row.neuromuscular_flag) : null,
        hamstringFlag: row.hamstring_flag ? String(row.hamstring_flag) : null,
        groinFlag: row.groin_flag ? String(row.groin_flag) : null,
        cmjFreshnessStatus: row.cmj_freshness_status ? String(row.cmj_freshness_status) : null,
        latestCmjAt: row.latest_cmj_at ? String(row.latest_cmj_at) : null,
        cmjScore: row.cmj_score != null ? Number(row.cmj_score) : null,
      };
    });

    // Best jump per player today (first row = highest due to ordering)
    const bestPerPlayer = new Map<string, CmjResult>();
    for (const row of ((cmjRes.data ?? []) as Array<Record<string, unknown>>)) {
      const pid = String(row.microplayer_id ?? "");
      if (!pid || bestPerPlayer.has(pid)) continue;
      bestPerPlayer.set(pid, {
        playerId: pid,
        jumpHeightCm: Number(row.jump_height_cm),
        asymmetryPct: row.asymmetry_percent != null ? Number(row.asymmetry_percent) : null,
        testTimestamp: String(row.test_timestamp ?? ""),
      });
    }
    setCmjResults(Array.from(bestPerPlayer.values()).sort((a, b) => b.jumpHeightCm - a.jumpHeightCm));

    setSnapshots(mapped);
    setMdDay((mdRes.data as { md_day?: string | null } | null)?.md_day ?? null);
    setActivePlayers(
      ((playersRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.full_name ?? ""),
      }))
    );
    setLoading(false);
  }

  useEffect(() => { void fetchData(); }, [date, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSyncMsg("Ekki innskráður."); setSyncing(false); return; }
      const res = await fetch("/api/integrations/vald/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ dateFrom: date, dateTo: date, triggerSource: "MANUAL" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync mistókst");
      setSyncMsg("✓ Sync tókst — gögnin eru uppfærð");
      await fetchData();
    } catch (e: any) {
      setSyncMsg(`Villa: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Build CMJ Required list ─────────────────────────────────────────────
  const isProtocolDay = mdDay === "MD-2" || mdDay === "MD+1";
  const snapshotMap   = new Map(snapshots.map((s) => [s.playerId, s]));
  const cmjRequired: CmjRequiredEntry[] = [];
  const seen = new Set<string>();

  for (const s of snapshots) {
    if (s.neuromuscularFlag === "red" || s.neuromuscularFlag === "yellow") {
      cmjRequired.push({ playerId: s.playerId, playerName: s.playerName, reason: "neuromuscular" });
      seen.add(s.playerId);
    }
  }
  if (isProtocolDay) {
    for (const p of activePlayers) {
      if (!seen.has(p.id)) {
        cmjRequired.push({ playerId: p.id, playerName: p.name, reason: "protocol" });
        seen.add(p.id);
      }
    }
  }
  for (const s of snapshots) {
    if (!seen.has(s.playerId) && s.cmjFreshnessStatus === "stale") {
      cmjRequired.push({ playerId: s.playerId, playerName: s.playerName, reason: "stale" });
      seen.add(s.playerId);
    }
  }
  for (const p of activePlayers) {
    if (!seen.has(p.id) && !snapshotMap.has(p.id)) {
      cmjRequired.push({ playerId: p.id, playerName: p.name, reason: "missing" });
      seen.add(p.id);
    }
  }
  cmjRequired.sort((a, b) => urgencyOrder(a.reason) - urgencyOrder(b.reason) || a.playerName.localeCompare(b.playerName));

  // ── Group entries ──────────────────────────────────────────────────────
  const grouped = new Map<CmjRequiredEntry["reason"], CmjRequiredEntry[]>();
  for (const e of cmjRequired) {
    if (!grouped.has(e.reason)) grouped.set(e.reason, []);
    grouped.get(e.reason)!.push(e);
  }

  const urgentCount = (grouped.get("neuromuscular")?.length ?? 0)
    + (grouped.get("protocol")?.length ?? 0)
    + (grouped.get("stale")?.length ?? 0);
  const missingCount = grouped.get("missing")?.length ?? 0;

  // ── Injury alerts ──────────────────────────────────────────────────────
  const redNeuromuscular = snapshots.filter((s) => s.neuromuscularFlag === "red");
  const hamstringConcern = snapshots.filter((s) => s.hamstringFlag === "red" || s.hamstringFlag === "yellow");
  const groinConcern     = snapshots.filter((s) => s.groinFlag === "red" || s.groinFlag === "yellow");
  const hasInjuryAlerts  = redNeuromuscular.length > 0 || hamstringConcern.length > 0 || groinConcern.length > 0;

  const noValdData = !loading && snapshots.length === 0 && missingCount === activePlayers.length && urgentCount === 0;

  return (
    <div className="space-y-4">

      {/* ── CMJ Testing card ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">CMJ Testing</h3>
            {isProtocolDay && mdDay && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{mdDay}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!loading && urgentCount > 0 && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                {urgentCount} required
              </span>
            )}
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              title="Sync VALD gögn núna"
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {syncing ? (
                <><span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> Syncing…</>
              ) : (
                <>↻ Sync VALD</>
              )}
            </button>
            <Link
              href="/settings/integrations/vald"
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              title="VALD stillingar"
            >
              Stillingar →
            </Link>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 py-3">
              <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin" />
              <span className="text-xs text-slate-400">Loading…</span>
            </div>
          )}

          {!loading && !teamId && (
            <p className="text-sm text-slate-400">No team context.</p>
          )}

          {/* Sync message */}
          {syncMsg && (
            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${syncMsg.startsWith("Villa") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
              {syncMsg}
            </div>
          )}

          {/* CMJ Results — today's best jump per player from ForceDecks */}
          {!loading && cmjResults.length > 0 && (() => {
            const snapshotMap = new Map(snapshots.map((s) => [s.playerId, s]));
            return (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">CMJ Niðurstöður í dag</span>
                  <span className="ml-1 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-px text-[10px] font-bold">{cmjResults.length}</span>
                </div>
                <div className="grid gap-1">
                  {cmjResults.map((r) => {
                    const snap = snapshotMap.get(r.playerId);
                    const name = snap?.playerName ?? r.playerId;
                    const asymColor = r.asymmetryPct != null && r.asymmetryPct > 10
                      ? "text-amber-600"
                      : "text-slate-400";
                    return (
                      <div key={r.playerId} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5">
                        <span className="text-xs font-medium text-slate-700">{name}</span>
                        <div className="flex items-center gap-3">
                          {r.asymmetryPct != null && (
                            <span className={`text-[11px] ${asymColor}`}>
                              ±{r.asymmetryPct.toFixed(1)}%
                            </span>
                          )}
                          <span className="text-xs font-bold text-emerald-700">{r.jumpHeightCm.toFixed(1)} cm</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* No VALD data at all — friendly setup state */}
          {!loading && noValdData && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-5 text-center space-y-1">
              <p className="text-sm font-medium text-slate-600">No VALD data connected</p>
              <p className="text-xs text-slate-400">
                CMJ baselines will appear here once VALD force plate data is synced for this team.
              </p>
            </div>
          )}

          {/* All good */}
          {!loading && !noValdData && cmjRequired.length === 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-xs text-emerald-700 font-medium">All CMJ data current — no tests required today.</span>
            </div>
          )}

          {/* Priority groups: neuromuscular / protocol / stale */}
          {!loading && PRIORITY_GROUPS.map((reason) => {
            const entries = grouped.get(reason);
            if (!entries?.length) return null;
            const m = REASON_META[reason];
            return (
              <div key={reason}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.label}</span>
                  <span className={`ml-1 rounded-full px-1.5 py-px text-[10px] font-bold ${m.bg} ${m.text}`}>{entries.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {entries.map((e) => (
                    <span key={e.playerId} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.bg} ${m.text} ${m.border}`}>
                      {e.playerName}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Missing / no baseline — collapsible */}
          {!loading && missingCount > 0 && !noValdData && (
            <details className="group">
              <summary className="flex cursor-pointer select-none list-none items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">No CMJ baseline</span>
                <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-500">{missingCount}</span>
                <svg className="ml-auto w-3 h-3 text-slate-300 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(grouped.get("missing") ?? []).map((e) => (
                  <span key={e.playerId} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-500">
                    {e.playerName}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* ── VALD Injury Alerts card ──────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">VALD Injury Alerts</h3>
          {!loading && hasInjuryAlerts && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              Attention
            </span>
          )}
        </div>

        <div className="px-4 py-3 space-y-2">
          {loading && (
            <p className="text-xs text-slate-400 py-1">Loading…</p>
          )}

          {!loading && !hasInjuryAlerts && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-xs text-emerald-700 font-medium">No injury alerts today.</span>
            </div>
          )}

          {!loading && hasInjuryAlerts && (
            <>
              <InjuryAlertRow
                color="text-red-700"
                dot="bg-red-500"
                title="Neuromuscular red"
                names={redNeuromuscular.map((s) => s.playerName)}
              />
              <InjuryAlertRow
                color="text-amber-700"
                dot="bg-amber-400"
                title="Hamstring concern"
                names={hamstringConcern.map((s) => s.playerName)}
              />
              <InjuryAlertRow
                color="text-amber-700"
                dot="bg-amber-400"
                title="Groin concern"
                names={groinConcern.map((s) => s.playerName)}
              />
            </>
          )}
        </div>
      </div>

    </div>
  );
}

function InjuryAlertRow({ title, names, color, dot }: { title: string; names: string[]; color: string; dot: string }) {
  if (!names.length) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 flex items-start gap-2">
      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      <div>
        <span className={`text-xs font-semibold ${color}`}>{title}: </span>
        <span className="text-xs text-slate-600">{names.join(", ")}</span>
      </div>
    </div>
  );
}
