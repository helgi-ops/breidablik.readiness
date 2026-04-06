"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

      if (next) {
        if (role === "coach" && next.startsWith("/coach")) return router.replace(next);
        if (role === "player" && next.startsWith("/player")) return router.replace(next);
      }

      if (role === "coach") return router.replace("/coach");
      if (role === "player") return router.replace("/player/checkin");

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
