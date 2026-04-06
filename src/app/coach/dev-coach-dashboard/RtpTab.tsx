"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Lang } from "@/lib/lang";

// ── Copy ──────────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    injured:          "Slasaður",
    rehabilitation:   "Endurhæfing",
    rtp_training:     "RTP þjálfun",
    cleared:          "Grænljós",
    mild:             "Vægt",
    moderate:         "Miðlungs",
    severe:           "Alvarlegt",
    injuredKpi:       "Slasaðir",
    rehabKpi:         "Endurhæfing",
    rtpKpi:           "RTP þjálfun",
    clearedKpi:       "Grænljós (þetta tímabil)",
    activeFilter:     (n: number) => `Virkir (${n})`,
    allFilter:        (n: number) => `Allir (${n})`,
    recordBtn:        "+ Skrá meiðsli",
    loadingList:      "Hleð meiðslaskrá…",
    emptyActive:      "Engir virkir meiðslar skráðir.",
    emptyAll:         "Engin meiðslaskrá.",
    formTitle:        "Skrá nýja meiðsli",
    playerLabel:      "Leikmaður",
    injuryDate:       "Dagsetning meiðsla",
    bodyPart:         "Líkamshlutar",
    injuryType:       "Tegund meiðsla",
    severity:         "Alvarleiki",
    estReturn:        "Áætluð skiladagsetning",
    notes:            "Athugasemdir",
    notesPlaceholder: "Lýsing á meiðslum, meðferð, o.fl.",
    saveBtn:          "Vista meiðsli",
    saving:           "Vista…",
    cancelBtn:        "Hætta við",
    rtpStages:        "RTP Stig",
    progressBtn:      (label: string) => `Fara yfir í: ${label}`,
    clearedMsg:       "✓ Leikmaður hefur grænljós — tilbúinn til leiks",
    statusLabel:      "Staða",
    actualReturn:     "Raunveruleg skiladagur",
    saveChanges:      "Vista breytingar",
    close:            "Loka",
    daysAgo:          (n: number) => `${n} dagar liðnir`,
    stageLabel:       (n: number) => `Stig ${n} / 5`,
    bodyParts: [
      "Ökkli", "Hné", "Leggur", "Þjó", "Bakhluti lærs", "Framstuðningur",
      "Mjaðmar", "Magi / grind", "Bak", "Öxl", "Handleggur", "Höfuð / Hnakki", "Annað",
    ],
    injuryTypes: [
      "Tognanir (sprain)", "Tognanir (strain)", "Rifnar líffærataugar", "Brot",
      "Særindi (contusion)", "Bólga", "Yfirburðarslit", "Annað",
    ],
  },
  EN: {
    injured:          "Injured",
    rehabilitation:   "Rehabilitation",
    rtp_training:     "RTP Training",
    cleared:          "Cleared",
    mild:             "Mild",
    moderate:         "Moderate",
    severe:           "Severe",
    injuredKpi:       "Injured",
    rehabKpi:         "Rehabilitation",
    rtpKpi:           "RTP Training",
    clearedKpi:       "Cleared (this period)",
    activeFilter:     (n: number) => `Active (${n})`,
    allFilter:        (n: number) => `All (${n})`,
    recordBtn:        "+ Record injury",
    loadingList:      "Loading injury log…",
    emptyActive:      "No active injuries recorded.",
    emptyAll:         "No injury records.",
    formTitle:        "Record new injury",
    playerLabel:      "Player",
    injuryDate:       "Injury date",
    bodyPart:         "Body part",
    injuryType:       "Injury type",
    severity:         "Severity",
    estReturn:        "Estimated return date",
    notes:            "Notes",
    notesPlaceholder: "Description, treatment plan, etc.",
    saveBtn:          "Save injury",
    saving:           "Saving…",
    cancelBtn:        "Cancel",
    rtpStages:        "RTP Stages",
    progressBtn:      (label: string) => `Progress to: ${label}`,
    clearedMsg:       "✓ Player is cleared — available for match play",
    statusLabel:      "Status",
    actualReturn:     "Actual return date",
    saveChanges:      "Save changes",
    close:            "Close",
    daysAgo:          (n: number) => `${n} days ago`,
    stageLabel:       (n: number) => `Stage ${n} / 5`,
    bodyParts: [
      "Ankle", "Knee", "Lower leg", "Thigh", "Hamstring", "Hip flexor",
      "Hip / groin", "Abdomen / pelvis", "Back", "Shoulder", "Arm", "Head / Neck", "Other",
    ],
    injuryTypes: [
      "Sprain", "Strain", "Ligament tear", "Fracture",
      "Contusion", "Inflammation", "Overuse", "Other",
    ],
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerRow = {
  player_id: string;
  full_name: string;
  position?: string | null;
};

type Injury = {
  id: string;
  player_id: string;
  player_name?: string;
  injury_date: string;
  body_part: string;
  injury_type: string;
  severity: "mild" | "moderate" | "severe";
  status: "injured" | "rehabilitation" | "rtp_training" | "cleared";
  rtp_stage: number;
  estimated_return_date: string | null;
  actual_return_date: string | null;
  notes: string | null;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RTP_STAGES: Record<Lang, Array<{ stage: number; label: string; desc: string }>> = {
  IS: [
    { stage: 0, label: "Hvíld",               desc: "Engin líkamleg virkni" },
    { stage: 1, label: "Léttur hjartsláttur", desc: "Ganga, sund, hjól — engin þolmörk" },
    { stage: 2, label: "Íþróttamiðað álag",   desc: "Hlaup, beinar hreyfingar" },
    { stage: 3, label: "Án snertings",         desc: "Tækniæfingar, liðsæfingar án snertings" },
    { stage: 4, label: "Full þjálfun",         desc: "Snertingsþjálfun, hermar" },
    { stage: 5, label: "Leikur",               desc: "Grænljós — fullur leikmaður" },
  ],
  EN: [
    { stage: 0, label: "Rest",               desc: "No physical activity" },
    { stage: 1, label: "Light aerobic",      desc: "Walking, swimming, cycling — no resistance" },
    { stage: 2, label: "Sport-specific",     desc: "Running, straight-line movements" },
    { stage: 3, label: "Non-contact drills", desc: "Technical and team drills without contact" },
    { stage: 4, label: "Full training",      desc: "Contact training, simulated play" },
    { stage: 5, label: "Match play",         desc: "Cleared — full participant" },
  ],
};

const SEVERITY_STYLES: Record<string, string> = {
  mild:     "bg-blue-100 text-blue-700",
  moderate: "bg-amber-100 text-amber-700",
  severe:   "bg-rose-100 text-rose-700",
};

const STATUS_STYLES: Record<string, string> = {
  injured:        "bg-rose-100 text-rose-700",
  rehabilitation: "bg-amber-100 text-amber-700",
  rtp_training:   "bg-indigo-100 text-indigo-700",
  cleared:        "bg-emerald-100 text-emerald-700",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RtpStageBar({ stage, lang }: { stage: number; lang: Lang }) {
  return (
    <div className="flex gap-1">
      {RTP_STAGES[lang].map((s) => (
        <div
          key={s.stage}
          title={s.label}
          className={`h-2 flex-1 rounded-full transition-colors ${
            s.stage <= stage
              ? s.stage === 5
                ? "bg-emerald-500"
                : "bg-indigo-500"
              : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

// ── New Injury Form ───────────────────────────────────────────────────────────

type NewInjuryFormProps = {
  players: PlayerRow[];
  teamId: string;
  lang: Lang;
  onSaved: () => void;
  onCancel: () => void;
};

function NewInjuryForm({ players, teamId, lang, onSaved, onCancel }: NewInjuryFormProps) {
  const ct = COPY[lang];
  const today = new Date().toISOString().slice(0, 10);

  const [playerId, setPlayerId]     = useState(String(players[0]?.player_id ?? ""));
  const [injuryDate, setInjuryDate] = useState(today);
  const [bodyPart, setBodyPart]     = useState<string>(ct.bodyParts[0]);
  const [injuryType, setInjuryType] = useState<string>(ct.injuryTypes[0]);
  const [severity, setSeverity]     = useState<"mild" | "moderate" | "severe">("moderate");
  const [estReturn, setEstReturn]   = useState("");
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  // Re-initialise body part / injury type when lang changes
  useEffect(() => {
    setBodyPart(COPY[lang].bodyParts[0]);
    setInjuryType(COPY[lang].injuryTypes[0]);
  }, [lang]);

  async function handleSave() {
    if (!playerId) return;
    setSaving(true);
    setError("");

    const { error: err } = await supabase.from("player_injuries").insert({
      player_id: playerId,
      team_id: teamId,
      injury_date: injuryDate,
      body_part: bodyPart,
      injury_type: injuryType,
      severity,
      status: "injured",
      rtp_stage: 0,
      estimated_return_date: estReturn || null,
      notes: notes || null,
    });

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full";

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
          {ct.formTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{ct.playerLabel}</label>
            <select className={field} value={playerId} onChange={e => setPlayerId(e.target.value)}>
              {players.map(p => (
                <option key={p.player_id} value={String(p.player_id)}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{ct.injuryDate}</label>
            <input type="date" className={field} value={injuryDate} onChange={e => setInjuryDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{ct.bodyPart}</label>
            <select className={field} value={bodyPart} onChange={e => setBodyPart(e.target.value)}>
              {ct.bodyParts.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{ct.injuryType}</label>
            <select className={field} value={injuryType} onChange={e => setInjuryType(e.target.value)}>
              {ct.injuryTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{ct.severity}</label>
            <select className={field} value={severity} onChange={e => setSeverity(e.target.value as typeof severity)}>
              <option value="mild">{ct.mild}</option>
              <option value="moderate">{ct.moderate}</option>
              <option value="severe">{ct.severe}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{ct.estReturn}</label>
            <input type="date" className={field} value={estReturn} onChange={e => setEstReturn(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{ct.notes}</label>
          <textarea
            className={`${field} resize-none`}
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={ct.notesPlaceholder}
          />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? ct.saving : ct.saveBtn}
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {ct.cancelBtn}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Injury Card ───────────────────────────────────────────────────────────────

function InjuryCard({
  injury,
  lang,
  onUpdate,
}: {
  injury: Injury;
  lang: Lang;
  onUpdate: (id: string, patch: Partial<Injury>) => void;
}) {
  const ct = COPY[lang];
  const stages = RTP_STAGES[lang];

  const [expanded, setExpanded]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [localStage, setLocalStage]     = useState(injury.rtp_stage);
  const [localStatus, setLocalStatus]   = useState(injury.status);
  const [localNotes, setLocalNotes]     = useState(injury.notes ?? "");
  const [actualReturn, setActualReturn] = useState(injury.actual_return_date ?? "");

  const days = daysSince(injury.injury_date);
  const currentStageInfo = stages[localStage];

  async function handleProgressStage() {
    const next = Math.min(5, localStage + 1);
    const nextStatus: Injury["status"] = next === 5 ? "cleared" : next >= 3 ? "rtp_training" : next >= 1 ? "rehabilitation" : "injured";
    setSaving(true);
    await supabase
      .from("player_injuries")
      .update({ rtp_stage: next, status: nextStatus })
      .eq("id", injury.id);
    setLocalStage(next);
    setLocalStatus(nextStatus);
    onUpdate(injury.id, { rtp_stage: next, status: nextStatus });
    setSaving(false);
  }

  async function handleSaveNotes() {
    setSaving(true);
    await supabase
      .from("player_injuries")
      .update({ notes: localNotes || null, actual_return_date: actualReturn || null, status: localStatus })
      .eq("id", injury.id);
    onUpdate(injury.id, { notes: localNotes || null, actual_return_date: actualReturn || null, status: localStatus });
    setSaving(false);
    setExpanded(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/60 rounded-t-xl"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">{injury.player_name}</span>
            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${SEVERITY_STYLES[injury.severity]}`}>
              {ct[injury.severity]}
            </span>
            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[localStatus]}`}>
              {ct[localStatus]}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {injury.body_part} · {injury.injury_type} · {injury.injury_date} · {ct.daysAgo(days)}
          </div>
        </div>
        <div className="shrink-0 w-32">
          <div className="text-[10px] text-slate-400 mb-1">
            {ct.stageLabel(localStage)} — {currentStageInfo.label}
          </div>
          <RtpStageBar stage={localStage} lang={lang} />
        </div>
        <div className="shrink-0 text-slate-400 text-xs">{expanded ? "▲" : "▼"}</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">
          {/* RTP stage progress */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              {ct.rtpStages}
            </div>
            <div className="space-y-1">
              {stages.map((s) => (
                <div
                  key={s.stage}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    s.stage === localStage
                      ? "bg-indigo-50 border border-indigo-200"
                      : s.stage < localStage
                      ? "text-slate-400"
                      : "text-slate-500"
                  }`}
                >
                  <span className={`shrink-0 font-bold w-5 text-center ${s.stage <= localStage ? "text-indigo-600" : "text-slate-300"}`}>
                    {s.stage < localStage ? "✓" : s.stage === localStage ? "→" : s.stage + ""}
                  </span>
                  <div>
                    <span className="font-semibold">{s.label}</span>
                    <span className="ml-2 text-[11px] text-slate-400">{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            {localStage < 5 && (
              <button
                onClick={handleProgressStage}
                disabled={saving}
                className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "…" : ct.progressBtn(stages[localStage + 1]?.label ?? "")}
              </button>
            )}
            {localStage === 5 && (
              <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700">
                {ct.clearedMsg}
              </div>
            )}
          </div>

          {/* Status + actual return */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                {ct.statusLabel}
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={localStatus}
                onChange={e => setLocalStatus(e.target.value as Injury["status"])}
              >
                <option value="injured">{ct.injured}</option>
                <option value="rehabilitation">{ct.rehabilitation}</option>
                <option value="rtp_training">{ct.rtp_training}</option>
                <option value="cleared">{ct.cleared}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                {ct.actualReturn}
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={actualReturn}
                onChange={e => setActualReturn(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              {ct.notes}
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-none"
              rows={3}
              value={localNotes}
              onChange={e => setLocalNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {saving ? ct.saving : ct.saveChanges}
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              {ct.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Props = {
  coachTeamId: string | null;
  lang: Lang;
};

export function RtpTab({ coachTeamId, lang }: Props) {
  const ct = COPY[lang];

  const [players, setPlayers]           = useState<PlayerRow[]>([]);
  const [injuries, setInjuries]         = useState<Injury[]>([]);
  const [loading, setLoading]           = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [filterStatus, setFilterStatus] = useState<"active" | "all">("active");

  // Fetch full active player list from players table (not today's readiness view)
  useEffect(() => {
    if (!coachTeamId) return;
    supabase
      .from("players")
      .select("id, full_name, position")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => {
        setPlayers(
          ((data ?? []) as Array<{ id: string; full_name: string; position: string | null }>)
            .map((p) => ({ player_id: p.id, full_name: p.full_name, position: p.position }))
        );
      });
  }, [coachTeamId]);

  const load = useCallback(async () => {
    if (!coachTeamId) return;
    setLoading(true);

    const { data } = await supabase
      .from("player_injuries")
      .select("*")
      .eq("team_id", coachTeamId)
      .order("injury_date", { ascending: false });

    // Attach player names using live player list
    const playerMap = new Map(players.map(p => [p.player_id, p.full_name]));
    const withNames = ((data ?? []) as Injury[]).map(inj => ({
      ...inj,
      player_name: playerMap.get(inj.player_id) ?? `#${inj.player_id}`,
    }));

    setInjuries(withNames);
    setLoading(false);
  }, [coachTeamId, players]);

  useEffect(() => { load(); }, [load]);

  function handleUpdate(id: string, patch: Partial<Injury>) {
    setInjuries(prev => prev.map(inj => inj.id === id ? { ...inj, ...patch } : inj));
  }

  const displayed = filterStatus === "active"
    ? injuries.filter(i => i.status !== "cleared")
    : injuries;

  const activeCount  = injuries.filter(i => i.status !== "cleared").length;
  const clearedCount = injuries.filter(i => i.status === "cleared").length;
  const injuredCount = injuries.filter(i => i.status === "injured").length;
  const rtpCount     = injuries.filter(i => i.status === "rtp_training").length;
  const rehabCount   = injuries.filter(i => i.status === "rehabilitation").length;

  return (
    <div className="space-y-4">

      {/* Summary KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: ct.injuredKpi,  value: injuredCount,  chip: "bg-rose-50 border-rose-200" },
          { label: ct.rehabKpi,    value: rehabCount,    chip: "bg-amber-50 border-amber-200" },
          { label: ct.rtpKpi,      value: rtpCount,      chip: "bg-indigo-50 border-indigo-200" },
          { label: ct.clearedKpi,  value: clearedCount,  chip: "bg-emerald-50 border-emerald-200" },
        ].map(({ label, value, chip }) => (
          <div key={label} className={`rounded-xl border px-4 py-3 ${chip}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["active", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                filterStatus === f
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "active" ? ct.activeFilter(activeCount) : ct.allFilter(injuries.length)}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {ct.recordBtn}
          </button>
        )}
      </div>

      {/* New injury form */}
      {showForm && (
        <NewInjuryForm
          players={players}
          teamId={coachTeamId ?? ""}
          lang={lang}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Injury list */}
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">{ct.loadingList}</div>
      ) : displayed.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          {filterStatus === "active" ? ct.emptyActive : ct.emptyAll}
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(inj => (
            <InjuryCard key={inj.id} injury={inj} lang={lang} onUpdate={handleUpdate} />
          ))}
        </div>
      )}

    </div>
  );
}
