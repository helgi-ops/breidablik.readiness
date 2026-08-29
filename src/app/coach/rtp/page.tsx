"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import PagePurpose from "@/components/coach/PagePurpose";

type Player = { id: string; full_name: string; position: string | null };

export default function ForcePlateAssessmentIndex() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setError("Not signed in."); setLoading(false); return; }
        const { data: prof } = await sb.from("profiles").select("team_id").eq("id", session.user.id).maybeSingle();
        const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
        if (!teamId) { setError("Not linked to a team."); setLoading(false); return; }
        const { data: roster } = await sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true).order("full_name");
        if (alive) setPlayers((roster ?? []) as Player[]);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? players.filter((p) => p.full_name.toLowerCase().includes(s)) : players;
  }, [players, q]);

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <h1 className="text-xl font-bold tracking-tight text-zinc-900">VALD Assessment</h1>
      <PagePurpose
        en="turn a player's VALD tests — ForceDecks jump, NordBord hamstring, ForceFrame groin — into one readiness picture: verdict, why, then the numbers"
        is="breyta VALD prófum leikmanns — ForceDecks stökk, NordBord hamstring, ForceFrame nára — í eina readiness-mynd: niðurstaða, af hverju, svo tölurnar"
        tutorial="force-plate-assessment"
      />
      <p className="mt-1 text-sm text-zinc-500">Pick a player to open their VALD assessment — ForceDecks (jump), NordBord (hamstring) &amp; ForceFrame (groin), plus return-to-play when injured.</p>

      {/* Reference: which objective tests to run for which injury (RTP). */}
      <Link
        href="/coach/rtp/testing-guide"
        className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-violet-400 hover:bg-violet-50/40"
      >
        <span className="min-w-0">
          <span className="text-sm font-medium text-zinc-900">Which tests for which injury? · Hvaða próf við hvaða meiðsli?</span>
          <span className="mt-0.5 block text-xs text-zinc-500">RTP testing guide — VALD device batteries + criteria per injury, printable to PDF.</span>
        </span>
        <span className="ml-3 shrink-0 text-zinc-300" aria-hidden>→</span>
      </Link>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search player…"
        className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />

      {loading ? (
        <div className="mt-4 text-sm text-zinc-500">Loading roster…</div>
      ) : error ? (
        <div className="mt-4 text-sm text-red-600">{error}</div>
      ) : (
        <div className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-zinc-400">No players.</div>
          ) : filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/coach/rtp/${p.id}`)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50"
            >
              <span className="text-sm font-medium text-zinc-900">{p.full_name}</span>
              <span className="text-xs text-zinc-400">{p.position ?? ""} →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
