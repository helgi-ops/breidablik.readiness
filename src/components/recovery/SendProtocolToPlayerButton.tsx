"use client";

/**
 * SendProtocolToPlayerButton
 *
 * A direct "send THIS protocol to a player" control for a single-protocol
 * reference page (e.g. /coach/hamstring-rehab) — the coach is already looking at
 * the protocol, so unlike CoachAssignProtocolButton (which lists the whole
 * library to pick from) this sends a FIXED slug. Self-contained: resolves the
 * coach's team + active players itself. Assigns via the same
 * /api/coach/player/[id]/assign-recovery route, so the player receives it on
 * /player/recovery-protocols exactly as any other recovery assignment.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type PlayerOption = { id: string; full_name: string | null };

export default function SendProtocolToPlayerButton({
  slug,
  lang = "IS",
  buttonLabel,
}: {
  slug: string;
  lang?: "IS" | "EN";
  buttonLabel?: string;
}) {
  const isIS = lang === "IS";
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState<PlayerOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open || players !== null) return;
    (async () => {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setPlayers([]); return; }
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = (prof as { team_id?: string | null } | null)?.team_id ?? null;
      if (!tid) { setPlayers([]); return; }
      const { data } = await sb
        .from("players").select("id, full_name")
        .eq("team_id", tid).eq("is_active", true).order("full_name");
      setPlayers((data ?? []) as PlayerOption[]);
    })();
  }, [open, players]);

  const send = async () => {
    if (!selected) return;
    setBusy(true); setFeedback(null);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const res = await fetch(`/api/coach/player/${selected}/assign-recovery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ protocolSlug: slug }),
      });
      const json = (await res.json()) as { ok?: boolean; created?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setFeedback(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setFeedback(json.created ? (isIS ? "Sent ✓" : "Sent ✓") : (isIS ? "Þegar sent í dag" : "Already sent today"));
    } catch {
      setFeedback(isIS ? "Gat ekki sent" : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
      >
        {buttonLabel ?? (isIS ? "Senda á leikmann" : "Send to a player")}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            {isIS ? "Veldu leikmann" : "Pick a player"}
          </div>
          {players === null ? (
            <div className="py-2 text-slate-500">{isIS ? "Sæki…" : "Loading…"}</div>
          ) : players.length === 0 ? (
            <div className="py-2 text-slate-500">{isIS ? "Engir leikmenn" : "No players"}</div>
          ) : (
            <>
              <select
                value={selected}
                onChange={(e) => { setSelected(e.target.value); setFeedback(null); }}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">{isIS ? "Veldu…" : "Select…"}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={send}
                disabled={!selected || busy}
                className="mt-2 w-full rounded-md bg-[#1c7a4a] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? (isIS ? "Sendi…" : "Sending…") : (isIS ? "Senda" : "Send")}
              </button>
            </>
          )}
          {feedback && <div className="mt-1.5 text-[12px] text-slate-600">{feedback}</div>}
        </div>
      )}
    </div>
  );
}
