/**
 * PT "first week without gaps" (lota 1):
 *   - the client invite email (EN/IS, from the practice, link + expiry)
 *   - sign-in returns an invited person to the invite page, and only there
 *   - reminders in the client's language
 *   - the plan builder grid follows weeks / sessions per week without losing work
 *   - a client deletes only reports they uploaded
 *   - a rest day previews the next session's own block
 */

import { describe, expect, it } from "vitest";
import { buildClientInviteEmail } from "@/lib/email/clientInviteEmail";
import { inviteReturnPath } from "@/lib/auth/inviteReturn";
import { ptSessionReminderText, ptWeeklyRecapText, reminderLang } from "@/lib/notifications/sendPtReminders";
import { resizePerWeek, resizePlanWeeks } from "../planGrid";
import { canDeleteReport } from "@/lib/pt/reportAccess";
import { resolveProgrammeSlot } from "../programmeSchedule";

const invite = {
  clientName: "Sara",
  practiceName: "Strong Lab",
  trainerName: "Anna Jóns",
  acceptUrl: "https://app.micropulse.is/invite/client/abc123",
  expiresAt: new Date("2026-12-22T12:00:00Z"),
};

describe("client invite email", () => {
  it("English: from the practice, names the trainer, carries the link and expiry", () => {
    const e = buildClientInviteEmail({ ...invite, lang: "EN" });
    expect(e.subject).toBe("Strong Lab invited you to their training app");
    expect(e.text).toContain("Hi Sara,");
    expect(e.text).toContain("Anna Jóns at Strong Lab");
    expect(e.text).toContain(invite.acceptUrl);
    expect(e.text).toContain("22 December 2026");
    expect(e.html).toContain(`href="${invite.acceptUrl}"`);
  });

  it("Icelandic", () => {
    const e = buildClientInviteEmail({ ...invite, lang: "IS" });
    expect(e.subject).toBe("Strong Lab bauð þér í æfingaappið sitt");
    expect(e.text).toContain("Hæ Sara,");
    expect(e.text).toContain("Anna Jóns hjá Strong Lab");
    expect(e.html).toContain('lang="is"');
  });

  it("no trainer name or client name still reads well, and HTML is escaped", () => {
    const e = buildClientInviteEmail({ ...invite, lang: "EN", clientName: null, trainerName: null, practiceName: "<b>Gym</b>" });
    expect(e.text.startsWith("Hi,")).toBe(true);
    expect(e.html).not.toContain("<b>Gym</b>");
    expect(e.html).toContain("&lt;b&gt;Gym&lt;/b&gt;");
  });
});

describe("sign-in returns to the invite page", () => {
  it("accepts our own invite paths", () => {
    expect(inviteReturnPath("/invite/client/abc123")).toBe("/invite/client/abc123");
    expect(inviteReturnPath("/invite/coach/tok_EN-1?x=1#y")).toBe("/invite/coach/tok_EN-1");
  });
  it("rejects anything else", () => {
    for (const bad of [null, "", "/coach", "//evil.com/invite/client/a", "https://evil.com/invite/client/a", "/invite/client/../../x", "/invite/player/abc"]) {
      expect(inviteReturnPath(bad)).toBeNull();
    }
  });
});

describe("reminders in the client's language", () => {
  it("client language, else practice default, else English", () => {
    expect(reminderLang({ app_language: "IS", teams: { team_type: "personal_trainer", default_language: "EN" } })).toBe("IS");
    expect(reminderLang({ app_language: null, teams: [{ team_type: "personal_trainer", default_language: "IS" }] })).toBe("IS");
    expect(reminderLang({ app_language: null, teams: null })).toBe("EN");
  });
  it("session and weekly texts", () => {
    expect(ptSessionReminderText("EN").title).toBe("Session today");
    expect(ptSessionReminderText("IS").title).toBe("Æfing í dag");
    expect(ptWeeklyRecapText("EN", 1, 0).body).toBe("1 session. Great work 💪");
    expect(ptWeeklyRecapText("EN", 3, 4250).body).toContain("3 sessions · 4,250 kg lifted");
    expect(ptWeeklyRecapText("IS", 3, 0).body).toBe("3 æfingar. Flott vinna 💪");
  });
});

describe("plan builder grid follows the inputs", () => {
  type S = { day: number; name: string };
  const mk = (d: number): S => ({ day: d, name: "" });
  const start = [
    { week: 1, sessions: [{ day: 1, name: "A" }, { day: 2, name: "B" }] },
    { week: 2, sessions: [{ day: 1, name: "C" }, { day: 2, name: "D" }] },
  ];

  it("more weeks copy the last week (not shared objects)", () => {
    const out = resizePlanWeeks(start, 3, 2, mk);
    expect(out.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(out[2].sessions.map((s) => s.name)).toEqual(["C", "D"]);
    out[2].sessions[0].name = "changed";
    expect(out[1].sessions[0].name).toBe("C");
  });

  it("fewer weeks cut from the end; built weeks are kept", () => {
    const out = resizePlanWeeks(start, 1, 2, mk);
    expect(out).toHaveLength(1);
    expect(out[0].sessions.map((s) => s.name)).toEqual(["A", "B"]);
  });

  it("sessions per week pad with blanks and cut from the end", () => {
    const more = resizePlanWeeks(start, 2, 3, mk);
    expect(more[0].sessions.map((s) => s.name)).toEqual(["A", "B", ""]);
    expect(more[0].sessions[2].day).toBe(3);
    const fewer = resizePlanWeeks(start, 2, 1, mk);
    expect(fewer[1].sessions.map((s) => s.name)).toEqual(["C"]);
  });

  it("per-week percentages follow the week count", () => {
    expect(resizePerWeek([10, 20], 4, 0)).toEqual([10, 20, 0, 0]);
    expect(resizePerWeek([10, 20, 30], 2, 0)).toEqual([10, 20]);
  });
});

describe("report deletion", () => {
  it("the trainer may delete any report on the client", () => {
    expect(canDeleteReport({ uid: "coach", isCoach: true }, { uploaded_by: "someone" })).toBe(true);
  });
  it("a client deletes only their own uploads", () => {
    expect(canDeleteReport({ uid: "client", isCoach: false }, { uploaded_by: "client" })).toBe(true);
    expect(canDeleteReport({ uid: "client", isCoach: false }, { uploaded_by: "coach" })).toBe(false);
    expect(canDeleteReport({ uid: "client", isCoach: false }, { uploaded_by: null })).toBe(false);
  });
});

describe("rest day previews the next session", () => {
  it("2 blocks (Mon/Thu): Tuesday previews block 1 on Thursday, Friday previews block 0 on Monday", () => {
    // 2026-11-23 is a Monday.
    const tue = resolveProgrammeSlot({ programmeKey: "phase_based", startDate: "2026-11-23", today: "2026-11-24", nBlocks: 2 });
    expect(tue.kind).toBe("rest");
    if (tue.kind === "rest") {
      expect(tue.nextSessionWeekdayIso).toBe(4);
      expect(tue.nextBlockIndex).toBe(1);
    }
    const fri = resolveProgrammeSlot({ programmeKey: "phase_based", startDate: "2026-11-23", today: "2026-11-27", nBlocks: 2 });
    if (fri.kind === "rest") expect(fri.nextBlockIndex).toBe(0);
  });
});
