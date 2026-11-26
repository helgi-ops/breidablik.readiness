/**
 * PT self-serve (signup + first 10 minutes):
 *   - the phantom-team guard in setup_personal_trainer (only an explicit PT signup creates a team)
 *   - the demo client is shown but never counted, reminded or reported
 *   - the getting-started checklist only moves forward
 *   - monthly report periods
 *
 * The live database check for the guard is supabase/sql/check_pt_signup_guard.sql
 * (rolls back; player and club signups create no PT team).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientDisplayName, isDemoClient, realClients } from "../demoClient";
import { monthlyReportClients, monthPeriod, previousMonth } from "../monthlyReports";
import { goalsForProgramme, resolveOnboarding, type OnboardingRow } from "../onboarding";
import { ptReminderPlayerIds } from "@/lib/notifications/sendPtReminders";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

/** The body of the newest migration that (re)defines setup_personal_trainer. */
function latestSetupPersonalTrainer(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.reverse()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    const m = /CREATE OR REPLACE FUNCTION public\.setup_personal_trainer\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$/i.exec(sql);
    if (m) return { file, body: m[1] };
  }
  throw new Error("setup_personal_trainer not found in supabase/migrations");
}

describe("setup_personal_trainer — phantom-team guard", () => {
  const { file, body } = latestSetupPersonalTrainer();
  const code = body.replace(/--[^\n]*/g, "");

  it("is the self-serve migration (or later)", () => {
    expect(file >= "20261121120000").toBe(true);
  });

  it("bails out unless team_type is exactly 'personal_trainer' (NULL-safe)", () => {
    expect(code).toMatch(/IF\s+\(new\.raw_user_meta_data->>'team_type'\)\s+IS DISTINCT FROM\s+'personal_trainer'\s+THEN\s+RETURN new;/i);
  });

  it("checks the guard before it creates anything", () => {
    const guard = code.search(/IS DISTINCT FROM\s+'personal_trainer'/i);
    const firstInsert = code.search(/INSERT INTO/i);
    expect(guard).toBeGreaterThan(-1);
    expect(firstInsert).toBeGreaterThan(guard);
  });

  it("never uses a NULL-unsafe comparison for team_type", () => {
    expect(code).not.toMatch(/->>'team_type'\)?\s*(<>|!=)\s*'personal_trainer'/i);
  });

  it("only links a coach profile that has no team yet", () => {
    expect(code).toMatch(/team_id IS NULL/i);
    expect(code).toMatch(/upper\(role\)\s*=\s*'COACH'/i);
  });
});

describe("demo client — shown, never counted", () => {
  const rows = [
    { id: "a", name: "Anna", is_demo: false },
    { id: "d", name: "Demo client", is_demo: true },
    { id: "b", name: "Bjarki", isDemo: false },
    { id: "e", name: "x", isDemo: true },
    { id: "c", name: "Cecilía" },
  ];

  it("isDemoClient reads both the DB and the API flag", () => {
    expect(isDemoClient({ is_demo: true })).toBe(true);
    expect(isDemoClient({ isDemo: true })).toBe(true);
    expect(isDemoClient({ is_demo: false })).toBe(false);
    expect(isDemoClient({})).toBe(false);
    expect(isDemoClient(null)).toBe(false);
  });

  it("realClients drops only the demo client", () => {
    expect(realClients(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("names the demo client in the viewer's language", () => {
    expect(clientDisplayName({ is_demo: true, name: "Demo client" }, "EN")).toBe("Demo client");
    expect(clientDisplayName({ is_demo: true, name: "Demo client" }, "IS")).toBe("Sýnisviðskiptavinur");
    expect(clientDisplayName({ name: " Anna " }, "IS")).toBe("Anna");
    expect(clientDisplayName({ full_name: "Bjarki" }, "EN")).toBe("Bjarki");
  });

  it("PT reminders never target the demo client (or club players)", () => {
    const ids = ptReminderPlayerIds([
      { id: "real", is_demo: false, teams: { team_type: "personal_trainer" } },
      { id: "demo", is_demo: true, teams: { team_type: "personal_trainer" } },
      { id: "arr", teams: [{ team_type: "personal_trainer" }] },
      { id: "club", is_demo: false, teams: { team_type: "club" } },
      { id: "none", teams: null },
    ]);
    expect([...ids].sort()).toEqual(["arr", "real"]);
  });

  it("monthly reports go to active clients with an account — never the demo client", () => {
    const picked = monthlyReportClients([
      { id: "real", user_id: "u1", is_active: true, is_demo: false },
      { id: "demo", user_id: "u2", is_active: true, is_demo: true },
      { id: "noacct", user_id: null, is_active: true },
      { id: "inactive", user_id: "u3", is_active: false },
    ]);
    expect(picked.map((p) => p.id)).toEqual(["real"]);
  });
});

describe("getting-started checklist", () => {
  const NOW = "2026-11-21T10:00:00.000Z";
  const empty: OnboardingRow = {
    picked_programme_key: null, picked_level: null,
    invited_at: null, programme_at: null, session_at: null, completed_at: null,
  };

  it("a fresh practice has nothing done and writes nothing", () => {
    const s = resolveOnboarding(empty, { hasInvitation: false, realClientHasProgramme: false }, NOW);
    expect(s).toMatchObject({ invite: false, programme: false, session: false, completed: false, patch: {} });
  });

  it("an invitation ticks step 1", () => {
    const s = resolveOnboarding(null, { hasInvitation: true, realClientHasProgramme: false }, NOW);
    expect(s.invite).toBe(true);
    expect(s.patch).toEqual({ invited_at: NOW });
    expect(s.completed).toBe(false);
  });

  it("picking a programme ticks step 2", () => {
    const s = resolveOnboarding({ ...empty, picked_programme_key: "strength_3day" }, { hasInvitation: false, realClientHasProgramme: false }, NOW);
    expect(s.programme).toBe(true);
    expect(s.patch.programme_at).toBe(NOW);
  });

  it("a real client with a programme ticks steps 2 and 3; all three hide the checklist", () => {
    const s = resolveOnboarding(empty, { hasInvitation: true, realClientHasProgramme: true }, NOW);
    expect(s).toMatchObject({ invite: true, programme: true, session: true, completed: true });
    expect(s.patch).toEqual({ invited_at: NOW, programme_at: NOW, session_at: NOW, completed_at: NOW });
  });

  it("steps never go back once stored", () => {
    const stored = { ...empty, invited_at: "a", programme_at: "b", session_at: "c", completed_at: "d" };
    const s = resolveOnboarding(stored, { hasInvitation: false, realClientHasProgramme: false }, NOW);
    expect(s.completed).toBe(true);
    expect(s.patch).toEqual({});
  });

  it("existing practices (pre-completed) never see the checklist", () => {
    const s = resolveOnboarding({ ...empty, completed_at: "2026-11-21" }, { hasInvitation: false, realClientHasProgramme: false }, NOW);
    expect(s.completed).toBe(true);
  });

  it("every starter programme has a goal; unknown ones fall back to general", () => {
    expect(goalsForProgramme("starter_sprint_speed_8w")).toContain("speed");
    expect(goalsForProgramme("starter_vertical_jump_8w")).toContain("power");
    expect(goalsForProgramme("starter_strength_3day_8w")).toContain("strength");
    expect(goalsForProgramme("starter_beginner_fullbody_8w")).toContain("general");
    expect(goalsForProgramme("no_such_programme")).toEqual(["general"]);
  });
});

describe("monthly report period", () => {
  it("covers the whole calendar month", () => {
    expect(monthPeriod("2026-11")).toEqual({ month: "2026-11-01", start: "2026-11-01", end: "2026-11-30", weeks: 4 });
    expect(monthPeriod("2028-02").end).toBe("2028-02-29");
    expect(monthPeriod("2026-12").weeks).toBe(4);
  });

  it("the 1st builds the month that just ended (January → December)", () => {
    expect(previousMonth("2026-12-01").month).toBe("2026-11-01");
    expect(previousMonth("2027-01-01")).toMatchObject({ month: "2026-12-01", end: "2026-12-31" });
  });

  it("rejects a bad month", () => {
    expect(() => monthPeriod("2026-13")).toThrow();
    expect(() => monthPeriod("Nov 2026")).toThrow();
  });
});
