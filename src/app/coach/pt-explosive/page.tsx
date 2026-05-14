"use client";

/**
 * /coach/pt-explosive
 *
 * 12-week Explosive Power Programme browser + per-client assignment surface.
 * MicroPulse super-admin tool — visible to Helgi only (eigandi síðunnar).
 *
 * Two variants are available from the same panel:
 *   - phase_based       — 4-phase PUSH/PULL block (Suchomel 2018 block
 *                         periodisation + Cormier 2020 contrast)
 *   - research_3_4day   — 3-4 day/week split (Suchomel 2018 + DeWeese 2015
 *                         sequencing; Beg 3d, Int/Adv 4d)
 *
 * Daily Green/Yellow/Red readiness sub-columns adapt every prescribed set
 * to the player's wellness score on the day (Foster 1998 monotony,
 * Pareja-Blanco 2017 velocity-loss thresholds).
 *
 * Access model:
 *   - Coach with role='admin' (Helgi) — full library + assignment surface
 *   - Anyone else — redirected to /coach (they should never see this in
 *     the sidebar in the first place, but the route is publicly addressable
 *     so we enforce server-side too)
 *
 * Underlying API: /api/coach/pt-explosive (GET library, POST/PATCH/DELETE
 * assignments). Backed by pt_explosive_programmes + _assignments tables.
 *
 * Players list is the coach's current team — same pattern as /coach/lv-profile.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ExplosivePowerPanel from "@/components/trainer/ExplosivePowerPanel";

type Player = { id: string; name: string };

export default function PtExplosivePage() {
  const router = useRouter();
  const [lang] = useLang();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) {
          setError(lang === "IS" ? "Ekki innskráð(ur)" : "Not signed in");
          setAllowed(false);
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("team_id, role")
          .eq("id", userId)
          .maybeSingle();
        const role = String((prof as { role?: string } | null)?.role ?? "").toLowerCase();
        const isAdmin = role === "admin";
        if (!isAdmin) {
          // Hard gate — admin-only surface. Bounce back to dashboard.
          setAllowed(false);
          router.replace("/coach");
          return;
        }
        setAllowed(true);
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
  }, [lang, router]);

  if (allowed === false) {
    // Mid-redirect — render nothing rather than flash the panel.
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Sprengikraftur — 12 vikur" : "Explosive Power — 12 weeks"}
        </h1>
        <p className="text-sm text-slate-600">
          {lang === "IS"
            ? "Tvö 12-vikna kerfi (4-fasa PUSH/PULL og 3–4 daga/viku rannsóknarmiðað). Daglegt græn/gul/rauð aðlögun byggð á Foster 1998 og Pareja-Blanco 2017."
            : "Two 12-week programmes (phase-based PUSH/PULL + 3–4 day/week research-based). Daily Green/Yellow/Red adaptation built on Foster 1998 + Pareja-Blanco 2017."}
        </p>
        <p className="text-xs text-slate-500">
          {lang === "IS"
            ? "Aðeins sýnilegt fyrir MicroPulse admin (eigandi síðunnar)."
            : "Visible only to MicroPulse admins (site owner)."}
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : allowed ? (
        <ExplosivePowerPanel clients={players} lang={lang === "EN" ? "EN" : "IS"} />
      ) : null}
    </div>
  );
}
