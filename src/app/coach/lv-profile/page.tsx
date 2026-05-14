"use client";

/**
 * /coach/lv-profile
 *
 * Load-Velocity Profile data-entry page for team coaches (sits under
 * "Strength Planning" in the sidebar). Wraps the same LvProfilePanel that
 * the personal-trainer side uses, but feeds it the team's players instead
 * of a trainer's clients.
 *
 * Gating model:
 *   - Per-team availability is implicit in sidebar visibility / pricing.
 *   - Per-player toggle uses trainer_client_addons (addon_key='lv_profile').
 *     For a team coach, the coach is the "trainer" — flicking the toggle on
 *     for a player is the same gesture as the PT side. Keeps one schema.
 *
 * Underlying maths + API are shared with PT. See:
 *   src/lib/lvProfile/index.ts                (regression + DSI)
 *   src/app/api/trainer/lv-profile/route.ts   (GET/POST/DELETE)
 *   src/components/trainer/LvProfilePanel.tsx (UI)
 */

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import LvProfilePanel from "@/components/trainer/LvProfilePanel";

type Player = { id: string; name: string };

export default function CoachLvProfilePage() {
  const [lang] = useLang();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) {
          setError(lang === "IS" ? "Ekki innskráð(ur)" : "Not signed in");
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("team_id, role")
          .eq("id", userId)
          .maybeSingle();
        const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        if (!teamId) {
          setError(lang === "IS" ? "Þú ert ekki tengd(ur) við lið." : "Not linked to a team.");
          return;
        }
        const { data: rows, error: pErr } = await supabase
          .from("players")
          .select("id, full_name")
          .eq("team_id", teamId)
          .order("full_name", { ascending: true });
        if (pErr) throw pErr;
        setPlayers(((rows ?? []) as Array<{ id: string; full_name: string }>).map((r) => ({
          id: r.id,
          name: r.full_name,
        })));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [lang]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Kraft-/hraðapróf (Load-Velocity Profile)" : "Load-Velocity Profile"}
        </h1>
        <p className="text-sm text-slate-600">
          {lang === "IS"
            ? "Skráðu rampa-próf (3–5 mælingar) til að spá fyrir um 1RM, V₀ og styrk-/hraðamerki. Byggt á González-Badillo 2010 og Banyard 2017."
            : "Log a ramp test (3–5 datapoints) to predict 1RM, V₀, and strength/velocity bias. Based on González-Badillo 2010 + Banyard 2017."}
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : (
        <LvProfilePanel clients={players} lang={lang === "EN" ? "EN" : "IS"} />
      )}
    </div>
  );
}
