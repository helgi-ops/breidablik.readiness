"use client";

/**
 * PtClientGuard — bounces PT clients off the football team/player surface.
 *
 * A PT client (player role on a team_type='personal_trainer' team) should only
 * ever see the /client PWA. The post-login router already sends them there, but
 * nothing stopped a typed URL, browser history, or a stale PWA start_url from
 * landing them on /team or /player — where they'd get a full football nav.
 * Mount this at the top of those entry points; it redirects PT clients to
 * /client and renders nothing.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PtClientGuard() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, team_id")
          .eq("id", user.id)
          .maybeSingle();
        const p = profile as { role?: string | null; team_id?: string | null } | null;
        if (String(p?.role ?? "").toLowerCase() !== "player" || !p?.team_id) return;
        const { data: team } = await supabase
          .from("teams")
          .select("team_type")
          .eq("id", p.team_id)
          .maybeSingle();
        const isPtClient = String((team as { team_type?: string | null } | null)?.team_type ?? "").toLowerCase() === "personal_trainer";
        if (active && isPtClient) router.replace("/client");
      } catch { /* fail open — guard is best-effort */ }
    })();
    return () => { active = false; };
  }, [router]);
  return null;
}
