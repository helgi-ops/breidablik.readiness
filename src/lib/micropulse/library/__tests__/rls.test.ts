import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Structural guard for the Coaching Library RLS. A foreign team's media / meetings must
 * never be returned: every table enables RLS and every SELECT policy scopes visibility
 * to the caller's OWN coach-owned rows OR team rows for teams they coach (coach_teams),
 * and NEVER exposes an owner_type='public' path (player-identifiable media stays private).
 * The live functional isolation check is run separately against the database.
 */
function migration(file: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../../../../../supabase/migrations", file), "utf8");
}

describe("coach_media RLS", () => {
  const sql = migration("20260921150000_coach_library_media.sql");
  it("enables RLS and scopes SELECT by coach ownership / coach_teams", () => {
    expect(sql).toMatch(/alter table public\.coach_media enable row level security/i);
    const select = sql.slice(sql.indexOf("coach_media_select"));
    expect(select).toMatch(/owner_coach_id = auth\.uid\(\)/);
    expect(select).toMatch(/coach_teams ct where ct\.team_id = coach_media\.team_id and ct\.coach_id = auth\.uid\(\)/);
  });
  it("has no public owner_type path (media never public)", () => {
    expect(sql).not.toMatch(/owner_type = 'public'/);
    expect(sql).toMatch(/owner_type in \('coach','team'\)/);
  });
  it("uses a private bucket + a source check constraint", () => {
    expect(sql).toMatch(/values \('coach-library-media', 'coach-library-media', false\)/);
    expect(sql).toMatch(/external_url is not null or storage_path is not null/);
  });
});

describe("coach_meetings + attachments RLS", () => {
  const sql = migration("20260921160000_coach_meetings.sql");
  it("enables RLS on both tables", () => {
    expect(sql).toMatch(/alter table public\.coach_meetings enable row level security/i);
    expect(sql).toMatch(/alter table public\.coach_meeting_attachments enable row level security/i);
  });
  it("scopes meetings SELECT by coach ownership / coach_teams and no public path", () => {
    const select = sql.slice(sql.indexOf("coach_meetings_select"));
    expect(select).toMatch(/owner_coach_id = auth\.uid\(\)/);
    expect(select).toMatch(/coach_teams ct where ct\.team_id = coach_meetings\.team_id/);
    expect(sql).not.toMatch(/owner_type = 'public'/);
  });
  it("gates attachments through the parent meeting's visibility", () => {
    expect(sql).toMatch(/coach_meeting_attachments_all[\s\S]*coach_meetings m where m\.id = coach_meeting_attachments\.meeting_id/);
  });
});
