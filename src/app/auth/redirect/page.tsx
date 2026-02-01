"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthRedirectPage() {
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

      if (userErr) {
        setError(userErr.message);
        return;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      // ✅ Mikilvægt: profiles.id = auth.users.id (hjá þér)
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (profErr) {
        setError(profErr.message);
        return;
      }

      const role = (profile?.role ?? "").toLowerCase();

      // Ef þú sendir next með query, leyfum við það,
      // EN tryggjum að það passi við role.
      if (next) {
        if (role === "coach" && next.startsWith("/coach")) {
          router.replace(next);
          return;
        }
        if (role === "player" && next.startsWith("/player")) {
          router.replace(next);
          return;
        }
        // ef next er "vitlaust" miðað við role -> ignore
      }

      if (role === "coach") {
        router.replace("/coach");
        return;
      }

      if (role === "player") {
        router.replace("/player/checkin");
        return;
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
