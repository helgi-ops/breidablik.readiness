
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";

const COPY = {
  EN: {
    title: "MD+1 Minutes",
    subtitle: "Enter minutes from the last match. This drives STARTER / NON-STARTER.",
    search: "Search…", refresh: "Refresh", saving: "Saving…", saveAll: "Save all",
    matchDay: "Match day:", opponent: "Opponent:", opponentPh: "e.g. FH, Víkingur, Valur…",
    home: "Home", away: "Away", unsaved: "Unsaved", loading: "Loading…",
    player: "Player", matchDayCol: "Match day", minutes: "Minutes", dnp: "DNP",
    empty: "No players for this team — or no scheduled match yet.",
    footer: "STARTER ≥ 60 min · NON-STARTER < 60 min",
    footerCite: "60-min threshold: Carling 2018; Nédélec 2012; Helsen 2018",
  },
  IS: {
    title: "MD+1 mínútur",
    subtitle: "Skráðu mínútur úr síðasta leik. Þetta stjórnar STARTER / NON-STARTER.",
    search: "Leita…", refresh: "Endurhlaða", saving: "Vista…", saveAll: "Vista allt",
    matchDay: "Leikdagur:", opponent: "Andstæðingur:", opponentPh: "t.d. FH, Víkingur, Valur…",
    home: "Heima", away: "Úti", unsaved: "Óvistað", loading: "Hleð…",
    player: "Leikmaður", matchDayCol: "Leikdagur", minutes: "Mínútur", dnp: "DNP",
    empty: "Engir leikmenn fyrir þetta lið — eða enginn skráður leikur enn.",
    footer: "STARTER ≥ 60 mín · NON-STARTER < 60 mín",
    footerCite: "60-mín þröskuldur: Carling 2018; Nédélec 2012; Helsen 2018",
  },
} as const;



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
  opponent: string | null;
  is_home: boolean | null;
  competition: string | null;
};

export default function CoachMatchMinutesPage() {
  const [lang] = useLang();
  const t = COPY[lang === "IS" ? "IS" : "EN"];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [opponent, setOpponent] = useState("");
  const [opponentDirty, setOpponentDirty] = useState(false);
  const [matchDate, setMatchDate] = useState("");
  const [matchDateDirty, setMatchDateDirty] = useState(false);
  const [isHome, setIsHome] = useState<boolean | null>(null);
  const [isHomeDirty, setIsHomeDirty] = useState(false);
  // Currently active team — resolved from profiles.team_id (the team the
  // coach picked in the sidebar TeamSwitcher). The match-minutes view is
  // not RLS-team-scoped (it returns every player the user can see across
  // all their teams), so we MUST filter on the client by team_id or the
  // table will mix players from multiple clubs together.
  const [teamId, setTeamId] = useState<string | null>(null);

  const supabase = useMemo(() => getSupabaseClient(), []);

  async function load(teamIdParam: string | null) {
    setLoading(true);
    setError("");

    if (!teamIdParam) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("v_coach_match_minutes_input")
      .select("*")
      .eq("team_id", teamIdParam);

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const loaded = (data as Row[]) ?? [];
    setRows(loaded);
    // Seed opponent & match date from first row
    const first = loaded.find((r) => r.opponent);
    if (first?.opponent && !opponentDirty) setOpponent(first.opponent);
    const firstWithDate = loaded.find((r) => r.last_match_date);
    if (firstWithDate?.last_match_date && !matchDateDirty) setMatchDate(firstWithDate.last_match_date);
    const firstWithHome = loaded.find((r) => r.is_home != null);
    if (firstWithHome?.is_home != null && !isHomeDirty) setIsHome(firstWithHome.is_home);
    setLoading(false);
  }

  // Resolve the coach's currently active team, then load. Re-run whenever
  // the active team changes (e.g. after switching teams in the sidebar).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (alive) {
          setError("Not signed in");
          setLoading(false);
        }
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const tid = (profile as { team_id?: string | null } | null)?.team_id ?? null;
      if (!alive) return;
      setTeamId(tid);
      if (!tid) {
        setError("No team linked to this account");
        setLoading(false);
        return;
      }
      await load(tid);
    })();
    return () => { alive = false; };
  }, [supabase]);


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

    // Use the override date if the coach changed it, otherwise use the view date
    const effectiveDate = matchDateDirty && matchDate ? matchDate : null;

    // If match date, opponent, or home/away was changed, ensure match_schedule row exists
    if (teamId && (matchDateDirty || opponentDirty || isHomeDirty)) {
      const date = effectiveDate ?? rows.find((r) => r.last_match_date)?.last_match_date;
      if (date) {
        const schedulePayload: Record<string, unknown> = {
          team_id: teamId,
          match_date: date,
        };
        if (opponent.trim()) schedulePayload.opponent = opponent.trim();
        if (isHome != null) schedulePayload.is_home = isHome;

        const { error: schedErr } = await supabase
          .from("match_schedule")
          .upsert(schedulePayload, { onConflict: "team_id,match_date" });
        if (schedErr) {
          setError(schedErr.message);
          setSaving(false);
          return;
        }
      }
    }

    // Build minutes payload — use effective date for all players
    const payload = rows
      .filter((r) => effectiveDate || r.last_match_date)
      .map((r) => ({
        player_id: r.player_id,
        match_date: effectiveDate ?? r.last_match_date,
        team_id: r.team_id,
        minutes_played: r.is_dnp ? 0 : r.minutes_played,
        is_dnp: r.is_dnp,
      }));

    const { error: minErr } = await supabase
      .from("match_player_minutes")
      .upsert(payload, { onConflict: "player_id,match_date" });

    if (minErr) {
      setError(minErr.message);
      setSaving(false);
      return;
    }

    setOpponentDirty(false);
    setMatchDateDirty(false);
    setIsHomeDirty(false);
    await load(teamId);
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <PagePurpose
            en="record who played how long, so load reflects real minutes"
            is="skrá hver spilaði hve lengi, svo álag endurspegli raunmínútur"
          />
          <CardDescription>
            {t.subtitle}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder={t.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-64"
              />
              <Badge variant="secondary">{filtered.length}</Badge>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => load(teamId)} disabled={loading || saving}>
                {t.refresh}
              </Button>
              <Button onClick={saveAll} disabled={loading || saving}>
                {saving ? t.saving : t.saveAll}
              </Button>
            </div>
          </div>

          {/* Match info bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">{t.matchDay}</span>
              <Input
                type="date"
                value={matchDate}
                onChange={(e) => {
                  setMatchDate(e.target.value);
                  setMatchDateDirty(true);
                }}
                className="w-44"
                disabled={saving}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">{t.opponent}</span>
              <Input
                placeholder={t.opponentPh}
                value={opponent}
                onChange={(e) => {
                  setOpponent(e.target.value);
                  setOpponentDirty(true);
                }}
                className="w-48"
                disabled={saving}
              />
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={isHome === true ? "default" : "outline"}
                className="h-8 px-3 text-xs"
                disabled={saving}
                onClick={() => { setIsHome(true); setIsHomeDirty(true); }}
              >
                {t.home}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isHome === false ? "default" : "outline"}
                className="h-8 px-3 text-xs"
                disabled={saving}
                onClick={() => { setIsHome(false); setIsHomeDirty(true); }}
              >
                {t.away}
              </Button>
            </div>

            {rows[0]?.competition && (
              <Badge variant="secondary">{rows[0].competition}</Badge>
            )}

            {(opponentDirty || matchDateDirty || isHomeDirty) && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                {t.unsaved}
              </Badge>
            )}
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Separator />

          {loading ? (
            <div className="text-sm text-muted-foreground">{t.loading}</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">{t.empty}</div>
          ) : (
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">{t.player}</th>
                    <th className="p-3">{t.matchDayCol}</th>
                    <th className="p-3 w-32">{t.minutes}</th>
                    <th className="p-3 w-24">{t.dnp}</th>
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
          <span title={t.footerCite} className="cursor-help underline decoration-dotted">{t.footer}</span>
        </CardFooter>
      </Card>
    </div>
  );
}
