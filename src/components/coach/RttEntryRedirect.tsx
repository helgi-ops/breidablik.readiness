"use client";

/**
 * RttEntryRedirect — the /coach/return-to-training entry. There is no landing
 * page: it sends the coach straight to the first injured player's plan and lets
 * them switch with the in-page picker. If no one is injured, it shows the picker
 * so any player can still be opened.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import RttPlayerPicker from "./RttPlayerPicker";

type Resp = { injured: Array<{ player_id: string }>; roster: Array<{ id: string; name: string }>; error?: string };

export default function RttEntryRedirect() {
  const [lang] = useLang();
  const is = lang === "IS";
  const router = useRouter();
  const [state, setState] = useState<"loading" | "empty" | "error">("loading");
  const [msg, setMsg] = useState<string | null>(null);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/coach/return-to-training", { headers: { Authorization: `Bearer ${await token()}` } });
        const j = (await res.json()) as Resp;
        if (!res.ok) { setMsg(j.error ?? "Failed"); setState("error"); return; }
        if (j.injured?.length) { router.replace(`/coach/return-to-training/${j.injured[0].player_id}`); return; }
        setState("empty");
      } catch (e) { setMsg(e instanceof Error ? e.message : "Network error"); setState("error"); }
    })();
  }, [router, token]);

  if (state === "error") return <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg ?? "No data"}</div></div>;

  if (state === "empty") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-bold text-slate-900">{is ? "Aftur í æfingar" : "Return-to-training"}</h1>
        <p className="mt-1 text-sm text-slate-500">{is ? "Engir skráðir meiðsli á liðinu núna. Veldu leikmann til að skoða álagssögu og byggja upp endurkomu-áætlun." : "No recorded injuries on the squad right now. Pick a player to see their load history and build a return-to-training plan."}</p>
        <div className="mt-3"><RttPlayerPicker defaultOpen /></div>
      </div>
    );
  }

  return <div className="p-6 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>;
}
