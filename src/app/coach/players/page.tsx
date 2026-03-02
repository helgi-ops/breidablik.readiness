"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
};

const SPORT_OPTIONS = [
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
] as const;

const UNIT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  football: [
    { value: "goalkeeper", label: "Goalkeeper" },
    { value: "defense", label: "Defense" },
    { value: "midfield", label: "Midfield" },
    { value: "attack", label: "Attack" },
  ],
  basketball: [
    { value: "guards", label: "Guards" },
    { value: "wings", label: "Wings" },
    { value: "bigs", label: "Bigs" },
  ],
};

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export default function CoachPlayersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [q, setQ] = useState("");

  // selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  // bulk controls
  const [bulkSport, setBulkSport] = useState<string | null>(null);
  const [bulkUnit, setBulkUnit] = useState<string | null>(null);

  // inline edits draft
  const [draft, setDraft] = useState<Record<string, { sport?: string | null; unit?: string | null }>>({});

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
        return;
      }

      // ✅ HVAR: þetta þarf að passa við þitt profiles schema
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, role, team_id, player_id, display_name")
        .eq("id", userId)
        .maybeSingle();

      if (profErr) throw profErr;
      setProfile(prof as any);

      const tId = (prof as any)?.team_id ?? null;
      if (!tId) {
        setPlayers([]);
        return;
      }

      await loadPlayers(tId);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlayers(tId: string) {
    // ✅ HVAR: sækja players fyrir coach team_id
    const { data, error } = await supabase
      .from("players")
      .select("id, full_name, team_id, team, position, sport, unit")
      .eq("team_id", tId)
      .order("full_name", { ascending: true });

    if (error) throw error;

    const list = (data ?? []) as PlayerRow[];
    setPlayers(list);

    // init selection + drafts
    const sel: Record<string, boolean> = {};
    const dr: Record<string, { sport?: string | null; unit?: string | null }> = {};
    for (const p of list) {
      sel[p.id] = false;
      dr[p.id] = { sport: p.sport ?? null, unit: p.unit ?? null };
    }
    setSelected(sel);
    setDraft(dr);
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

      // ef sport breytist og bulkUnit ekki valið → núllum unit til að forðast mis-match
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
      const nextSport = sport;
      // ef sport breytist → núllum unit svo user velji rétt unit fyrir sport
      const nextUnit = (cur.sport ?? null) !== nextSport ? null : (cur.unit ?? null);
      return { ...prev, [id]: { ...cur, sport: nextSport, unit: nextUnit } };
    });
  }

  function setRowUnit(id: string, unit: string | null) {
    setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), unit } }));
  }

  async function saveChanges() {
    if (!canEdit) return;
    if (!teamId) return;

    setSaving(true);
    try {
      // finnum hvað hefur breyst
      const updates: { id: string; sport: string | null; unit: string | null }[] = [];

      for (const p of players) {
        const d = draft[p.id] ?? {};
        const sport = norm(d.sport);
        const unit = norm(d.unit);
        const oldSport = norm(p.sport);
        const oldUnit = norm(p.unit);

        if (sport !== oldSport || unit !== oldUnit) {
          updates.push({ id: p.id, sport, unit });
        }
      }

      if (updates.length === 0) return;

      // ✅ HVAR: Uppfæra players.unit + players.sport
      // (Promise.all í batch)
      const results = await Promise.all(
        updates.map((u) =>
          supabase
            .from("players")
            .update({ sport: u.sport, unit: u.unit })
            .eq("id", u.id)
            .eq("team_id", teamId) // extra safety
            .select("id")
        )
      );

      const firstErr = results.find((r) => (r as any)?.error)?.error;
      if (firstErr) throw firstErr;

      // reload list
      await loadPlayers(teamId);
    } finally {
      setSaving(false);
    }
  }

  const unknownCount = useMemo(() => {
    return players.filter((p) => !norm(p.unit) || norm(p.unit) === "unknown").length;
  }, [players]);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign Units</CardTitle>
          <CardDescription>
            Settu <span className="font-medium">sport</span> og <span className="font-medium">unit</span> á leikmenn.
            {unknownCount > 0 ? (
              <span className="ml-2 text-xs text-slate-500">Óúthlutað: {unknownCount}</span>
            ) : null}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!canEdit && (
            <div className="rounded-lg border bg-yellow-50 p-3 text-sm">
              Þú ert ekki með coach/admin réttindi til að breyta leikmönnum.
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder="Leita að leikmanni..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="md:max-w-sm"
            />

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Select value={bulkSport ?? ""} onValueChange={(v) => setBulkSport(v || null)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Bulk sport" />
                </SelectTrigger>
                <SelectContent>
                  {SPORT_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={bulkUnit ?? ""}
                onValueChange={(v) => setBulkUnit(v || null)}
                disabled={!bulkSport}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Bulk unit" />
                </SelectTrigger>
                <SelectContent>
                  {(bulkSport ? UNIT_OPTIONS[bulkSport] ?? [] : []).map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="secondary" onClick={applyBulk} disabled={!canEdit || selectedIds.length === 0}>
                Apply to selected ({selectedIds.length})
              </Button>

              <Button onClick={saveChanges} disabled={!canEdit || saving}>
                {saving ? "Saving..." : "Save changes"}
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
                <span className="font-medium">Players</span>
                <span className="text-slate-500">({filtered.length})</span>
              </div>

              <Button variant="ghost" onClick={() => bootstrap()} disabled={loading}>
                Refresh
              </Button>
            </div>

            <div className="divide-y">
              {loading ? (
                <div className="p-4 text-sm text-slate-500">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">Engir leikmenn fundust.</div>
              ) : (
                filtered.map((p) => {
                  const d = draft[p.id] ?? {};
                  const sport = norm(d.sport);
                  const unit = norm(d.unit);

                  return (
                    <div key={p.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={Boolean(selected[p.id])}
                          onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [p.id]: Boolean(v) }))}
                        />
                        <div>
                          <div className="font-medium">{p.full_name ?? "—"}</div>
                          <div className="text-xs text-slate-500">
                            {p.team ?? "—"} {p.position ? `· ${p.position}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <Select value={sport ?? ""} onValueChange={(v) => setRowSport(p.id, v || null)} disabled={!canEdit}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Sport" />
                          </SelectTrigger>
                          <SelectContent>
                            {SPORT_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
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
                              <SelectItem key={u.value} value={u.value}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="w-[120px] text-xs text-slate-500">
                          {!sport ? "Set sport" : !unit ? "Set unit" : "OK"}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">
            Tips: Byrjaðu á að velja alla → setja sport → Apply → velja viðeigandi unit í bulk (eða handvirkt á einstaka).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
