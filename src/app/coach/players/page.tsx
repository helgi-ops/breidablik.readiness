"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Select
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Checkbox
import { Checkbox } from "@/components/ui/checkbox";
import CoachConsentStatusCard from "@/components/coach/CoachConsentStatusCard";
import TeamInviteLinks from "@/components/coach/TeamInviteLinks";
import { POSITION_OPTIONS } from "@/lib/micropulse/positionStyle";

// ── Copy ──────────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    pendingTitle:       "Bíður samþykkis",
    pendingDesc:        "Eftirfarandi leikmenn skráðu sig og bíða samþykkis þíns.",
    pendingLoading:     "Hleð...",
    pendingEmpty:       "Engir leikmenn í bið.",
    registeredOn:       (date: string) => `Skráði sig ${date}`,
    approve:            "Samþykkja",
    reject:             "Hafna",
    assignTitle:        "Úthluta einingum",
    assignDesc:         (sport: string, unit: string) =>
                          `Settu ${sport} og ${unit} á leikmenn.`,
    unassigned:         (n: number) => `Óúthlutað: ${n}`,
    noPermission:       "Þú ert ekki með coach/admin réttindi til að breyta leikmönnum.",
    searchPlaceholder:  "Leita að leikmanni...",
    bulkSport:          "Bulk íþrótt",
    bulkUnit:           "Bulk eining",
    applySelected:      (n: number) => `Nota á valda (${n})`,
    saveChanges:        "Vista breytingar",
    saving:             "Vista...",
    playersHeader:      "Leikmenn",
    refresh:            "Uppfæra",
    loading:            "Hleð...",
    noPlayers:          "Engir leikmenn fundust.",
    setSport:           "Velja íþrótt",
    setUnit:            "Velja einingu",
    ok:                 "OK",
    deactivate:         "Gera óvirkan",
    deactivating:       "Vista...",
    reactivate:         "Virkja aftur",
    confirmDeactivate:  (name: string) =>
                          `Gera ${name} óvirkan? Leikmaðurinn hverfur úr virkum listum og readiness, en öll gögn haldast. Hægt að virkja aftur hvenær sem er.`,
    inactiveTitle:      "Óvirkir leikmenn",
    inactiveDesc:       "Leikmenn sem hafa verið gerðir óvirkir. Gögnin haldast — hægt að virkja aftur hvenær sem er.",
    inactiveEmpty:      "Engir óvirkir leikmenn.",
    tip:                "Ábending: Byrjaðu á að velja alla → setja íþrótt → Nota → velja viðeigandi einingu í bulk (eða handvirkt á einstaka).",
    locale:             "is-IS",
  },
  EN: {
    pendingTitle:       "Pending approval",
    pendingDesc:        "The following players have registered and are awaiting your approval.",
    pendingLoading:     "Loading...",
    pendingEmpty:       "No players awaiting approval.",
    registeredOn:       (date: string) => `Registered ${date}`,
    approve:            "Approve",
    reject:             "Reject",
    assignTitle:        "Assign units",
    assignDesc:         (sport: string, unit: string) =>
                          `Assign ${sport} and ${unit} to players.`,
    unassigned:         (n: number) => `Unassigned: ${n}`,
    noPermission:       "You do not have coach/admin permissions to edit players.",
    searchPlaceholder:  "Search players...",
    bulkSport:          "Bulk sport",
    bulkUnit:           "Bulk unit",
    applySelected:      (n: number) => `Apply to selected (${n})`,
    saveChanges:        "Save changes",
    saving:             "Saving...",
    playersHeader:      "Players",
    refresh:            "Refresh",
    loading:            "Loading...",
    noPlayers:          "No players found.",
    setSport:           "Set sport",
    setUnit:            "Set unit",
    ok:                 "OK",
    deactivate:         "Make inactive",
    deactivating:       "Saving...",
    reactivate:         "Reactivate",
    confirmDeactivate:  (name: string) =>
                          `Make ${name} inactive? They drop out of active lists and readiness, but all data is kept. You can reactivate any time.`,
    inactiveTitle:      "Inactive players",
    inactiveDesc:       "Players who have been made inactive. Their data is kept — reactivate any time.",
    inactiveEmpty:      "No inactive players.",
    tip:                "Tip: Start by selecting all → set sport → Apply → then choose the appropriate unit in bulk (or adjust individually).",
    locale:             "en-GB",
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfileRow = {
  id: string;
  role: string | null;
  team_id: string | null;
  player_id: string | null;
  display_name: string | null;
};

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id?: string | null;
  team?: string | null;
  position?: string | null;
  sport?: string | null;
  unit?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  requested_at?: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORT_OPTIONS = [
  { value: "football",   label: "Football" },
  { value: "basketball", label: "Basketball" },
] as const;

const UNIT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  football: [
    { value: "goalkeeper", label: "Goalkeeper" },
    { value: "defense",    label: "Defense" },
    { value: "midfield",   label: "Midfield" },
    { value: "attack",     label: "Attack" },
  ],
  basketball: [
    { value: "guards", label: "Guards" },
    { value: "wings",  label: "Wings" },
    { value: "bigs",   label: "Bigs" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

// Supabase/PostgREST errors are plain objects — `String(err)` yields the useless
// "[object Object]". Pull out a human-readable line instead.
function supabaseErrorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown };
    const msg = [o.message, o.details, o.hint].filter((v) => typeof v === "string" && v).join(" — ");
    if (msg) return msg;
  }
  return e instanceof Error ? e.message : String(e);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoachPlayersPage() {
  const [lang] = useLang();
  const ct = COPY[lang];

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  const [profile, setProfile]               = useState<ProfileRow | null>(null);
  const [players, setPlayers]               = useState<PlayerRow[]>([]);
  const [pendingPlayers, setPendingPlayers] = useState<PlayerRow[]>([]);
  const [inactivePlayers, setInactivePlayers] = useState<PlayerRow[]>([]);
  const [busyId, setBusyId]                 = useState<string | null>(null);
  const [q, setQ]                           = useState("");

  // selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  // bulk controls
  const [bulkSport, setBulkSport] = useState<string | null>(null);
  const [bulkUnit, setBulkUnit]   = useState<string | null>(null);

  // inline edits draft
  const [draft, setDraft] = useState<Record<string, { sport?: string | null; unit?: string | null; position?: string | null }>>({});

  const teamId = profile?.team_id ?? null;
  const canEdit = useMemo(() => {
    const r = (profile?.role ?? "").toLowerCase();
    return r.includes("coach") || r.includes("admin");
  }, [profile]);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setProfile(null);
        setPlayers([]);
        setPendingPlayers([]);
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, role, team_id, player_id, display_name")
        .eq("id", userId)
        .maybeSingle();

      if (profErr) throw profErr;
      setProfile(prof as ProfileRow);

      const tId = (prof as ProfileRow)?.team_id ?? null;
      if (!tId) {
        setPlayers([]);
        setPendingPlayers([]);
        return;
      }

      await loadPlayers(tId);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlayers(tId: string) {
    const { data, error } = await supabase
      .from("players")
      .select("id, full_name, team_id, team, position, sport, unit, status, is_active, requested_at")
      .eq("team_id", tId)
      .order("full_name", { ascending: true });

    if (error) throw error;

    const all = (data ?? []) as PlayerRow[];
    const st = (p: PlayerRow) => (p.status ?? "ACTIVE");
    const pending  = all.filter((p) => p.status === "PENDING");
    const inactive = all.filter((p) => st(p) === "INACTIVE" || (p.status !== "PENDING" && p.status !== "REJECTED" && p.is_active === false));
    const active   = all.filter((p) => st(p) !== "PENDING" && st(p) !== "REJECTED" && st(p) !== "INACTIVE" && p.is_active !== false);

    setPlayers(active);
    setPendingPlayers(pending);
    setInactivePlayers(inactive);

    const sel: Record<string, boolean> = {};
    const dr: Record<string, { sport?: string | null; unit?: string | null; position?: string | null }> = {};
    for (const p of active) {
      sel[p.id] = false;
      dr[p.id]  = { sport: p.sport ?? null, unit: p.unit ?? null, position: p.position ?? null };
    }
    setSelected(sel);
    setDraft(dr);
  }

  async function approvePlayer(playerId: string) {
    if (!teamId) return;
    setApproving(playerId);
    try {
      // 1. Activate the player row
      const { error } = await supabase
        .from("players")
        .update({ status: "ACTIVE", is_active: true })
        .eq("id", playerId)
        .eq("team_id", teamId);
      if (error) throw error;

      // 2. Look up the user_id on this player row so we can link the profile
      const { data: playerRow } = await supabase
        .from("players")
        .select("user_id")
        .eq("id", playerId)
        .maybeSingle();

      const linkedUserId = (playerRow as { user_id?: string | null } | null)?.user_id ?? null;
      if (linkedUserId) {
        // 3. Make sure profiles.player_id is set (handles retroactive data pre-trigger-fix)
        await supabase
          .from("profiles")
          .update({ player_id: playerId, team_id: teamId })
          .eq("id", linkedUserId)
          .is("player_id", null); // only patch if not yet linked
      }

      await loadPlayers(teamId);
    } finally {
      setApproving(null);
    }
  }

  async function rejectPlayer(playerId: string) {
    if (!teamId) return;
    setApproving(playerId);
    try {
      const { error } = await supabase
        .from("players")
        .update({ status: "REJECTED", is_active: false })
        .eq("id", playerId)
        .eq("team_id", teamId);
      if (error) throw error;
      await loadPlayers(teamId);
    } finally {
      setApproving(null);
    }
  }

  async function deactivatePlayer(p: PlayerRow) {
    if (!teamId || !canEdit) return;
    if (!window.confirm(ct.confirmDeactivate(p.full_name ?? "—"))) return;
    setBusyId(p.id);
    try {
      const { error } = await supabase
        .from("players")
        .update({ status: "INACTIVE", is_active: false })
        .eq("id", p.id)
        .eq("team_id", teamId);
      if (error) throw error;
      await loadPlayers(teamId);
    } catch (e) {
      window.alert(supabaseErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reactivatePlayer(p: PlayerRow) {
    if (!teamId || !canEdit) return;
    setBusyId(p.id);
    try {
      const { error } = await supabase
        .from("players")
        .update({ status: "ACTIVE", is_active: true })
        .eq("id", p.id)
        .eq("team_id", teamId);
      if (error) throw error;
      await loadPlayers(teamId);
    } catch (e) {
      window.alert(supabaseErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return players;
    return players.filter((p) => String(p.full_name ?? "").toLowerCase().includes(query));
  }, [players, q]);

  function toggleAll(checked: boolean) {
    const next = { ...selected };
    for (const p of filtered) next[p.id] = checked;
    setSelected(next);
  }

  function applyBulk() {
    if (!bulkSport && !bulkUnit) return;
    if (selectedIds.length === 0) return;

    const next = { ...draft };
    for (const id of selectedIds) {
      const prev = next[id] ?? {};
      const sport = bulkSport ?? prev.sport ?? null;
      const unit =
        bulkUnit ??
        (bulkSport && bulkSport !== (prev.sport ?? null) ? null : (prev.unit ?? null));
      next[id] = { sport, unit };
    }
    setDraft(next);
  }

  function setRowSport(id: string, sport: string | null) {
    setDraft((prev) => {
      const cur = prev[id] ?? {};
      const nextUnit = (cur.sport ?? null) !== sport ? null : (cur.unit ?? null);
      return { ...prev, [id]: { ...cur, sport, unit: nextUnit } };
    });
  }

  function setRowUnit(id: string, unit: string | null) {
    setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), unit } }));
  }

  function setRowPosition(id: string, position: string | null) {
    setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), position } }));
  }

  async function saveChanges() {
    if (!canEdit || !teamId) return;

    setSaving(true);
    try {
      const updates: { id: string; sport: string | null; unit: string | null; position: string | null }[] = [];

      for (const p of players) {
        const d = draft[p.id] ?? {};
        const sport = norm(d.sport);
        const unit  = norm(d.unit);
        const position = norm(d.position);
        if (sport !== norm(p.sport) || unit !== norm(p.unit) || position !== norm(p.position)) {
          updates.push({ id: p.id, sport, unit, position });
        }
      }

      if (updates.length === 0) return;

      const results = await Promise.all(
        updates.map((u) =>
          supabase
            .from("players")
            .update({ sport: u.sport, unit: u.unit, position: u.position })
            .eq("id", u.id)
            .eq("team_id", teamId)
            .select("id")
        )
      );

      const firstErr = results.find((r) => (r as { error?: unknown })?.error)?.error;
      if (firstErr) throw firstErr;

      await loadPlayers(teamId);
    } finally {
      setSaving(false);
    }
  }

  const unknownCount = useMemo(
    () => players.filter((p) => !norm(p.unit) || norm(p.unit) === "unknown").length,
    [players]
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">

      {/* ── Privacy consent status ── */}
      <CoachConsentStatusCard />

      {/* ── Invite links ── */}
      <TeamInviteLinks />

      {/* ── Pending requests ── */}
      {(loading || pendingPlayers.length > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{ct.pendingTitle}</CardTitle>
              {pendingPlayers.length > 0 && (
                <Badge variant="secondary" className="bg-amber-200 text-amber-900">
                  {pendingPlayers.length}
                </Badge>
              )}
            </div>
            <CardDescription>{ct.pendingDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-2 text-sm text-slate-500">{ct.pendingLoading}</div>
            ) : pendingPlayers.length === 0 ? (
              <div className="py-2 text-sm text-slate-500">{ct.pendingEmpty}</div>
            ) : (
              <div className="divide-y rounded-xl border bg-white">
                {pendingPlayers.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-medium">{p.full_name ?? "—"}</div>
                      <div className="text-xs text-slate-500">
                        {ct.registeredOn(formatDate(p.requested_at, ct.locale))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approvePlayer(p.id)}
                        disabled={approving === p.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {approving === p.id ? "…" : ct.approve}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectPlayer(p.id)}
                        disabled={approving === p.id}
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        {approving === p.id ? "…" : ct.reject}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Active players ── */}
      <Card>
        <CardHeader>
          <CardTitle>{ct.assignTitle}</CardTitle>
          <CardDescription>
            {ct.assignDesc("sport", "unit")}
            {unknownCount > 0 && (
              <span className="ml-2 text-xs text-slate-500">{ct.unassigned(unknownCount)}</span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!canEdit && (
            <div className="rounded-lg border bg-yellow-50 p-3 text-sm">
              {ct.noPermission}
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder={ct.searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="md:max-w-sm"
            />

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Select value={bulkSport ?? ""} onValueChange={(v) => setBulkSport(v || null)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={ct.bulkSport} />
                </SelectTrigger>
                <SelectContent>
                  {SPORT_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={bulkUnit ?? ""}
                onValueChange={(v) => setBulkUnit(v || null)}
                disabled={!bulkSport}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={ct.bulkUnit} />
                </SelectTrigger>
                <SelectContent>
                  {(bulkSport ? UNIT_OPTIONS[bulkSport] ?? [] : []).map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="secondary"
                onClick={applyBulk}
                disabled={!canEdit || selectedIds.length === 0}
              >
                {ct.applySelected(selectedIds.length)}
              </Button>

              <Button onClick={saveChanges} disabled={!canEdit || saving}>
                {saving ? ct.saving : ct.saveChanges}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b p-3 text-sm">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((p) => selected[p.id])}
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                />
                <span className="font-medium">{ct.playersHeader}</span>
                <span className="text-slate-500">({filtered.length})</span>
              </div>
              <Button variant="ghost" onClick={() => bootstrap()} disabled={loading}>
                {ct.refresh}
              </Button>
            </div>

            <div className="divide-y">
              {loading ? (
                <div className="p-4 text-sm text-slate-500">{ct.loading}</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">{ct.noPlayers}</div>
              ) : (
                filtered.map((p) => {
                  const d    = draft[p.id] ?? {};
                  const sport = norm(d.sport);
                  const unit  = norm(d.unit);
                  const position = norm(d.position);

                  return (
                    <div
                      key={p.id}
                      className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={Boolean(selected[p.id])}
                          onCheckedChange={(v) =>
                            setSelected((prev) => ({ ...prev, [p.id]: Boolean(v) }))
                          }
                        />
                        <div>
                          <div className="font-medium">{p.full_name ?? "—"}</div>
                          <div className="text-xs text-slate-500">
                            {p.team ?? "—"}{p.position ? ` · ${p.position}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <Select
                          value={position ?? ""}
                          onValueChange={(v) => setRowPosition(p.id, v || null)}
                          disabled={!canEdit}
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Staða" />
                          </SelectTrigger>
                          <SelectContent>
                            {POSITION_OPTIONS.map((o) => (
                              <SelectItem key={o.code} value={o.code}>{o.code} · {o.is}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={sport ?? ""}
                          onValueChange={(v) => setRowSport(p.id, v || null)}
                          disabled={!canEdit}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Sport" />
                          </SelectTrigger>
                          <SelectContent>
                            {SPORT_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={unit ?? ""}
                          onValueChange={(v) => setRowUnit(p.id, v || null)}
                          disabled={!canEdit || !sport}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {(sport ? UNIT_OPTIONS[sport] ?? [] : []).map((u) => (
                              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="w-[120px] text-xs text-slate-500">
                          {!sport ? ct.setSport : !unit ? ct.setUnit : ct.ok}
                        </div>

                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deactivatePlayer(p)}
                            disabled={busyId === p.id}
                            className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                          >
                            {busyId === p.id ? ct.deactivating : ct.deactivate}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">
            {ct.tip}
          </div>
        </CardContent>
      </Card>

      {/* ── Inactive players ── */}
      {(loading || inactivePlayers.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{ct.inactiveTitle}</CardTitle>
              {inactivePlayers.length > 0 && (
                <Badge variant="secondary" className="bg-slate-200 text-slate-700">
                  {inactivePlayers.length}
                </Badge>
              )}
            </div>
            <CardDescription>{ct.inactiveDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-2 text-sm text-slate-500">{ct.loading}</div>
            ) : inactivePlayers.length === 0 ? (
              <div className="py-2 text-sm text-slate-500">{ct.inactiveEmpty}</div>
            ) : (
              <div className="divide-y rounded-xl border bg-white">
                {inactivePlayers.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-medium text-slate-600">{p.full_name ?? "—"}</div>
                      <div className="text-xs text-slate-400">
                        {p.team ?? "—"}{p.position ? ` · ${p.position}` : ""}
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reactivatePlayer(p)}
                        disabled={busyId === p.id}
                        className="border-green-300 text-green-700 hover:bg-green-50"
                      >
                        {busyId === p.id ? "…" : ct.reactivate}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
