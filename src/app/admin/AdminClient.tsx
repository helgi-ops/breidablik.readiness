"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import PlayerOwnershipAdminPanel from "@/components/admin/PlayerOwnershipAdminPanel";
import ComplianceDashboard from "@/components/admin/ComplianceDashboard";
import BulkDobEditor from "@/components/admin/BulkDobEditor";
import { formatTeamLabel } from "@/lib/teamLabels";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanTier = "FREE" | "PRO" | "ELITE";

interface Team {
  id: string;
  name: string;
  sport?: string | null;
  gender?: string | null;
  plan_tier: PlanTier;
  created_at: string;
  player_count?: number;
  coach_name?: string | null;
}

interface Player {
  id: string;
  full_name: string;
  team_id: string;
  team_name?: string;
  status: "PENDING" | "ACTIVE" | "REJECTED";
  is_active: boolean;
  requested_at: string | null;
  user_id: string | null;
}

interface Stats {
  totalTeams: number;
  totalPlayers: number;
  activePlayers: number;
  pendingPlayers: number;
  proTeams: number;
  eliteTeams: number;
}

type AdminTab = "overview" | "teams" | "players" | "pending" | "compliance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<PlanTier, string> = {
  FREE: "bg-zinc-100 text-zinc-600",
  PRO: "bg-blue-100 text-blue-700",
  ELITE: "bg-amber-100 text-amber-700",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-600",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-sm text-zinc-700 mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Hætta við
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Staðfesta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminClient() {
  const [tab, setTab] = useState<AdminTab>("overview");

  // Data
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerStatusFilter, setPlayerStatusFilter] = useState<"ALL" | "ACTIVE" | "PENDING" | "REJECTED">("ALL");
  const [playerTeamFilter, setPlayerTeamFilter] = useState<string>("ALL");
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Move player dialog
  const [moveTarget, setMoveTarget] = useState<Player | null>(null);
  const [moveToTeam, setMoveToTeam] = useState("");

  // Player ownership drill-in
  const [ownershipTarget, setOwnershipTarget] = useState<Player | null>(null);

  // Bulk DOB editor
  const [bulkDobOpen, setBulkDobOpen] = useState(false);
  const [complianceRefreshKey, setComplianceRefreshKey] = useState(0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load all data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);

    // Load teams
    const { data: teamsRaw } = await supabase
      .from("teams")
      .select("id, name, sport, gender, plan_tier, created_at")
      .order("name");

    // Load coaches (profiles with role=coach)
    const { data: coaches } = await supabase
      .from("profiles")
      .select("team_id, full_name, display_name")
      .eq("role", "coach");

    // Load players
    const { data: playersRaw } = await supabase
      .from("players")
      .select("id, full_name, team_id, status, is_active, requested_at, user_id")
      .order("full_name");

    const teamsMap: Record<string, string> = {};
    (teamsRaw ?? []).forEach((t: any) => {
      teamsMap[t.id] = formatTeamLabel({ name: t.name, sport: t.sport, gender: t.gender }, "IS");
    });

    const coachByTeam: Record<string, string> = {};
    (coaches ?? []).forEach((c: any) => {
      if (c.team_id) coachByTeam[c.team_id] = c.full_name || c.display_name || "–";
    });

    // Player count per team
    const playerCountByTeam: Record<string, number> = {};
    (playersRaw ?? []).forEach((p: any) => {
      if (p.team_id) playerCountByTeam[p.team_id] = (playerCountByTeam[p.team_id] ?? 0) + 1;
    });

    const enrichedTeams: Team[] = (teamsRaw ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      sport: t.sport ?? null,
      gender: t.gender ?? null,
      plan_tier: t.plan_tier as PlanTier,
      created_at: t.created_at,
      player_count: playerCountByTeam[t.id] ?? 0,
      coach_name: coachByTeam[t.id] ?? null,
    }));

    const enrichedPlayers: Player[] = (playersRaw ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      team_id: p.team_id,
      team_name: teamsMap[p.team_id] ?? "–",
      status: p.status,
      is_active: p.is_active,
      requested_at: p.requested_at,
      user_id: p.user_id,
    }));

    setTeams(enrichedTeams);
    setPlayers(enrichedPlayers);

    const allP = enrichedPlayers;
    setStats({
      totalTeams: enrichedTeams.length,
      totalPlayers: allP.length,
      activePlayers: allP.filter((p) => p.status === "ACTIVE").length,
      pendingPlayers: allP.filter((p) => p.status === "PENDING").length,
      proTeams: enrichedTeams.filter((t) => t.plan_tier === "PRO").length,
      eliteTeams: enrichedTeams.filter((t) => t.plan_tier === "ELITE").length,
    });

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Team actions ───────────────────────────────────────────────────────────

  async function updatePlanTier(teamId: string, tier: PlanTier) {
    setBusy(true);
    const { error } = await supabase.from("teams").update({ plan_tier: tier }).eq("id", teamId);
    if (error) { showToast("Villa við að uppfæra plan tier"); }
    else { showToast("Plan tier uppfært"); await loadData(); }
    setBusy(false);
  }

  function confirmDeleteTeam(team: Team) {
    setConfirm({
      message: `Eyða liðinu „${team.name}" og öllum leikmönnum þess? Þetta er óafturkræft.`,
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        // Delete players first, then team
        await supabase.from("players").delete().eq("team_id", team.id);
        const { error } = await supabase.from("teams").delete().eq("id", team.id);
        if (error) showToast("Villa við að eyða liði");
        else { showToast(`Liðið „${team.name}" eytt`); await loadData(); }
        setBusy(false);
      },
    });
  }

  // ── Player actions ─────────────────────────────────────────────────────────

  function confirmDeletePlayer(player: Player) {
    setConfirm({
      message: `Eyða leikmanninum „${player.full_name}"? Þetta er óafturkræft.`,
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        const { error } = await supabase.from("players").delete().eq("id", player.id);
        if (error) showToast("Villa við að eyða leikmann");
        else { showToast(`„${player.full_name}" eytt`); await loadData(); }
        setBusy(false);
      },
    });
  }

  async function movePlayer() {
    if (!moveTarget || !moveToTeam) return;
    setBusy(true);
    const { error } = await supabase
      .from("players")
      .update({ team_id: moveToTeam })
      .eq("id", moveTarget.id);
    if (error) showToast("Villa við að færa leikmann");
    else {
      // Also update profile's team_id if user is linked
      if (moveTarget.user_id) {
        await supabase
          .from("profiles")
          .update({ team_id: moveToTeam })
          .eq("id", moveTarget.user_id);
      }
      showToast(`„${moveTarget.full_name}" færður`);
      await loadData();
    }
    setMoveTarget(null);
    setMoveToTeam("");
    setBusy(false);
  }

  async function approvePlayer(player: Player) {
    setBusy(true);
    const { error } = await supabase
      .from("players")
      .update({ status: "ACTIVE", is_active: true })
      .eq("id", player.id);
    if (error) showToast("Villa við samþykki");
    else { showToast(`„${player.full_name}" samþykktur`); await loadData(); }
    setBusy(false);
  }

  async function rejectPlayer(player: Player) {
    setBusy(true);
    const { error } = await supabase
      .from("players")
      .update({ status: "REJECTED", is_active: false })
      .eq("id", player.id);
    if (error) showToast("Villa við höfnun");
    else { showToast(`„${player.full_name}" hafnað`); await loadData(); }
    setBusy(false);
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const pendingPlayers = players.filter((p) => p.status === "PENDING");

  const filteredPlayers = players.filter((p) => {
    const matchSearch =
      !playerSearch || p.full_name.toLowerCase().includes(playerSearch.toLowerCase());
    const matchStatus = playerStatusFilter === "ALL" || p.status === playerStatusFilter;
    const matchTeam = playerTeamFilter === "ALL" || p.team_id === playerTeamFilter;
    return matchSearch && matchStatus && matchTeam;
  });

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const TABS: Array<{ key: AdminTab; label: string }> = [
    { key: "overview", label: "Yfirlit" },
    { key: "teams", label: "Lið" },
    { key: "players", label: "Leikmenn" },
    {
      key: "pending",
      label: pendingPlayers.length > 0 ? `Bíður samþykkis (${pendingPlayers.length})` : "Bíður samþykkis",
    },
    { key: "compliance", label: "Regluvarsla" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400 text-sm">
        Hleð gögnum…
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-zinc-900 text-white px-5 py-3 text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Move player dialog */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold mb-1">Færa leikmann</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Færðu <strong>{moveTarget.full_name}</strong> yfir í nýtt lið.
            </p>
            <label className="block text-xs text-zinc-500 mb-1">Velja lið</label>
            <select
              value={moveToTeam}
              onChange={(e) => setMoveToTeam(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 mb-5"
            >
              <option value="">– Veldu lið –</option>
              {teams
                .filter((t) => t.id !== moveTarget.team_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {formatTeamLabel(t, "IS")}
                  </option>
                ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setMoveTarget(null); setMoveToTeam(""); }}
                className="rounded-lg border px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Hætta við
              </button>
              <button
                onClick={movePlayer}
                disabled={!moveToTeam || busy}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                style={{ background: "#005a2b" }}
              >
                Færa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab nav */}
      <div className="border-b mb-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "border-b-2 px-5 py-3 text-sm font-semibold whitespace-nowrap"
                  : "border-b-2 border-transparent px-5 py-3 text-sm text-zinc-500 hover:text-zinc-700 whitespace-nowrap"
              }
              style={tab === t.key ? { borderBottomColor: "#005a2b", color: "#005a2b" } : {}}
            >
              {t.label}
              {t.key === "pending" && pendingPlayers.length > 0 && tab !== "pending" && (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  {pendingPlayers.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && stats && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Yfirlit kerfisins</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <StatCard label="Lið samtals" value={stats.totalTeams} />
            <StatCard label="ELITE lið" value={stats.eliteTeams} />
            <StatCard label="PRO lið" value={stats.proTeams} />
            <StatCard label="FREE lið" value={stats.totalTeams - stats.proTeams - stats.eliteTeams} />
            <StatCard label="Leikmenn" value={stats.totalPlayers} sub={`${stats.activePlayers} virkir`} />
            <StatCard
              label="Bíður samþykkis"
              value={stats.pendingPlayers}
              sub={stats.pendingPlayers > 0 ? "Þarf athygli" : ""}
            />
          </div>

          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Öll lið</h3>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Lið</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-left">Þjálfari</th>
                  <th className="px-4 py-3 text-right">Leikmenn</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3 font-medium">{formatTeamLabel(team, "IS")}</td>
                    <td className="px-4 py-3">
                      <Badge label={team.plan_tier} color={PLAN_COLORS[team.plan_tier]} />
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{team.coach_name ?? "–"}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{team.player_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TEAMS ── */}
      {tab === "teams" && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Stjórna liðum</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Lið</th>
                  <th className="px-4 py-3 text-left">Þjálfari</th>
                  <th className="px-4 py-3 text-right">Leikmenn</th>
                  <th className="px-4 py-3 text-left">Plan tier</th>
                  <th className="px-4 py-3 text-right">Aðgerðir</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3 font-medium">{formatTeamLabel(team, "IS")}</td>
                    <td className="px-4 py-3 text-zinc-500">{team.coach_name ?? "–"}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{team.player_count}</td>
                    <td className="px-4 py-3">
                      <select
                        value={team.plan_tier}
                        onChange={(e) => updatePlanTier(team.id, e.target.value as PlanTier)}
                        disabled={busy}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-300"
                      >
                        <option value="FREE">FREE</option>
                        <option value="PRO">PRO</option>
                        <option value="ELITE">ELITE</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => confirmDeleteTeam(team)}
                        disabled={busy}
                        className="rounded-md px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40"
                      >
                        Eyða liði
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PLAYERS ── */}
      {tab === "players" && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Stjórna leikmönnum</h2>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Leita að leikmann…"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
            <select
              value={playerTeamFilter}
              onChange={(e) => setPlayerTeamFilter(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              <option value="ALL">Öll lið</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{formatTeamLabel(t, "IS")}</option>
              ))}
            </select>
            <select
              value={playerStatusFilter}
              onChange={(e) => setPlayerStatusFilter(e.target.value as any)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              <option value="ALL">Allar stöður</option>
              <option value="ACTIVE">Virkir</option>
              <option value="PENDING">Bíður</option>
              <option value="REJECTED">Hafnað</option>
            </select>
            <span className="ml-auto text-xs text-zinc-400 self-center">
              {filteredPlayers.length} leikmenn
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Nafn</th>
                  <th className="px-4 py-3 text-left">Lið</th>
                  <th className="px-4 py-3 text-left">Staða</th>
                  <th className="px-4 py-3 text-right">Aðgerðir</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                      Engir leikmenn fundust
                    </td>
                  </tr>
                )}
                {filteredPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3 font-medium">{player.full_name}</td>
                    <td className="px-4 py-3 text-zinc-500">{player.team_name}</td>
                    <td className="px-4 py-3">
                      <Badge
                        label={
                          player.status === "ACTIVE"
                            ? "Virkur"
                            : player.status === "PENDING"
                            ? "Bíður"
                            : "Hafnað"
                        }
                        color={STATUS_COLORS[player.status]}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setOwnershipTarget(player)}
                          disabled={busy}
                          className="rounded-md px-3 py-1.5 text-xs text-zinc-700 border border-zinc-300 hover:bg-zinc-50 disabled:opacity-40"
                          title="Eignarréttur gagna"
                        >
                          Gögn
                        </button>
                        <button
                          onClick={() => { setMoveTarget(player); setMoveToTeam(""); }}
                          disabled={busy}
                          className="rounded-md px-3 py-1.5 text-xs text-blue-700 border border-blue-200 hover:bg-blue-50 disabled:opacity-40"
                        >
                          Færa
                        </button>
                        <button
                          onClick={() => confirmDeletePlayer(player)}
                          disabled={busy}
                          className="rounded-md px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40"
                        >
                          Eyða
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ownership drill-in modal */}
      {ownershipTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6">
          <div className="w-full max-w-4xl rounded-2xl bg-zinc-50 shadow-2xl">
            <div className="flex items-center justify-between border-b bg-white px-6 py-4 rounded-t-2xl">
              <div>
                <div className="text-xs text-zinc-500">Eignarréttur gagna</div>
                <h3 className="text-base font-semibold text-zinc-900">
                  {ownershipTarget.full_name}
                </h3>
              </div>
              <button
                onClick={() => setOwnershipTarget(null)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Loka
              </button>
            </div>
            <div className="p-6">
              <PlayerOwnershipAdminPanel
                playerId={ownershipTarget.id}
                lang="IS"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── PENDING ── */}
      {tab === "pending" && (
        <div>
          <h2 className="text-lg font-semibold mb-1">Bíður samþykkis</h2>
          <p className="text-sm text-zinc-500 mb-5">
            Leikmenn frá öllum liðum sem bíða samþykkis þjálfara eða admin.
          </p>

          {pendingPlayers.length === 0 ? (
            <div className="rounded-xl border bg-zinc-50 px-6 py-12 text-center text-zinc-400 text-sm">
              Engir leikmenn bíða samþykkis
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Nafn</th>
                    <th className="px-4 py-3 text-left">Lið</th>
                    <th className="px-4 py-3 text-left">Skráð</th>
                    <th className="px-4 py-3 text-right">Aðgerðir</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingPlayers.map((player) => (
                    <tr key={player.id} className="hover:bg-amber-50/40">
                      <td className="px-4 py-3 font-medium">{player.full_name}</td>
                      <td className="px-4 py-3 text-zinc-500">{player.team_name}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">
                        {player.requested_at
                          ? new Date(player.requested_at).toLocaleDateString("is-IS")
                          : "–"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => approvePlayer(player)}
                            disabled={busy}
                            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                            style={{ background: "#005a2b" }}
                          >
                            Samþykkja
                          </button>
                          <button
                            onClick={() => rejectPlayer(player)}
                            disabled={busy}
                            className="rounded-md px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40"
                          >
                            Hafna
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── COMPLIANCE ── */}
      {tab === "compliance" && (
        <div>
          <div className="mb-4 flex items-center justify-end">
            <button
              onClick={() => setBulkDobOpen(true)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Fjölda-DOB úr Excel
            </button>
          </div>
          <ComplianceDashboard
          key={complianceRefreshKey}
          lang="IS"
          onOpenPlayer={(playerId, fullName) => {
            const existing = players.find((p) => p.id === playerId);
            if (existing) {
              setOwnershipTarget(existing);
            } else {
              // Fallback: synthesize a minimal Player row so the modal opens
              setOwnershipTarget({
                id: playerId,
                full_name: fullName,
                team_id: "",
                team_name: "",
                status: "ACTIVE",
                is_active: true,
                requested_at: null,
                user_id: null,
              });
            }
          }}
          />
        </div>
      )}

      {/* Bulk DOB editor modal */}
      {bulkDobOpen && (
        <BulkDobEditor
          lang="IS"
          onClose={() => setBulkDobOpen(false)}
          onSaved={() => setComplianceRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
