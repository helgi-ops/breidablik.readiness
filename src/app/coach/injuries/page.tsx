"use client";

/**
 * Coach injury log + correlation view.
 *
 * Three things in one page:
 *   1. Team-level summary card: "MicroPulse predicted X of Y injuries (Z%)"
 *   2. Injury list with retrospective signal indicators per row
 *   3. "Log new injury" form (collapsible)
 *
 * The retrospective signal computation runs server-side on insert via
 * compute_injury_retrospective_signals(). Each injury_event row stores its
 * retro_signals JSONB so list rendering is fast.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

type InjuryType =
  | "hamstring" | "calf" | "groin" | "quad" | "hip"
  | "knee_acl" | "knee_mcl" | "knee_meniscus" | "knee_other"
  | "ankle_sprain" | "ankle_other"
  | "foot" | "achilles" | "lower_back" | "upper_body"
  | "concussion" | "illness" | "other";

type Mechanism =
  | "non_contact_match" | "non_contact_training"
  | "contact_match" | "contact_training"
  | "overuse" | "recurrence" | "unknown";

type Severity = "minimal" | "mild" | "moderate" | "severe";
type BodySide = "left" | "right" | "bilateral" | "na";

type InjuryEvent = {
  id: string;
  player_id: string;
  team_id: string;
  injury_date: string;
  injury_type: InjuryType;
  body_side: BodySide;
  mechanism: Mechanism;
  severity: Severity | null;
  days_lost: number | null;
  return_date: string | null;
  is_active: boolean;
  notes: string | null;
  retro_signals: any | null;
  recorded_at: string;
};

type Player = { id: string; full_name: string | null };

type Summary = {
  total_injuries: number;
  predicted_injuries: number;
  strong_pattern_match: number;
  avg_pattern_match_score: number | null;
  hamstring_count: number;
  calf_count: number;
  groin_count: number;
  knee_count: number;
  ankle_count: number;
  earliest_injury: string | null;
  latest_injury: string | null;
};

const INJURY_TYPE_LABEL: Record<InjuryType, string> = {
  hamstring: "Aftan-læri",
  calf: "Kálfi",
  groin: "Nár",
  quad: "Fram-læri",
  hip: "Mjöðm",
  knee_acl: "Hné — ACL",
  knee_mcl: "Hné — MCL",
  knee_meniscus: "Hné — meniscus",
  knee_other: "Hné — annað",
  ankle_sprain: "Ökkla-tognun",
  ankle_other: "Ökkla — annað",
  foot: "Fótur",
  achilles: "Achilles",
  lower_back: "Mjóbak",
  upper_body: "Efri hluti",
  concussion: "Heilahristingur",
  illness: "Veikindi",
  other: "Annað",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  minimal: "Minimal (1-3 d)",
  mild: "Mild (4-7 d)",
  moderate: "Moderate (8-28 d)",
  severe: "Severe (>28 d)",
};

const MECHANISM_LABEL: Record<Mechanism, string> = {
  non_contact_match: "Án snertingar — leikur",
  non_contact_training: "Án snertingar — æfing",
  contact_match: "Snerting — leikur",
  contact_training: "Snerting — æfing",
  overuse: "Yfirálag",
  recurrence: "Endurmeiðsl",
  unknown: "Óþekkt",
};

export default function CoachInjuriesPage() {
  const [loading, setLoading]   = React.useState(true);
  const [error, setError]       = React.useState<string | null>(null);
  const [teamId, setTeamId]     = React.useState<string | null>(null);
  const [teamLabel, setTeamLabel] = React.useState<string>("");
  const [players, setPlayers]   = React.useState<Player[]>([]);
  const [injuries, setInjuries] = React.useState<InjuryEvent[]>([]);
  const [summary, setSummary]   = React.useState<Summary | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  React.useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError("Ekki innskráður"); return; }
      const { data: profile } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = profile?.team_id as string | undefined;
      if (!tid) { setError("Ekki tengdur við lið"); return; }
      setTeamId(tid);

      const { data: team } = await sb.from("teams").select("name, club_short_name").eq("id", tid).maybeSingle();
      setTeamLabel((team?.club_short_name || team?.name) ?? "");

      const { data: roster } = await sb.from("players")
        .select("id, full_name").eq("team_id", tid).order("full_name");
      setPlayers((roster ?? []) as Player[]);

      const { data: injData, error: injErr } = await sb.from("injury_events")
        .select("*")
        .eq("team_id", tid)
        .order("injury_date", { ascending: false })
        .limit(200);
      if (injErr) throw injErr;
      setInjuries((injData ?? []) as InjuryEvent[]);

      const { data: sumData } = await sb.from("team_injury_correlation_summary")
        .select("*").eq("team_id", tid).maybeSingle();
      setSummary(sumData as Summary | null);
    } catch (e: any) {
      setError(e?.message ?? "Villa");
    } finally {
      setLoading(false);
    }
  }

  const playerName = (id: string) => players.find(p => p.id === id)?.full_name?.trim() || "—";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Meiðslaskráning</h1>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              proof-of-ROI
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Skráðu meiðsli og sjáðu hvaða signals MicroPulse fangaði fyrirfram.
            {teamLabel && <> · {teamLabel}</>}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {showForm ? "Loka skráningarformi" : "+ Skrá meiðsli"}
        </button>
      </div>

      {/* Summary */}
      {summary && summary.total_injuries > 0 && (
        <SummaryPanel summary={summary} />
      )}

      {/* Form */}
      {showForm && teamId && (
        <InjuryForm
          teamId={teamId}
          players={players}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}

      {/* List */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Skráð meiðsli (síðustu 200)
        </h2>
        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Hleð…</div>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        {!loading && !error && injuries.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Engin meiðsli skráð enn. Skráðu fyrsta meiðslið til að sjá retrospective signal correlation.
          </div>
        )}
        {!loading && injuries.length > 0 && (
          <div className="space-y-2">
            {injuries.map((inj) => (
              <InjuryRow key={inj.id} injury={inj} playerName={playerName(inj.player_id)} />
            ))}
          </div>
        )}
      </div>

      <div className="text-sm">
        <Link href="/coach" className="text-emerald-700 hover:underline">← Til baka á dashboard</Link>
      </div>
    </div>
  );
}

// ─── Summary panel ───────────────────────────────────────────────────────

function SummaryPanel({ summary }: { summary: Summary }) {
  const total = summary.total_injuries;
  const predicted = summary.predicted_injuries;
  const pct = total > 0 ? Math.round((predicted / total) * 100) : 0;

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            MicroPulse Pattern Match — last 365 days
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-4xl font-bold text-emerald-700">{predicted}</div>
            <div className="text-xl text-emerald-700">of {total} injuries</div>
            <div className="text-2xl font-bold text-emerald-700">({pct}%)</div>
          </div>
          <div className="mt-1 text-xs text-emerald-600">
            preceded by warning signs (yellow/red flag, decoupling alert, or ACWR spike)
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <Stat label="Strong pattern match (≥0.5)" value={summary.strong_pattern_match} />
          <Stat label="Avg pattern score" value={summary.avg_pattern_match_score?.toFixed(2) ?? "—"} />
          <Stat label="Hamstring" value={summary.hamstring_count} />
          <Stat label="Knee" value={summary.knee_count} />
          <Stat label="Ankle" value={summary.ankle_count} />
          <Stat label="Groin" value={summary.groin_count} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded bg-white px-2 py-1">
      <span className="text-emerald-700">{label}</span>
      <span className="font-semibold text-emerald-900">{value}</span>
    </div>
  );
}

// ─── Injury row ───────────────────────────────────────────────────────────

function InjuryRow({ injury, playerName }: { injury: InjuryEvent; playerName: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const retro = injury.retro_signals;
  const score = retro?.pattern_match_score as number | undefined;
  const preceded = retro?.preceded_by_warning as boolean | undefined;
  const yellowDays = retro?.wellness?.yellow_days as number | undefined;
  const redDays = retro?.wellness?.red_days as number | undefined;
  const decAlerts = retro?.decoupling?.alert_days as number | undefined;
  const acwr = retro?.load?.acwr as number | undefined;
  const firstWarning = retro?.first_warning_days_before_injury as number | undefined;

  let scoreColor = "bg-slate-100 text-slate-700";
  if (score != null) {
    if (score >= 0.7) scoreColor = "bg-emerald-100 text-emerald-700";
    else if (score >= 0.4) scoreColor = "bg-amber-100 text-amber-700";
    else if (score >= 0.2) scoreColor = "bg-orange-100 text-orange-700";
    else scoreColor = "bg-slate-100 text-slate-600";
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-slate-50"
      >
        <div className="flex flex-1 items-center gap-3">
          <div className="text-xs font-mono text-slate-500">{injury.injury_date}</div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{playerName}</div>
            <div className="text-xs text-muted-foreground">
              {INJURY_TYPE_LABEL[injury.injury_type]}
              {injury.body_side !== "na" && <> · {injury.body_side}</>}
              {" · "}{MECHANISM_LABEL[injury.mechanism]}
              {injury.severity && <> · {SEVERITY_LABEL[injury.severity]}</>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {preceded && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              ✓ Preceded by warning
            </span>
          )}
          {!preceded && retro && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
              No prior signal
            </span>
          )}
          {score != null && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${scoreColor}`}>
              {(score * 100).toFixed(0)}% match
            </span>
          )}
          <span className="text-slate-400">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && retro && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Mini label="Yellow days" value={yellowDays ?? "—"} hint="(of 14)" />
            <Mini label="Red days" value={redDays ?? "—"} hint="(of 14)" />
            <Mini label="Decoupling alerts" value={decAlerts ?? "—"} hint="(>1 SD)" />
            <Mini label="ACWR" value={acwr?.toFixed(2) ?? "—"} hint="(7d / 28d)" />
          </div>

          {firstWarning != null && firstWarning < 14 && (
            <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
              <strong>First warning sign:</strong> {firstWarning} days before injury.
              MicroPulse had detected the pattern with that lead time.
            </div>
          )}

          {retro?.wellness?.dominant_signals_seen && retro.wellness.dominant_signals_seen.length > 0 && (
            <div className="mt-3 text-xs">
              <strong className="text-slate-700">Dominant signals seen:</strong>{" "}
              <span className="text-slate-600">
                {retro.wellness.dominant_signals_seen.map((s: string) => s.replace("wellness.", "")).join(", ")}
              </span>
            </div>
          )}

          {injury.notes && (
            <div className="mt-3 text-xs">
              <strong className="text-slate-700">Notes:</strong>{" "}
              <span className="italic text-slate-600">{injury.notes}</span>
            </div>
          )}

          <div className="mt-3 text-[10px] text-slate-400">
            Retro signals computed: {retro.computed_at ? new Date(retro.computed_at).toLocaleString("is-IS") : "—"}
            {" · "}
            Window: {retro.scan_window_days} days
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <div className="rounded bg-white px-3 py-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

// ─── New injury form ─────────────────────────────────────────────────────

function InjuryForm({
  teamId, players, onSaved,
}: {
  teamId: string;
  players: Player[];
  onSaved: () => void;
}) {
  const [playerId, setPlayerId] = React.useState("");
  const [date, setDate]         = React.useState(new Date().toISOString().slice(0, 10));
  const [type, setType]         = React.useState<InjuryType>("hamstring");
  const [side, setSide]         = React.useState<BodySide>("na");
  const [mechanism, setMechanism] = React.useState<Mechanism>("non_contact_match");
  const [severity, setSeverity] = React.useState<Severity | "">("");
  const [daysLost, setDaysLost] = React.useState("");
  const [notes, setNotes]       = React.useState("");
  const [saving, setSaving]     = React.useState(false);
  const [err, setErr]           = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId) { setErr("Veldu leikmann"); return; }
    setSaving(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from("injury_events").insert({
        player_id: playerId,
        team_id: teamId,
        injury_date: date,
        injury_type: type,
        body_side: side,
        mechanism: mechanism,
        severity: severity || null,
        days_lost: daysLost ? parseInt(daysLost, 10) : null,
        notes: notes.trim() || null,
        is_active: true,
      });
      if (error) throw error;
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Villa við vistun");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border-2 border-emerald-300 bg-white p-4 space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Skrá meiðsli</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Leikmaður">
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— veldu —</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label="Dagur meiðsla">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Týpa meiðsla">
          <select value={type} onChange={(e) => setType(e.target.value as InjuryType)} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(INJURY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Hlið líkama">
          <select value={side} onChange={(e) => setSide(e.target.value as BodySide)} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm">
            <option value="na">Á ekki við</option>
            <option value="left">Vinstri</option>
            <option value="right">Hægri</option>
            <option value="bilateral">Báðar</option>
          </select>
        </Field>
        <Field label="Mekanismi">
          <select value={mechanism} onChange={(e) => setMechanism(e.target.value as Mechanism)} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(MECHANISM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Alvarleiki">
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— ekki ákvarðað —</option>
            {Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Fjöldi daga týnt (ef þekkt)">
          <input type="number" min={0} value={daysLost} onChange={(e) => setDaysLost(e.target.value)} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm" />
        </Field>
      </div>

      <Field label="Athugasemdir">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border-slate-300 px-2 py-1.5 text-sm" />
      </Field>

      {err && <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving || !playerId} className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-slate-300">
          {saving ? "Vista…" : "Vista meiðsli + reikna correlation"}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Þegar meiðsli er vistað keyrir kerfið automatískt afturskyggna analýsu af síðustu 14 daga
        MicroPulse signals (wellness flags, decoupling alerts, ACWR spikes) og pakka niðurstöðum í
        retro_signals JSONB sem sýnt er í lista.
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
