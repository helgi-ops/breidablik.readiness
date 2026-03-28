"use client";

import { useEffect, useState } from "react";
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

const REASON_LABEL: Record<CmjRequiredEntry["reason"], string> = {
  neuromuscular: "Neuromuscular flag",
  protocol: "Protocol day",
  stale: "CMJ stale (>7d)",
  missing: "No CMJ baseline",
};

const REASON_COLOR: Record<CmjRequiredEntry["reason"], string> = {
  neuromuscular: "bg-red-100 text-red-700 border-red-200",
  protocol: "bg-blue-100 text-blue-700 border-blue-200",
  stale: "bg-amber-100 text-amber-700 border-amber-200",
  missing: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export default function ValdAlertsPanel({ teamId, date }: Props) {
  const [snapshots, setSnapshots] = useState<ValdSnapshotRow[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [mdDay, setMdDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) {
      setSnapshots([]);
      setActivePlayers([]);
      setMdDay(null);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    setLoading(true);

    Promise.all([
      // VALD snapshot for today
      supabase
        .from("vald_daily_player_snapshot")
        .select("microplayer_id, neuromuscular_flag, hamstring_flag, groin_flag, cmj_freshness_status, latest_cmj_at, players!inner(full_name)")
        .eq("team_id", teamId)
        .eq("snapshot_date", date),

      // MD day context (to detect protocol days)
      supabase
        .from("v_training_day_context_team")
        .select("md_day")
        .eq("team_id", teamId)
        .eq("date", date)
        .maybeSingle(),

      // All active players (needed to flag players without any VALD data on protocol days)
      supabase
        .from("players")
        .select("id, full_name")
        .eq("team_id", teamId)
        .eq("is_active", true)
        .order("full_name"),
    ]).then(([snapshotRes, mdRes, playersRes]) => {
      const mappedSnapshots = ((snapshotRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const player = (row.players as Record<string, unknown> | null) ?? null;
        return {
          playerId: String(row.microplayer_id ?? ""),
          playerName: String(player?.full_name ?? "Player"),
          neuromuscularFlag: row.neuromuscular_flag ? String(row.neuromuscular_flag) : null,
          hamstringFlag: row.hamstring_flag ? String(row.hamstring_flag) : null,
          groinFlag: row.groin_flag ? String(row.groin_flag) : null,
          cmjFreshnessStatus: row.cmj_freshness_status ? String(row.cmj_freshness_status) : null,
          latestCmjAt: row.latest_cmj_at ? String(row.latest_cmj_at) : null,
        };
      });

      const day = (mdRes.data as { md_day?: string | null } | null)?.md_day ?? null;

      const allPlayers = ((playersRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.full_name ?? ""),
      }));

      setSnapshots(mappedSnapshots);
      setMdDay(day);
      setActivePlayers(allPlayers);
      setLoading(false);
    });
  }, [date, teamId]);

  // ── Build CMJ Required list ───────────────────────────────────────────────
  const isProtocolDay = mdDay === "MD-2" || mdDay === "MD+1";
  const snapshotMap = new Map(snapshots.map((s) => [s.playerId, s]));

  const cmjRequired: CmjRequiredEntry[] = [];
  const seen = new Set<string>();

  // 1. Neuromuscular concern (always takes priority)
  for (const s of snapshots) {
    if (s.neuromuscularFlag === "red" || s.neuromuscularFlag === "yellow") {
      cmjRequired.push({ playerId: s.playerId, playerName: s.playerName, reason: "neuromuscular" });
      seen.add(s.playerId);
    }
  }

  // 2. Protocol day — flag ALL active players not yet added
  if (isProtocolDay) {
    for (const p of activePlayers) {
      if (!seen.has(p.id)) {
        cmjRequired.push({ playerId: p.id, playerName: p.name, reason: "protocol" });
        seen.add(p.id);
      }
    }
  }

  // 3. Stale CMJ (>7 days) for players with snapshot data
  for (const s of snapshots) {
    if (!seen.has(s.playerId) && s.cmjFreshnessStatus === "stale") {
      cmjRequired.push({ playerId: s.playerId, playerName: s.playerName, reason: "stale" });
      seen.add(s.playerId);
    }
  }

  // 4. Missing CMJ for any active player without snapshot
  for (const p of activePlayers) {
    if (!seen.has(p.id) && !snapshotMap.has(p.id)) {
      cmjRequired.push({ playerId: p.id, playerName: p.name, reason: "missing" });
      seen.add(p.id);
    }
  }

  cmjRequired.sort((a, b) => urgencyOrder(a.reason) - urgencyOrder(b.reason) || a.playerName.localeCompare(b.playerName));

  // ── Injury alerts ────────────────────────────────────────────────────────
  const redNeuromuscular = snapshots.filter((s) => s.neuromuscularFlag === "red");
  const hamstringConcern = snapshots.filter((s) => s.hamstringFlag === "red" || s.hamstringFlag === "yellow");
  const groinConcern = snapshots.filter((s) => s.groinFlag === "red" || s.groinFlag === "yellow");

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
      {/* ── CMJ Required ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">CMJ Required Today</div>
          {!loading && cmjRequired.length > 0 && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
              {cmjRequired.length}
            </span>
          )}
          {!loading && isProtocolDay && mdDay && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {mdDay}
            </span>
          )}
        </div>

        {loading ? (
          <div className="mt-2 text-xs text-zinc-400">Loading…</div>
        ) : !teamId ? (
          <div className="mt-2 text-xs text-zinc-400">No team context.</div>
        ) : cmjRequired.length === 0 ? (
          <div className="mt-2 rounded-lg border bg-green-50 px-3 py-2 text-xs text-green-700">
            All CMJ data is current — no tests required today.
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {cmjRequired.map((entry) => (
              <div
                key={entry.playerId}
                className="flex items-center justify-between rounded-lg border bg-zinc-50 px-3 py-1.5"
              >
                <span className="text-sm font-medium text-zinc-900">{entry.playerName}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${REASON_COLOR[entry.reason]}`}>
                  {REASON_LABEL[entry.reason]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Injury alerts ────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">VALD Injury Alerts</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-700">
          {!teamId ? <AlertLine title="Coverage" names={["No team context available."]} /> : null}
          <AlertLine title="Neuromuscular red" names={redNeuromuscular.map((s) => s.playerName)} />
          <AlertLine title="Hamstring concern" names={hamstringConcern.map((s) => s.playerName)} />
          <AlertLine title="Groin concern" names={groinConcern.map((s) => s.playerName)} />
        </div>
      </div>
    </div>
  );
}

function AlertLine({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="rounded-lg border bg-zinc-50 px-3 py-2">
      <div className="font-medium text-zinc-900">{title}</div>
      <div className="mt-1 text-xs text-zinc-600">{names.length ? names.join(", ") : "None today."}</div>
    </div>
  );
}
