"use client";

/**
 * PlayerRecoveryAssignmentsCard
 *
 * Renders the current player's pending recovery assignments (today + tomorrow
 * window). Each card shows the protocol detail with a Complete button.
 * Hidden entirely when no assignments — non-intrusive on rest days.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  EVIDENCE_LABELS,
  type RecoveryEvidenceTier,
  type RecoveryProtocolCategory,
  type RecoveryProtocol,
  type RecoverySection,
} from "@/lib/recovery/types";

type Assignment = {
  id: string;
  protocol_id: string;
  due_at: string;
  completed_at: string | null;
  trigger_reason: string | null;
  protocol: RecoveryProtocol | null;
};

function evidenceClass(tier: RecoveryEvidenceTier): string {
  if (tier === "strong") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (tier === "moderate") return "border-sky-300 bg-sky-50 text-sky-800";
  if (tier === "mixed") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function categoryClass(c: RecoveryProtocolCategory): string {
  switch (c) {
    case "post_match":
      return "border-violet-300 bg-violet-50 text-violet-800";
    case "md_plus_1":
      return "border-indigo-300 bg-indigo-50 text-indigo-800";
    case "pre_match":
      return "border-orange-300 bg-orange-50 text-orange-800";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function formatDueLabel(dueIso: string): string {
  const due = new Date(dueIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const time = due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dueDay.getTime() === today.getTime()) return `Today · ${time}`;
  if (dueDay.getTime() === tomorrow.getTime()) return `Tomorrow · ${time}`;
  return due.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Daily tendon check-in — daily provocation-test pain (VAS) + morning stiffness.
// Serves both tendinopathy modules by `region` (patellar = decline-squat,
// achilles = heel-raise). Descriptive; feeds the coach pain-monitoring gate,
// never the player's readiness verdict.
function TendonCheckin({ region, painLabel, bodyLabel }: { region: string; painLabel: string; bodyLabel: string }) {
  const [pain, setPain] = useState<number | null>(null);
  const [stiffness, setStiffness] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/player/tendon-checkin?region=${region}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const json = (await res.json()) as { checkin?: { provocation_vas: number | null; morning_stiffness_vas: number | null; note: string | null } | null };
      if (!active || !json.checkin) return;
      setPain(json.checkin.provocation_vas);
      setStiffness(json.checkin.morning_stiffness_vas);
      setNote(json.checkin.note ?? "");
      setSaved(true);
    })();
    return () => { active = false; };
  }, [region]);

  const save = async () => {
    setBusy(true); setSaved(false);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/player/tendon-checkin", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provocationVas: pain, morningStiffnessVas: stiffness, note: note || null, region }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  const vasSelect = (value: number | null, onChange: (v: number | null) => void) => (
    <select
      value={value ?? ""}
      onChange={(e) => { onChange(e.target.value === "" ? null : Number(e.target.value)); setSaved(false); }}
      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px]"
    >
      <option value="">—</option>
      {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
    </select>
  );

  return (
    <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/50 p-2.5">
      <div className="text-[11px] font-semibold text-violet-900">Daily tendon check-in</div>
      <div className="text-[10px] text-violet-700">{bodyLabel} — this helps your coach set the right load. It does not change your readiness colour.</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[10px] font-medium text-slate-600">
          {painLabel} (0–10)
          {vasSelect(pain, setPain)}
        </label>
        <label className="text-[10px] font-medium text-slate-600">
          Morning stiffness (0–10)
          {vasSelect(stiffness, setStiffness)}
        </label>
      </div>
      <input
        value={note}
        onChange={(e) => { setNote(e.target.value); setSaved(false); }}
        placeholder="Note (optional)"
        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px]"
      />
      <button
        type="button"
        onClick={save}
        disabled={busy || (pain === null && stiffness === null && !note)}
        className="mt-2 w-full rounded-md bg-[#1c7a4a] py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : saved ? "Saved ✓ — update" : "Save today's check-in"}
      </button>
    </div>
  );
}

export default function PlayerRecoveryAssignmentsCard() {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  // The phase/section opened in the readable pop-up (null = closed).
  const [modal, setModal] = useState<{ protocolTitle: string; index: number; total: number; section: RecoverySection } | null>(null);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/player/recovery-assignments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; assignments: Assignment[] };
      setAssignments(json.assignments);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const complete = async (id: string) => {
    setCompleting(id);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      await fetch(`/api/player/recovery-assignments/${id}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchAssignments();
    } finally {
      setCompleting(null);
    }
  };

  if (loading || !assignments) return null;
  const pending = assignments.filter((a) => !a.completed_at);
  if (pending.length === 0) return null;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-violet-900">Recovery routines for you</div>
          <div className="text-[11px] text-violet-700">
            {pending.length} routine{pending.length === 1 ? "" : "s"} assigned · tap to expand
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {pending.map((a) => {
          const p = a.protocol;
          if (!p) return null;
          const isOpen = openId === a.id;
          return (
            <div key={a.id} className="rounded-md border border-violet-200 bg-white">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : a.id)}
                className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-slate-50"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${categoryClass(
                        p.category,
                      )}`}
                    >
                      {CATEGORY_LABELS[p.category]}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${evidenceClass(
                        p.evidence_tier,
                      )}`}
                    >
                      {EVIDENCE_LABELS[p.evidence_tier]}
                    </span>
                    <span className="text-[10px] text-slate-500">{p.duration_min} min</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{p.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-600">{p.goal}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    Due: {formatDueLabel(a.due_at)}
                    {a.trigger_reason === "auto_match_load" && " · auto-assigned (high match load)"}
                    {a.trigger_reason === "auto_md_plus_1" && " · auto-assigned (MD+1 morning)"}
                    {a.trigger_reason === "manual_coach" && " · assigned by your coach"}
                  </div>
                </div>
                <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-3 py-2 text-xs">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Tap a phase to open it full-size</div>
                  <div className="space-y-1.5">
                    {p.sections.map((sec, si) => (
                      <button
                        key={si}
                        type="button"
                        onClick={() => setModal({ protocolTitle: p.title, index: si, total: p.sections.length, section: sec })}
                        className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-violet-300 hover:bg-violet-50"
                      >
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-slate-900">{si + 1}. {sec.title}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">{sec.drills.length} exercise{sec.drills.length === 1 ? "" : "s"} · {sec.duration_min} min</span>
                        </span>
                        <span className="text-lg text-violet-500">›</span>
                      </button>
                    ))}
                  </div>

                  {p.slug === "jumpers_knee_staged_loading" && (
                    <TendonCheckin region="patellar" painLabel="Single-leg decline-squat pain" bodyLabel="How the knee feels today" />
                  )}
                  {p.slug === "achilles_tendinopathy_staged_loading" && (
                    <TendonCheckin region="achilles" painLabel="Single-leg heel-raise pain" bodyLabel="How the Achilles feels today" />
                  )}

                  <button
                    type="button"
                    onClick={() => complete(a.id)}
                    disabled={completing === a.id}
                    className="mt-2 w-full rounded-md bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {completing === a.id ? "Saving…" : "Mark complete"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-violet-600">
                  {modal.protocolTitle} · {modal.index + 1}/{modal.total}
                </div>
                <h3 className="mt-0.5 text-lg font-bold text-slate-900">{modal.section.title}</h3>
                <div className="mt-0.5 text-xs text-slate-500">{modal.section.duration_min} min</div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close"
                className="-mr-1 -mt-1 rounded-full p-2 text-2xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">{modal.section.description}</p>

            <ul className="mt-4 space-y-3">
              {modal.section.drills.map((d, di) => (
                <li key={di} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-semibold text-slate-900">{d.name}</span>
                    <span className="shrink-0 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{d.reps_or_time}</span>
                  </div>
                  {d.cues.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
                      {d.cues.map((c, ci) => (
                        <li key={ci}>{c}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setModal(null)}
              className="mt-5 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
