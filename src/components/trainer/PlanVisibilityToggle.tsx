"use client";

/**
 * PlanVisibilityToggle — lets the coach choose whether THIS client can see
 * their full programme overview in the player app. Default off (autoregulation
 * friendly). Small inline control for the trainer dashboard client row.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function PlanVisibilityToggle({ clientId, lang }: { clientId: string; lang: "EN" | "IS" }) {
  const is = lang === "IS";
  const [visible, setVisible] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const authHeader = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/player/${clientId}/plan-visibility`, { headers: await authHeader() });
      const j = await res.json();
      setVisible(res.ok ? !!j.visible : false);
    } catch { setVisible(false); }
  }, [clientId, authHeader]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async () => {
    if (visible == null) return;
    const next = !visible;
    setBusy(true);
    try {
      const res = await fetch(`/api/coach/player/${clientId}/plan-visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ visible: next }),
      });
      if (res.ok) setVisible(next);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  if (visible == null) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div>
        <div className="text-xs font-semibold text-slate-700">{is ? "Sýna viðskiptavini æfingakerfið" : "Show programme to client"}</div>
        <div className="text-[11px] text-slate-500">{is ? "Yfirlit (vikur/æfingar) í appinu hans — ekki álag." : "Overview (weeks/sessions) in their app — not loads."}</div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        role="switch"
        aria-checked={visible}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${visible ? "bg-emerald-500" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${visible ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
