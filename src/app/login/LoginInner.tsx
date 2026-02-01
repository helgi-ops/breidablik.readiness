"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "signin" | "signup" | "reset";

export default function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = sp.get("next") || "/player/checkin"; // eða "/coach" ef þú vilt defaulta í coach
  const [mode, setMode] = useState<Mode>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        router.replace(next);
        router.refresh();
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: "player",
            },
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
                : undefined,
          },
        });
        if (error) throw error;

        if (!data.session) {
          setMsg("Athugaðu póstinn þinn til að staðfesta aðganginn og klára innskráningu.");
        } else {
          router.replace(next);
          router.refresh();
        }
        return;
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/reset-password`
              : undefined,
        });
        if (error) throw error;

        setMsg("Við sendum þér tölvupóst með hlekk til að endurstilla lykilorð.");
        return;
      }
    } catch (e: any) {
      setErr(e?.message ?? "Óvænt villa.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {mode === "signin" ? "Innskráning" : mode === "signup" ? "Nýskráning" : "Endurstilla lykilorð"}
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {mode === "signin" && "Skráðu þig inn til að gera daily check-in."}
        {mode === "signup" && "Búðu til aðgang með email og lykilorði."}
        {mode === "reset" && "Sláðu inn email og við sendum endurstillingarhlekk."}
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        {mode === "signup" && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Fullt nafn</span>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Fullt nafn"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
            />
          </label>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nafn@domain.com"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>

        {mode !== "reset" && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Lykilorð</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              minLength={6}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
            />
            <small style={{ opacity: 0.7 }}>A.m.k. 6 stafir.</small>
          </label>
        )}

        {err && (
          <div style={{ background: "#ffecec", border: "1px solid #ffb3b3", padding: 10, borderRadius: 8 }}>
            {err}
          </div>
        )}
        {msg && (
          <div style={{ background: "#eef7ff", border: "1px solid #b3d9ff", padding: 10, borderRadius: 8 }}>
            {msg}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "black",
            color: "white",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading
            ? "Vinn..."
            : mode === "signin"
            ? "Skrá inn"
            : mode === "signup"
            ? "Búa til aðgang"
            : "Senda endurstillingu"}
        </button>
      </form>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {mode !== "signin" && (
          <button
            onClick={() => {
              setMode("signin");
              setErr(null);
              setMsg(null);
            }}
            style={{ background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer" }}
          >
            Ég á aðgang → Innskráning
          </button>
        )}

        {mode !== "signup" && (
          <button
            onClick={() => {
              setMode("signup");
              setErr(null);
              setMsg(null);
            }}
            style={{ background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer" }}
          >
            Nýr notandi → Búa til aðgang
          </button>
        )}

        {mode !== "reset" && (
          <button
            onClick={() => {
              setMode("reset");
              setErr(null);
              setMsg(null);
              setPassword("");
            }}
            style={{ background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer" }}
          >
            Gleymt lykilorð?
          </button>
        )}
      </div>
    </div>
  );
}
