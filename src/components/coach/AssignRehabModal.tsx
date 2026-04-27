"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AssignRehabModal
// ─────────────────────────────────────────────────────────────────────────────
//
// Reusable assign-rehab dialog. Used from three surfaces:
//   1. /coach/injuries injury row → "Send rehab" (player + injury preset,
//      template list filtered to rehab/prehab category)
//   2. /coach/templates template card → "Assign to player" (template
//      preset, player picker open)
//   3. /coach/custom-templates set card → same flow
//
// Architecture: writes ONE row per day in [start_date, end_date] to
// player_template_assignments, all sharing the same program_label so
// the program reads as a single multi-day rehab block. Existing
// microdose flow is unaffected because all new fields are nullable.
//
// Sport-science basis (Aspetar 2014 RTP framework):
//   Stage 1: Acute (0–3 d) — pain mgmt, ROM, isometric
//   Stage 2: Sub-acute (3–7 d) — concentric loading
//   Stage 3: Sport-specific (1–2 wks) — functional drills
//   Stage 4: Return to play (criteria-based)
//   Stage 5: Return to performance (full team integration)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

type Lang = "IS" | "EN";

type WorkoutTemplate = {
  id: string;
  title: string | null;
  category?: string | null;
  description?: string | null;
};

type PlayerOption = {
  id: string;
  full_name: string;
};

export type AssignRehabModalProps = {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  /** Pre-selected player (e.g. when launched from injury row). */
  presetPlayerId?: string | null;
  presetPlayerName?: string | null;
  /** Pre-selected template (e.g. when launched from a template card). */
  presetTemplateId?: string | null;
  presetTemplateTitle?: string | null;
  /** Optional injury_event_id — traces the assignment back to a logged injury. */
  injuryEventId?: string | null;
  /** When templateId is not preset, restrict the picker to these categories. */
  categoryFilter?: Array<"rehab" | "prehab" | "recovery" | "activation" | "matchday" | "strength" | "power" | "microdose">;
  /** Team scope for fetching players + templates. */
  teamId: string;
  /** Optional callback after a successful save. */
  onSaved?: (programLabel: string, daysCount: number) => void;
};

const COPY = {
  IS: {
    title: "Úthluta endurhæfingaráætlun",
    titleAssign: "Úthluta æfingu á leikmann",
    player: "Leikmaður",
    template: "Æfingakerfi",
    selectPlayer: "Veldu leikmann…",
    selectTemplate: "Veldu æfingakerfi…",
    startDate: "Frá og með",
    endDate: "Til og með",
    programLabel: "Heiti áætlunar (valkvætt)",
    programLabelPlaceholder: "t.d. Hamstring rehab — vika 1",
    stageLabel: "Stig (valkvætt — Aspetar 2014)",
    stageNone: "— ekkert —",
    stageAcute: "Acute (0–3 dagar)",
    stageSubacute: "Sub-acute (3–7 dagar)",
    stageSport: "Sport-specific (1–2 vikur)",
    stageRtp: "Return to play",
    stageRtPerformance: "Return to performance",
    note: "Athugasemd til leikmanns (valkvætt)",
    notePlaceholder: "Sérstakar leiðbeiningar fyrir vikuna…",
    save: "Úthluta",
    saving: "Vista…",
    cancel: "Hætta við",
    daysPreview: (n: number) => `Mun búa til ${n} dag${n === 1 ? "" : "a"} af úthlutunum.`,
    success: (n: number) => `${n} dagar úthlutaðir leikmanni.`,
    errorMissing: "Vinsamlegast veldu leikmann og æfingakerfi.",
    errorDates: "Lokadagur verður að vera sami og eða eftir startdag.",
    errorSave: "Tókst ekki að vista úthlutun.",
    teamHint: "Aðeins virk æfingakerfi á þínu liði birtast í listanum.",
  },
  EN: {
    title: "Assign rehab program",
    titleAssign: "Assign template to player",
    player: "Player",
    template: "Template",
    selectPlayer: "Select a player…",
    selectTemplate: "Select a template…",
    startDate: "From",
    endDate: "Until",
    programLabel: "Program name (optional)",
    programLabelPlaceholder: "e.g. Hamstring rehab — week 1",
    stageLabel: "Stage (optional — Aspetar 2014)",
    stageNone: "— none —",
    stageAcute: "Acute (0–3 d)",
    stageSubacute: "Sub-acute (3–7 d)",
    stageSport: "Sport-specific (1–2 wks)",
    stageRtp: "Return to play",
    stageRtPerformance: "Return to performance",
    note: "Note to player (optional)",
    notePlaceholder: "Specific instructions for this block…",
    save: "Assign",
    saving: "Saving…",
    cancel: "Cancel",
    daysPreview: (n: number) => `Will create ${n} day${n === 1 ? "" : "s"} of assignments.`,
    success: (n: number) => `${n} days assigned.`,
    errorMissing: "Please select a player and a template.",
    errorDates: "End date must be on or after start date.",
    errorSave: "Could not save assignment.",
    teamHint: "Only active templates for your team appear in the list.",
  },
} as const;

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function* enumerateDates(startISO: string, endISO: string): Generator<string> {
  const start = new Date(`${startISO}T12:00:00Z`);
  const end = new Date(`${endISO}T12:00:00Z`);
  const cursor = new Date(start);
  while (cursor <= end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export default function AssignRehabModal(props: AssignRehabModalProps) {
  const t = COPY[props.lang];
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [playerId, setPlayerId] = useState<string>(props.presetPlayerId ?? "");
  const [templateId, setTemplateId] = useState<string>(props.presetTemplateId ?? "");
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [endDate, setEndDate] = useState<string>(addDaysISO(todayISO(), 6));
  const [programLabel, setProgramLabel] = useState<string>("");
  const [stageLabel, setStageLabel] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Reset form state when modal opens with fresh presets
  useEffect(() => {
    if (props.open) {
      setPlayerId(props.presetPlayerId ?? "");
      setTemplateId(props.presetTemplateId ?? "");
      setStartDate(todayISO());
      setEndDate(addDaysISO(todayISO(), 6));
      setProgramLabel("");
      setStageLabel("");
      setNote("");
      setError("");
    }
  }, [props.open, props.presetPlayerId, props.presetTemplateId]);

  // Load player roster (only when player isn't preset)
  useEffect(() => {
    if (!props.open || props.presetPlayerId) return;
    void (async () => {
      const { data } = await supabase
        .from("players")
        .select("id, full_name")
        .eq("team_id", props.teamId)
        .order("full_name");
      setPlayers((data ?? []) as PlayerOption[]);
    })();
  }, [props.open, props.presetPlayerId, props.teamId]);

  // Load template list (only when template isn't preset)
  useEffect(() => {
    if (!props.open || props.presetTemplateId) return;
    void (async () => {
      let query = supabase
        .from("workout_templates")
        .select("id, title, category, description")
        .or(`team_id.eq.${props.teamId},team_id.is.null`)
        .eq("is_active", true)
        .order("title");
      if (props.categoryFilter && props.categoryFilter.length > 0) {
        query = query.in("category", props.categoryFilter);
      }
      const { data } = await query;
      setTemplates((data ?? []) as WorkoutTemplate[]);
    })();
  }, [props.open, props.presetTemplateId, props.teamId, props.categoryFilter]);

  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    if (endDate < startDate) return 0;
    let n = 0;
    for (const _ of enumerateDates(startDate, endDate)) n++;
    return n;
  }, [startDate, endDate]);

  if (!props.open) return null;

  const titleText = props.injuryEventId ? t.title : t.titleAssign;

  async function handleSave() {
    setError("");
    if (!playerId || !templateId) {
      setError(t.errorMissing);
      return;
    }
    if (endDate < startDate) {
      setError(t.errorDates);
      return;
    }
    setSaving(true);
    try {
      // Build all rows up-front so the upsert is one round-trip
      const rows: Array<Record<string, unknown>> = [];
      for (const date of enumerateDates(startDate, endDate)) {
        rows.push({
          player_id: playerId,
          team_id: props.teamId,
          entry_date: date,
          template_id: templateId,
          note: note || null,
          program_label: programLabel || null,
          program_stage_label: stageLabel || null,
          injury_event_id: props.injuryEventId ?? null,
        });
      }
      const { error: upErr } = await supabase
        .from("player_template_assignments")
        .upsert(rows, { onConflict: "player_id,entry_date" });
      if (upErr) {
        // Surface the actual DB error message (RLS denial, constraint
        // violation, etc.) so the next bug is debuggable in 5 seconds
        // instead of a generic "could not save". Falls back to the
        // friendly message only when no message present.
        console.error("AssignRehabModal upsert failed:", upErr);
        setError(`${t.errorSave} — ${upErr.message || upErr.code || "unknown error"}`);
        setSaving(false);
        return;
      }
      props.onSaved?.(programLabel || "", rows.length);
      props.onClose();
    } catch (e) {
      console.error(e);
      setError(t.errorSave);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{titleText}</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* Player */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">{t.player}</label>
            {props.presetPlayerId ? (
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {props.presetPlayerName ?? props.presetPlayerId}
              </div>
            ) : (
              <select
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t.selectPlayer}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Template */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">{t.template}</label>
            {props.presetTemplateId ? (
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {props.presetTemplateTitle ?? props.presetTemplateId}
              </div>
            ) : (
              <>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t.selectTemplate}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.title} {tpl.category ? `· ${tpl.category}` : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[10px] italic text-slate-400">{t.teamHint}</div>
              </>
            )}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">{t.startDate}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">{t.endDate}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          {dayCount > 0 && (
            <div className="text-[11px] text-sky-700">{t.daysPreview(dayCount)}</div>
          )}

          {/* Program label */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">{t.programLabel}</label>
            <input
              type="text"
              value={programLabel}
              onChange={(e) => setProgramLabel(e.target.value)}
              placeholder={t.programLabelPlaceholder}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Stage label */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">{t.stageLabel}</label>
            <select
              value={stageLabel}
              onChange={(e) => setStageLabel(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">{t.stageNone}</option>
              <option value="Acute">{t.stageAcute}</option>
              <option value="Sub-acute">{t.stageSubacute}</option>
              <option value="Sport-specific">{t.stageSport}</option>
              <option value="Return to play">{t.stageRtp}</option>
              <option value="Return to performance">{t.stageRtPerformance}</option>
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">{t.note}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
              rows={2}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={props.onClose} disabled={saving}>{t.cancel}</Button>
          <Button onClick={handleSave} disabled={saving || dayCount === 0}>
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
