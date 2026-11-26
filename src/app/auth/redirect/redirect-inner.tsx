"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { inviteReturnPath } from "@/lib/auth/inviteReturn";

const COPY = {
  EN: {
    title: "Signing you in…",
    body: "Taking you to the right place.",
    back: "Back to sign in",
    unknownRole: "This account has no known role. Contact your coach or support.",
  },
  IS: {
    title: "Staðfesti aðgang…",
    body: "Tek þig á rétt svæði.",
    back: "Til baka í innskráningu",
    unknownRole: "Óþekkt role í profiles. Á að vera coach, player eða stjórnandi.",
  },
} as const;

function utcYYYYMMDD(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function isCheckinDone(userId: string): Promise<boolean> {
  const today = utcYYYYMMDD();

  const { data: profile } = await supabase
    .from("profiles")
    .select("player_id")
    .eq("id", userId)
    .maybeSingle();

  const playerIdFromProfile = (profile as { player_id?: string | null } | null)?.player_id ?? null;
  const candidatePlayerIds = [playerIdFromProfile, userId].filter(Boolean) as string[];

  for (const pid of candidatePlayerIds) {
    // Check readiness_entries directly — the view doesn't have individual metric columns
    const { data, error } = await supabase
      .from("readiness_entries")
      .select("id")
      .eq("player_id", pid)
      .eq("entry_date", today)
      .maybeSingle();

    if (!error && data?.id) return true;
  }

  return false;
}

export default function RedirectInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "";
  const [lang] = useLang();
  const t = COPY[lang];
  const unknownRole = t.unknownRole;

  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function go() {
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userErr) return setError(userErr.message);
      if (!user) return router.replace("/login");

      // Came from an invitation link: finish it there, whatever the role.
      const invite = inviteReturnPath(next);
      if (invite) return router.replace(invite);

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role, team_id")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (profErr) return setError(profErr.message);

      const role = (profile?.role ?? "").toLowerCase();

      const isCoachLike = role === "coach" || role === "admin" || role === "staff";

      // PT clients (player role on a team_type='personal_trainer' team) get the
      // /client PWA surface, NOT /player. The football team UI is irrelevant
      // to them — no readiness check-in flow, no team-wide tactical pages.
      let isPtClient = false;
      if (role === "player" && profile?.team_id) {
        const { data: team } = await supabase
          .from("teams")
          .select("team_type")
          .eq("id", profile.team_id)
          .maybeSingle();
        isPtClient = String((team as { team_type?: string | null } | null)?.team_type ?? "").toLowerCase() === "personal_trainer";
      }

      if (next) {
        if (isCoachLike && next.startsWith("/coach")) return router.replace(next);
        if (isCoachLike && next.startsWith("/team")) return router.replace(next);
        if (role === "exec" && next.startsWith("/exec")) return router.replace(next);
        if (isPtClient && next.startsWith("/client")) return router.replace(next);
        if (role === "player" && !isPtClient && (next.startsWith("/player") || next.startsWith("/team")))
          return router.replace(next);
      }

      if (isCoachLike) return router.replace("/coach");

      // EXEC (management/GM) — read-only club status surface.
      if (role === "exec") return router.replace("/exec");

      if (isPtClient) return router.replace("/client");

      if (role === "player") {
        // Check-in done → the player's own "Today" page, not done → checkin first.
        // (The /team football page is not the player's home — Today is.)
        const done = await isCheckinDone(user.id);
        if (!mounted) return;
        return router.replace(done ? "/player" : "/player/checkin");
      }

      setError(unknownRole);
    }

    go();
    return () => {
      mounted = false;
    };
  }, [router, next, unknownRole]);

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t.title}</h1>
      <p style={{ opacity: 0.8 }}>{t.body}</p>

      {error ? (
        <div style={{ marginTop: 12, background: "#f8e9e3", border: "1px solid #e6b6a6", padding: 10, borderRadius: 8 }}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => router.replace("/login")}
              style={{ background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer" }}
            >
              {t.back}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
