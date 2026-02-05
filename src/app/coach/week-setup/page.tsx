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

type DayType = "TRAIN" | "RECOVERY" | "GAME" | "OFF";
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// Manual intents for NO_MATCH week (coach editable)
type NoMatchIntent =
  | "FORCE"
  | "NEURAL_VELOCITY"
  | "VELOCITY"
  | "POLISH_CALM"
  | "ACTIVATION"
  | "RECOVERY"
  | "OFF";

type WeekRow = {
  id: string;
  team_id?: string; // mikilvægt til að disambiguate-a
  week_start_date: string;
  week_type: WeekType;
  matches: MatchInput[];
  no_match_intents?: NoMatchIntent[];
};

const NO_MATCH_OPTIONS: { value: NoMatchIntent; label: string }[] = [
  { value: "FORCE", label: "Force" },
  { value: "NEURAL_VELOCITY", label: "Neural / Velocity" },
  { value: "VELOCITY", label: "Velocity" },
  { value: "POLISH_CALM", label: "Polish / Calm" },
  { value: "ACTIVATION", label: "Activation" },
  { value: "RECOVERY", label: "Recovery" },
  { value: "OFF", label: "Off" },
];

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
  const k = mdMinus - 4; // 0..n from MD-4
  const isForce = k % 2 === 0; // MD-4 force, MD-5 neural, MD-6 force...
  return isForce ? `MD-${mdMinus} FORCE / RESTART` : `MD-${mdMinus} NEURAL / VELOCITY`;
}

function coerceWeekType(v: any): WeekType {
  if (v === "NO_MATCH" || v === "ONE_MATCH" || v === "TWO_MATCHES") return v;
  return "ONE_MATCH";
}

function intentToDayType(i: NoMatchIntent): DayType {
  if (i === "OFF") return "OFF";
  if (i === "RECOVERY") return "RECOVERY";
  return "TRAIN";
}

function intentToFocusLabel(i: NoMatchIntent): string {
  if (i === "FORCE") return "FORCE";
  if (i === "NEURAL_VELOCITY") return "NEURAL / VELOCITY";
  if (i === "VELOCITY") return "VELOCITY";
  if (i === "POLISH_CALM") return "POLISH / CALM";
  if (i === "ACTIVATION") return "ACTIVATION";
  if (i === "RECOVERY") return "RECOVERY";
  return "OFF";
}

function getDefaultNoMatchIntents(): NoMatchIntent[] {
  return ["FORCE", "NEURAL_VELOCITY", "RECOVERY", "ACTIVATION", "POLISH_CALM", "RECOVERY", "OFF"];
}

export default function WeekSetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const [weekStart, setWeekStart] = useState<string>(() => isoMondayOf(new Date()));
  const [weekType, setWeekType] = useState<WeekType>("NO_MATCH");
  const [matches, setMatches] = useState<MatchInput[]>(DEFAULT_MATCHES);

  const [intensityTarget, setIntensityTarget] = useState<number>(6);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [noMatchIntents, setNoMatchIntents] = useState<NoMatchIntent[]>(getDefaultNoMatchIntents());

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const visibleMatches = useMemo(() => {
    if (weekType === "ONE_MATCH") return [matches[0] ?? DEFAULT_MATCHES[0]];
    if (weekType === "TWO_MATCHES") return [matches[0] ?? DEFAULT_MATCHES[0], matches[1] ?? DEFAULT_MATCHES[1]];
    return [];
  }, [weekType, matches]);

  // 1) LOAD TEAM ID (robust)
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: uRes, error: uErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (uErr || !uRes.user) {
        setTeamId(null);
        return;
      }

      const uid = uRes.user.id;

      // Try profiles first
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id, id, user_id")
        .or(`id.eq.${uid},user_id.eq.${uid}`)
        .maybeSingle();

      if (!alive) return;

      const profTid = (prof?.team_id ?? "").toString().trim();
      if (profTid) {
        setTeamId(profTid);
        return;
      }

      // Fallback: coach_teams
      const { data: ct } = await supabase
        .from("coach_teams")
        .select("team_id,is_primary")
        .eq("coach_id", uid)
        .order("is_primary", { ascending: false })
        .limit(1);

      if (!alive) return;

      const ctTid = (ct?.[0]?.team_id ?? "").toString().trim();
      if (ctTid) {
        setTeamId(ctTid);
        return;
      }

      setTeamId(null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 2) LOAD WEEK SETUP (filter by team_id + week_start_date)
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      const tid = (teamId ?? "").trim();

      // Ekki sækja fyrr en teamId er komið
      if (!tid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setOk(null);

      const { data, error } = await supabase
        .from("coach_week_setup")
        .select("id, team_id, week_start_date, week_type, matches, no_match_intents")
        .eq("team_id", tid)
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

        if (wt === "NO_MATCH") {
          const arr = (data as any)?.no_match_intents;
          if (Array.isArray(arr) && arr.length === 7) setNoMatchIntents(arr as NoMatchIntent[]);
          else setNoMatchIntents(getDefaultNoMatchIntents());
        }

        const safeMatches = row.matches?.length > 0 ? row.matches : DEFAULT_MATCHES;
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
        setNoMatchIntents(getDefaultNoMatchIntents());
      }

      setLoading(false);
    }

    void loadWeek();
    return () => {
      alive = false;
    };
  }, [weekStart, teamId]);

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

    setMatches((prev) => {
      const first = prev[0] ?? DEFAULT_MATCHES[0];
      const second = prev[1] ?? DEFAULT_MATCHES[1];
      return [first, second];
    });

    if (next === "NO_MATCH" && (!noMatchIntents || noMatchIntents.length !== 7)) {
      setNoMatchIntents(getDefaultNoMatchIntents());
    }

    setStep(2);
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setOk(null);

    const tid = (teamId ?? "").trim();
    if (!tid) {
      setError("Vantar team_id (coach er ekki tengdur liði).");
      setSaving(false);
      return false;
    }

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
      p_team_id: tid,
      p_week_start_date: weekStart,
      p_week_type: weekType,
      p_matches: trimmed, // jsonb
      p_no_match_intents: weekType === "NO_MATCH" ? noMatchIntents : null, // jsonb
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

  const autoMdDayEdits = useMemo(() => {
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

    if (weekType === "NO_MATCH" || matchInWeek.length === 0) return [];

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

      let day_type: DayType = day_index === 7 ? "OFF" : "TRAIN";
      let focus: string | null = day_type === "OFF" ? "OFF" : "TRAIN";
      let notes: string | null = null;

      if (matchDatesSet.has(day_date)) {
        day_type = "GAME";
        focus = "MD (GAME)";
        notes = "Match day (within week)";
        return { day_index, day_type, focus, notes };
      }

      const next = nextMatchDate(day_date);
      if (next) {
        const delta = diffDays(day_date, next);
        const mdMinus = Math.abs(delta);

        if (mdMinus >= 4) return { day_index, day_type: "TRAIN" as DayType, focus: preMatchMicrodoseFocus(mdMinus), notes: `Upcoming match: ${next}` };
        if (mdMinus === 3) return { day_index, day_type: "TRAIN" as DayType, focus: "MD-3 NEURAL / VELOCITY", notes: `Upcoming match: ${next}` };
        if (mdMinus === 2) return { day_index, day_type: "RECOVERY" as DayType, focus: "MD-2 POLISH / CALM", notes: `Upcoming match: ${next}` };
        if (mdMinus === 1) return { day_index, day_type: "RECOVERY" as DayType, focus: "MD-1 ACTIVATION", notes: `Upcoming match: ${next}` };
      }

      const prev = prevMatchDate(day_date);
      if (prev) {
        const deltaPlus = diffDays(day_date, prev);
        if (deltaPlus >= 1 && day_index !== 7) {
          return { day_index, day_type: "RECOVERY" as DayType, focus: postMatchFocus(deltaPlus), notes: `Previous match: ${prev}` };
        }
      }

      return { day_index, day_type, focus, notes };
    });
  }, [visibleMatches, weekStart, weekEnd, weekType]);

  const manualNoMatchDayEdits = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const day_index = i + 1;
      const intent = noMatchIntents[i] ?? "OFF";
      return {
        day_index,
        day_type: intentToDayType(intent),
        focus: intentToFocusLabel(intent),
        notes: "No match week (manual)",
      };
    });
  }, [noMatchIntents]);

  const previewDays = useMemo(() => {
    return weekType === "NO_MATCH" ? manualNoMatchDayEdits : autoMdDayEdits;
  }, [weekType, manualNoMatchDayEdits, autoMdDayEdits]);

  async function handleApplyPlan() {
    setApplying(true);
    setError(null);
    setOk(null);

    const tid = (teamId ?? "").trim();
    if (!tid) {
      setError("Vantar team_id. Sláðu inn Team ID (uuid).");
      setApplying(false);
      return;
    }

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
        notes:
          weekType === "NO_MATCH"
            ? `WeekType=NO_MATCH · Manual week (coach)`
            : `WeekType=${weekType} · Microdosing playbook`,
        days: previewDays,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload?.error || "Apply failed.");
      setApplying(false);
      return;
    }

    setOk("Vika var virkjuð ✅ Leikmenn fá nú réttan æfingadag sendan.");
    setApplying(false);
  }

  function StepPill(props: { n: 1 | 2 | 3; label: string; active: boolean }) {
    return (
      <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${props.active ? "bg-muted" : ""}`}>
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
            props.active ? "bg-foreground text-background" : "bg-muted text-foreground"
          }`}
        >
          {props.n}
        </span>
        <span className="text-muted-foreground">{props.label}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Week setup</h1>
            <p className="text-sm text-muted-foreground">Stilltu vikuna. Kerfið sendir leikmönnum réttan æfingadag.</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>
              Vika: <span className="font-medium text-foreground">{weekStart}</span> →{" "}
              <span className="font-medium text-foreground">{weekEnd}</span>
            </div>
            <div className="mt-1 flex justify-end gap-2">
              <StepPill n={1} label="Vikugerð" active={step === 1} />
              <StepPill n={2} label="Uppsetning" active={step === 2} />
              <StepPill n={3} label="Preview" active={step === 3} />
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

      {/* STEP 1 */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Skref 1 — Vikugerð</CardTitle>
          <CardDescription>Veldu vikudagsetningu og hvort það séu leikir í vikunni.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {(!teamId || teamId.trim().length === 0) && (
            <div className="grid gap-2">
              <Label>Team ID (uuid)</Label>
              <Input
                placeholder="Paste team_id (uuid) here"
                value={teamId ?? ""}
                onChange={(e) => setTeamId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ef þetta er tómt: þá er coach ekki tengdur liði í profiles/coach_teams.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Week start (Monday)</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => {
                setWeekStart(isoMondayOfISO(e.target.value));
                setOk(null);
                setError(null);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label>Vikugerð</Label>
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant={weekType === "NO_MATCH" ? "default" : "outline"} onClick={() => applyWeekType("NO_MATCH")} disabled={loading || saving || applying}>
                Enginn leikur
              </Button>
              <Button type="button" variant={weekType === "ONE_MATCH" ? "default" : "outline"} onClick={() => applyWeekType("ONE_MATCH")} disabled={loading || saving || applying}>
                1 leikur
              </Button>
              <Button type="button" variant={weekType === "TWO_MATCHES" ? "default" : "outline"} onClick={() => applyWeekType("TWO_MATCHES")} disabled={loading || saving || applying}>
                2 leikir
              </Button>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm font-medium">Intensity target</div>
                <div className="text-xs text-muted-foreground">1 = mjög létt · 10 = mjög erfitt</div>
              </div>
              <div className="text-4xl font-bold leading-none tabular-nums">{intensityTarget}</div>
            </div>
            <input className="w-full" type="range" min={1} max={10} step={1} value={intensityTarget} onChange={(e) => setIntensityTarget(Number(e.target.value))} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={loading || saving || applying}>
              Næsta →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* STEP 2 */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Skref 2 — Uppsetning</CardTitle>
          <CardDescription>{weekType === "NO_MATCH" ? "Enginn leikur: veldu æfingainnihald per dag." : "Leikur/leikir: settu inn dagsetningar (kerfið sér um MD röðun)."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {weekType !== "NO_MATCH" ? (
            <div className="grid gap-3">
              {visibleMatches.map((m, idx) => (
                <div key={idx} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[140px_1fr_1fr_110px] md:items-center">
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Match</Label>
                    <Input value={m.match_id} onChange={(e) => setMatch(idx, { match_id: e.target.value })} placeholder={`M${idx + 1}`} />
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Input type="date" value={m.date} onChange={(e) => setMatch(idx, { date: e.target.value })} />
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Kickoff (optional)</Label>
                    <Input value={m.kickoff_time ?? ""} onChange={(e) => setMatch(idx, { kickoff_time: e.target.value })} placeholder="19:15" />
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">H/A</Label>
                    <select className="h-10 rounded-md border bg-background px-3 text-sm" value={m.home_away ?? "H"} onChange={(e) => setMatch(idx, { home_away: e.target.value as "H" | "A" })}>
                      <option value="H">Home</option>
                      <option value="A">Away</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Manual vika (mán → sun)</div>
                <Button type="button" variant="outline" onClick={() => setNoMatchIntents(getDefaultNoMatchIntents())} disabled={loading || saving || applying}>
                  Reset í default
                </Button>
              </div>

              <div className="grid gap-2 md:grid-cols-7">
                {Array.from({ length: 7 }).map((_, i) => {
                  const dayIndex = i + 1;
                  const date = addDays(weekStart, i);
                  const value = noMatchIntents[i] ?? "OFF";

                  return (
                    <div key={date} className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">Day {dayIndex}</div>
                      <div className="mt-1 text-sm font-medium">{date}</div>

                      <div className="mt-2 grid gap-1">
                        <Label className="text-xs text-muted-foreground">Áhersla</Label>
                        <select
                          className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value as NoMatchIntent;
                            setNoMatchIntents((prev) => {
                              const next = [...prev];
                              next[i] = v;
                              return next;
                            });
                          }}
                        >
                          {NO_MATCH_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        <div className="mt-2 flex items-center justify-between">
                          <Badge variant={dayBadgeVariant(intentToDayType(value))}>{intentToDayType(value)}</Badge>
                          <span className="text-[11px] text-muted-foreground">{intentToFocusLabel(value)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading || saving || applying}>
              ← Til baka
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep(3)} disabled={loading || saving || applying}>
              Næsta →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* STEP 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skref 3 — Preview & Apply</CardTitle>
          <CardDescription>Svona mun vikan líta út fyrir leikmenn (þetta er það sem verður sent).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-7">
            {previewDays.map((d) => (
              <div key={d.day_index} title={d.notes ?? ""} className="rounded-xl border p-3 text-center">
                <div className="text-xs text-muted-foreground">Day {d.day_index}</div>
                <div className="mt-1">
                  <Badge variant={dayBadgeVariant(d.day_type)}>{d.day_type}</Badge>
                </div>
                <div className="mt-2 text-xs font-medium leading-snug">{d.focus ?? ""}</div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void handleSave()} disabled={loading || saving || applying}>
              {saving ? "Saving..." : loading ? "Loading..." : "Save week"}
            </Button>

            <Button onClick={() => void handleApplyPlan()} disabled={loading || saving || applying}>
              {applying ? "Applying..." : "Apply → senda leikmönnum"}
            </Button>

            <div className="ml-auto text-xs text-muted-foreground">
              {weekType === "NO_MATCH" ? "Manual week" : "Auto MD week"} · system_key:{" "}
              <span className="font-medium text-foreground">MICRODOSING_PLAYBOOK</span>
            </div>
          </div>

          <div className="flex justify-start">
            <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={loading || saving || applying}>
              ← Breyta uppsetningu
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
