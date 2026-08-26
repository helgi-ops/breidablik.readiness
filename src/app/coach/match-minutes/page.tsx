
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { classifyMatchLoad, highMatchMinutesThreshold } from "@/lib/micropulse/matchMinutes";
import MatchVerdictChip from "@/components/coach/MatchVerdictChip";

const COPY = {
  EN: {
    title: "MD+1 Minutes",
    subtitle: "Pick a match, then mark who started, who came on, and their minutes.",
    search: "Search…", refresh: "Refresh", saving: "Saving…", saveAll: "Save all",
    matchDay: "Match day:", opponent: "Opponent:", opponentPh: "e.g. FH, Víkingur, Valur…",
    home: "Home", away: "Away", unsaved: "Unsaved", loading: "Loading…",
    pickMatch: "Match:", pickMatchPh: "Pick a match…", newDate: "＋ New date",
    player: "Player", matchDayCol: "Match day", minutes: "Minutes", dnp: "DNP",
    lineup: "Started / Sub", started: "Started", sub: "Sub",
    matchRunning: "Match running",
    empty: "No players for this team — or no scheduled match yet.",
    footer: "STARTER ≥ 60 min · NON-STARTER < 60 min",
    footerCite: "60-min threshold: Carling 2018; Nédélec 2012; Helsen 2018",
    pod: "Pod", estimate: "Forgot pod? Estimate", estimated: "est.", estRemove: "Remove estimate",
    estimateAll: "Estimate all missing", needMinutes: "Enter minutes first", podReal: "pod",
    estTip: "Estimated from this player's match average, pro-rated by minutes — not a pod measurement.",
  },
  IS: {
    title: "MD+1 mínútur",
    subtitle: "Veldu leik, merktu svo hverjir byrjuðu, hverjir komu inn á, og mínúturnar.",
    search: "Leita…", refresh: "Endurhlaða", saving: "Vista…", saveAll: "Vista allt",
    matchDay: "Leikdagur:", opponent: "Andstæðingur:", opponentPh: "t.d. FH, Víkingur, Valur…",
    home: "Heima", away: "Úti", unsaved: "Óvistað", loading: "Hleð…",
    pickMatch: "Leikur:", pickMatchPh: "Veldu leik…", newDate: "＋ Ný dagsetning",
    player: "Leikmaður", matchDayCol: "Leikdagur", minutes: "Mínútur", dnp: "DNP",
    lineup: "Byrjaði / Inn á", started: "Byrjaði", sub: "Inn á",
    matchRunning: "Leikhlaup",
    empty: "Engir leikmenn fyrir þetta lið — eða enginn skráður leikur enn.",
    footer: "STARTER ≥ 60 mín · NON-STARTER < 60 mín",
    footerCite: "60-mín þröskuldur: Carling 2018; Nédélec 2012; Helsen 2018",
    pod: "Mælir", estimate: "Gleymdi mæli? Áætla", estimated: "áætl.", estRemove: "Fjarlægja áætlun",
    estimateAll: "Áætla alla sem vantar", needMinutes: "Skráðu mínútur fyrst", podReal: "mælir",
    estTip: "Áætlað út frá leikja-meðaltali leikmannsins, hlutfallað eftir mínútum — ekki raunmæling.",
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type Row = {
  player_id: string;
  full_name: string;
  team_id: string;
  last_match_date: string | null;
  minutes_played: number;
  is_dnp: boolean;
  started: boolean | null;
  opponent: string | null;
  is_home: boolean | null;
  competition: string | null;
};

type Fixture = { date: string; opponent: string | null; is_home: boolean | null };
type Role = "start" | "sub" | "dnp";

export default function CoachMatchMinutesPage() {
  const [lang] = useLang();
  const t = COPY[lang === "IS" ? "IS" : "EN"];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
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
  // Team sport — drives the sport-aware STARTER threshold (basketball's 40-min
  // game can never reach football's 60-min cut). Null defaults to football.
  const [sportType, setSportType] = useState<string | null>(null);

  // Pod status per player for the current match date: "real" (measured),
  // "estimated" (a "forgot pod?" estimate), or absent (nothing → offer Estimate).
  const [podStatus, setPodStatus] = useState<Record<string, "real" | "estimated">>({});
  const [podPending, setPodPending] = useState<string | null>(null);

  // Per-player match-running context for the current match date: the pod window,
  // whether he started, and his GPS totals — everything classifyMatchLoad needs
  // to turn the coach's minutes into a live "matchday load vs match running"
  // verdict as he types (before he even saves). Sourced from GET
  // /api/coach/match-minutes, which reads the same match_player_minutes table.
  type MatchMeta = {
    podMinutes: number | null;
    startedMatch: boolean;
    distanceM: number | null;
    highSpeedM: number | null;
    minutesSaved: number | null;
  };
  const [matchMeta, setMatchMeta] = useState<Record<string, MatchMeta>>({});
  // Players whose minutes the coach has touched this session — so an untouched
  // row with no saved entry reads as "not entered" (verdict "unknown") rather
  // than a spurious 0 from the view's COALESCE.
  const [edited, setEdited] = useState<Set<string>>(new Set());

  const supabase = useMemo(() => getSupabaseClient(), []);

  const effectiveMatchDate = useMemo(
    () => (matchDate || rows.find((r) => r.last_match_date)?.last_match_date || ""),
    [matchDate, rows],
  );

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadPodStatus(tid: string | null, date: string) {
    if (!tid || !date) { setPodStatus({}); return; }
    const { data } = await supabase
      .from("player_external_load_daily")
      .select("player_id, raw_payload_json")
      .eq("team_id", tid).eq("date", date).eq("source", "catapult");
    const map: Record<string, "real" | "estimated"> = {};
    for (const r of (data ?? []) as Array<{ player_id: string; raw_payload_json?: { estimated?: boolean } | null }>) {
      map[r.player_id] = r.raw_payload_json?.estimated ? "estimated" : "real";
    }
    setPodStatus(map);
  }

  async function loadMatchMeta(tid: string | null, date: string) {
    if (!tid || !date) { setMatchMeta({}); return; }
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/coach/match-minutes?teamId=${encodeURIComponent(tid)}&date=${date}`,
        { headers: { Authorization: `Bearer ${token ?? ""}` } },
      );
      if (!res.ok) { setMatchMeta({}); return; }
      const json = (await res.json()) as {
        players?: Array<{
          playerId: string; podMinutes: number | null; startedMatch: boolean;
          distanceM: number | null; highSpeedM: number | null; minutesPlayed: number | null;
        }>;
      };
      const m: Record<string, MatchMeta> = {};
      for (const p of json.players ?? []) {
        m[p.playerId] = {
          podMinutes: p.podMinutes, startedMatch: p.startedMatch,
          distanceM: p.distanceM, highSpeedM: p.highSpeedM, minutesSaved: p.minutesPlayed,
        };
      }
      setMatchMeta(m);
    } catch { setMatchMeta({}); }
  }

  useEffect(() => {
    if (teamId && effectiveMatchDate) {
      void loadPodStatus(teamId, effectiveMatchDate);
      void loadMatchMeta(teamId, effectiveMatchDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, effectiveMatchDate]);

  async function postEstimate(playerId: string, minutes: number): Promise<string | null> {
    const token = await getToken();
    const res = await fetch("/api/coach/estimate-pod", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ teamId, playerId, matchDate: effectiveMatchDate, minutes }),
    });
    if (!res.ok) return (await res.json().catch(() => ({}))).error ?? "Failed";
    return null;
  }

  async function estimateOne(r: Row) {
    if (!teamId || !effectiveMatchDate || podPending) return;
    const minutes = r.is_dnp ? 0 : r.minutes_played;
    if (!minutes || minutes <= 0) { setError(t.needMinutes); return; }
    setPodPending(r.player_id); setError("");
    const err = await postEstimate(r.player_id, minutes);
    if (err) setError(err); else await loadPodStatus(teamId, effectiveMatchDate);
    setPodPending(null);
  }

  async function removeEstimate(r: Row) {
    if (!teamId || !effectiveMatchDate || podPending) return;
    setPodPending(r.player_id); setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/coach/estimate-pod", {
        method: "DELETE",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ teamId, playerId: r.player_id, matchDate: effectiveMatchDate }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed");
      else await loadPodStatus(teamId, effectiveMatchDate);
    } finally { setPodPending(null); }
  }

  async function estimateAllMissing() {
    if (!teamId || !effectiveMatchDate || podPending) return;
    const missing = rows.filter((r) => !podStatus[r.player_id] && !r.is_dnp && r.minutes_played > 0);
    if (missing.length === 0) return;
    setPodPending("__all__"); setError("");
    for (const r of missing) {
      const err = await postEstimate(r.player_id, r.minutes_played);
      if (err) { setError(err); break; }
    }
    await loadPodStatus(teamId, effectiveMatchDate);
    setPodPending(null);
  }

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
    // `started` isn't in the view — pull it for the last match date so a save doesn't wipe it.
    const date0 = loaded.find((r) => r.last_match_date)?.last_match_date ?? null;
    let startedBy = new Map<string, boolean | null>();
    if (date0) {
      const { data: mm } = await supabase
        .from("match_player_minutes").select("player_id, started")
        .eq("team_id", teamIdParam).eq("match_date", date0);
      startedBy = new Map((mm ?? []).map((r) => [(r as { player_id: string }).player_id, (r as { started: boolean | null }).started]));
    }
    setRows(loaded.map((r) => ({ ...r, started: startedBy.get(r.player_id) ?? null })));
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
      const { data: ts } = await supabase
        .from("team_settings").select("sport_type").eq("team_id", tid).maybeSingle();
      if (alive) setSportType((ts as { sport_type?: string | null } | null)?.sport_type ?? null);
      await load(tid);
      await loadFixtures(tid);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);


  // Full-match minutes for a "Started" quick-fill (football 90, basketball 40).
  const fullMatch = String(sportType ?? "").toLowerCase() === "basketball" ? 40 : 90;
  const starterThreshold = highMatchMinutesThreshold(sportType);

  /** All fixtures for the team (for the match picker) — newest first. */
  async function loadFixtures(tid: string) {
    const { data } = await supabase
      .from("match_schedule").select("match_date, opponent, is_home")
      .eq("team_id", tid).order("match_date", { ascending: false });
    setFixtures(((data ?? []) as Array<{ match_date: string; opponent: string | null; is_home: boolean | null }>)
      .map((r) => ({ date: r.match_date, opponent: r.opponent, is_home: r.is_home })));
  }

  /** Overlay the saved minutes/started for one match date onto the roster (blank where none). */
  async function loadMinutesForDate(tid: string, date: string) {
    const { data } = await supabase
      .from("match_player_minutes").select("player_id, minutes_played, is_dnp, started")
      .eq("team_id", tid).eq("match_date", date);
    const map = new Map((data ?? []).map((r) => [
      (r as { player_id: string }).player_id,
      r as { minutes_played: number | null; is_dnp: boolean | null; started: boolean | null },
    ]));
    setRows((prev) => prev.map((r) => {
      const m = map.get(r.player_id);
      return {
        ...r, last_match_date: date,
        minutes_played: m ? (m.is_dnp ? 0 : (m.minutes_played ?? 0)) : 0,
        is_dnp: m?.is_dnp ?? false,
        started: m?.started ?? null,
      };
    }));
    setEdited(new Set());
  }

  /** Pick a fixture from the dropdown → load its saved minutes + fill opponent/venue. */
  function selectMatch(date: string) {
    setMatchDate(date); setMatchDateDirty(false);
    const fx = fixtures.find((f) => f.date === date);
    if (fx?.opponent != null) { setOpponent(fx.opponent ?? ""); setOpponentDirty(false); }
    if (fx?.is_home != null) { setIsHome(fx.is_home); setIsHomeDirty(false); }
    if (teamId) void loadMinutesForDate(teamId, date);
  }

  /** Current Started / Sub / DNP for a player (explicit when set, else inferred from minutes). */
  function roleOf(r: Row): Role | null {
    if (r.is_dnp) return "dnp";
    if (r.started === true) return "start";
    if (r.started === false) return "sub";
    if (r.minutes_played >= starterThreshold) return "start";
    if (r.minutes_played > 0) return "sub";
    return null;
  }

  /** Set a player's role — quick entry: Started fills a full match, Sub keeps minutes, DNP = 0. */
  function updateRole(playerId: string, role: Role) {
    setEdited((prev) => new Set(prev).add(playerId));
    setRows((prev) => prev.map((r) => {
      if (r.player_id !== playerId) return r;
      if (role === "start") return { ...r, started: true, is_dnp: false, minutes_played: r.minutes_played > 0 && !r.is_dnp ? r.minutes_played : fullMatch };
      if (role === "sub") return { ...r, started: false, is_dnp: false, minutes_played: r.is_dnp ? 0 : r.minutes_played };
      return { ...r, started: false, is_dnp: true, minutes_played: 0 };
    }));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [rows, query]);

  function updateMinutes(playerId: string, matchDate: string | null, minutes: number) {
    if (!matchDate) return;
    setEdited((prev) => new Set(prev).add(playerId));

    setRows((prev) =>
      prev.map((r) =>
        r.player_id === playerId
          ? {
              ...r,
              minutes_played: Math.max(0, Math.min(130, minutes)),
              is_dnp: minutes > 0 ? false : r.is_dnp,
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
        started: r.is_dnp ? false : r.started,
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
    setEdited(new Set());
    await load(teamId);
    if (teamId && effectiveMatchDate) {
      await loadPodStatus(teamId, effectiveMatchDate);
      await loadMatchMeta(teamId, effectiveMatchDate);
    }
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
          {String(sportType ?? "").toLowerCase() === "basketball" && (
            <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] leading-snug text-sky-800">
              {lang === "IS"
                ? "Körfubolti: mínútur eru fluttar sjálfkrafa inn með KKÍ box-score-inu — þær birtast nú þegar í box-score og leikmanns-skýrslu. Notaðu þessa síðu aðeins til að leiðrétta, eða fyrir leik sem feed-ið náði ekki."
                : "Basketball: minutes are imported automatically with the KKÍ box score — they already drive the box score and per-game report. Use this page only to override, or for a game the feed didn't cover."}
            </div>
          )}
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
              {rows.some((r) => !podStatus[r.player_id] && !r.is_dnp && r.minutes_played > 0) && (
                <Button variant="outline" onClick={estimateAllMissing} disabled={loading || saving || !!podPending}>
                  {podPending === "__all__" ? t.saving : t.estimateAll}
                </Button>
              )}
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
            {fixtures.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium whitespace-nowrap">{t.pickMatch}</span>
                <Select value={matchDate || undefined} onValueChange={selectMatch} disabled={saving}>
                  <SelectTrigger className="w-60"><SelectValue placeholder={t.pickMatchPh} /></SelectTrigger>
                  <SelectContent>
                    {fixtures.map((f) => (
                      <SelectItem key={f.date} value={f.date}>
                        {f.date}{f.opponent ? ` · ${f.opponent}` : ""}{f.is_home == null ? "" : f.is_home ? " (H)" : " (A)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                    <th className="p-3 w-48">{t.lineup}</th>
                    <th className="p-3 w-32">{t.minutes}</th>
                    <th className="p-3 w-40">{t.pod}</th>
                    <th className="p-3 w-56 text-left">{t.matchRunning}</th>
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
                        <div className="inline-flex overflow-hidden rounded border">
                          {(["start", "sub", "dnp"] as Role[]).map((role) => {
                            const active = roleOf(r) === role;
                            const label = role === "start" ? t.started : role === "sub" ? t.sub : t.dnp;
                            const activeCls = role === "dnp" ? "bg-slate-500 text-white" : "bg-[#2740e6] text-white";
                            return (
                              <button
                                key={role}
                                type="button"
                                disabled={!r.last_match_date || saving}
                                onClick={() => updateRole(r.player_id, role)}
                                className={`px-2.5 py-1 text-xs font-medium ${active ? activeCls : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-40`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
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
                      <td className="p-3">
                        {podStatus[r.player_id] === "real" ? (
                          <span className="text-xs text-muted-foreground">✓ {t.podReal}</span>
                        ) : podStatus[r.player_id] === "estimated" ? (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="outline" className="border-amber-300 text-amber-600" title={t.estTip}>{t.estimated}</Badge>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" title={t.estRemove}
                              disabled={podPending === r.player_id} onClick={() => removeEstimate(r)}>✕</Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            title={r.minutes_played <= 0 || r.is_dnp ? t.needMinutes : t.estimate}
                            disabled={!r.last_match_date || r.is_dnp || r.minutes_played <= 0 || saving || !!podPending}
                            onClick={() => estimateOne(r)}>
                            {podPending === r.player_id ? "…" : t.estimate}
                          </Button>
                        )}
                      </td>
                      <td className="p-3 align-top">
                        {(() => {
                          const md = matchMeta[r.player_id];
                          // No GPS for this player on the match date → nothing to verify.
                          if (!md || md.podMinutes == null) {
                            return <span className="text-xs text-muted-foreground">—</span>;
                          }
                          // "Entered" = a saved row exists OR the coach touched it this
                          // session; otherwise the view's 0 is a default, not a real 0.
                          const entered = md.minutesSaved != null || edited.has(r.player_id);
                          const minutesPlayed = entered ? (r.is_dnp ? 0 : r.minutes_played) : null;
                          const verdict = classifyMatchLoad({
                            podMinutes: md.podMinutes,
                            minutesPlayed,
                            distanceM: md.distanceM,
                            highSpeedM: md.highSpeedM,
                            startedMatch: md.startedMatch,
                          });
                          return <MatchVerdictChip verdict={verdict} lang={lang === "IS" ? "IS" : "EN"} showReason="flagged" />;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground">
          {(() => {
            const starterMin = highMatchMinutesThreshold(sportType);
            const isBball = String(sportType ?? "").toLowerCase() === "basketball";
            const unit = lang === "IS" ? "mín" : "min";
            const footer = lang === "IS"
              ? `STARTER ≥ ${starterMin} ${unit} · NON-STARTER < ${starterMin} ${unit}`
              : `STARTER ≥ ${starterMin} ${unit} · NON-STARTER < ${starterMin} ${unit}`;
            const cite = isBball
              ? (lang === "IS"
                  ? `${starterMin}-mín þröskuldur: ~60% af 40-mín leik (aðlagað frá fótbolta 60/90)`
                  : `${starterMin}-min threshold: ~60% of a 40-min game (scaled from football 60/90)`)
              : t.footerCite;
            return (
              <span title={cite} className="cursor-help underline decoration-dotted">{footer}</span>
            );
          })()}
        </CardFooter>
      </Card>
    </div>
  );
}
