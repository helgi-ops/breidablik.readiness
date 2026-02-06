"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "signin" | "signup" | "reset";
type TeamRow = { id: string; name: string };

function utcYYYYMMDD(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function extractCheckinDone(row: any): boolean {
  if (!row) return false;

  // Algeng boolean nöfn (mismunandi útgáfur af viewum)
  const boolDone =
    row.checkin_done ??
    row.did_checkin ??
    row.checked_in ??
    row.is_checked_in ??
    row.has_checkin ??
    row.done ??
    null;

  if (typeof boolDone === "boolean") return boolDone;

  // Ef enginn boolean reitur: infer-a út frá því að metrics/score eru til
  const hasAnyMetric =
    row.total_score != null ||
    row.readiness != null ||
    row.sleep != null ||
    row.soreness != null ||
    row.stress != null ||
    row.fatigue != null;

  return Boolean(hasAnyMetric);
}

/**
 * Reglan:
 * - ef EKKI búinn með check-in í dag -> /player/checkin
 * - ef búinn -> /player
 *
 * Lykilatriði:
 * - nota UTC dagsetningu (view oft reiknað í UTC)
 * - nota profiles.player_id ef viewið er tengt við players.id
 */
async function getPlayerLandingPath(): Promise<"/player" | "/player/checkin"> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return "/player/checkin";

  const today = utcYYYYMMDD();

  // 1) Ná í profile til að fá player_id (ef til)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, player_id")
    .eq("id", userId)
    .maybeSingle();

  // Ef þetta er ekki PLAYER þá látum við ekki þessa reglu stjórna (en safe)
  const role = (profile as any)?.role ?? null;
  if (role && role !== "PLAYER") {
    // coach/admin etc. -> fer ekki í checkin flow
    return "/player";
  }

  const playerIdFromProfile = (profile as any)?.player_id as string | null;

  // Við prófum í þessari röð:
  // A) viewið notar players.id -> profile.player_id
  // B) viewið notar auth uid -> userId
  const candidatePlayerIds = [
    playerIdFromProfile,
    userId,
  ].filter(Boolean) as string[];

  for (const pid of candidatePlayerIds) {
    const { data, error } = await supabase
      .from("v_player_daily_decision_v3")
      .select("*")
      .eq("player_id", pid)
      .eq("day_date", today)
      .maybeSingle();

    if (!error) {
      const done = extractCheckinDone(data);
      return done ? "/player" : "/player/checkin";
    }
  }

  // Ef viewið skilar ekki línu (eða mismatch), þá defaultum við í checkin (öruggt)
  return "/player/checkin";
}

export default function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();

  // ✅ default: fara í checkin-flow (svo við “uppfærum” í /player ef búið)
  const next = sp.get("next") || "/player/checkin";

  // ✅ team id úr querystring ef þú vilt: /login?team=<uuid>
  const teamFromQuery = sp.get("team") || "";

  const [mode, setMode] = useState<Mode>("signin");

  // ✅ Password recovery redirect
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    if (!hash) return;

    const isRecovery =
      hash.includes("access_token=") &&
      (hash.includes("type=recovery") || hash.includes("recovery"));

    if (isRecovery) {
      router.replace(`/reset-password${hash}`);
    }
  }, [router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // ✅ Team dropdown
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string>(teamFromQuery);

  // Ef querystring breytist (sjaldan), halda sync
  useEffect(() => {
    if (teamFromQuery && teamFromQuery !== teamId) setTeamId(teamFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFromQuery]);

  // Sækja teams bara þegar þú ert í signup-mode (til að spara)
  useEffect(() => {
    let alive = true;

    async function loadTeams() {
      if (mode !== "signup") return;
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .order("name");

      if (!alive) return;
      if (!error && data) setTeams(data as TeamRow[]);
    }

    loadTeams();
    return () => {
      alive = false;
    };
  }, [mode]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSignup = useMemo(() => {
    if (mode !== "signup") return true;
    return (
      Boolean(fullName.trim()) &&
      Boolean(email.trim()) &&
      Boolean(password) &&
      Boolean(teamId)
    );
  }, [mode, fullName, email, password, teamId]);

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

        // ✅ NÝTT: reikna checkin status og velja rétt landing
        const landingPath = await getPlayerLandingPath();

        const nextIsPlayerFlow =
          next === "/player" || next === "/player/checkin";

        const finalNext = nextIsPlayerFlow ? landingPath : next;

        const target = `/auth/redirect?next=${encodeURIComponent(finalNext)}`;
        router.replace(target);
        router.refresh();
        return;
      }

      if (mode === "signup") {
        if (!teamId) {
          setErr("Veldu lið áður en þú býrð til aðgang.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: "PLAYER",
              team_id: teamId,
            },
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(
                    next
                  )}`
                : undefined,
          },
        });
        if (error) throw error;

        if (!data.session) {
          setMsg(
            "Athugaðu póstinn þinn til að staðfesta aðganginn og klára innskráningu."
          );
        } else {
          // Ef session kemur strax: sama landing logic
          const landingPath = await getPlayerLandingPath();

          const nextIsPlayerFlow =
            next === "/player" || next === "/player/checkin";

          const finalNext = nextIsPlayerFlow ? landingPath : next;

          const target = `/auth/redirect?next=${encodeURIComponent(finalNext)}`;
          router.replace(target);
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

        setMsg(
          "Við sendum þér tölvupóst með hlekk til að endurstilla lykilorð."
        );
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
        {mode === "signin"
          ? "Innskráning"
          : mode === "signup"
          ? "Nýskráning"
          : "Endurstilla lykilorð"}
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        {mode === "signin" && "Skráðu þig inn til að gera daily check-in."}
        {mode === "signup" && "Búðu til aðgang með email og lykilorði."}
        {mode === "reset" && "Sláðu inn email og við sendum endurstillingarhlekk."}
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        {mode === "signup" && (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Fullt nafn</span>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Fullt nafn"
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Lið</span>
              <select
                required
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              >
                <option value="">Veldu lið…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <small style={{ opacity: 0.7 }}>
                Ef listinn er tómur þá er líklega RLS að loka á teams fyrir óinnskráða.
              </small>
            </label>
          </>
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
          <div
            style={{
              background: "#ffecec",
              border: "1px solid #ffb3b3",
              padding: 10,
              borderRadius: 8,
            }}
          >
            {err}
          </div>
        )}
        {msg && (
          <div
            style={{
              background: "#eef7ff",
              border: "1px solid #b3d9ff",
              padding: 10,
              borderRadius: 8,
            }}
          >
            {msg}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !canSignup}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "black",
            color: "white",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading || !canSignup ? 0.7 : 1,
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
            style={{
              background: "transparent",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
            }}
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
            style={{
              background: "transparent",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
            }}
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
            style={{
              background: "transparent",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Gleymt lykilorð?
          </button>
        )}
      </div>
    </div>
  );
}
