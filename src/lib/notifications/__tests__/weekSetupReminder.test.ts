import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stub push so nothing hits the network; capture what would be sent.
vi.mock("@/lib/push/webPush", () => ({
  sendWebPush: vi.fn(async () => {}),
  isSubscriptionGone: vi.fn(() => false),
}));

import { sendWebPush } from "@/lib/push/webPush";
import { runWeekSetupReminder } from "../weekSetupReminder";

const DATE = "2026-09-10";

type Tables = {
  teams?: Array<{ id: string }>;
  week_plans?: Array<{ day_date: string; day_type?: string }>;
  match_schedule?: Array<{ match_date: string }>;
  profiles?: Array<{ id: string; role: string | null }>;
  coach_teams?: Array<{ coach_id: string }>;
  coach_notification_log?: Array<Record<string, unknown>>;
  coach_push_subscriptions?: Array<{ id: string; endpoint: string | null; p256dh: string | null; auth: string | null }>;
};

/** A table-aware Supabase stub. Every chain method returns the same thenable builder; awaiting it
 *  yields `{ data }` = that table's rows (or the first row after `.maybeSingle()`). `insert` records
 *  the row so a follow-up read/assertion can see it. Filters are ignored — each scenario controls a
 *  single team + coach so unfiltered reads already return the intended set. */
function makeSb(tables: Tables): { sb: SupabaseClient; inserts: Record<string, unknown[]> } {
  const store: Record<string, unknown[]> = {
    teams: tables.teams ?? [],
    week_plans: tables.week_plans ?? [],
    match_schedule: tables.match_schedule ?? [],
    profiles: tables.profiles ?? [],
    coach_teams: tables.coach_teams ?? [],
    coach_notification_log: tables.coach_notification_log ?? [],
    coach_push_subscriptions: tables.coach_push_subscriptions ?? [],
  };
  const inserts: Record<string, unknown[]> = {};

  const from = (table: string) => {
    const state = { single: false };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain; builder.eq = chain; builder.gte = chain; builder.lte = chain;
    builder.order = chain; builder.limit = chain; builder.update = chain;
    builder.maybeSingle = () => { state.single = true; return builder; };
    builder.insert = (row: unknown) => {
      (inserts[table] ||= []).push(row);
      store[table] = [...(store[table] ?? []), row as Record<string, unknown>];
      return Promise.resolve({ data: null, error: null });
    };
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const rows = store[table] ?? [];
      const data = state.single ? (rows[0] ?? null) : rows;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return builder;
  };
  return { sb: { from } as unknown as SupabaseClient, inserts };
}

const oneTeamNeedingSetup = (over: Partial<Tables> = {}): Tables => ({
  teams: [{ id: "t1" }],
  week_plans: [], // no plan for today → needs setup
  profiles: [{ id: "c1", role: "coach" }],
  coach_teams: [],
  coach_notification_log: [],
  coach_push_subscriptions: [{ id: "s1", endpoint: "https://push/x", p256dh: "k", auth: "a" }],
  ...over,
});

describe("runWeekSetupReminder", () => {
  beforeEach(() => vi.mocked(sendWebPush).mockClear());

  it("sends when today's week_plans row is missing, and logs the delivery", async () => {
    const { sb, inserts } = makeSb(oneTeamNeedingSetup({ match_schedule: [{ match_date: "2026-09-13" }] }));
    const res = await runWeekSetupReminder(sb, { dateKey: DATE });

    expect(res.teamsChecked).toBe(1);
    expect(res.teamsNeedingSetup).toBe(1);
    expect(res.coachesNotified).toBe(1);
    expect(res.pushCount).toBe(1);
    expect(vi.mocked(sendWebPush)).toHaveBeenCalledTimes(1);
    // A dedupe log row is written for (coach, week_setup, today).
    expect(inserts.coach_notification_log?.[0]).toMatchObject({
      profile_id: "c1", team_id: "t1", kind: "week_setup", signal_key: DATE,
    });
  });

  it("skips when today's week_plans row is present", async () => {
    const { sb } = makeSb(oneTeamNeedingSetup({ week_plans: [{ day_date: DATE, day_type: "TRAIN" }] }));
    const res = await runWeekSetupReminder(sb, { dateKey: DATE });

    expect(res.teamsNeedingSetup).toBe(0);
    expect(res.coachesNotified).toBe(0);
    expect(vi.mocked(sendWebPush)).not.toHaveBeenCalled();
  });

  it("dedupes a coach already reminded today (no second push)", async () => {
    const { sb } = makeSb(oneTeamNeedingSetup({
      coach_notification_log: [{ profile_id: "c1", kind: "week_setup", signal_key: DATE }],
    }));
    const res = await runWeekSetupReminder(sb, { dateKey: DATE });

    expect(res.teamsNeedingSetup).toBe(1);
    expect(res.coachesSkippedAlreadySent).toBe(1);
    expect(res.coachesNotified).toBe(0);
    expect(vi.mocked(sendWebPush)).not.toHaveBeenCalled();
  });

  it("message adapts to whether a fixture is on record (MD guessed vs unknown)", async () => {
    // With a fixture in the window → 'MD guessed from the fixture'.
    const withFix = makeSb(oneTeamNeedingSetup({ match_schedule: [{ match_date: "2026-09-12" }] }));
    await runWeekSetupReminder(withFix.sb, { dateKey: DATE });
    const bodyWith = (vi.mocked(sendWebPush).mock.calls[0][1] as { body: string }).body;
    expect(bodyWith).toMatch(/leikjaskránni|ágiskaður/i);

    vi.mocked(sendWebPush).mockClear();

    // No fixture → 'no fixture found, set the week'.
    const noFix = makeSb(oneTeamNeedingSetup({ match_schedule: [] }));
    await runWeekSetupReminder(noFix.sb, { dateKey: DATE });
    const bodyNo = (vi.mocked(sendWebPush).mock.calls[0][1] as { body: string }).body;
    expect(bodyNo).toMatch(/engin leikjaskrá/i);
  });

  it("no coach with a push subscription → counted as needing setup but nothing sent", async () => {
    const { sb } = makeSb(oneTeamNeedingSetup({ coach_push_subscriptions: [] }));
    const res = await runWeekSetupReminder(sb, { dateKey: DATE });

    expect(res.teamsNeedingSetup).toBe(1);
    expect(res.coachesNotified).toBe(0);
    expect(res.pushCount).toBe(0);
    expect(vi.mocked(sendWebPush)).not.toHaveBeenCalled();
  });
});
