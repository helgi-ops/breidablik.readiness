"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// shadcn/ui
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type WeekType = "NO_MATCH" | "ONE_MATCH" | "TWO_MATCHES";

type MatchInput = {
  match_id: string;
  date: string; // YYYY-MM-DD
  kickoff_time?: string;
  home_away?: "H" | "A";
};

type WeekRow = {
  id: string;
  week_start_date: string;
  week_type: WeekType;
  matches: MatchInput[];
};

type DayType = "TRAIN" | "RECOVERY" | "GAME" | "OFF";
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const DEFAULT_MATCHES: MatchInput[] = [
  { match_id: "M1", date: "", kickoff_time: "", home_away: "H" },
  { match_id: "M2", date: "", kickoff_time: "", home_away: "A" },
];

function isoMondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoMondayOfISO(yyyyMmDd: string) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  return isoMondayOf(d);
}

function addDays(yyyyMmDd: string, days: number) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(aYYYYMMDD: string, bYYYYMMDD: string) {
  // a - b in whole days
  const a = new Date(aYYYYMMDD + "T00:00:00");
  const b = new Date(bYYYYMMDD + "T00:00:00");
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function dayBadgeVariant(dayType: DayType): BadgeVariant {
  if (dayType === "GAME") return "destructive";
  if (dayType === "RECOVERY") return "secondary";
  if (dayType === "OFF") return "outline";
  return "default";
}

// MD label helper: MD-4 and earlier (MD-5, MD-6...) alternate FORCE ↔ NEURAL
function preMatchMicrodoseFocus(mdMinus: number) {
  // mdMinus: 4,5,6,...
  const k = mdMinus - 4; // 0..n from MD-4
  const isForce = k % 2 === 0; // MD-4 force, MD-5 neural, MD-6 force...
  return isForce ? `MD-${mdMinus} FORCE / RESTART` : `MD-${mdMinus} NEURAL / VELOCITY`;
}

function coerceWeekType(v: any): WeekType {
  if (v === "NO_MATCH" || v === "ONE_MATCH" || v === "TWO_MATCHES") return v;
  // fallback fyrir gögn sem eru til nú þegar
  return "ONE_MATCH";
}

export default function WeekSetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const [weekStart, setWeekStart] = useState<string>(() => isoMondayOf(new Date()));
  const [weekType, setWeekType] = useState<WeekType>("NO_MATCH");
  const [matches, setMatches] = useState<MatchInput[]>(DEFAULT_MATCHES);

  const [intensityTarget, setIntensityTarget] = useState<number>(6);

  // team_id sem á að koma sjálfkrafa ef coach er með profiles.team_id
  const [teamId, setTeamId] = useState<string | null>(null);

  // ✅ Debug states (til að sjá nákvæmlega af hverju teamId er null)
  const [teamIdSource, setTeamIdSource] = useState<string>("(not loaded)");
  const [teamIdDebug, setTeamIdDebug] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const visibleMatches = useMemo(() => {
    if (weekType === "ONE_MATCH") return [matches[0] ?? DEFAULT_MATCHES[0]];
    if (weekType === "TWO_MATCHES") return [matches[0] ?? DEFAULT_MATCHES[0], matches[1] ?? DEFAULT_MATCHES[1]];
    return [];
  }, [weekType, matches]);

  // =========================
  // 1) LOAD TEAM ID (robust)
  // - supports profiles.id OR profiles.user_id
  // - shows debug in UI
  // =========================
  useEffect(() => {
    let alive = true;

    (async () => {
      setTeamIdDebug("");
      setTeamIdSource("(loading)");

      const { data: uRes, error: uErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (uErr) {
        setTeamId(null);
        setTeamIdSource("auth error");
        setTeamIdDebug(uErr.message);
        return;
      }
      if (!uRes.user) {
        setTeamId(null);
        setTeamIdSource("not logged in");
        setTeamIdDebug("No user session.");
        return;
      }

      const uid = uRes.user.id;

      // Try both common schemas:
      // - profiles.id = auth.uid()
      // - profiles.user_id = auth.uid()
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("team_id, id, user_id")
        .or(`id.eq.${uid},user_id.eq.${uid}`)
        .maybeSingle();

      if (!alive) return;

      if (pErr) {
        setTeamId(null);
        setTeamIdSource("profiles select blocked");
        setTeamIdDebug(pErr.message);
        return;
      }

      const tid = (prof?.team_id ?? "").toString().trim();

      if (tid) {
        setTeamId(tid);
        setTeamIdSource("profiles.team_id");
        setTeamIdDebug(`uid=${uid}`);
      } else {
        setTeamId(null);
        setTeamIdSource("profiles row found but team_id empty");
        setTeamIdDebug(`uid=${uid}`);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // =========================
  // 2) LOAD WEEK SETUP
  // =========================
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      setLoading(true);
      setError(null);
      setOk(null);

      const { data, error } = await supabase
        .from("coach_week_setup")
        .select("id, week_start_date, week_type, matches")
        .eq("week_start_date", weekStart)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data) {
        const row = data as WeekRow;
        const wt = coerceWeekType((row as any).week_type);
        setWeekType(wt);

        const safeMatches =
          row.matches?.length > 0
            ? row.matches
            : DEFAULT_MATCHES;

        // tryggjum að við höfum alltaf 2 stykki í state (þó NO_MATCH noti þau ekki)
        const m0 = safeMatches[0] ?? DEFAULT_MATCHES[0];
        const m1 = safeMatches[1] ?? DEFAULT_MATCHES[1];

        setMatches([
          {
            match_id: (m0.match_id || "M1").trim(),
            date: (m0.date || "").trim(),
            kickoff_time: (m0.kickoff_time || "").trim(),
            home_away: (m0.home_away as any) || "H",
          },
          {
            match_id: (m1.match_id || "M2").trim(),
            date: (m1.date || "").trim(),
            kickoff_time: (m1.kickoff_time || "").trim(),
            home_away: (m1.home_away as any) || "A",
          },
        ]);
      } else {
        setWeekType("NO_MATCH");
        setMatches(DEFAULT_MATCHES);
      }

      setLoading(false);
    }

    loadWeek();
    return () => {
      alive = false;
    };
  }, [weekStart]);

  // ✅ setMatch: auto-align weekStart to Monday of match week (bara ef date er sett)
  function setMatch(i: number, patch: Partial<MatchInput>) {
    if (patch.date && patch.date.trim()) {
      const matchMonday = isoMondayOfISO(patch.date.trim());
      if (matchMonday !== weekStart) setWeekStart(matchMonday);
    }

    setMatches((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function applyWeekType(next: WeekType) {
    setWeekType(next);
    setError(null);
    setOk(null);

    // tryggjum alltaf 2 matches í state
    setMatches((prev) => {
      const first = prev[0] ?? DEFAULT_MATCHES[0];
      const second = prev[1] ?? DEFAULT_MATCHES[1];
      return [first, second];
    });
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setOk(null);

    // Ef NO_MATCH: vista tómt matches array (hreint og skýrt)
    const trimmed =
      weekType === "NO_MATCH"
        ? []
        : visibleMatches.map((m, idx) => ({
            match_id: (m.match_id || `M${idx + 1}`).trim(),
            date: (m.date || "").trim(),
            kickoff_time: (m.kickoff_time || "").trim() || undefined,
            home_away: (m.home_away || "H") as "H" | "A",
          }));

    const { error } = await supabase.rpc("save_week_setup", {
      p_week_start_date: weekStart,
      p_week_type: weekType,
      p_matches: trimmed,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return false;
    }

    setOk("Vikan var vistuð ✅");
    setSaving(false);
    return true;
  }

  // ✅ Week mapping:
  // - Ef weekType = NO_MATCH EÐA enginn leikur í vikunni => generic training week (engin MD)
  // - Annars: núverandi MD logic
  const dayEdits = useMemo(() => {
    const matchInWeek =
      weekType === "NO_MATCH"
        ? []
        : visibleMatches
            .map((m, idx) => ({
              idx,
              id: (m.match_id || `M${idx + 1}`).trim(),
              date: (m.date || "").trim(),
            }))
            .filter((m) => !!m.date)
            .filter((m) => m.date >= weekStart && m.date <= weekEnd)
            .sort((a, b) => a.date.localeCompare(b.date));

    // ✅ Generic fallback þegar enginn leikur er til (eða NO_MATCH)
    if (weekType === "NO_MATCH" || matchInWeek.length === 0) {
      return Array.from({ length: 7 }).map((_, i) => {
        const day_index = i + 1;

        // Generic: miðvikudagur = recovery, sunnudagur = off
        let day_type: DayType = "TRAIN";
        let focus: string | null = "TRAIN";
        let notes: string | null = "No match week";

        if (day_index === 3) {
          day_type = "RECOVERY";
          focus = "RECOVERY";
        }
        if (day_index === 7) {
          day_type = "OFF";
          focus = "OFF";
        }

        return { day_index, day_type, focus, notes };
      });
    }

    const matchDatesSet = new Set(matchInWeek.map((m) => m.date));

    function nextMatchDate(day_date: string) {
      return matchInWeek.find((m) => m.date > day_date)?.date ?? null;
    }

    function prevMatchDate(day_date: string) {
      for (let i = matchInWeek.length - 1; i >= 0; i--) {
        if (matchInWeek[i].date < day_date) return matchInWeek[i].date;
      }
      return null;
    }

    function postMatchFocus(mdPlus: number) {
      if (mdPlus === 1) return "MD+1 POST MATCH";
      return `MD+${mdPlus} RECOVERY`;
    }

    return Array.from({ length: 7 }).map((_, i) => {
      const day_index = i + 1;
      const day_date = addDays(weekStart, i);

      // Default Sunday OFF
      let day_type: DayType = day_index === 7 ? "OFF" : "TRAIN";
      let focus: string | null = day_type === "OFF" ? "OFF" : "TRAIN";
      let notes: string | null = null;

      // match day
      if (matchDatesSet.has(day_date)) {
        day_type = "GAME";
        focus = "MD (GAME)";
        notes = "Match day (within week)";
        return { day_index, day_type, focus, notes };
      }

      // pre-match: use next match inside week
      const next = nextMatchDate(day_date);
      if (next) {
        const delta = diffDays(day_date, next); // negative
        const mdMinus = Math.abs(delta);

        if (mdMinus >= 4) {
          day_type = "TRAIN";
          focus = preMatchMicrodoseFocus(mdMinus); // MD-4 / MD-5 / ...
          notes = `Upcoming match: ${next}`;
          return { day_index, day_type, focus, notes };
        }

        if (mdMinus === 3) {
          day_type = "TRAIN";
          focus = "MD-3 NEURAL / VELOCITY";
          notes = `Upcoming match: ${next}`;
          return { day_index, day_type, focus, notes };
        }

        if (mdMinus === 2) {
          day_type = "RECOVERY";
          focus = "MD-2 POLISH / CALM";
          notes = `Upcoming match: ${next}`;
          return { day_index, day_type, focus, notes };
        }

        if (mdMinus === 1) {
          day_type = "RECOVERY";
          focus = "MD-1 ACTIVATION";
          notes = `Upcoming match: ${next}`;
          return { day_index, day_type, focus, notes };
        }
      }

      // post-match: use previous match inside week
      const prev = prevMatchDate(day_date);
      if (prev) {
        const deltaPlus = diffDays(day_date, prev); // positive
        if (deltaPlus >= 1) {
          // Keep Sunday OFF
          if (day_index !== 7) {
            day_type = "RECOVERY";
            focus = postMatchFocus(deltaPlus);
            notes = `Previous match: ${prev}`;
          }
        }
      }

      return { day_index, day_type, focus, notes };
    });
  }, [visibleMatches, matches, weekStart, weekEnd, weekType]);

  async function handleApplyPlan() {
    setApplying(true);
    setError(null);
    setOk(null);

    const tid = (teamId ?? "").trim();
    if (!tid) {
      setError("Vantar team_id. Sláðu inn Team ID (uuid) eða tengdu profiles.team_id.");
      setApplying(false);
      return;
    }

    // ✅ Ef vika er með leik: validate-a date
    if (weekType !== "NO_MATCH") {
      const m1 = (visibleMatches[0]?.date || "").trim();
      if (!m1) {
        setError("Veldu match date fyrir M1.");
        setApplying(false);
        return;
      }
      if (weekType === "TWO_MATCHES") {
        const m2 = (visibleMatches[1]?.date || "").trim();
        if (!m2) {
          setError("Veldu match date fyrir M2.");
          setApplying(false);
          return;
        }
      }
    }

    const saved = await handleSave();
    if (!saved) {
      setApplying(false);
      return;
    }

    const res = await fetch("/api/coach/week-setup/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: tid,
        week_start: weekStart,
        system_key: "MICRODOSING_PLAYBOOK",
        intensity_target: intensityTarget,
        notes: `WeekType=${weekType} · Microdosing playbook`,
        days: dayEdits,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload?.error || "Apply failed.");
      setApplying(false);
      return;
    }

    setOk("Week plan var búið til/uppfært (microdosing) ✅");
    setApplying(false);
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Week Setup</h1>
            <p className="text-sm text-muted-foreground">
              Vikan er mánudagur → sunnudagur. Ef enginn leikur er skráður (NO_MATCH) er vikan generic (engin MD-talning).
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>
              Vika: <span className="font-medium text-foreground">{weekStart}</span> →{" "}
              <span className="font-medium text-foreground">{weekEnd}</span>
            </div>
            <div>
              Setup: <span className="font-medium text-foreground">MICRODOSING_PLAYBOOK</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="pt-5 text-sm text-destructive">Villa: {error}</CardContent>
        </Card>
      )}
      {ok && (
        <Card className="mb-4 border-emerald-500/30">
          <CardContent className="pt-5 text-sm text-emerald-600">{ok}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grunnstillingar</CardTitle>
            <CardDescription>Vika, týpa og lið (sjálfvirkt ef profiles.team_id er til).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {(!teamId || teamId.trim().length === 0) && (
              <div className="grid gap-2">
                <Label>Team ID (uuid)</Label>
                <Input placeholder="Paste team_id (uuid) here" value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Ef þetta sést alltaf: skoðaðu “source/debug” hér að neðan (oft RLS eða profiles.user_id schema).
                </p>

                <div className="mt-1 text-xs text-muted-foreground">
                  source: <span className="font-medium text-foreground">{teamIdSource}</span>
                  {teamIdDebug ? <span className="ml-2 opacity-80">· debug: {teamIdDebug}</span> : null}
                </div>
              </div>
            )}

            {(teamId && teamId.trim().length > 0) && (
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Team</div>
                <div className="mt-1 font-medium">{teamId}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  source: <span className="font-medium text-foreground">{teamIdSource}</span>
                  {teamIdDebug ? <span className="ml-2 opacity-80">· debug: {teamIdDebug}</span> : null}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Week start (Monday)</Label>
              <Input type="date" value={weekStart} onChange={(e) => setWeekStart(isoMondayOfISO(e.target.value))} />
              <p className="text-xs text-muted-foreground">
                Ef þú velur dag sem er ekki mánudagur, þá “snappar” hann sjálfkrafa á mánudag vikunnar.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Week type</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant={weekType === "NO_MATCH" ? "default" : "outline"}
                  onClick={() => applyWeekType("NO_MATCH")}
                  disabled={loading || saving || applying}
                >
                  No match
                </Button>
                <Button
                  type="button"
                  variant={weekType === "ONE_MATCH" ? "default" : "outline"}
                  onClick={() => applyWeekType("ONE_MATCH")}
                  disabled={loading || saving || applying}
                >
                  One match
                </Button>
                <Button
                  type="button"
                  variant={weekType === "TWO_MATCHES" ? "default" : "outline"}
                  onClick={() => applyWeekType("TWO_MATCHES")}
                  disabled={loading || saving || applying}
                >
                  Two matches
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                NO_MATCH = æfingavika án leikja (generic mapping, engin MD-talning).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intensity</CardTitle>
            <CardDescription>1–10 target fyrir microdosing (ekki grind).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm font-medium">Intensity target</div>
                <div className="text-xs text-muted-foreground">1 = mjög létt · 10 = mjög erfitt</div>
              </div>
              <div className="text-5xl font-bold leading-none tabular-nums">{intensityTarget}</div>
            </div>

            <input
              className="w-full"
              type="range"
              min={1}
              max={10}
              step={1}
              value={intensityTarget}
              onChange={(e) => setIntensityTarget(Number(e.target.value))}
            />

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleSave()} disabled={loading || saving || applying}>
                {saving ? "Saving..." : loading ? "Loading..." : "Save week"}
              </Button>

              <Button onClick={() => void handleApplyPlan()} disabled={loading || saving || applying}>
                {applying ? "Applying..." : "Apply → búa til week_plan"}
              </Button>

              <div className="ml-auto text-xs text-muted-foreground">
                team_id: <span className="font-medium text-foreground">{teamId ?? "(vantar)"}</span>
                <span className="ml-2 opacity-70">· source: {teamIdSource}</span>
              </div>

              {teamIdDebug && (
                <div className="w-full text-xs text-muted-foreground">
                  debug: {teamIdDebug}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ✅ Matches: aðeins ef vika er með leik */}
      {weekType !== "NO_MATCH" && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Matches</CardTitle>
            <CardDescription>
              Settu inn leikdag(a). Ef match date er valinn hoppar weekStart á rétta viku (mán→sun).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {visibleMatches.map((m, idx) => (
              <div key={idx} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[110px_170px_1fr_90px] md:items-center">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Match id</Label>
                  <Input
                    value={m.match_id}
                    onChange={(e) => setMatch(idx, { match_id: e.target.value })}
                    placeholder={`M${idx + 1}`}
                  />
                </div>

                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input type="date" value={m.date} onChange={(e) => setMatch(idx, { date: e.target.value })} />
                </div>

                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Kickoff (optional)</Label>
                  <Input
                    value={m.kickoff_time ?? ""}
                    onChange={(e) => setMatch(idx, { kickoff_time: e.target.value })}
                    placeholder="19:15"
                  />
                </div>

                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">H/A</Label>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={m.home_away ?? "H"}
                    onChange={(e) => setMatch(idx, { home_away: e.target.value as "H" | "A" })}
                  >
                    <option value="H">Home</option>
                    <option value="A">Away</option>
                  </select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Week plan mapping</CardTitle>
          <CardDescription>
            MD mapping innan vikunnar (mán→sun). Ef NO_MATCH eða enginn leikur er í vikunni → generic mapping (engin MD).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-7">
            {dayEdits.map((d) => (
              <div key={d.day_index} title={d.notes ?? ""} className="rounded-xl border p-3 text-center">
                <div className="text-xs text-muted-foreground">Day {d.day_index}</div>
                <div className="mt-1">
                  <Badge variant={dayBadgeVariant(d.day_type)}>{d.day_type}</Badge>
                </div>
                <div className="mt-2 text-xs font-medium leading-snug">{d.focus ?? ""}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            Dæmi (leikur á föstudegi): mán=MD-4, þri=MD-3, mið=MD-2, fim=MD-1, fös=MD, lau=MD+1, sun=OFF.
            <br />
            NO_MATCH: generic vika (miðvikudagur RECOVERY, sunnudagur OFF).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
