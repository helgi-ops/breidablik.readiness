"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

  const playerIdFromProfile = (profile as any)?.player_id as string | null;
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

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (profErr) return setError(profErr.message);

      const role = (profile?.role ?? "").toLowerCase();

      const isCoachLike = role === "coach" || role === "admin" || role === "staff";

      if (next) {
        if (isCoachLike && next.startsWith("/coach")) return router.replace(next);
        if (isCoachLike && next.startsWith("/team")) return router.replace(next);
        if (role === "player" && (next.startsWith("/player") || next.startsWith("/team")))
          return router.replace(next);
      }

      if (isCoachLike) return router.replace("/coach");

      if (role === "player") {
        // Check-in done → team page, not done → checkin first
        const done = await isCheckinDone(user.id);
        if (!mounted) return;
        return router.replace(done ? "/team" : "/player/checkin");
      }

      setError("Óþekkt role í profiles. Á að vera coach eða player.");
    }

    go();
    return () => {
      mounted = false;
    };
  }, [router, next]);

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Staðfesti aðgang…</h1>
      <p style={{ opacity: 0.8 }}>Tek þig á rétt svæði.</p>

      {error ? (
        <div style={{ marginTop: 12, background: "#ffecec", border: "1px solid #ffb3b3", padding: 10, borderRadius: 8 }}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => router.replace("/login")}
              style={{ background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer" }}
            >
              Til baka í innskráningu
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
