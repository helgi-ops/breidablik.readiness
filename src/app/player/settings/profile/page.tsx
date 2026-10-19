"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

/**
 * Player self-service: fix your OWN name (a misspelling). Writes only the name fields via
 * /api/player/profile (server-side, self-scoped) — a player can't change their team/status/position.
 */
export default function PlayerProfileSettingsPage() {
  const router = useRouter();
  const [lang] = useLang();
  const is = lang === "IS";

  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/player");
  }, [router]);

  const token = useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await token();
        if (!t) return;
        const res = await fetch("/api/player/profile", { headers: { Authorization: `Bearer ${t}` } });
        const j = await res.json().catch(() => null);
        if (alive && j?.ok) setFullName(j.full_name ?? "");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const save = useCallback(async () => {
    const fn = fullName.trim();
    if (!fn) { setMsg({ ok: false, text: is ? "Nafn má ekki vera tómt" : "Name can't be empty" }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const t = await token();
      if (!t) { setMsg({ ok: false, text: is ? "Ekki innskráður" : "Not signed in" }); return; }
      const res = await fetch("/api/player/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ full_name: fn }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) setMsg({ ok: true, text: is ? "Vistað ✓" : "Saved ✓" });
      else setMsg({ ok: false, text: j?.error ?? (is ? "Villa við að vista" : "Error saving") });
    } finally {
      setSaving(false);
    }
  }, [fullName, is, token]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-10">
      <div
        className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-[var(--surface,#f4f2ec)]/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label={is ? "Til baka" : "Back to app"}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
        >
          <span aria-hidden className="text-base leading-none">←</span> {is ? "Til baka" : "Back"}
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{is ? "Stillingar leikmanns" : "Player settings"}</div>
        <h1 className="mt-1 text-xl font-semibold text-zinc-950">{is ? "Nafnið mitt" : "My name"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {is ? "Lagaðu ranga stafsetningu á nafninu þínu. Lið og staða eru á forræði þjálfara." : "Fix a misspelling of your name. Your team and position stay with the coach."}
        </p>

        {loading ? (
          <div className="mt-5 text-sm text-zinc-400">{is ? "Hleð…" : "Loading…"}</div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">{is ? "Fullt nafn" : "Full name"}</label>
              <input
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setMsg(null); }}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            {msg && (
              <div className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</div>
            )}
            <button
              onClick={save}
              disabled={saving || !fullName.trim()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "#005a2b" }}
            >
              {saving ? (is ? "Vista…" : "Saving…") : (is ? "Vista" : "Save")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
