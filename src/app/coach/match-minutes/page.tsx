export const dynamic = "force-dynamic";

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Row = {
  player_id: string;
  full_name: string;
  team_id: string;
  last_match_date: string | null;
  minutes_played: number;
  is_dnp: boolean;
};

export default function CoachMatchMinutesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("v_coach_match_minutes_input")
      .select("*");

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as Row[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [rows, query]);

  function updateMinutes(playerId: string, matchDate: string | null, minutes: number) {
    if (!matchDate) return;

    setRows((prev) =>
      prev.map((r) =>
        r.player_id === playerId
          ? {
              ...r,
              minutes_played: Math.max(0, Math.min(130, minutes)),
              is_dnp: minutes === 0,
            }
          : r
      )
    );
  }

  function updateDnp(playerId: string, matchDate: string | null, isDnp: boolean) {
    if (!matchDate) return;

    setRows((prev) =>
      prev.map((r) =>
        r.player_id === playerId
          ? {
              ...r,
              is_dnp: isDnp,
              minutes_played: isDnp ? 0 : r.minutes_played,
            }
          : r
      )
    );
  }

  async function saveAll() {
    setSaving(true);
    setError("");

    const payload = rows
      .filter((r) => r.last_match_date)
      .map((r) => ({
        player_id: r.player_id,
        match_date: r.last_match_date,
        team_id: r.team_id,
        minutes_played: r.is_dnp ? 0 : r.minutes_played,
        is_dnp: r.is_dnp,
      }));

    const { error } = await supabase
      .from("match_player_minutes")
      .upsert(payload, { onConflict: "player_id,match_date" });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    await load();
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>MD+1 Minutes</CardTitle>
          <CardDescription>
            Skráðu mínútur úr síðasta leik. Þetta stjórnar STARTER / NON-STARTER.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Leita..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-64"
              />
              <Badge variant="secondary">{filtered.length}</Badge>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={load} disabled={loading || saving}>
                Refresh
              </Button>
              <Button onClick={saveAll} disabled={loading || saving}>
                {saving ? "Saving…" : "Save all"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Separator />

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">Leikmaður</th>
                    <th className="p-3">Leikdagur</th>
                    <th className="p-3 w-32">Mínútur</th>
                    <th className="p-3 w-24">DNP</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.player_id} className="border-t">
                      <td className="p-3 font-medium">{r.full_name}</td>
                      <td className="p-3 text-center font-mono text-xs">
                        {r.last_match_date ?? "—"}
                      </td>
                      <td className="p-3">
                        <Input
                          type="number"
                          min={0}
                          max={130}
                          value={r.minutes_played}
                          onChange={(e) =>
                            updateMinutes(r.player_id, r.last_match_date, Number(e.target.value))
                          }
                          disabled={!r.last_match_date || r.is_dnp || saving}
                        />
                      </td>
                      <td className="p-3 text-center">
                        <Checkbox
                          checked={r.is_dnp}
                          onCheckedChange={(v) =>
                            updateDnp(r.player_id, r.last_match_date, Boolean(v))
                          }
                          disabled={!r.last_match_date || saving}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground">
          STARTER ≥ 60 mín · NON-STARTER &lt; 60 mín
        </CardFooter>
      </Card>
    </div>
  );
}
