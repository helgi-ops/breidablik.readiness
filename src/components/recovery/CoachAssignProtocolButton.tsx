"use client";

/**
 * CoachAssignProtocolButton
 *
 * Compact button + popover for a coach to manually assign a recovery protocol
 * to a player. Drops onto Decel Intelligence player rows, Decision Summary
 * cards, etc. Pre-loads the active protocol library so selection is instant.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  EVIDENCE_LABELS,
  type RecoveryProtocol,
} from "@/lib/recovery/types";

export default function CoachAssignProtocolButton({
  playerId,
  className,
}: {
  playerId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [protocols, setProtocols] = useState<RecoveryProtocol[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open || protocols !== null) return;
    (async () => {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/recovery-protocols", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; protocols: RecoveryProtocol[] };
      setProtocols(json.protocols);
    })();
  }, [open, protocols]);

  const assign = async (slug: string) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setFeedback("Not signed in");
        return;
      }
      const res = await fetch(`/api/coach/player/${playerId}/assign-recovery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ protocolSlug: slug }),
      });
      const json = (await res.json()) as { ok?: boolean; created?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setFeedback(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setFeedback(json.created ? "Assigned ✓" : "Already assigned today");
      setTimeout(() => setOpen(false), 1100);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
      >
        + Assign recovery
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg">
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Pick a protocol
          </div>
          {protocols === null ? (
            <div className="px-1 py-2 text-slate-500">Loading…</div>
          ) : protocols.length === 0 ? (
            <div className="px-1 py-2 text-slate-500">No protocols available.</div>
          ) : (
            <ul className="space-y-0.5">
              {protocols.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => assign(p.slug)}
                    disabled={submitting}
                    className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {CATEGORY_LABELS[p.category]} · {p.duration_min} min · {EVIDENCE_LABELS[p.evidence_tier]}
                    </span>
                    <span className="text-xs font-semibold text-slate-900">{p.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {feedback && (
            <div className="mt-1 px-2 py-1 text-[10px] text-slate-600">{feedback}</div>
          )}
        </div>
      )}
    </div>
  );
}
