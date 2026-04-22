"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePlan } from "@/lib/micropulse/product";
import UpgradeWall from "@/components/micropulse/UpgradeWall";

// shadcn/ui
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type WeekType = "NO_MATCH" | "ONE_MATCH" | "TWO_MATCHES";

type SeasonPhase = "preseason" | "inseason" | "playoffs" | "offseason";

const SEASON_PHASES: {
  id: SeasonPhase;
  label: string;
  sublabel: string;
  icon: string;
  activeClass: string;
  baseClass: string;
}[] = [
  { id: "preseason",  label: "Preseason",            sublabel: "Undirbúningur",    icon: "🌱", activeClass: "border-amber-500 bg-amber-100 ring-1 ring-amber-400",   baseClass: "border-amber-200 bg-amber-50" },
  { id: "inseason",   label: "In-season",             sublabel: "Keppnistímabil",   icon: "⚡", activeClass: "border-emerald-500 bg-emerald-100 ring-1 ring-emerald-400", baseClass: "border-emerald-200 bg-emerald-50" },
  { id: "playoffs",   label: "Playoffs",              sublabel: "Úrslitakeppni",    icon: "🔥", activeClass: "border-red-500 bg-red-100 ring-1 ring-red-400",         baseClass: "border-red-200 bg-red-50" },
  { id: "offseason",  label: "Off-season",            sublabel: "Frítímabil",       icon: "🌙", activeClass: "border-slate-500 bg-slate-100 ring-1 ring-slate-400",   baseClass: "border-slate-200 bg-slate-50" },
];

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
  | "GAME"
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
  { value: "FORCE", label: "Force / MD-4" },
  { value: "NEURAL_VELOCITY", label: "Neural / Velocity / MD-3" },
  { value: "VELOCITY", label: "Velocity / MD-2" },
  { value: "POLISH_CALM", label: "Polish / Calm / MD-2" },
  { value: "ACTIVATION", label: "Activation / MD-1" },
  { value: "RECOVERY", label: "Recovery / MD+1 & MD+2" },
  { value: "GAME", label: "Game / MD" },
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
  if (i === "GAME") return "GAME"; // ✅ NEW
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
  if (i === "GAME") return "GAME"; // ✅ NEW
  return "OFF";
}

function getDefaultNoMatchIntents(): NoMatchIntent[] {
  return ["FORCE", "NEURAL_VELOCITY", "RECOVERY", "ACTIVATION", "POLISH_CALM", "RECOVERY", "OFF"];
}

const WEEKDAYS_SHORT = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
const WEEKDAYS_LONG  = ["Mánudagur", "Þriðjudagur", "Miðvikudagur", "Fimmtudagur", "Föstudagur", "Laugardagur", "Sunnudagur"];

export default function WeekSetupPage() {
  const { isAtLeastPro } = usePlan();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const [weekStart, setWeekStart] = useState<string>(() => isoMondayOf(new Date()));
  const [weekType, setWeekType] = useState<WeekType>("NO_MATCH");
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(null);
  const [matches, setMatches] = useState<MatchInput[]>(DEFAULT_MATCHES);

  // ✅ PRESEASON fix: manual override jafnvel þó 1–2 leikir
  const [manualOverride, setManualOverride] = useState<boolean>(true);

  const [intensityTarget, setIntensityTarget] = useState<number>(6);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [noMatchIntents, setNoMatchIntents] = useState<NoMatchIntent[]>(getDefaultNoMatchIntents());

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const visibleMatches = useMemo(() => {
    if (weekType === "ONE_MATCH") return [matches[0] ?? DEFAULT_MATCHES[0]];
    if (weekType === "TWO_MATCHES")
      return [matches[0] ?? DEFAULT_MATCHES[0], matches[1] ?? DEFAULT_MATCHES[1]];
    return [];
  }, [weekType, matches]);

  // ✅ Manual-week behavior rule:
  // - NO_MATCH: alltaf manual
  // - ONE/TWO: manual ef manualOverride er ON
  const isManualWeek = useMemo(() => weekType === "NO_MATCH" || manualOverride, [weekType, manualOverride]);

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
        .select("id, team_id, week_start_date, week_type, matches, no_match_intents, season_phase")
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

        // ✅ alltaf hlaða no_match_intents ef til (því við viljum manual override líka á match vikum)
        const arr = (data as any)?.no_match_intents;
        if (Array.isArray(arr) && arr.length === 7) setNoMatchIntents(arr as NoMatchIntent[]);
        else setNoMatchIntents(getDefaultNoMatchIntents());

        // Hlaða season_phase
        const sp = (data as any)?.season_phase;
        const validPhases: SeasonPhase[] = ["preseason", "inseason", "playoffs", "offseason"];
        setSeasonPhase(validPhases.includes(sp) ? (sp as SeasonPhase) : null);

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

    if (!noMatchIntents || noMatchIntents.length !== 7) {
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

    // ✅ ALDREI null í no_match_intents (DB column er NOT NULL)
    // ✅ Vista alltaf, líka á match vikum (til að manual override virki í preseason)
    const safeNoMatchIntents: NoMatchIntent[] =
      Array.isArray(noMatchIntents) && noMatchIntents.length === 7
        ? noMatchIntents
        : getDefaultNoMatchIntents();

    const { error } = await supabase.rpc("save_week_setup", {
      p_team_id: tid,
      p_week_start_date: weekStart,
      p_week_type: weekType,
      p_matches: trimmed, // jsonb
      p_no_match_intents: safeNoMatchIntents, // ✅ alltaf 7 stök
      p_season_phase: seasonPhase ?? null,
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

        if (mdMinus >= 4)
          return {
            day_index,
            day_type: "TRAIN" as DayType,
            focus: preMatchMicrodoseFocus(mdMinus),
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 3)
          return {
            day_index,
            day_type: "TRAIN" as DayType,
            focus: "MD-3 NEURAL / VELOCITY",
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 2)
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: "MD-2 POLISH / CALM",
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 1)
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: "MD-1 ACTIVATION",
            notes: `Upcoming match: ${next}`,
          };
      }

      const prev = prevMatchDate(day_date);
      if (prev) {
        const deltaPlus = diffDays(day_date, prev);
        if (deltaPlus >= 1 && day_index !== 7) {
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: postMatchFocus(deltaPlus),
            notes: `Previous match: ${prev}`,
          };
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
        notes: "Manual week (coach)",
      };
    });
  }, [noMatchIntents]);

  const previewDays = useMemo(() => {
    // ✅ PRESEASON / manual override: alltaf manual preview
    if (isManualWeek) return manualNoMatchDayEdits;
    return autoMdDayEdits;
  }, [isManualWeek, manualNoMatchDayEdits, autoMdDayEdits]);

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

    // ✅ Ef manual override er OFF og þetta er match vika → validate match dates
    if (!isManualWeek && weekType !== "NO_MATCH") {
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
        notes: isManualWeek ? `Manual override ON · WeekType=${weekType}` : `Auto MD ON · WeekType=${weekType}`,
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

  function StepPill(props: { n: 1 | 2 | 3; label: string; active: boolean; done: boolean; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
          props.active ? "bg-muted border-foreground/20" : "hover:bg-muted/50"
        }`}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
            props.active
              ? "bg-foreground text-background"
              : props.done
              ? "bg-emerald-500 text-white"
              : "bg-muted text-foreground"
          }`}
        >
          {props.done && !props.active ? "✓" : props.n}
        </span>
        <span className={props.active ? "text-foreground font-medium" : "text-muted-foreground"}>{props.label}</span>
      </button>
    );
  }

  if (!isAtLeastPro) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <UpgradeWall
          requiredPlan="PRO"
          featureName="Week setup"
          description="Set up the training week, assign match days, and configure session intent for each day."
        />
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
              <StepPill n={1} label="Vikugerð" active={step === 1} done={step > 1} onClick={() => setStep(1)} />
              <StepPill n={2} label="Uppsetning" active={step === 2} done={step > 2} onClick={() => setStep(2)} />
              <StepPill n={3} label="Preview" active={step === 3} done={false} onClick={() => setStep(3)} />
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
        <CardHeader
          className={step !== 1 ? "cursor-pointer" : ""}
          onClick={() => step !== 1 && setStep(1)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Skref 1 — Vikugerð</CardTitle>
              {step !== 1 && (
                <CardDescription className="mt-0.5">
                  {weekStart} → {weekEnd} · {weekType === "NO_MATCH" ? "Enginn leikur" : weekType === "ONE_MATCH" ? "1 leikur" : "2 leikir"}
                  {isManualWeek && weekType !== "NO_MATCH" ? " · Manual" : ""}
                </CardDescription>
              )}
              {step === 1 && <CardDescription>Veldu vikudagsetningu og hvort það séu leikir í vikunni.</CardDescription>}
            </div>
            {step !== 1 && <span className="text-xs text-emerald-600 font-medium">✓ Lokið</span>}
          </div>
        </CardHeader>
        {step === 1 && (
        <CardContent className="grid gap-4">
          {(!teamId || teamId.trim().length === 0) && (
            <div className="grid gap-2">
              <Label>Team ID (uuid)</Label>
              <Input placeholder="Paste team_id (uuid) here" value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value)} />
              <p className="text-xs text-muted-foreground">Ef þetta er tómt: þá er coach ekki tengdur liði í profiles/coach_teams.</p>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Vikuupphaf (mánudagur)</Label>
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

          {/* Season phase */}
          <div className="grid gap-2">
            <Label>Tímabil</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SEASON_PHASES.map((phase) => (
                <button
                  key={phase.id}
                  type="button"
                  disabled={loading || saving || applying}
                  onClick={() => setSeasonPhase((p) => p === phase.id ? null : phase.id)}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-sm transition-all ${
                    seasonPhase === phase.id ? phase.activeClass : `${phase.baseClass} hover:opacity-80`
                  } disabled:opacity-50`}
                >
                  <span className="text-base leading-none">{phase.icon}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs leading-tight truncate">{phase.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-snug truncate">{phase.sublabel}</div>
                  </div>
                </button>
              ))}
            </div>
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

          {/* Manual override toggle */}
          <div className="grid gap-2">
            <Label>Preseason / Manual override</Label>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <div className="text-sm font-medium">Leyfa handvirka vikugerð (eins og NO_MATCH)</div>
                <div className="text-xs text-muted-foreground">Gott í preseason: þú stýrir dag-til-dags áherslum þó það séu 1–2 leikir.</div>
              </div>
              <Button
                type="button"
                variant={manualOverride ? "default" : "outline"}
                onClick={() => {
                  setManualOverride((v) => !v);
                  setOk(null);
                  setError(null);
                }}
                disabled={loading || saving || applying}
              >
                {manualOverride ? "ON" : "OFF"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={loading || saving || applying}>
              Næsta →
            </Button>
          </div>
        </CardContent>
        )}
      </Card>

      {/* STEP 2 */}
      <Card className="mb-4">
        <CardHeader
          className={step !== 2 ? "cursor-pointer" : ""}
          onClick={() => step !== 2 && setStep(2)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Skref 2 — Uppsetning</CardTitle>
              {step !== 2 && (
                <CardDescription className="mt-0.5">
                  {isManualWeek ? "Manual vikustýring" : "Auto MD röðun"} · Intensity {intensityTarget}/10
                </CardDescription>
              )}
              {step === 2 && (
                <CardDescription>
                  {isManualWeek ? "Manual vikustýring: veldu áherslu per dag (virkar líka þó 1–2 leikir)." : "Auto MD: settu inn dagsetningar (kerfið sér um MD röðun)."}
                </CardDescription>
              )}
            </div>
            {step > 2 && <span className="text-xs text-emerald-600 font-medium">✓ Lokið</span>}
          </div>
        </CardHeader>
        {step === 2 && (
        <CardContent className="grid gap-4">
          {weekType !== "NO_MATCH" && (
            <div className="grid gap-3">
              {visibleMatches.map((m, idx) => (
                <div key={idx} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[140px_1fr_1fr_110px] md:items-center">
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Leikur</Label>
                    <Input value={m.match_id} onChange={(e) => setMatch(idx, { match_id: e.target.value })} placeholder={`L${idx + 1}`} />
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Dagsetning</Label>
                    <Input type="date" value={m.date} onChange={(e) => setMatch(idx, { date: e.target.value })} />
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Byrjunartími (valfrjáls)</Label>
                    <Input value={m.kickoff_time ?? ""} onChange={(e) => setMatch(idx, { kickoff_time: e.target.value })} placeholder="19:15" />
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">H/A</Label>
                    <select className="h-10 rounded-md border bg-background px-3 text-sm" value={m.home_away ?? "H"} onChange={(e) => setMatch(idx, { home_away: e.target.value as "H" | "A" })}>
                      <option value="H">Heimavöllur</option>
                      <option value="A">Leikavöllur</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isManualWeek && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Dagleg áhersla (mán → sun)</div>
                <Button type="button" variant="outline" onClick={() => setNoMatchIntents(getDefaultNoMatchIntents())} disabled={loading || saving || applying}>
                  Endurstilla
                </Button>
              </div>

              <div className="grid gap-2 md:grid-cols-7">
                {Array.from({ length: 7 }).map((_, i) => {
                  const date = addDays(weekStart, i);
                  const value = noMatchIntents[i] ?? "OFF";

                  return (
                    <div key={date} className="rounded-xl border p-3">
                      <div className="text-xs font-semibold text-foreground">{WEEKDAYS_SHORT[i]}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{date.slice(5)}</div>

                      <div className="mt-2 grid gap-1">
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-xs"
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

                        <div className="mt-1.5 flex items-center justify-center">
                          <Badge variant={dayBadgeVariant(intentToDayType(value))} className="text-[10px]">
                            {intentToDayType(value)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isManualWeek && weekType !== "NO_MATCH" && (
            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              Auto MD er virkt. Ef þú vilt handvirkt eins og preseason: settu <b>Manual override</b> á ON í Skrefi 1.
            </div>
          )}

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

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading || saving || applying}>
              ← Til baka
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep(3)} disabled={loading || saving || applying}>
              Næsta →
            </Button>
          </div>
        </CardContent>
        )}
      </Card>

      {/* STEP 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skref 3 — Yfirlit & Virkja</CardTitle>
          <CardDescription>Svona mun vikan líta út fyrir leikmenn (þetta er það sem verður sent).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-7">
            {previewDays.map((d, i) => {
              const date = addDays(weekStart, i);
              return (
                <div key={d.day_index} title={d.notes ?? ""} className="rounded-xl border p-3 text-center">
                  <div className="text-xs font-semibold text-foreground">{WEEKDAYS_SHORT[i]}</div>
                  <div className="text-[11px] text-muted-foreground">{date.slice(5)}</div>
                  <div className="mt-2">
                    <Badge variant={dayBadgeVariant(d.day_type)} className="text-[10px]">{d.day_type}</Badge>
                  </div>
                  <div className="mt-1.5 text-[11px] font-medium leading-snug text-muted-foreground">{d.focus ?? ""}</div>
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void handleSave()} disabled={loading || saving || applying}>
              {saving ? "Vista..." : loading ? "Hleður..." : "Vista viku"}
            </Button>

            <Button onClick={() => void handleApplyPlan()} disabled={loading || saving || applying}>
              {applying ? "Virkjar..." : "Virkja → senda leikmönnum"}
            </Button>

            <div className="ml-auto text-xs text-muted-foreground">
              {isManualWeek ? "Manual vika" : "Auto MD vika"} · system_key:{" "}
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
