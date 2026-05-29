"use client";

/**
 * /client/chat — coach ↔ client messages, rendered inline inside the PT shell
 * (keeps the bottom nav). Uses the shared ChatThread; no redirect to /player.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ChatThread from "@/components/chat/ChatThread";

function todayIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function ClientChatPage() {
  const [lang] = useLang();
  const [player, setPlayer] = useState<{ id: string; name: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("players")
          .select("id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (alive && data) {
          setPlayer({ id: (data as { id: string }).id, name: (data as { full_name: string | null }).full_name ?? (lang === "IS" ? "Iðkandi" : "Athlete") });
        }
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [lang]);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Spjall við þjálfara" : "Chat with trainer"}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lang === "IS"
            ? "Hröð skilaboð, spurningar um æfingar, dagsetningar."
            : "Quick messages, exercise questions, scheduling."}
        </div>
      </div>

      {!loaded ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : player ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <ChatThread
            playerId={player.id}
            playerName={player.name}
            entryDate={todayIso()}
            viewerRole="player"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {lang === "IS" ? "Ekki tókst að hlaða spjalli." : "Couldn't load the chat."}
        </div>
      )}
    </div>
  );
}
