"use client";

/**
 * RemoveClientButton — removes a client from the trainer's active roster by
 * deactivating them (soft, reversible: data is kept, they can be reactivated).
 * Two-step confirm so it can't be hit by accident. Never hard-deletes.
 */

import { useCallback, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function RemoveClientButton({
  clientId, clientName, lang, onRemoved,
}: { clientId: string; clientName: string; lang: "EN" | "IS"; onRemoved: () => void }) {
  const is = lang === "IS";
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const remove = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/trainer/client/${clientId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ active: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setConfirming(false);
      onRemoved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy(false); }
  }, [clientId, onRemoved]);

  if (!confirming) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="text-[11px] text-slate-500">
          {is ? "Fjarlægja úr þjálfunarlistanum (gögn varðveitt, hægt að endurvirkja)." : "Remove from the roster (data kept, can be reactivated)."}
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
        >
          {is ? "Fjarlægja" : "Remove"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
      <div className="text-[12px] font-medium text-red-800">
        {is ? `Fjarlægja ${clientName} úr listanum?` : `Remove ${clientName} from the roster?`}
      </div>
      <div className="mt-0.5 text-[10px] text-red-600">
        {is ? "Þeir hverfa úr listanum og hætta að fá áminningar. Gögnin haldast og þú getur endurvirkjað." : "They drop off the list and stop getting reminders. Their data is kept and you can reactivate them."}
      </div>
      {err && <div className="mt-1 text-[10px] text-red-700">{err}</div>}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={remove}
          className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
          {busy ? "…" : (is ? "Já, fjarlægja" : "Yes, remove")}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-white disabled:opacity-50">
          {is ? "Hætta við" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
