// src/app/team/layout.tsx
//
// Server component: defense-in-depth so PT clients never even receive the
// football team surface. The client-side PtClientGuard already redirects them,
// but this runs first — before any HTML is sent — for typed URLs / stale PWA
// start_urls. Only /team is guarded server-side; /player can't be, because PT
// clients legitimately use /player/checkin (the readiness flow).
//
// Note: redirect() works by throwing NEXT_REDIRECT, so it MUST live outside the
// try/catch — otherwise the catch would swallow the redirect. The DB lookup is
// fail-open: an auth hiccup never blocks legit coaches or football players.
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  let isPtClient = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, team_id")
        .eq("id", user.id)
        .maybeSingle();
      const p = profile as { role?: string | null; team_id?: string | null } | null;
      if (String(p?.role ?? "").toLowerCase() === "player" && p?.team_id) {
        const { data: team } = await supabase
          .from("teams")
          .select("team_type")
          .eq("id", p.team_id)
          .maybeSingle();
        isPtClient = String((team as { team_type?: string | null } | null)?.team_type ?? "").toLowerCase() === "personal_trainer";
      }
    }
  } catch {
    // fail open — never block legit football players on an auth hiccup
  }

  if (isPtClient) redirect("/client");
  return <>{children}</>;
}
