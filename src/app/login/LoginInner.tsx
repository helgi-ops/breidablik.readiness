"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getSupabaseSessionPersistence,
  setSupabaseSessionPersistence,
  supabase,
} from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "signin" | "signup" | "reset";
type Gender = "M" | "F";
type Sport = "football" | "basketball" | "handball";

type TeamRow = {
  id: string;
  name: string;
  gender: string | null;
  sport: string | null;
};

function utcYYYYMMDD(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function extractCheckinDone(row: any): boolean {
  if (!row) return false;

  const boolDone =
    row.checkin_done ??
    row.did_checkin ??
    row.checked_in ??
    row.is_checked_in ??
    row.has_checkin ??
    row.done ??
    null;

  if (typeof boolDone === "boolean") return boolDone;

  const hasAnyMetric =
    row.total_score != null ||
    row.readiness != null ||
    row.sleep != null ||
    row.soreness != null ||
    row.stress != null ||
    row.fatigue != null;

  return Boolean(hasAnyMetric);
}

async function getLandingPath(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return "/player/checkin";

  const today = utcYYYYMMDD();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, player_id")
    .eq("id", userId)
    .maybeSingle();

  const role = ((profile as any)?.role ?? "").toUpperCase();

  // Coach / admin / staff → always go to coach dashboard
  if (role === "COACH" || role === "ADMIN" || role === "STAFF") return "/coach";

  const playerIdFromProfile = (profile as any)?.player_id as string | null;
  const candidatePlayerIds = [playerIdFromProfile, userId].filter(Boolean) as string[];

  for (const pid of candidatePlayerIds) {
    const { data, error } = await supabase
      .from("v_player_daily_decision_v3")
      .select("*")
      .eq("player_id", pid)
      .eq("day_date", today)
      .maybeSingle();

    if (!error) {
      const done = extractCheckinDone(data);
      // Checkin done → team page, not done → checkin first
      return done ? "/team" : "/player/checkin";
    }
  }

  return "/player/checkin";
}

export default function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = sp.get("next") || "/player/checkin";
  const teamInviteToken = sp.get("team_invite") || "";

  // Optional prefill
  const teamFromQuery = sp.get("team") || "";
  const genderFromQueryRaw = (sp.get("gender") || "").toUpperCase();
  const genderFromQuery: Gender | "" =
    genderFromQueryRaw === "M" ? "M" : genderFromQueryRaw === "F" ? "F" : "";

  const sportFromQueryRaw = (sp.get("sport") || "").toLowerCase();
  const sportFromQuery: Sport | "" =
    sportFromQueryRaw === "football"
      ? "football"
      : sportFromQueryRaw === "basketball"
      ? "basketball"
      : sportFromQueryRaw === "handball"
      ? "handball"
      : "";

  const [mode, setMode] = useState<Mode>("signin");

  // ✅ Auto-redirect if already logged in (critical for PWA keep-me-logged-in)
  useEffect(() => {
    let cancelled = false;
    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) { setCheckingSession(false); return; }
        // Valid session exists — route through /auth/redirect so role-based routing is applied
        if (cancelled) return;
        const landingPath = await getLandingPath();
        if (cancelled) return;
        const nextIsPlayerFlow = next === "/player" || next === "/player/checkin" || next === "/team";
        const finalNext = nextIsPlayerFlow ? landingPath : next;
        router.replace(`/auth/redirect?next=${encodeURIComponent(finalNext)}`);
      } catch {
        if (!cancelled) setCheckingSession(false);
      }
    }
    checkExistingSession();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [rememberMe, setRememberMe] = useState(true);

  // ✅ NEW: gender + sport flow
  const [gender, setGender] = useState<Gender | null>(genderFromQuery ? (genderFromQuery as Gender) : null);
  const [sport, setSport] = useState<Sport | null>(sportFromQuery ? (sportFromQuery as Sport) : null);

  // ✅ Team dropdown
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string>(teamFromQuery);

  // Keep sync with querystring (rare)
  useEffect(() => {
    if (teamFromQuery && teamFromQuery !== teamId) setTeamId(teamFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFromQuery]);

  useEffect(() => {
    if (genderFromQuery && genderFromQuery !== gender) setGender(genderFromQuery as Gender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFromQueryRaw]);

  useEffect(() => {
    if (sportFromQuery && sportFromQuery !== sport) setSport(sportFromQuery as Sport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportFromQueryRaw]);

  // ✅ Team invite link: resolve token → lock team/gender/sport and auto-switch to signup
  const [teamInviteLocked, setTeamInviteLocked] = useState(false);
  const [teamInviteTeamName, setTeamInviteTeamName] = useState<string | null>(null);

  useEffect(() => {
    if (!teamInviteToken) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/team-invites/${teamInviteToken}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        const team = json.team as { id: string; name: string; sport: string | null; gender: string | null } | null;
        if (!team) return;
        setTeamId(team.id);
        setTeamInviteTeamName(team.name);
        setTeamInviteLocked(true);
        setMode("signup");
        if (team.gender === "M" || team.gender === "F") setGender(team.gender as Gender);
        if (team.sport === "football" || team.sport === "basketball" || team.sport === "handball")
          setSport(team.sport as Sport);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [teamInviteToken]);

  // ✅ If team is prefilled but gender/sport is not, infer from that team row
  useEffect(() => {
    let alive = true;

    async function inferFromTeam() {
      if (mode !== "signup") return;
      if (!teamId) return;

      // Only infer missing parts
      if (gender && sport) return;

      const { data, error } = await supabase
        .from("teams")
        .select("id, gender, sport")
        .eq("id", teamId)
        .maybeSingle();

      if (!alive) return;
      if (error || !data) return;

      if (!gender && (data.gender === "M" || data.gender === "F")) setGender(data.gender as Gender);
      if (!sport && (data.sport === "football" || data.sport === "basketball" || data.sport === "handball"))
        setSport(data.sport as Sport);
    }

    inferFromTeam();
    return () => {
      alive = false;
    };
  }, [mode, teamId, gender, sport]);

  // ✅ Load teams only in signup, and only after gender + sport are chosen
  useEffect(() => {
    let alive = true;

    async function loadTeams() {
      if (mode !== "signup") return;

      // Must choose both before listing teams
      if (!gender || !sport) {
        setTeams([]);
        if (!teamFromQuery) setTeamId("");
        return;
      }

      const { data, error } = await supabase
        .from("teams")
        .select("id,name,gender,sport")
        .eq("gender", gender)
        .eq("sport", sport)
        .order("name");

      if (!alive) return;

      if (error) {
        // show user-friendly error
        console.warn("loadTeams error:", error);
        setTeams([]);
        if (!teamFromQuery) setTeamId("");
        return;
      }

      const rows = (data ?? []) as TeamRow[];
      setTeams(rows);

      // if selected team doesn't belong to this filter -> reset (unless forced via query)
      if (teamId) {
        const ok = rows.some((t) => t.id === teamId);
        if (!ok && !teamFromQuery) setTeamId("");
      }
    }

    loadTeams();
    return () => {
      alive = false;
    };
  }, [mode, gender, sport]); // intentionally not depending on teamId to avoid loops

  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ✅ Coach-check: does selected team have at least one registered coach?
  const [teamHasCoach, setTeamHasCoach] = useState<boolean | null>(null);

  useEffect(() => {
    setRememberMe(getSupabaseSessionPersistence() !== "session");
  }, []);

  useEffect(() => {
    let alive = true;
    async function checkCoach() {
      if (mode !== "signup" || !teamId) {
        setTeamHasCoach(null);
        return;
      }
      // Check coach_teams table (coaches use this, not profiles.team_id)
      const { count: ctCount } = await supabase
        .from("coach_teams")
        .select("coach_id", { count: "exact", head: true })
        .eq("team_id", teamId);

      if (!alive) return;

      if ((ctCount ?? 0) > 0) {
        setTeamHasCoach(true);
        return;
      }

      // Fallback: also check profiles (case-insensitive role match)
      const { count: profCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .ilike("role", "coach");

      if (!alive) return;
      setTeamHasCoach((profCount ?? 0) > 0);
    }
    checkCoach();
    return () => { alive = false; };
  }, [mode, teamId]);

  const canSignup = useMemo(() => {
    if (mode !== "signup") return true;
    const base = Boolean(fullName.trim()) && Boolean(email.trim()) && Boolean(password) && Boolean(teamId);
    if (teamInviteLocked) {
      // Invite link already verified team has a coach; gender/sport are pre-set
      return base && Boolean(gender) && Boolean(sport);
    }
    return base && Boolean(gender) && Boolean(sport) && teamHasCoach === true;
  }, [mode, fullName, email, password, gender, sport, teamId, teamHasCoach, teamInviteLocked]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        setSupabaseSessionPersistence(rememberMe);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const landingPath = await getLandingPath();
        const nextIsPlayerFlow = next === "/player" || next === "/player/checkin" || next === "/team";
        const finalNext = nextIsPlayerFlow ? landingPath : next;

        const target = `/auth/redirect?next=${encodeURIComponent(finalNext)}`;
        router.replace(target);
        router.refresh();
        return;
      }

      if (mode === "signup") {
        if (!gender) {
          setErr("Veldu kyn áður en þú býrð til aðgang.");
          return;
        }
        if (!sport) {
          setErr("Veldu sport áður en þú býrð til aðgang.");
          return;
        }
        if (!teamId) {
          setErr("Veldu lið áður en þú býrð til aðgang.");
          return;
        }
        if (!teamHasCoach) {
          setErr("Þjálfari er ekki skráður hjá þessu liði. Þjálfari þarf að skrá sig fyrst.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: "PLAYER",
              gender,
              sport,
              team_id: teamId,
            },
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
                : undefined,
          },
        });
        if (error) throw error;

        if (!data.session) {
          setMsg("Athugaðu póstinn þinn til að staðfesta aðganginn. Þjálfari þarf að samþykkja skráningu þína áður en þú færð aðgang.");
        } else {
          const landingPath = await getLandingPath();
          const nextIsPlayerFlow = next === "/player" || next === "/player/checkin" || next === "/team";
          const finalNext = nextIsPlayerFlow ? landingPath : next;

          const target = `/auth/redirect?next=${encodeURIComponent(finalNext)}`;
          router.replace(target);
          router.refresh();
        }
        return;
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
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

  if (checkingSession) {
    return (
      <div style={{ maxWidth: 420, margin: "40px auto", padding: 16, textAlign: "center", opacity: 0.6 }}>
        <p>Hleð…</p>
      </div>
    );
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
        {mode === "signin" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Keep me logged in</span>
          </label>
        )}

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
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
              />
            </label>

            {/* Gender — hidden when invite locked */}
            {!teamInviteLocked && <div style={{ display: "grid", gap: 6 }}>
              <span>Kyn</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setGender("M");
                    if (!teamFromQuery) setTeamId("");
                    setTeams([]);
                    // do not clear sport: user might want to keep sport selection
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: gender === "M" ? "black" : "white",
                    color: gender === "M" ? "white" : "black",
                    fontWeight: 700,
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Karl
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGender("F");
                    if (!teamFromQuery) setTeamId("");
                    setTeams([]);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: gender === "F" ? "black" : "white",
                    color: gender === "F" ? "white" : "black",
                    fontWeight: 700,
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Kona
                </button>
              </div>
              <small style={{ opacity: 0.7 }}>Veldu kyn til að sjá rétt sport og lið.</small>
            </div>}

            {/* Sport (after gender) — hidden when invite locked */}
            {!teamInviteLocked && gender && (
              <label style={{ display: "grid", gap: 6 }}>
                <span>Sport</span>
                <select
                  required
                  value={sport ?? ""}
                  onChange={(e) => {
                    const v = (e.target.value || "") as Sport | "";
                    setSport(v ? (v as Sport) : null);
                    if (!teamFromQuery) setTeamId("");
                    setTeams([]);
                  }}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                >
                  <option value="">Veldu sport…</option>
                  <option value="football">Fótbolti</option>
                  <option value="basketball">Körfubolti</option>
                  <option value="handball">Handbolti</option>
                </select>
                <small style={{ opacity: 0.7 }}>Veldu sport til að sjá rétt lið.</small>
              </label>
            )}

            {/* Team — locked when from invite link, otherwise dropdown */}
            {teamInviteLocked ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span>Lið</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid #b0d6bd", background: "#eaf3ec" }}>
                  <span style={{ color: "#16653d" }}>✓</span>
                  <span style={{ fontWeight: 600, color: "#145233" }}>{teamInviteTeamName ?? "..."}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#47a06f" }}>Frá boðslink</span>
                </div>
              </label>
            ) : gender && sport && (
              <label style={{ display: "grid", gap: 6 }}>
                <span>Lið</span>
                <select
                  required
                  value={teamId}
                  onChange={(e) => { setTeamId(e.target.value); setTeamHasCoach(null); }}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                >
                  <option value="">Veldu lið…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {teamId && teamHasCoach === false && (
                  <div style={{ background: "#faf1de", border: "1px solid #e0b257", padding: "8px 10px", borderRadius: 8, fontSize: 13 }}>
                    ⚠️ Enginn þjálfari er skráður hjá þessu liði enn. Þjálfari þarf að skrá sig áður en leikmaður getur skráð sig.
                  </div>
                )}
                {teamId && teamHasCoach === true && (
                  <div style={{ background: "#eaf3ec", border: "1px solid #b0d6bd", padding: "8px 10px", borderRadius: 8, fontSize: 13 }}>
                    ✓ Þjálfari er skráður — skráning leyfð.
                  </div>
                )}
              </label>
            )}
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
          <div style={{ background: "#f8e9e3", border: "1px solid #e6b6a6", padding: 10, borderRadius: 8 }}>
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

        <a
          href="/signup/create-team"
          style={{ textDecoration: "underline", color: "#0f766e" }}
        >
          Stofna nýtt félag →
        </a>
      </div>
    </div>
  );
}
