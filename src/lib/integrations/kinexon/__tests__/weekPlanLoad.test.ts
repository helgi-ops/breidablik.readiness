import { describe, expect, it } from "vitest";
import { aggregateKinexonWeekPlanLoad, kinexonMatchLine, type KinexonLoadRow } from "@/lib/integrations/kinexon/weekPlanLoad";

const row = (playerId: string, date: string, pl: number, over: Partial<KinexonLoadRow> = {}): KinexonLoadRow => ({
  playerId, date, pl, distance: pl * 10, hsr: pl / 10, cod: 100, coo: 200, exertions: 300, mechLoad: 400, duration: 80, ...over,
});
const MATCHES = new Set(["2026-10-10", "2026-10-20", "2026-09-01"]);
const SINCE = "2026-10-05";

describe("aggregateKinexonWeekPlanLoad", () => {
  it("keeps match days out of the training baseline", () => {
    const a = aggregateKinexonWeekPlanLoad([row("p", "2026-10-08", 500), row("p", "2026-10-09", 700), row("p", "2026-10-10", 900)], MATCHES, SINCE).get("p")!;
    expect(a.training.pl).toBe(600);
    expect(a.training.sessions).toBe(2);
    expect(a.match?.pl).toBe(900);
    expect(a.match?.matches).toBe(1);
  });
  it("means the player's own recorded matches, including ones older than the training window", () => {
    const a = aggregateKinexonWeekPlanLoad([row("p", "2026-10-08", 500), row("p", "2026-10-10", 900), row("p", "2026-09-01", 700)], MATCHES, SINCE).get("p")!;
    expect(a.match?.pl).toBe(800);
    expect(a.match?.matches).toBe(2);
    expect(a.training.pl).toBe(500);
  });
  it("an old training day stays out of the baseline", () => {
    const a = aggregateKinexonWeekPlanLoad([row("p", "2026-09-15", 100), row("p", "2026-10-08", 500)], MATCHES, SINCE).get("p")!;
    expect(a.training.pl).toBe(500);
  });
  it("no recorded match means no match line", () => {
    expect(aggregateKinexonWeekPlanLoad([row("p", "2026-10-08", 500)], MATCHES, SINCE).get("p")!.match).toBeNull();
  });
  it("a player with only match rows falls back to them for the baseline", () => {
    const a = aggregateKinexonWeekPlanLoad([row("p", "2026-10-10", 900)], MATCHES, SINCE).get("p")!;
    expect(a.training.pl).toBe(900);
    expect(a.match?.pl).toBe(900);
  });
  it("a variable the feed lacks stays empty, and a repeated day counts once", () => {
    const a = aggregateKinexonWeekPlanLoad([row("p", "2026-10-08", 500, { coo: null }), row("p", "2026-10-08", 9999), row("q", "2026-10-08", 300)], MATCHES, SINCE);
    expect(a.get("p")!.training.coo).toBeNull();
    expect(a.get("p")!.training.pl).toBe(500);
    expect(a.get("q")!.training.pl).toBe(300);
  });
});

describe("kinexonMatchLine", () => {
  const match = { pl: 900, distance: 5000, hsr: 100, cod: 50, coo: null, exertions: 300, mechLoad: 400, matches: 3 };
  it("multiplies the player's match mean by the week's matches", () => {
    const l = kinexonMatchLine(match, 2)!;
    expect(l.pl).toBe(1800);
    expect(l.coo).toBeNull();
  });
  it("is empty without a recorded match or in a week with no match", () => {
    expect(kinexonMatchLine(null, 2)).toBeNull();
    expect(kinexonMatchLine(match, 0)).toBeNull();
  });
});
