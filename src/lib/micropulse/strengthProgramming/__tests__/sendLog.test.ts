/**
 * "C" (2026-11-18): the automatic strength send keeps a log the coach can read — sent / skipped with a reason /
 * failed, per team per day and per player — on /coach/strength and, when something failed, in the morning digest.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
vi.mock("@/lib/push/webPush", () => ({ sendWebPush: vi.fn(), isSubscriptionGone: () => false }));
vi.mock("@/lib/email/sendTransactionalEmail", () => ({ sendTransactionalEmail: vi.fn() }));
import { buildMorningDigest } from "@/lib/notifications/coachDigest";
import { playerRow, sendLogDigestItems, summarizeSendLog, teamRow, type SendLogRow } from "../sendLog";

const D = "2026-11-18";
const T = "team-1";
const ran = (extra: SendLogRow[]): SendLogRow[] => [{ ...teamRow(T, D, "sent", null), created_at: `${D}T09:00:14Z` }, ...extra];

describe("summarizeSendLog", () => {
  it("a normal morning: count, named reasons, time", () => {
    const rows = ran([
      ...Array.from({ length: 21 }, (_, i) => playerRow(T, D, `p${i}`, "sent", null, null)),
      playerRow(T, D, "inj1", "skipped", "injured"),
      playerRow(T, D, "inj2", "skipped", "injured"),
      playerRow(T, D, "own", "skipped", "already_sent"),
    ]);
    const s = summarizeSendLog(rows, D);
    expect(s.state).toBe("ran");
    expect(s.ranAt).toBe(`${D}T09:00:14Z`);
    expect(s.line.en).toBe("Sent to 21 players · 1 had yours already · 2 injured · 0 failed");
    expect(s.line.is).toBe("Sent á 21 leikmenn · 1 var með þína þegar · 2 í meiðslum · 0 mistókust");
    expect(s.needsAction).toBe(false);
    // A coach's own send is counted, not listed: the coach knows; injured players are named.
    expect(s.people.map((p) => p.playerId)).toEqual(["inj1", "inj2"]);
  });

  it("a failure is listed first and needs action", () => {
    const s = summarizeSendLog(ran([
      playerRow(T, D, "a", "skipped", "no_session"),
      playerRow(T, D, "b", "failed", "duplicate key"),
      playerRow(T, D, "c", "sent", null, "YELLOW"),
    ]), D);
    expect(s.failed).toBe(1);
    expect(s.needsAction).toBe(true);
    expect(s.people[0]).toMatchObject({ playerId: "b", status: "failed" });
    // The raw error never reaches the coach.
    expect(JSON.stringify(s.people)).not.toMatch(/duplicate key/);
    expect(s.line.en).toContain("1 no session today");
  });

  it("a check-in rebuild is counted", () => {
    const s = summarizeSendLog(ran([{ ...playerRow(T, D, "c", "sent", null, "RED"), rebuilt_at: `${D}T10:02:00Z` }]), D);
    expect(s.rebuilt).toBe(1);
    expect(s.line.en).toMatch(/1 adjusted to their check-in$/);
  });

  it("whole team not sent: the week not set needs action, a day off does not", () => {
    const noWeek = summarizeSendLog([teamRow(T, D, "not_sent", "no_week_plan")], D);
    expect(noWeek.state).toBe("not_sent");
    expect(noWeek.line.en).toMatch(/week isn't set up/);
    expect(noWeek.needsAction).toBe(true);
    const off = summarizeSendLog([teamRow(T, D, "not_sent", "off_day")], D);
    expect(off.line.en).toMatch(/day off/);
    expect(off.needsAction).toBe(false);
  });

  it("no rows = no run logged; other days are ignored", () => {
    const s = summarizeSendLog(ran([playerRow(T, D, "a", "sent", null)]), "2026-11-17");
    expect(s.state).toBe("missing");
    expect(s.sent).toBe(0);
  });

  it("no jargon or verdict words in what the coach reads", () => {
    const s = summarizeSendLog(ran([
      playerRow(T, D, "a", "skipped", "standard_no_programme"),
      playerRow(T, D, "b", "skipped", "something_new"),
    ]), D);
    const text = JSON.stringify([s.line, s.people]);
    expect(text).not.toMatch(/standard_no_programme|something_new|MODIFIED|RECOVERY|verdict/);
    expect(s.line.en).toContain("1 no programme · 1 skipped");
  });
});

describe("morning digest", () => {
  it("names yesterday's failed sends first, as needing action", () => {
    const s = summarizeSendLog(ran([playerRow(T, D, "b", "failed", "x"), playerRow(T, D, "c", "failed", "y")]), D);
    const d = buildMorningDigest([], sendLogDigestItems(s));
    expect(d.tone).toBe("action");
    expect(d.items[0].label.en).toBe("Automatic strength send: 2 sessions not saved yesterday");
    expect(d.items[0].href).toBe("/coach/strength");
  });
  it("says nothing when all went out (skips are not news)", () => {
    const s = summarizeSendLog(ran([playerRow(T, D, "a", "skipped", "injured"), playerRow(T, D, "c", "sent", null)]), D);
    expect(sendLogDigestItems(s)).toEqual([]);
    expect(buildMorningDigest([], []).tone).toBe("steady");
  });
});

describe("wiring", () => {
  const root = join(__dirname, "../../../../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("the 09:00 send writes a team row and one row per player", () => {
    const src = read("src/app/api/strength/auto-send/route.ts");
    expect(src).toMatch(/writeSendLog\(sb, \[teamRow\(team\.id, todayIso, "not_sent"/);
    expect(src).toMatch(/await writeSendLog\(sb, logRows\)/);
    for (const r of ["already_sent", "custom_programme", "standard_no_programme"]) expect(src).toContain(`"${r}"`);
    expect(src).toMatch(/log\(p\.id, "skipped", built\.skip\)/);
    expect(src).toMatch(/log\(p\.id, "sent", null, readinessLevel\)/);
  });
  it("a check-in rebuild stamps the player's row", () => {
    expect(read("src/lib/micropulse/strengthProgramming/autoSession.ts")).toMatch(/await markRebuilt\(sb, \{ teamId: row\.team_id, playerId/);
  });
  it("the coach sees it under the send-mode picker; the digest reads yesterday", () => {
    expect(read("src/components/coach/StrengthSendModePicker.tsx")).toContain("<StrengthSendStatus lang={lang} />");
    expect(read("src/lib/notifications/coachDigest.ts")).toMatch(/buildMorningDigest\(signals, await strengthSendIssue\(sb, teamId, dateKey\)\)/);
  });
  it("the table is read-only for the browser and scoped to the coach's team", () => {
    const sql = read("supabase/migrations/20261118110000_strength_send_log.sql");
    expect(sql).toMatch(/grant select on public\.strength_send_log to authenticated;/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/);
    expect(sql).toMatch(/using \(public\.can_read_team_coach_prefs\(team_id\)\)/);
  });
});
